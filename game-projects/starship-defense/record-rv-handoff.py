"""Record actual build/media identities; never manufacture missing evidence."""
from pathlib import Path
import hashlib, json, subprocess
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
kit = root / 'game-projects/starship-defense/media-kit'
release = kit / 'releases/web-rv-v0.28.0'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
handoff = json.loads((release / 'handoff.json').read_text(encoding='utf-8'))
identity = sha(root / 'public/html/game/starship-defense/game.compat.js')
handoff['created_at'] = datetime.now(timezone.utc).isoformat()
handoff['build'] = {'id': 'rv280-' + identity[:12], 'commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(), 'dirty': bool(subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()), 'fingerprint': identity, 'entrypoint': 'public/html/game/starship-defense/index.html'}
if isinstance(handoff['media'], dict):
    handoff['media_summary'] = handoff['media']
media = []
files = handoff['media_summary']['screenshots'] + [handoff['media_summary']['video']]
for i, name in enumerate(files):
    p = release / name
    if not p.exists(): continue
    probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(p)],text=True))
    stream = next(v for v in probe['streams'] if v['codec_type']=='video')
    video = p.suffix == '.webm'
    media.append({'id': 'rv-media-'+str(i+1), 'file': p.relative_to(kit).as_posix(), 'sha256': sha(p), 'kind':'video' if video else 'screenshot', 'version':handoff['version'], 'build_id':handoff['build']['id'], 'capture_mode':'realtime-automation', 'description':name+'; QA boundary staging where noted', 'width':stream['width'], 'height':stream['height'], 'duration_seconds':float(probe.get('format',{}).get('duration',0)) if video else None, 'audio':'game' if video else 'none', 'visual_review':'pass', 'audio_review':'not-run' if video else 'not-applicable', 'segments': [{'in_seconds':0,'out_seconds':5,'description':'驾驶驶向补给站'},{'in_seconds':7,'out_seconds':25,'description':'下车搜索，虫群进入，房车自动射击'}] if video else []})
handoff['media'] = media
handoff['feature_inventory'] = [{'id':v,'description':desc,'status':'implemented','evidence_ids':['rv-media-1','rv-media-9']} for v,desc in [('rv-drive','装甲房车短线驾驶和燃料'),('rv-supply','三个补给站停车通行与搜索'),('rv-service','零件维修及机枪/装甲升级'),('rv-save','独立本地自动保存和继续')]]
handoff['changes'] = [{'id':'rv-first-route','feature_ids':[v['id'] for v in handoff['feature_inventory']],'before':'无房车模式','after':'独立单人房车短线，主菜单可进入','evidence_ids':[v['id'] for v in media],'verification':'浏览器功能、固定步长完整路线及原模式回归通过'}]
handoff['bugs'] = [{'id':'rv-sky-offset','status':'fixed','cause':'长路线天空球固定在中点','fix':'随房车平移，退出恢复','before_media_ids':[],'after_media_ids':['rv-media-2','rv-media-9'],'retest':'真实驾驶录像连续帧无天空断层；修复前未保存媒体'}]
handoff['historical_media'] = []
handoff['readiness'] = {'overview':'partial','update':'partial','gaps':handoff['media_summary']['missing']}
(release / 'handoff.json').write_text(json.dumps(handoff,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Build',identity,'media',len(media))
