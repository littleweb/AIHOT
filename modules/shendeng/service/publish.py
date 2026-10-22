"""Synchronize checked public JSON with the local API and existing GitHub Pages pipeline."""
import datetime, hashlib, html, json, pathlib, sys, time, urllib.request
from common import ROOT, DATA, CONFIG, read_json, write_json, run, node, lock, status
REPO = 'repos/' + CONFIG['repository']
STATE = DATA / 'publication.json'

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def public_files():
    paths = sorted((ROOT / 'site/editions').glob('*.json')) + sorted((ROOT / 'site/rankings').glob('*.json')) + sorted((ROOT / 'site/fulltext').glob('*.json'))
    return {str(p.relative_to(ROOT)): p.read_bytes() for p in paths}

def api(method, path, body=None):
    raw=run(['gh', 'api', '-X', method, path] + (['--input', '-'] if body is not None else []),
            input=json.dumps(body) if body is not None else None, capture=True)
    return json.loads(raw) if raw.strip() else None

def head_tree():
    parent = api('GET', REPO + '/git/ref/heads/main')['object']['sha']
    tree = api('GET', REPO + '/git/commits/' + parent)['tree']['sha']
    entries = api('GET', REPO + '/git/trees/' + tree + '?recursive=1')
    if entries.get('truncated'): raise RuntimeError('Remote tree truncated; publication stopped')
    return parent, tree, {e['path']: e['sha'] for e in entries['tree'] if e['type'] == 'blob'}

def changed_files(files, remote, baseline):
    changed = {p: data for p, data in files.items() if blob(data) != remote.get(p)}
    for path in changed:
        if path in baseline and baseline[path] != remote.get(path):
            raise RuntimeError('Remote public content changed independently: ' + path)
    return changed

def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ShendengNews-Service/1.0', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode()

def hot_snapshot():
    data=json.loads(get(CONFIG['localUrl']+'/api/site/hot'))
    # Compare published ranking values, not only membership. The worker recalculates heat
    # every five minutes; a new computedAt alone is not evidence of changed content.
    return [{'rank':i['rank'],'title':i['story']['title'],'story':'/story/'+i['story']['publicId'],
             'participants':i['participantCount'],
             'heat':i['heat'],'trend':i['trend'],'trendPct':i['trendPct'],
             'badges':i['badges'],'spark':i['spark'],'latest':i['latest']}
            for i in data['entries']]

def sync_hot(state):
    current=hot_snapshot()
    if 'hot' not in state:
        state['hot']=current;write_json(STATE,state);return
    if state['hot']==current:return
    parent,_,_=head_tree()
    requested=time.time()
    api('POST',REPO+'/actions/workflows/publish.yml/dispatches',{'ref':'main'})
    state['pending']={'commit':parent,'parent':parent,'files':{},'hot':current,'dispatchAt':requested}
    write_json(STATE,state);finish_pending(state)

