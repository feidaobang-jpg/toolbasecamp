"""Record completed visual inspection and persist the delivery location without publishing."""
from pathlib import Path
import json,re,datetime
R=Path(__file__).resolve().parent
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
index=read(R/'qa/frame-index.json')
write(R/'qa/visual-review.json',{'at':NOW,'method':'representative final frame inspection',
 'frame_count':len(index),'all_contact_pages_inspected':[0,1,2,3],
 'hud_and_subtitle_safe_area':'pass','result_table_not_obscured':'pass',
 'source_actions':'pass: engineer boarding, tank road movement/armor, death/forward deployment, H support, grenade, capture HUD and natural result',
 'medic_hp_evidence':'Original frame HUD at raw42.6915/42.7576 shows60; raw42.8042 returns100 after H, final55.53-55.65 approximately. No gameplay state modification.',
 'youtube_no_spoken_burned_captions':'pass; qa/youtube-clean-39.68.jpg inspected',
 'ending_full_text_and_hold':'pass','cover_full_and_320px_thumbnail':'pass',
 'subjective_audio_listening':'not-run','complete_motion_review':'pending human review',
 'actual_phone_platform_overlay_review':'not-run'})
log=(R/'qa/black-silence.log').read_text(encoding='utf-8-sig')
silences=[float(x) for x in re.findall(r'silence_start:\s*([\d.]+)',log)]
blacks=[float(x) for x in re.findall(r'black_start:\s*([\d.]+)',log)]
assert not blacks,blacks
assert all(t>=107 for t in silences),silences
write(R/'qa/black-silence.json',{'at':NOW,'unexpected_black_runs':'none at >=0.4 seconds',
 'unexpected_silence_runs':'none before ending hold at >=1.5 seconds / -45dB',
 'silence_start_seconds':silences,'intentional_tail_hold':True,'media':'shared-zh',
 'youtube_audio_shared_mix':True,'subjective_listening':'not-run'})
mylist=read(R/'toy-public-status.json')
if 'list' in mylist:
 game=next(x for x in mylist['list'] if str(x['id'])=='38678478981120')
 write(R/'toy-public-status.json',{'checked_at':NOW,'source':'toy mylist --json',
 'game':game,'public_page_text':'该内容已下架','public_browser_checks':['anonymous Playwright','Codex in-app browser'],
 'public_runtime_verified':False,'backend_status_observed':game['status'],
 'interpretation':'公开运行入口与CLI published信号不一致；不擅自断言已下架或已可玩。'})
state=read(R/'run-state.json')
state['delivery_path']='D:/project/toolbasecamp-artifacts/conquest-video-20261011'
state['preservation_status']='copy_and_hash_verification_pending'
state['resource_cleanup']={'capture_scripts_exited':True,'playwright_contexts_closed_in_finally':True,
 'toy_public_cua_tab_closed':True,'model_server_started':False,'preview_server_started':False}
write(R/'run-state.json',state)
