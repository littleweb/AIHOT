"""Export public SSR routes and send changed objects to the Hong Kong OSS bucket."""
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from common import CONFIG, DATA, ROOT, environment, lock, read_json, run, runtime, start_task, status, write_json

BUCKET = 'shendeng-news-hk'
REGION = 'cn-hongkong'
ENDPOINT = 'https://oss-cn-hongkong.aliyuncs.com'
ORIGIN = 'https://shendeng-news-hk.oss-cn-hongkong.aliyuncs.com'
DESTINATION = DATA / 'oss-static'
STATE = DATA / 'oss-objects.json'
SETTINGS = DATA / 'oss.json'
RECOVERY = DATA / 'oss-recovery'
REQUIRED = ('index.html', 'daily/index.html', 'hot/index.html', 'topics/index.html',
            'leaderboard/index.html', 'skills/index.html', 'assets/static-public.json', 'export-manifest.json')
CONTENT_TYPES = {'.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'}


def options():
    return read_json(SETTINGS, {})


def can_upload(settings):
    cli = Path(settings.get('cli') or 'ossutil')
    config = Path(settings.get('configFile') or '.ossutilconfig')
    return cli.is_absolute() and cli.is_file() and os.access(cli, os.X_OK) and config.is_absolute() and config.is_file()


def export():
    if not (ROOT / 'apps/web/build/client').is_dir():
        run(['npm', 'run', 'build', '--workspace', '@aihot/web'], timeout=600)
    destination = DESTINATION.with_name('oss-building')
    args = [runtime()['node'], 'scripts/export-static.ts', '--base', CONFIG['localUrl'],
            '--site-url', CONFIG['siteUrl'], '--out', str(destination), '--jobs', '8']
    status('oss', phase='exporting', completed=0)
    log = DATA / 'oss-export.log'
    with log.open('wb') as output:
        with subprocess.Popen(args, cwd=ROOT, env=environment(), stdout=output, stderr=output) as process:
            deadline = time.monotonic() + 7200
            completed = 0
            try:
                while process.poll() is None:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Static export exceeded 120 minutes')
                    with log.open('rb') as lines:
                        pages = sum(line.startswith(b'export /') for line in lines)
                    if pages != completed:
                        completed = pages
                        status('oss', phase='exporting', completed=completed)
                    time.sleep(3)
            finally:
                if process.poll() is None:
                    process.kill()
        if process.returncode:
            raise RuntimeError('Static export failed. See private oss-export.log')
    manifest_path = destination / 'export-manifest.json'
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or not manifest.get('staticReadingEdition'):
        raise RuntimeError('Missing public static export manifest')
    for name in REQUIRED:
        path = destination / name
        if not path.is_file() or not path.stat().st_size:
            raise RuntimeError('Static output missing ' + name)
    if '神灯AI热点' not in (destination / 'index.html').read_text():
        raise RuntimeError('Static output has the wrong site identity')
    manifest['pages'] = sorted(set(manifest['pages']))
    write_json(manifest_path, manifest)
    # Completion order varies across concurrent requests. Keep the shared catalog
    # stable for comparisons and show recently published articles first in search.
    catalog_path = destination / 'assets/static-public.json'
    public = read_json(catalog_path)
    public['catalog'].sort(key=lambda item: (str(item.get('publishedAt') or ''), item['id']), reverse=True)
    catalog_path.write_text(json.dumps(public, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
    fallback = destination / '404.html'
    if not fallback.exists():
        fallback.write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>找不到页面 · 神灯AI热点</title>'
                            '<h1>找不到页面</h1><a href="/">返回神灯AI热点</a></html>\n')
    # OSS serves mutable objects with revalidation. A per-export timestamp in each
    # page would otherwise force an upload even when its entire content is identical.
    for path in destination.rglob('*.html'):
        data = path.read_bytes()
        stable = re.sub(rb'data-static-snapshot="[a-z0-9]+"', b'data-static-snapshot="oss"', data)
        if stable != data:
            path.write_bytes(stable)
    if DESTINATION.exists():
        shutil.rmtree(DESTINATION)
    destination.rename(DESTINATION)
    return manifest


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hashes(directory):
    results = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Unexpected symlink in static export')
        if path.is_file() and path.name != '.nojekyll':
            results[path.relative_to(directory).as_posix()] = digest(path.read_bytes())
    return results


def download(base, name, require_oss=False):
    request = Request(base + '/' + quote(name) + '?verify=' + str(time.time_ns()),
                      headers={'Cache-Control': 'no-cache', 'User-Agent': 'ShendengNews-Service/1.0'})
    with urlopen(request, timeout=30) as response:
        if require_oss and not response.headers.get('x-oss-request-id'):
            raise RuntimeError('Public HTTPS domain is not served by OSS')
        return response.read()


def verify(base, expected, names):
    for name in names:
        if digest(download(base, name)) != expected[name]:
            raise RuntimeError('OSS verification mismatch: ' + name)


def upload(settings, directory, name):
    extension = Path(name).suffix
    content_type = CONTENT_TYPES.get(extension) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
    args = [settings['cli'], 'cp', str(directory / name), 'oss://' + BUCKET + '/' + name,
            '--config-file', settings['configFile'], '--profile', 'shendeng-news',
            '--region', REGION, '--endpoint', ENDPOINT, '--force', '--quiet',
            '--content-type', content_type, '--cache-control', 'no-cache']
    run(args, timeout=120, capture=True)


def release(active=False, validate=None):
    start_task('oss')
    held = lock('oss')
    try:
        _release(active, validate)
    finally:
        held.close()


def save_recovery(transaction, names, previous):
    old = {name: previous[name] for name in names if name in previous}

    def save(name):
        data = download(ORIGIN, name)
        if digest(data) != old[name]:
            raise RuntimeError('OSS object changed outside the publisher: ' + name)
        target = RECOVERY / 'objects' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(save, old))
    write_json(RECOVERY / 'rollback.json', {'transaction': transaction, 'objects': old})


