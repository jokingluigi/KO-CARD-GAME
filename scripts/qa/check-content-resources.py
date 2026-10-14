#!/usr/bin/env python3
"""GET game content resources with optional read-only administrator authentication; cache outside tracked files for browser QA."""
import argparse, concurrent.futures, hashlib, http.cookiejar, json, pathlib, urllib.error, urllib.parse, urllib.request
ORIGIN = 'https://ko-card-game.onrender.com'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--cookie-file', type=pathlib.Path, help='Existing private administrator cookie; used only on the fixed content origin')
p.add_argument('--snapshot', type=pathlib.Path, required=True)
p.add_argument('--cache', type=pathlib.Path, default=pathlib.Path('.local/qa/current-admin-resources'))
a = p.parse_args()
a.cache.mkdir(parents=True, exist_ok=True)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
opener = urllib.request.build_opener()
if a.cookie_file:
    jar = http.cookiejar.MozillaCookieJar(str(a.cookie_file))
    jar.load(ignore_discard=True, ignore_expires=False)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect())
urls = set()
def collect(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and key.lower().endswith('url') and item.startswith('/api/storage/objects/'):
                urls.add(item)
            else: collect(item)
    elif isinstance(value, list):
        for item in value: collect(item)
for name in ('cards', 'champions', 'tower'):
    collect(json.loads((a.snapshot / (name + '.json')).read_text()))
def check(path):
    result = {'path': path}
    try:
        with opener.open(ORIGIN + path, timeout=45) as response:
            data = response.read(32 * 1024 * 1024 + 1)
            if len(data) > 32 * 1024 * 1024: raise ValueError('Resource too large')
            result.update(status=response.status, mime=response.headers.get_content_type(), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            filename = hashlib.sha256(path.encode()).hexdigest()
            (a.cache / filename).write_bytes(data)
            result['cacheFile'] = filename
            result['validContentType'] = result['mime'].startswith(('image/', 'audio/', 'video/')) and len(data) > 0
    except urllib.error.HTTPError as error: result['status'] = error.code
    except Exception as error: result['error'] = type(error).__name__
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(check, sorted(urls)))
report = {'sourceOrigin': ORIGIN, 'anonymousGetOnly': not bool(a.cookie_file), 'authenticatedContentGetOnly': bool(a.cookie_file), 'resourceCount': len(results),
          'passed': sum(r.get('status') == 200 and r.get('validContentType', False) for r in results), 'results': results}
(a.cache / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'results'}))
raise SystemExit(0 if report['passed'] == len(results) else 1)
