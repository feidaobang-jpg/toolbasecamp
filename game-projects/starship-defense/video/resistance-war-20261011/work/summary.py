"""汇总一个 take 的录制结果：事件时间线 + 镜头时长 + 通关状态。"""
import json, sys
from pathlib import Path

take = sys.argv[1] if len(sys.argv) > 1 else 'war-ch0'
d = json.loads((Path(__file__).resolve().parent / 'capture' / take / 'capture.json').read_text(encoding='utf-8'))

print(f"=== {take} ===")
print(f"duration {d['duration']:.1f}s | frames {len(d['frames'])} | shots {len(d['shots'])} | events {len(d['events'])}")
print(f"audioStarted={d['audioStarted']} audioStartTs={d.get('audioStartTs',0):.2f}")
print(f"phase_isolation={d['phase_isolation']}")
print(f"normal_rule_inputs_only={d['normal_rule_inputs_only']} errors={len(d['errors'])}")
fs = d['finalState']
print(f"finalState: active={fs.get('active')} chapter={fs.get('chapter')} phase={fs.get('phase')} over={fs.get('over')} finished={fs.get('finished')}")

print("--- 关键事件 ---")
KEY = ('destroyed', 'complete', 'result', 'reset', 'giveup', 'no-bunker', 'captured',
       'order-attack', 'mounted', 'breakthrough', 'escort', 'gate', 'cannon', 'delivered', 'advance')
for e in d['events']:
    n = e['name']
    if any(k in n for k in KEY):
        det = {k: v for k, v in e.items() if k not in ('name', 't', 'game', 'frame', 'state')}
        print(f"  {e['t']:6.1f}s f{e.get('frame',0):5} {n:34} {json.dumps(det, ensure_ascii=False)[:96]}")

print("--- 镜头时长 ---")
for s in d['shots']:
    print(f"  {s['name']:30} {str(s.get('startWall')):>7}~{str(s.get('endWall')):>7}s  frames={s.get('frames')}  sec={s.get('seconds')}")
