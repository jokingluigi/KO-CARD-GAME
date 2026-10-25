"""Restore the exact reviewed CC0 files from pinned provenance, without purchases."""
import hashlib,json,pathlib,urllib.request
root=pathlib.Path('artifacts/ko-game/public/vendor/kenney')
for entry in json.loads((root/'manifest.json').read_text()):
 target=root/entry['file']
 if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==entry['sha256']:continue
 data=urllib.request.urlopen(entry['url'],timeout=30).read()
 if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise ValueError('Asset hash mismatch: '+entry['file'])
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
