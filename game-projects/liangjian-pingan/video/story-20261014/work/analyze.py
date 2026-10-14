"""Dump capture event landmarks + narration durations to UTF-8 for edit planning."""
import json, wave, os
from pathlib import Path
W = Path(__file__).resolve().parent
out = []
for name in ['full', 'rescue', 'lobby']:
    d = json.loads((W / 'capture' / f'{name}.json').read_text('utf-8'))
    fr = d.get('frames', [])
    out.append(f'===== {name}: frames={len(fr)} span={round(fr[-1]["t"],1) if fr else 0}s route={d.get("route")} errors={d.get("errors")}')
    if name != 'lobby':
        fin = d.get('final', {})
        out.append('  FINAL: ' + json.dumps(fin, ensure_ascii=False))
        for e in d.get('events', []):
            if 'event' in e:
                out.append(f'  [{round(e["source_seconds"],1)}] EVENT {e["event"]} {e.get("ending","")}')
        # phase changes and stamp changes
        last_phase, last_stamp = None, None
        for e in d.get('events', []):
            if 'phase' in e:
                if e['phase'] != last_phase:
                    out.append(f'  [{round(e["source_seconds"],1)}] PHASE {e["phase"]} (game t={round(e["t"],1)}) state={e["state"]}')
                    last_phase = e['phase']
                if e.get('stamp') != last_stamp:
                    out.append(f'  [{round(e["source_seconds"],1)}] STAMP "{e["stamp"]}"')
                    last_stamp = e.get('stamp')
    else:
        out.append('  clicked=' + str(d.get('clicked')) + ' last_frame_t=' + str(round(fr[-1]["t"],2)))
out.append('===== narration wavs')
tot = 0.0
for f in sorted((W / 'audio' / 'shared-zh').glob('*.wav')):
    with wave.open(str(f), 'rb') as w:
        dur = w.getnframes() / w.getframerate()
        ch, rate, sw = w.getnchannels(), w.getframerate(), w.getsampwidth()
    tot += dur
    j = json.loads((f.with_suffix('.json')).read_text('utf-8'))
    out.append(f'{f.name} {round(dur,2)}s ch={ch} rate={rate} marks={len(j["marks"])} :: {j["text"]}')
out.append(f'TOTAL narration {round(tot,1)}s')
dst = W / 'qa' / 'analyze.txt'
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text('\n'.join(out), 'utf-8')
print('wrote', dst, len(out))
