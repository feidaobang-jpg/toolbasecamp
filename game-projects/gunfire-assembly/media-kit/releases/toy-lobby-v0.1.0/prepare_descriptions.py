# -*- coding: utf-8 -*-
"""Prepare compact Bilibili descriptions for gunfire split. No network writes."""
from pathlib import Path
import hashlib
import json
import re

rel = Path(__file__).resolve().parent
before = rel / 'bili-before'
prepared = rel / 'prepared'
prepared.mkdir(parents=True, exist_ok=True)


def compact(text: str) -> str:
    return '\n'.join(line.strip() for line in text.splitlines() if line.strip())


def sha(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


BV1L = compact('''Toy直接试玩：https://www.bilibili.com/toy/feidao-gunfire/index.html （进入《枪火集结》大厅选「抗战战役 · 亮剑名场面」）
网站试玩（复制到浏览器）：https://www.zhengxiaohui.cn/games.html （列表里选「枪火集结」）
这期把亮剑名场面做成了能真打的抗战战役，现已拆进独立枪战游戏《枪火集结》大厅；共三章。
第一章李家坡，沿交通壕推进，手雷炸掉两座机枪堡垒再夺坡顶；第二章骑兵连，上马冲刺挥刀冲破封锁线，再护送运输车撤离；第三章平安县城，搬炮弹、接管攻城炮，落点环对准城门连开三炮轰开城门，带队进城打巷战。
全程正常规则通关，没开无敌没改数值，三章都能随时重玩、检查点续关。
抗战战役这一版用 Codex 开发；枪火集结大厅与网站同步开放。
你更想先玩骑兵冲锋还是先开那门炮？自研游戏投票页：https://www.zhengxiaohui.cn/game-vote.html （站内路径：游戏 → 自研游戏投票榜）''')

BV1K = compact('''最新一期：平安县城，开炮！三章抗战战役实机通关 https://www.bilibili.com/video/BV1Lfp76KEDd/
这场据点争夺最后3∶0险胜：我方击杀94，对方105。工程兵开坦克推进、阵亡后从已占据点部署、医疗兵回血，再守住通信站和补给仓库。
百宝箱试玩（复制到浏览器打开）：https://www.zhengxiaohui.cn/games.html （选择「枪火集结」→ 战地模式）
Toy直接试玩：https://www.bilibili.com/toy/feidao-gunfire/index.html
当前操作：WASD移动，J按住射击，I登乘/下车，H兵种支援，U手雷；步行第一人称手动瞄准、载具第三人称。视频保留此前自动瞄准的录制实况，以当前试玩为准。
战地据点现已迁入独立游戏《枪火集结》大厅；本期展示真实实战。
投票／愿望单（复制到浏览器打开）：https://www.zhengxiaohui.cn/game-vote.html （百宝箱 → 游戏 → 自研游戏投票榜）
更新（2026-10-12）：战地与抗战已拆到《枪火集结》独立大厅与Toy；虫潮围城继续做基地防守、银行塔防、房车与虫族。网站已更新，枪火集结Toy已上线。''')

UPDATE = (
    '更新（2026-10-12）：战地据点与抗战战役已迁至独立游戏《枪火集结》'
    '（Toy：https://www.bilibili.com/toy/feidao-gunfire/index.html）；'
    '虫潮围城保留基地防守、银行塔防、房车与虫族。网站已同步。'
)


def replace_update_line(text: str, update: str) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    idxs = [i for i, ln in enumerate(lines) if re.match(r'^更新（', ln.strip())]
    if len(idxs) > 1:
        raise SystemExit(f'multiple update lines: {idxs}')
    if idxs:
        lines[idxs[0]] = update
    else:
        lines.append(update)
    return compact('\n'.join(lines))


def main() -> None:
    for bvid, text in [('BV1Lfp76KEDd', BV1L), ('BV1KFpJ6sEEK', BV1K)]:
        (prepared / f'{bvid}.txt').write_text(text, encoding='utf-8')
        print(bvid, 'chars', len(text), 'sha', sha(text)[:12])

    for bvid in ['BV1Ujad6DEuf', 'BV1WbHq6eEBt', 'BV1C5HQ6gEvD']:
        src = (before / f'{bvid}.txt').read_text(encoding='utf-8')
        out = replace_update_line(src, UPDATE)
        (prepared / f'{bvid}.txt').write_text(out, encoding='utf-8')
        print(bvid, 'chars', len(out), 'sha', sha(out)[:12])
        if '战地模式也保留' in out:
            print(' WARN still has old phrase', bvid)

    meta = {
        'toy_id': '43022175699968',
        'toy_slug': 'feidao-gunfire',
        'toy_status': 'published',
        'toy_url': 'https://www.bilibili.com/toy/feidao-gunfire/index.html',
        'targets': [
            {'bvid': 'BV1Lfp76KEDd', 'kind': 'gunfire_full', 'bind_toy': '43022175699968'},
            {'bvid': 'BV1KFpJ6sEEK', 'kind': 'gunfire_full', 'bind_toy': '43022175699968'},
            {'bvid': 'BV1Ujad6DEuf', 'kind': 'chongchao_update_line', 'bind_toy': '38678478981120'},
            {'bvid': 'BV1WbHq6eEBt', 'kind': 'chongchao_update_line', 'bind_toy': '38678478981120'},
            {'bvid': 'BV1C5HQ6gEvD', 'kind': 'chongchao_update_line', 'bind_toy': '38678478981120'},
        ],
    }
    (rel / 'description-plan.json').write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print('prepared ok')


if __name__ == '__main__':
    main()
