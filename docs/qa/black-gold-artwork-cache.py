import sys,urllib.request,json,hashlib,pathlib
p=sys.argv[1]
assert p.startswith('/api/storage/objects/uploads/card-images/') and '..' not in p
out=pathlib.Path('/tmp/ko-board-image-cache');out.mkdir(exist_ok=True)
f=out/hashlib.sha256(p.encode()).hexdigest()
if not f.exists():
 with urllib.request.urlopen('https://ko-card-game-vr69.onrender.com'+p,timeout=45) as r:
  mime=r.headers.get_content_type();assert mime.startswith('image/');f.write_bytes(r.read())
 (out/(f.name+'.type')).write_text(mime)
print(json.dumps({'path':str(f),'type':(out/(f.name+'.type')).read_text()}))
