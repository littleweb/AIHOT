"""Publish locally reviewed content directly to Hong Kong OSS."""
import datetime, hashlib, html, json, sys, time, urllib.request
from common import ROOT, DATA, CONFIG, read_json, write_json, node, lock, status, start_task, take_request
from oss_release import options as oss_options, release as oss_release

STATE = DATA / 'oss-publication-inputs.json'


def public_files():
    paths = sorted((ROOT / 'site/editions').glob('*.json')) + sorted((ROOT / 'site/rankings').glob('*.json')) + sorted((ROOT / 'site/fulltext').glob('*.json'))
    return {str(p.relative_to(ROOT)): p.read_bytes() for p in paths}

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

def verify_online(pending):
    base = CONFIG['siteUrl']
    manifest = json.loads(get(base + '/export-manifest.json?verify=' + str(time.time_ns())))
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
            verify_subject_topic(item.get('subjects', []), detail, manifest)
    # Technical-direction topic is part of the existing compatibility smoke check.
    get(base + '/topics/openai/index.html')
    get(base + '/topics/agent/index.html')
    if 'hot' in pending: verify_hot(pending, manifest)

def verify_subject_topic(subjects, detail, manifest):
    # Entity IDs can lack topics or use a different topic slug. Only verify a
    # configured, exported company topic; an advertised but missing page is an error.
    topics=json.loads((ROOT/'industry/topics.json').read_text())['topics']
    slugs={t['entityId']:t['slug'] for t in topics if t.get('entityId')}
    for subject in subjects:
        slug=slugs.get(subject)
        if not slug: continue
        route='/topics/'+slug
        if route not in manifest['pages']:
            if route in detail: raise RuntimeError('Online company topic link has no exported page: '+route)
            continue
        get(CONFIG['siteUrl']+route+'/index.html')
        return

def verify_hot(pending, manifest):
    base=CONFIG['siteUrl']
    hot_body=html.unescape(get(base+'/hot/index.html'))
    active=None; verified=[]
    for entry in pending['hot']:
        # The 48-hour window can expire while Pages builds. Only an event absent from
        # both the deployed page and the current public ranking may leave expectations.
        if entry['title'] not in hot_body and entry['story'] not in hot_body:
            if active is None: active={e['story'] for e in hot_snapshot()}
            if entry['story'] not in active: continue
        if entry['title'] not in hot_body or entry['story'] not in manifest['pages']:
            raise RuntimeError('Online hot event or its exported detail is missing')
        event_body=get(base+entry['story']+'/index.html')
        if '返回' not in event_body:raise RuntimeError('Online event return link missing')
        verified.append(entry)
    pending['hot']=verified

def sync(manual=False):
    if oss_options().get('mode') != 'active':
        status('publish', phase='disabled', manual=manual)
        return
    previous = read_json(STATE, {})
    files = public_files()
    hashes = {path: hashlib.sha256(data).hexdigest() for path, data in files.items()}
    hot = hot_snapshot()
    current = {'files': hashes, 'hot': hot}
    if current == previous and not manual:
        return
    changed = {path: data for path, data in files.items()
               if hashes[path] != previous.get('files', {}).get(path)}
    if changed:
        status('publish', phase='validating', changed=len(changed))
        node('modules/shendeng/validate-editions.ts')
        snapshot_dir = DATA / 'publication-input'
        snapshot_dir.mkdir(exist_ok=True)
        for path, data in changed.items():
            if path.startswith('site/editions/'):
                snapshot = snapshot_dir / path.rsplit('/', 1)[-1]
                snapshot.write_bytes(data)
                node('modules/shendeng/import-reviewed.ts', str(snapshot), '--codex', timeout=300)
        if any(path.startswith('site/fulltext/') for path in changed):
            node('modules/shendeng/fulltext.ts', 'import', timeout=300)
    status('publish', phase='publishing-oss')
    def validate():
        status('publish', phase='verifying')
        latest = public_files()
        verify_online({'files': {path: data.decode() for path, data in changed.items()
                                 if latest.get(path) == data}, 'hot': hot})
    oss_release(active=True, validate=validate)
    write_json(STATE, current)
    status('publish', phase='published', verified=True, mode='oss')


if __name__ == '__main__':
    held = lock('publish')
    next_sync = 0
    while True:
        manual = take_request('publish')
        if manual or '--once' in sys.argv or time.monotonic() >= next_sync:
            start_task('publish')
            try:
                sync(manual)
            except Exception as error:
                print(str(error), flush=True)
                status('publish', phase='failed', error=str(error))
                if '--once' in sys.argv:
                    raise
            next_sync = time.monotonic() + CONFIG['syncIntervalSeconds']
        if '--once' in sys.argv:
            break
        if take_request('oss'):
            try:
                oss_release(active=oss_options().get('mode') == 'active')
            except Exception as error:
                print(str(error), flush=True)
                status('oss', phase='failed', error=str(error))
        time.sleep(2)
