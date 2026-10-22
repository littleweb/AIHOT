"""Private runtime state lives under .data; public configuration lives under site/."""
import json, os, pathlib, subprocess, time, fcntl, sys
ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / '.data/service'
DATA.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT / 'site/continuous.json').read_text())

def write_json(path, value):
    path = pathlib.Path(path)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)

def read_json(path, default=None):
    return json.loads(pathlib.Path(path).read_text()) if pathlib.Path(path).exists() else default

def runtime():
    return read_json(DATA / 'runtime.json')

def environment():
    env = dict(os.environ)
    env['PATH'] = str(pathlib.Path(runtime()['node']).parent) + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    if runtime().get('proxyUrl'):
        for key in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
            env[key] = runtime()['proxyUrl']
        env['NO_PROXY'] = env['no_proxy'] = 'localhost,127.0.0.1,::1'
    # Keep the original engine's external API and push valves closed.
    for key in ['COLLECT_ENABLED', 'MODEL_CALLS_ENABLED', 'FEISHU_CONTENT_PUSH_ENABLED', 'FEISHU_INTERNAL_ENABLED', 'INDEXNOW_SUBMIT_ENABLED']:
        env[key] = 'false'
    return env

def run(args, timeout=180, capture=False, input=None, cwd=ROOT):
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=environment(), input=input, text=True,
                            stdout=subprocess.PIPE if capture else None, stderr=subprocess.PIPE if capture else None, timeout=timeout)
    if result.returncode:
        # Child output is private; never include credentials or full commands in status.
        if capture and result.stderr: print(result.stderr[-4000:], file=sys.stderr, flush=True)
        raise RuntimeError(f'{pathlib.Path(str(args[0])).name} exited {result.returncode}')
    return result.stdout if capture else None

def node(*args, **kwargs):
    return run([runtime()['node'], '--env-file-if-exists=.env', *args], **kwargs)

def lock(name):
    handle = (DATA / (name + '.lock')).open('a')
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return handle

def status(name, **values):
    write_json(DATA / (name + '-status.json'), dict(updatedAt=time.time(), **values))
