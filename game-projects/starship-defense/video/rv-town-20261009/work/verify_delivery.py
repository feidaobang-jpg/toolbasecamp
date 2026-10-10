"""Validate the preserved artifact tree without regenerating movies or metadata."""
from pathlib import Path
import sys,json,hashlib
source=Path(__file__).resolve().parent.parent
target=Path(sys.argv[1]).resolve()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
files=[p for p in source.rglob('*') if p.is_file()]
for p in files:
 dest=target/p.relative_to(source)
 assert dest.is_file() and p.stat().st_size==dest.stat().st_size,str(dest)
critical=[p for p in files if (p.relative_to(source).parts[0] in ['final','review']) or p.suffix in ['.json','.py','.cjs','.md','.srt','.ass'] or p.name in ['raw.mp4','game-audio.webm']]
for p in critical:assert sha(p)==sha(target/p.relative_to(source)),str(p)
root=json.loads((target/'work/publish.json').read_text(encoding='utf-8'))
for v in root['variants']:
 mpath=target/'work'/v['manifest_file'];m=json.loads(mpath.read_text(encoding='utf-8'))
 assert sha(mpath.parent/m['video_file'])==m['video_sha256']
 for field in ['description_file','cover_file','credits']:assert (mpath.parent/m[field]).is_file()
 for s in m['subtitles']:assert sha(mpath.parent/s['file'])==s['sha256']
print(json.dumps({'all_file_count':len(files),'all_sizes_match':True,'critical_hashes_match':len(critical),'all_manifest_references_resolve':True,'target':str(target)},ensure_ascii=False))
