"""macOS launchd supervisor for the original API/web/worker and the site's private sync jobs."""
import argparse, json, os, pathlib, plistlib, signal, subprocess, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from common import ROOT, DATA, CONFIG, runtime, environment, run, node, read_json, write_json, lock, status
LABEL = 'news.shendeng.local'
SCRIPT = pathlib.Path(__file__).resolve()
PLIST = pathlib.Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')

class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({p.stem: read_json(p) for p in DATA.glob('*-status.json')}, ensure_ascii=False).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *_): pass

def serve():
    held = lock('supervisor')
    cfg = runtime()
    try:
        run([cfg['pgBin'] + '/pg_isready', '-h', '127.0.0.1', '-p', '55439'], capture=True)
    except RuntimeError:
        run([cfg['pgBin'] + '/pg_ctl', '-D', cfg['pgData'], '-l', str(DATA / 'postgres.log'),
             '-o', '-p 55439 -h 127.0.0.1 -k /tmp', 'start'], capture=True)
    # The existing database is shared; shutting down this service never stops Postgres.
    server = ThreadingHTTPServer(('127.0.0.1', 3092), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    node_path = cfg['node']
    commands = {
        'api': ([node_path, '--env-file-if-exists=.env', 'apps/api/src/main.ts'], ROOT),
        'web': ([node_path, 'server.ts'], ROOT / 'apps/web'),
        'worker': ([node_path, '--env-file-if-exists=.env', 'apps/worker/src/main.ts'], ROOT),
        'publish': ([sys.executable, '-u', str(SCRIPT.with_name('publish.py'))], ROOT),
        'fulltext': ([sys.executable, '-u', str(SCRIPT.with_name('fulltext.py'))], ROOT),
        'research': ([sys.executable, '-u', str(SCRIPT.with_name('research.py'))], ROOT),
    }
    children = {}; logs = {}; stopping = False
    def shutdown(*_):
        nonlocal stopping
        stopping = True
        for child in children.values():
            if child.poll() is None: child.terminate()
    signal.signal(signal.SIGTERM, shutdown); signal.signal(signal.SIGINT, shutdown)
    try:
        while not stopping:
            states = {}
            for name, (command, cwd) in commands.items():
                child = children.get(name)
                if child is None or child.poll() is not None:
                    if name in logs: logs[name].close()
                    target = DATA / (name + '.log')
                    if target.exists() and target.stat().st_size > 8_000_000: target.replace(target.with_suffix('.previous.log'))
                    logs[name] = target.open('a')
                    env = environment()
                    if name == 'web':
                        env.update(API_BASE_URL='http://127.0.0.1:3091', SITE_URL=CONFIG['localUrl'], WEB_PORT='3090', WEB_HOST='127.0.0.1')
                    children[name] = subprocess.Popen(command, cwd=cwd, env=env, stdout=logs[name], stderr=logs[name])
                states[name] = {'pid': children[name].pid, 'running': children[name].poll() is None}
            status('supervisor', phase='running', processes=states, localUrl=CONFIG['localUrl'])
            time.sleep(5)
    finally:
        shutdown()
        for child in children.values():
            try: child.wait(timeout=220)
            except subprocess.TimeoutExpired: child.kill(); child.wait()
        server.shutdown()
        for log in logs.values(): log.close()

def install(args):
    write_json(DATA / 'runtime.json', {'node': args.node, 'codex': args.codex, 'pgBin': args.pg_bin, 'pgData': args.pg_data, 'proxyUrl': args.proxy})
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    with PLIST.open('wb') as output:
        plistlib.dump({'Label': LABEL, 'ProgramArguments': [sys.executable, '-u', str(SCRIPT), 'run'],
                      'WorkingDirectory': str(ROOT), 'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30, 'ExitTimeOut': 240,
                      'EnvironmentVariables': {'PYTHONPYCACHEPREFIX': str(DATA / 'pycache')},
                      'StandardOutPath': str(DATA / 'supervisor.log'), 'StandardErrorPath': str(DATA / 'supervisor-error.log')}, output)
    print('Installed login service:', PLIST)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['install', 'run', 'status'])
    parser.add_argument('--node'); parser.add_argument('--codex'); parser.add_argument('--pg-bin'); parser.add_argument('--pg-data')
    parser.add_argument('--proxy')
    args = parser.parse_args()
    if args.action == 'install':
        if not all([args.node, args.codex, args.pg_bin, args.pg_data]): parser.error('All local runtime paths are required')
        install(args)
    elif args.action == 'run': serve()
    else: print(json.dumps({p.stem: read_json(p) for p in DATA.glob('*-status.json')}, ensure_ascii=False, indent=2))
