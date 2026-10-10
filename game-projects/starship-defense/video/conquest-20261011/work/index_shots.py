"""Map actual capture timestamps to the edit; retain source coordinates separately."""
from pathlib import Path
import json,sys
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
main=read(R/'capture/match-01/session.json')
base=read(R/'capture/match-01/01-opening/capture.json')
late=read(R/'capture/match-01/02-battle/capture.json')
vehicle=read(R/'capture/vehicle-02/01-opening/capture.json')
def event(name):return next(x for x in main['events'] if x['name']==name)
def offset(row,cap):return row['t']+base['started']/1000-cap['frames'][0]['timestamp']
win=offset(event('real-result'),late)
heal=offset(event('medic-heal'),base)
grenade=offset(event('grenade-116'),base)
M='capture/match-01/01-opening/raw.mp4';L='capture/match-01/02-battle/raw.mp4';V='capture/vehicle-02/01-opening/raw.mp4'
label='主战局 · 普通规则 · 1名玩家 + 7名电脑'
supp='补拍：另一局载具实战 · 普通规则'
plan={
 '01-hook':[[L,max(0,win-3.6),3.6,'主战局结尾预览 · 兵力票见底',False],['capture/match-01/real-result.png',0,None,'实际结算：3 : 0 险胜',True]],
 '02-map':[[M,57,None,label,False]],
 '03-tickets':[[M,70,None,label,False]],
 '04-kit':[[V,.7,4.1,supp+' · 五兵种固定装备',False],[V,8.1,None,supp+' · I 登乘坦克',False]],
 '05-tank':[[V,50.2,None,supp,False]],
 '06-spawn':[[M,26,5.2,label+' · 阵亡后选择兵种与据点',False],[M,35,None,label+' · 仓库附近重新部署',False]],
 '07-heal':[[M,max(0,heal-1.6),4.0,label+' · H 医疗支援',False],[M,69,None,label+' · 进入补给仓库占领圈',False]],
 '08-fight':[[M,max(0,grenade-4.2),None,label+' · 掩体交火与手雷',False]],
 '09-finish':[[L,max(0,win-8.4),None,label+' · 最后两个据点',False]],
 '10-result':[['capture/match-01/real-result.png',0,None,'主战局 · 03:45 实际结算 · 击杀94 : 105',True]],
 '11-close':[[M,54,5.7,'主战局复盘 · 向侧翼推进',False],['edit/shared-zh/closing.png',0,None,'',True]]
}
(R/'shot-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
evidence={'capture_mode':'realtime-automation','gameplay_modified':False,'time_scale':1,'main_result':main['final']['result'],'source_recordings':[{'file':M,'duration':base['frames'][-1]['timestamp']-base['frames'][0]['timestamp'],'frame_count':len(base['frames'])},{'file':L,'duration':late['frames'][-1]['timestamp']-late['frames'][0]['timestamp'],'frame_count':len(late['frames'])},{'file':V,'duration':vehicle['frames'][-1]['timestamp']-vehicle['frames'][0]['timestamp'],'frame_count':len(vehicle['frames'])}],'events':[{'name':x['name'],'wall_seconds':x['t'],'game_seconds':x['game'],'hp':x['state']['hp'],'stats':x['state']['stats']} for x in main['events']],'raw_time_offsets':{'result_in_late':win,'heal_in_opening':heal,'grenade_in_opening':grenade},'limitations':['One player seat and seven bots, not eight human players.','Supplemental tank footage is a separate match.','Final 30fps retains lower source frame cadence; no interpolation.']}
(R/'capture-receipts.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print('SOURCE OFFSETS',evidence['raw_time_offsets'])
