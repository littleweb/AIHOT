"""Private runtime state lives under .data; public configuration lives under site/."""
import json, os, pathlib, subprocess, time, fcntl, sys, uuid
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
    env['PATH'] = str(pathlib.Path(runtime()['node']).parent) + ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
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

RUNS = {}
EVENT_FIELDS = {'phase', 'error', 'startedAt', 'finishedAt', 'candidates', 'sourceFailures',
                'steps', 'proposedItems', 'completed', 'remaining', 'failed', 'total',
                'changed', 'commit', 'runNumber', 'runUrl', 'verified', 'mode'}

def start_task(name):
    RUNS[name] = {'id': uuid.uuid4().hex, 'startedAt': time.time()}

def status(name, **values):
    now = time.time()
    current = dict(updatedAt=now, **values)
    if name in RUNS:
        current['runId'] = RUNS[name]['id']
        current['runStartedAt'] = RUNS[name]['startedAt']
        current['pid'] = os.getpid()
    write_json(DATA / (name + '-status.json'), current)
    if name not in RUNS or values.get('phase') in {'up-to-date', 'disabled', 'idle'} and not values.get('manual'):
        return
    event = {key: value for key, value in values.items() if key in EVENT_FIELDS}
    if 'error' in event:
        event['error'] = str(event['error'])[:350]
    event.update(task=name, runId=RUNS[name]['id'], updatedAt=now)
    journal = DATA / (name + '-events.jsonl')
    if journal.exists() and journal.stat().st_size > 1024 * 1024:
        with journal.open('rb') as previous:
            previous.seek(-512 * 1024, os.SEEK_END)
            previous.readline()
            retained = previous.read()
        compacted = journal.with_suffix('.tmp')
        compacted.write_bytes(retained)
        compacted.replace(journal)
    with journal.open('a') as output:
        output.write(json.dumps(event, ensure_ascii=False) + '\n')

def take_request(name):
    try:
        (DATA / 'requests' / name).unlink()
    except FileNotFoundError:
        return False
    return True

def wait_for_request(name, seconds):
    deadline = time.monotonic() + seconds
    request = DATA / 'requests' / name
    while not request.is_file():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(2, remaining))

def run_research_codex(args, prompt, log):
    # JSONL output stays local. The client receives only a count of completed CLI steps.
    with log.open('wb') as output, log.with_suffix('.stderr').open('wb') as errors:
        with subprocess.Popen(args, cwd=ROOT, env=environment(), stdin=subprocess.PIPE,
                              stdout=output, stderr=errors) as process, log.open('rb') as reader:
            try:
                process.stdin.write(prompt.encode())
                process.stdin.close()
                deadline = time.monotonic() + 2700
                steps = 0
                while True:
                    returncode = process.poll()
                    previous = steps
                    while True:
                        position = reader.tell()
                        line = reader.readline()
                        if not line.endswith(b'\n'):
                            reader.seek(position)
                            break
                        try:
                            steps += json.loads(line).get('type') == 'item.completed'
                        except (ValueError, AttributeError):
                            pass
                    if steps != previous:
                        status('research', phase='researching', steps=steps)
                    if returncode is not None:
                        return returncode
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Codex CLI exceeded the research time limit')
                    time.sleep(2)
            finally:
                if process.poll() is None:
                    process.kill()
