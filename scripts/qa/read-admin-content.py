#!/usr/bin/env python3
"""Read only content endpoints with an existing private administrator cookie jar.
No login, database connection, mutation, account/history export or secret output.
"""
import argparse, datetime, hashlib, http.cookiejar, json, pathlib, urllib.request

ORIGIN = 'https://ko-card-game.onrender.com'
PATHS = {'cards': '/api/admin/cards', 'champions': '/api/admin/champions',
         'tags': '/api/admin/tags/', 'tower': '/api/admin/tower/'}
CONTENT_KEYS = {'cards': 'cards', 'champions': 'champions', 'tags': 'tags'}
FORBIDDEN_KEYS = {'password', 'passwordHash', 'email', 'session', 'sessionToken',
                  'access_token', 'refresh_token', 'service_role', 'publishedBy', 'userId'}

def canonical(value):
    if isinstance(value, list) and value and all(isinstance(r, dict) and 'id' in r for r in value):
        value = sorted(value, key=lambda r: r['id'])
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def verify_content(value):
    if isinstance(value, dict):
        if FORBIDDEN_KEYS.intersection(value):
            raise ValueError('Content response contains a forbidden sensitive field; export stopped')
        for item in value.values(): verify_content(item)
    elif isinstance(value, list):
        for item in value: verify_content(item)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Unexpected redirect; do not forward administrator authentication')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cookie-file', required=True, type=pathlib.Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--output', type=pathlib.Path)
    group.add_argument('--check', type=pathlib.Path)
    args = parser.parse_args()
    jar = http.cookiejar.MozillaCookieJar(str(args.cookie_file))
    jar.load(ignore_discard=True, ignore_expires=False)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect())
    def get(name):
        with opener.open(urllib.request.Request(ORIGIN + PATHS[name], method='GET'), timeout=60) as response:
            value = json.load(response)
        value = value.get(CONTENT_KEYS[name], value) if name in CONTENT_KEYS and isinstance(value, dict) else value
        verify_content(value)
        return value
    data = {name: get(name) for name in PATHS}
    # Double read the mutable effect definitions before accepting a capture.
    for name in ('cards', 'champions'):
        if canonical(get(name)) != canonical(data[name]):
            raise ValueError('Content changed during capture; retry with a stable version')
    if args.check:
        changed = [name for name, value in data.items()
                   if canonical(value) != canonical(json.loads((args.check / (name + '.json')).read_text()))]
        print(json.dumps({'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          'changedFiles': changed, 'cardCount': len(data['cards']),
                          'championCount': len(data['champions'])}, ensure_ascii=False))
        return 1 if changed else 0
    args.output.mkdir(parents=True, exist_ok=False)
    files = {}
    for name, value in data.items():
        encoded = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
        (args.output / (name + '.json')).write_bytes(encoded)
        files[name] = {'sha256': hashlib.sha256(encoded).hexdigest()}
        if isinstance(value, list): files[name]['count'] = len(value)
    manifest = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sourceOrigin': ORIGIN, 'sourcePaths': list(PATHS.values()),
                'access': 'authenticated GET only; existing external cookie jar', 'files': files,
                'missing': ['Frozen published Tower V2 version not exposed by the content configuration endpoint']}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'cards': len(data['cards']), 'champions': len(data['champions']), 'output': str(args.output)}))
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        # Avoid exception repr, URLs with queries, headers, cookie or response-body output.
        print(json.dumps({'error': type(error).__name__, 'message': 'Read-only capture failed; check private session validity and content schema'}))
        raise SystemExit(2)
