# -*- coding: utf-8 -*-
"""给 narration.json 的每行解说补英文翻译（YouTube 中英可切换字幕用）。幂等：按 id 覆盖 en 字段。"""
import json
from pathlib import Path

EN = {
 '01a': "The bridge snaps, and Bowser drops into the lava before he can finish a single threat.",
 '01b': "This is World 1-4 in Super Mario 3D: Bowser's Castle.",
 '02a': "You've already played the first three worlds - sky, cave, treetops.",
 '02b': "This update adds the last door: the menu can start straight at 1-4 Castle, and finishing 1-3 rolls right into it.",
 '03a': "The contrast hits immediately - the background is basically black, only the lava glows.",
 '03b': "The floor is 160 columns of castle stone, with stairs stepping down one block at a time.",
 '04a': "Four lava pits are hidden along the way; fall into one and that's a life gone.",
 '04b': "Seven fire bars spin down the corridor - I matched their speed and turning direction frame by frame against the original.",
 '04c': "Wait for the gap. Charging through always costs you.",
 '04d': "If you like watching a fire bar sweep past, tap that like button.",
 '05a': "Six hidden coin blocks are tucked in this level. I bonked one this run, so the coin counter goes from 0 to 1.",
 '06a': "I ran the exact same route in all five camera views.",
 '06b': "Over-the-shoulder is the most intense - the fire bars come straight at you.",
 '07a': "Press C once more and you're in first person, where fireballs fill your face and the path basically disappears.",
 '07b': "Fun for a look; the earlier views are what actually clear the level.",
 '08a': "The last preset is top-down, where the whole castle layout reads at a glance.",
 '08b': "And besides C for presets, Q and E rotate the camera to any angle you want.",
 '09a': "On a phone it's a different control set: push the stick all the way to run, and the four buttons are I sprint, J fireball, K jump, U crouch.",
 '09b': "Hold the phone vertically and the menu turns itself sideways - no restart needed.",
 '09c': "This stretch really was driven on the touchscreen. A fire bar clipped me twice, but no deaths, and it still cleared.",
 '10a': "At the end of the corridor is the bridge Bowser guards - he paces, jumps, and inhales before breathing fire.",
 '10b': "Five fireballs reveal what he really is, but honestly the faster option is to just ignore him.",
 '11a': "A platform paces above the bridge. Double-jump onto it, go clean over Bowser's head and hit the axe.",
 '11b': "Touch the axe and the chains snap, the bridge collapses, and Bowser falls.",
 '12a': "Then the toad tells you: the bridge is cut, but the princess is in another castle.",
 '13a': "That completes 1-1 through 1-4. All 46 mechanic tests pass, and the website and Toy builds are already on this version.",
 '14a': "One honest note: this footage is driven by a test script along a verified route, not played by hand.",
 '14b': "The route came out of a depth-first search inside the same world - a few hundred nodes, 136 segments, zero damage.",
 '15a': "Next episode either keeps pushing forward or follows your votes - the voting page and the play link are the first lines of the description.",
 '15b': "If you cut this bridge too, tell me in the comments how much time you had left.",
}
p = Path(__file__).resolve().parent / 'narration.json'
cfg = json.loads(p.read_text(encoding='utf-8'))
missing = []
for sh in cfg['shots']:
    for ln in sh['lines']:
        if ln['id'] in EN:
            ln['en'] = EN[ln['id']]
        else:
            missing.append(ln['id'])
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('已写英文翻译，缺翻译的行:', missing or '无')
