import sys,json,hashlib,pathlib
p=sys.argv[1]
assert p.startswith('/api/storage/objects/uploads/card-images/') and '..' not in p
out=pathlib.Path('/tmp/ko-board-image-cache');out.mkdir(exist_ok=True)
f=out/hashlib.sha256(p.encode()).hexdigest()
if not f.exists():
 raise FileNotFoundError("Read-only local artwork cache is missing this image; supply an offline export first")
print(json.dumps({'path':str(f),'type':(out/(f.name+'.type')).read_text()}))
