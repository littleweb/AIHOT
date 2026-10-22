"""Read-only Codex research; deterministic validation owns all public file writes."""
import datetime, json, os, pathlib, subprocess, sys, time
from common import ROOT, DATA, CONFIG, read_json, write_json, runtime, environment, node, lock, status
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

def research():
    state = read_json(STATE, {})
    if '--once' not in sys.argv and not due(state, time.time()): return
    started = datetime.datetime.now(TZ)
    status('research', phase='researching', startedAt=started.isoformat())
    write_json(SCHEMA, schema())
    RESULT.unlink(missing_ok=True)
    from discover import discover
    candidates, failures = discover()
    print(f'Discovery: {candidates} original links; {failures} sources unavailable', flush=True)
    prompt = (ROOT / 'modules/shendeng/continuous-prompt.md').read_text()
    prompt += '\n本轮开始时间（北京时间）: ' + started.isoformat()
    args = [runtime()['codex'], 'exec', '--sandbox', 'read-only', '-c', 'approval_policy="never"',
            '-c', 'web_search="live"', '-c', 'sandbox_read_only.network_access=true',
            '--ephemeral', '--output-schema', str(SCHEMA), '--output-last-message', str(RESULT), '-C', str(ROOT), '-']
    # Keep only a few private logs; credentials never leave the existing local CLI store.
    for old in sorted(DATA.glob('research-*.log'))[:-6]: old.unlink()
    log = DATA / ('research-' + started.strftime('%Y%m%d-%H%M%S') + '.log')
    with log.open('w') as output:
        process = subprocess.run(args, input=prompt, text=True, cwd=ROOT, env=environment(), stdout=output, stderr=output, timeout=2700)
    if process.returncode or not RESULT.exists(): raise RuntimeError('Local Codex research failed; see private research log')
    proposal = read_json(RESULT)
    node('modules/shendeng/merge-research.ts', str(RESULT), timeout=180)
    finished = time.time()
    state['lastFinishedAt'] = finished
    if started.strftime('%H:%M') >= CONFIG['morningTime']:
        state['morningDate'] = started.date().isoformat()
    # Refresh public rankings once per local day, retaining originals and old timestamps on failure.
    if state.get('rankingsDate') != started.date().isoformat():
        try:
            node('modules/rankings/refresh.ts', timeout=180)
            state['rankingsDate'] = started.date().isoformat()
        except Exception:
            write_json(STATE, state)
            raise RuntimeError('Ranking refresh failed; successful snapshots retained, failed snapshot unchanged')
    write_json(STATE, state)
    status('research', phase='checked', proposedItems=len(proposal['items']), skipped=proposal['skipped'], finishedAt=finished)

if __name__ == '__main__':
    held = lock('research')
    while True:
        try: research()
        except Exception as error:
            print(str(error), flush=True); status('research', phase='failed', error=str(error))
            if '--once' in sys.argv: raise
            # Avoid retrying quota/auth failures every minute; retain a clear failed status.
            time.sleep(CONFIG['researchIntervalMinutes'] * 60)
        if '--once' in sys.argv: break
        time.sleep(30)
