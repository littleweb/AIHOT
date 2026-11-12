"""Read-only Codex research; deterministic validation owns all public file writes."""
import datetime, sys, time
from common import ROOT, DATA, CONFIG, read_json, write_json, runtime, node, lock, status, start_task, take_request, run_research_codex
STATE = DATA / 'research.json'
SCHEMA = DATA / 'research-schema.json'
RESULT = DATA / 'research-result.json'
TZ = datetime.timezone(datetime.timedelta(hours=8))

def schema():
    text = {'type': 'string'}
    nullable = {'type': ['string', 'null']}
    properties = {key: text for key in ['sourceId', 'sourceName', 'date', 'url', 'title', 'summary', 'reason', 'category', 'quote']}
    properties.update(tier={'type': 'string', 'enum': ['T1', 'T2']}, entity=nullable,
                      subjects={'type': 'array', 'items': text}, region={'type': 'string', 'enum': ['国内', '国外']},
                      tags={'type': 'array', 'items': text}, selected={'type': 'boolean'},
                      event={'anyOf': [{'type': 'null'}, {'type': 'object', 'additionalProperties': False,
                             'required': ['key', 'title', 'factKey', 'factTitle'], 'properties': {'key': text, 'title': text, 'factKey': text, 'factTitle': text}}]})
    return {'type': 'object', 'additionalProperties': False, 'required': ['date', 'researchedAt', 'items', 'skipped'],
            'properties': {'date': text, 'researchedAt': text, 'skipped': {'type': 'array', 'items': text},
                           'items': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                                              'required': list(properties), 'properties': properties}}}}

def due(state, now):
    local = datetime.datetime.fromtimestamp(now, TZ)
    morning = local.strftime('%H:%M') >= CONFIG['morningTime'] and state.get('morningDate') != local.date().isoformat()
    return morning or now - state.get('lastFinishedAt', 0) >= CONFIG['researchIntervalMinutes'] * 60

def research(state):
    started = datetime.datetime.now(TZ)
    start_task('research')
    status('research', phase='discovering', startedAt=started.isoformat())
    write_json(SCHEMA, schema())
    RESULT.unlink(missing_ok=True)
    from discover import discover
    candidates, failures = discover()
    print(f'Discovery: {candidates} original links; {failures} sources unavailable', flush=True)
    status('research', phase='reading-sources', candidates=candidates, sourceFailures=failures)
    node('modules/shendeng/research-originals.ts', timeout=240)
    prompt = (ROOT / 'modules/shendeng/continuous-prompt.md').read_text()
    prompt += '\n本轮开始时间（北京时间）: ' + started.isoformat()
    args = [runtime()['codex'], 'exec', '--sandbox', 'read-only', '-c', 'approval_policy="never"',
            '-c', 'web_search="live"',
            '--json', '--ephemeral', '--output-schema', str(SCHEMA), '--output-last-message', str(RESULT), '-C', str(ROOT), '-']
    # Keep only a few private logs; credentials never leave the existing local CLI store.
    for old in sorted(DATA.glob('research-*.log'))[:-6]:
        old.unlink()
        old.with_suffix('.stderr').unlink(missing_ok=True)
    log = DATA / ('research-' + started.strftime('%Y%m%d-%H%M%S') + '.log')
    status('research', phase='researching', steps=0)
    if run_research_codex(args, prompt, log) or not RESULT.exists():
        raise RuntimeError('Local Codex research failed; see private research log')
    proposal = read_json(RESULT)
    merge_report = DATA / 'research-merge.json'
    status('research', phase='validating', proposedItems=len(proposal['items']))
    node('modules/shendeng/merge-research.ts', str(RESULT), str(merge_report), timeout=180)
    merge_skipped = read_json(merge_report, {}).get('skipped', [])
    finished = time.time()
    state['lastFinishedAt'] = finished
    if started.strftime('%H:%M') >= CONFIG['morningTime']:
        state['morningDate'] = started.date().isoformat()
    write_json(STATE, state)
    status('research', phase='checked', proposedItems=len(proposal['items']), skipped=proposal['skipped'], mergeSkipped=merge_skipped, finishedAt=finished)

def rankings(state, date):
    start_task('rankings')
    status('rankings', phase='fetching')
    try:
        node('modules/rankings/refresh.ts', timeout=180)
    except Exception as error:
        status('rankings', phase='failed', error='Ranking refresh failed. Successful snapshots retained. See private research service log.')
        print(str(error), flush=True)
        return False
    state['rankingsDate'] = date
    write_json(STATE, state)
    status('rankings', phase='checked', completed=2)
    return True

if __name__ == '__main__':
    held = lock('research')
    retry_research_at = retry_rankings_at = 0
    while True:
        state = read_json(STATE, {})
        now = time.time()
        date = datetime.datetime.fromtimestamp(now, TZ).date().isoformat()
        once = '--once' in sys.argv
        if take_request('rankings') or now >= retry_rankings_at and state.get('rankingsDate') != date:
            if rankings(state, date):
                retry_rankings_at = 0
            else:
                retry_rankings_at = now + CONFIG['researchIntervalMinutes'] * 60
        if take_request('research') or once or now >= retry_research_at and due(state, now):
            try:
                research(state)
                retry_research_at = 0
            except Exception as error:
                print(str(error), flush=True)
                status('research', phase='failed', error=str(error))
                if once:
                    raise
                retry_research_at = now + CONFIG['researchIntervalMinutes'] * 60
        if once:
            break
        time.sleep(2)