def recover(settings, previous):
    plan = read_json(RECOVERY / 'rollback.json')
    if not plan:
        return
    if previous.get('transaction') != plan['transaction']:
        status('oss', phase='rolling-back')
        old = plan['objects']
        # Use the same ordering for recovery as for a forward deployment.
        batches = upload_plan(old, {'pages': []}, {})
        for batch in batches:
            for name in batch:
                if name in old:
                    upload(settings, RECOVERY / 'objects', name)
        verify(ORIGIN, old, old)
    shutil.rmtree(RECOVERY)


def upload_plan(current, manifest, previous):
    previous_hashes = previous.get('objects', {})
    changed = [name for name, sha in current.items()
               if previous_hashes.get(name) != sha and name != 'export-manifest.json']
    if not changed and manifest['pages'] == previous.get('pages') and previous_hashes:
        return []
    # Dependencies first, mutable entry points and deployment marker last.
    return [[name for name in changed if not name.endswith('.html')],
            [name for name in changed if name.endswith('.html') and name != 'index.html'],
            [name for name in changed if name == 'index.html'],
            ['export-manifest.json']]


def _release(active, validate=None):
    settings = options()
    status('oss', phase='checking', mode='active' if active else 'preview')
    if active and not can_upload(settings):
        raise RuntimeError('OSS upload profile is missing')
    previous = read_json(STATE, {})
    if can_upload(settings):
        recover(settings, previous)
    if active:
        # A matching manifest alone is insufficient when Pages serves the initial
        # snapshot too. Require the response to identify a live OSS request.
        manifest_name = 'export-manifest.json'
        if download(CONFIG['siteUrl'], manifest_name, require_oss=True) != download(ORIGIN, manifest_name):
            raise RuntimeError('Public HTTPS domain does not serve the Hong Kong OSS manifest')
        if not previous.get('objects'):
            raise RuntimeError('Complete and verify an OSS preview before activating publication')
    manifest = export()
    current = hashes(DESTINATION)
    if not can_upload(settings):
        status('oss', phase='local-ready', total=len(current),
               error='OSS upload needs a local ossutil configuration and the shendeng-news profile')
        return
    batches = upload_plan(current, manifest, previous)
    completed = 0
    total = sum(map(len, batches))
    transaction = uuid.uuid4().hex
    if active and total:
        status('oss', phase='saving-previous')
        save_recovery(transaction, (name for batch in batches for name in batch), previous['objects'])
    try:
        status('oss', phase='uploading', completed=completed, total=total)
        if total:
            with ThreadPoolExecutor(max_workers=8) as pool:
                for batch in batches:
                    for _ in pool.map(lambda name: upload(settings, DESTINATION, name), batch):
                        completed += 1
                        if completed % 10 == 0 or completed == total:
                            status('oss', phase='uploading', completed=completed, total=total)
        else:
            current['export-manifest.json'] = previous['objects']['export-manifest.json']
        status('oss', phase='verifying', completed=completed, total=total)
        samples = list(REQUIRED)
        for prefix in ('/items/', '/story/'):
            route = next((page for page in manifest['pages'] if page.startswith(prefix)
                          and page.count('/') == 2), None)
            if route:
                name = route.lstrip('/') + '/index.html'
                if name in current:
                    samples.append(name)
        verify(ORIGIN, current, samples)
        if active:
            verify(CONFIG['siteUrl'], current, samples)
        if validate:
            validate()
        write_json(STATE, {'objects': current, 'pages': manifest['pages'], 'verifiedAt': time.time(), 'transaction': transaction})
    except Exception:
        try:
            recover(settings, previous)
        except Exception as recovery_error:
            raise RuntimeError('OSS upload failed and recovery must be retried: ' + str(recovery_error)) from None
        raise
    if active and total:
        recover(settings, {'transaction': transaction})
    status('oss', phase='published', completed=completed, total=total, verified=True,
           mode='active' if active else 'preview')


if __name__ == '__main__':
    # Standalone preview can read from the same SSR service as Pages. All OSS
    # writes, including automatic deployments, share the same workspace lock.
    try:
        release()
    except BlockingIOError:
        raise SystemExit('OSS release already running') from None
    except Exception as error:
        status('oss', phase='failed', error=str(error))
        raise