def verify_online(pending):
    base = CONFIG['siteUrl']
    manifest = json.loads(get(base + '/export-manifest.json?commit=' + pending['commit']))
    if '/leaderboard' not in manifest['pages'] or '/skills' not in manifest['pages']:
        raise RuntimeError('Online manifest is missing ranking pages')
    for path in ['/', '/daily/index.html', '/topics/index.html', '/leaderboard/index.html', '/skills/index.html']:
        if '神灯AI热点' not in get(base + path): raise RuntimeError('Online page missing site identity: ' + path)
    for path in pending['files']:
        if path.startswith('site/rankings/'):
            snapshot = json.loads(pending['files'][path])
            route = '/leaderboard' if snapshot['kind'] == 'models' else '/skills'
            body = html.unescape(get(base + route + '/index.html'))
            captured = datetime.datetime.fromisoformat(snapshot['capturedAt'].replace('Z', '+00:00')).astimezone(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
            if snapshot['sourceUrl'] not in body or captured not in body:
                raise RuntimeError('Online ranking source or actual capture time differs from snapshot')
            for row in snapshot['rows']:
                if row['name'] not in body or row['displayValue'] not in body:
                    raise RuntimeError('Online ranking row missing: ' + row['name'])
            if '/leaderboard/index.html' not in body or '/skills/index.html' not in body or '返回' not in body:
                raise RuntimeError('Online ranking switch or return link missing')
        if path.startswith('site/fulltext/'):
            snapshot = json.loads(pending['files'][path])
            route = '/items/' + snapshot['articleId']
            detail = get(base + route + '/index.html')
            if '正文' not in detail: raise RuntimeError('Online full text missing')
            if snapshot['translation']:
                if route + '/original' not in manifest['pages']: raise RuntimeError('Online original language page missing')
                original = get(base + route + '/original/index.html')
                if '正文 · AI 翻译' not in detail or '正文 · 原文' not in original:
                    raise RuntimeError('Online language switch missing')
        if path.startswith('site/editions/'):
            edition = json.loads(pending['files'][path])
            if not edition['items']: continue
            item = edition['items'][-1]
            item_id = item.get('id') or 'r' + hashlib.sha256(item['url'].encode()).hexdigest()[:24]
            detail = get(base + '/items/' + item_id + '/index.html')
            if item['title'] not in html.unescape(detail) or item['url'] not in html.unescape(detail):
                raise RuntimeError('Online detail does not match published source')
            if '返回' not in detail: raise RuntimeError('Online detail return link missing')
            for subject in item.get('subjects', [])[:1]: get(base + '/topics/' + subject + '/index.html')
    # Technical-direction topic is part of the existing compatibility smoke check.
    get(base + '/topics/openai/index.html')
    get(base + '/topics/agent/index.html')
    if 'hot' in pending:
        hot_body=html.unescape(get(base+'/hot/index.html'))
        for entry in pending['hot']:
            if entry['title'] not in hot_body or entry['story'] not in manifest['pages']:
                raise RuntimeError('Online hot event or its exported detail is missing')
            event_body=get(base+entry['story']+'/index.html')
            if '返回' not in event_body:raise RuntimeError('Online event return link missing')

def finish_pending(state):
    pending = state['pending']
    head = api('GET', REPO + '/git/ref/heads/main')['object']['sha']
    if head == pending['parent'] and not pending.get('dispatchAt'):
        api('PATCH', REPO + '/git/refs/heads/main', {'sha': pending['commit'], 'force': False})
    elif head != pending['commit']:
        comparison = api('GET', REPO + '/compare/' + pending['commit'] + '...' + head)
        if comparison['status'] not in ['ahead', 'identical']:
            raise RuntimeError('Remote main changed before synchronization; pending publication needs review')
    status('publish', phase='waiting-for-pages', commit=pending['commit'])
    run_id = pending.get('runId')
    if not run_id:
        for _ in range(30):
            runs = api('GET', REPO + '/actions/workflows/publish.yml/runs?per_page=20')['workflow_runs']
            found = next((r for r in runs if r['head_sha'] == pending['commit'] and
                (not pending.get('dispatchAt') or r['event']=='workflow_dispatch' and
                 datetime.datetime.fromisoformat(r['created_at'].replace('Z','+00:00')).timestamp()>=pending['dispatchAt']-5)), None)
            if found: run_id = found['id']; break
            time.sleep(10)
        if not run_id: raise RuntimeError('No Pages run for published commit')
        pending['runId'] = run_id; write_json(STATE, state)
    run(['gh', 'run', 'watch', str(run_id), '--repo', CONFIG['repository'], '--exit-status', '--interval', '20'], timeout=3000)
    verify_online(pending)
    state['remote'].update({p: blob(data.encode()) for p, data in pending['files'].items()})
    if 'hot' in pending:state['hot']=pending['hot']
    state['lastPublishedAt'] = time.time(); state['lastCommit'] = pending['commit']; state['pending'] = None
    write_json(STATE, state)
    status('publish', phase='published', commit=state['lastCommit'], verified=True)

def sync():
    state = read_json(STATE, {'remote': {}, 'pending': None})
    if state.get('pending'): finish_pending(state); return
    files = public_files()
    # Query the remote only when local public data differs from the last successful baseline.
    local = {p: blob(data) for p, data in files.items()}
    if state.get('remote') and all(state['remote'].get(p) == sha for p, sha in local.items()): sync_hot(state);return
    parent, tree, remote = head_tree()
    changed = changed_files(files, remote, state.get('remote', {}))
    if not changed:
        state['remote'] = {p: remote.get(p) for p in files}; write_json(STATE, state)
        status('publish', phase='up-to-date', commit=parent); return
    status('publish', phase='validating', files=list(changed))
    node('modules/shendeng/validate-editions.ts')
    run(['npm', 'run', 'typecheck'], timeout=300)
    snapshot_dir = DATA / 'publication-input'; snapshot_dir.mkdir(exist_ok=True)
    for path, data in changed.items():
        if path.startswith('site/editions/'):
            snapshot = snapshot_dir / pathlib.Path(path).name; snapshot.write_bytes(data)
            node('modules/shendeng/import-reviewed.ts', str(snapshot), '--codex', timeout=300)
    node('modules/shendeng/fulltext.ts', 'import', timeout=300)
    node('scripts/smoke.ts', '--base', CONFIG['localUrl'], timeout=300)
    # Non-forced ref update rejects concurrent remote commits; no unrelated file is uploaded.
    entries = [{'path': p, 'mode': '100644', 'type': 'blob', 'content': data.decode()} for p, data in changed.items()]
    new_tree = api('POST', REPO + '/git/trees', {'base_tree': tree, 'tree': entries})['sha']
    commit = api('POST', REPO + '/git/commits', {'message': 'Sync source-checked AI updates ' + time.strftime('%Y-%m-%d %H:%M'), 'tree': new_tree, 'parents': [parent]})['sha']
    # Persist before ref mutation: a restart can resume the same run, never silently lose it.
    state['remote'] = {p: remote.get(p) for p in files}
    state['pending'] = {'commit': commit, 'parent': parent, 'files': {p: d.decode() for p, d in changed.items()},'hot':hot_snapshot()}
    write_json(STATE, state)
    api('PATCH', REPO + '/git/refs/heads/main', {'sha': commit, 'force': False})
    finish_pending(state)

if __name__ == '__main__':
    held = lock('publish')
    while True:
        try: sync()
        except Exception as error:
            print(str(error), flush=True); status('publish', phase='failed', error=str(error))
            if '--once' in sys.argv: raise
        if '--once' in sys.argv: break
        time.sleep(CONFIG['syncIntervalSeconds'])
