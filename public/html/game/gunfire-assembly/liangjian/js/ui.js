// 界面：战斗信息、字幕、菜单（主菜单 / 暂停 / 结算）与键盘导航
import { clamp, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export const VIEW_NAMES = ['第三人称', '第一人称'];

const OPTS = {
  startPhase: { label: '起始阶段', where: 'm', fmt: (v, app) => v + ' ' + (app.chapter.phases[v] || '') },
  lives: { label: '命数', where: 'm', fmt: (v) => (v === 'inf' ? '无限命' : '经典 3 命') },
  armor: { label: '耐久', where: 'm', fmt: (v) => ({ std: '标准 5 格', easy: '宽松 8 格', one: '一发 1 格' }[v]) },
  demo: { label: '演示模式', where: 'mp', fmt: (v) => (v ? '开（无敌）' : '关') },
  view: { label: '视角', where: 'mp', fmt: (v) => VIEW_NAMES[v] },
  quality: { label: '画质', where: 'mp', fmt: (v, app) => (v === 'auto' ? '自动（' + (app.actualQuality() === 'high' ? '高' : '流畅') + '）' : v === 'high' ? '高' : '流畅') },
  volume: { label: '音量', where: 'mp', fmt: (v) => (v === 0 ? '静音' : v + '%') },
  touchKeys: { label: '触屏按键', where: 'm', fmt: (v) => ({ auto: '自动', show: '显示', hide: '隐藏' }[v]) },
  fps: { label: '帧率显示', where: 'mp', fmt: (v) => (v ? '开' : '关') },
  aimSens: { label: '瞄准灵敏度', where: 'mp', fmt: (v) => ({ low: '低', mid: '中', high: '高' }[v]) },
  mouseAim: { label: '鼠标瞄准', where: 'mp', fmt: (v) => (v === 'lock' ? '鼠标接管' : '按住拖动') },
  leftFire: { label: '左手开火键', where: 'mp', fmt: (v) => (v ? '开' : '关') },
};
const MODES = [['auto', '自动识别'], ['pc', '电脑键鼠'], ['touch', '手机触屏']];

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = $('hud'); this.touch = $('touch');
    $('boss').firstElementChild.textContent = app.chapter.bossName;
    this.dlgQ = []; this.dlgT = 0; this.stampT = 0; this.stampD = 0; this.toastT = 0;
    this.labels = {};
    this.cache = {};
    this.active = null;
    this.optBtns = [];
    this.modeBtns = [];
    this._buildMenus();
    this._bindTop();
    this._skills();
  }

  // ---------- 菜单 ----------
  _optBtn(key) {
    const b = el('button', 'btn opt');
    b.type = 'button'; b.dataset.opt = key;
    b.innerHTML = `<span class="ol">${OPTS[key].label}</span><span class="ov"></span>`;
    b.addEventListener('click', () => { this.app.cycle(key, 1); this.refresh(); });
    this.optBtns.push(b);
    return b;
  }
  _btn(text, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  _modes() {
    const row = el('div', 'modes');
    row.appendChild(el('span', '', '操作模式'));
    for (const [v, name] of MODES) {
      const b = this._btn(name, 'mode', () => { this.app.setMode(v); this.refresh(); });
      b.dataset.mode = v;
      row.appendChild(b);
      this.modeBtns.push(b);
    }
    return row;
  }
  _buildMenus() {
    // 主菜单
    const menu = $('menu'), p = el('div', 'panel');
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', '主菜单');
    const head = el('div', 'head');
    head.appendChild(el('div', 'logo', '亮剑'));
    const ch = this.app.chapter;
    head.appendChild(el('div', 'sub', `<strong>第${'一二三'[ch.num - 1]}章 · ${ch.title}</strong><span>${ch.blurb}</span>`));
    head.appendChild(el('div', 'seal', ch.seal));
    this.head = head;
    const start = el('div', 'row');
    this.btnStart = this._btn('开始战斗', 'primary', () => this.app.start(false));
    this.btnCont = this._btn('继续', 'center', () => this.app.start(true));
    start.appendChild(this.btnStart); start.appendChild(this.btnCont);
    this.startRow = start;
    // 选章：三章同一个页面，换章重新载入（场景各不相同）
    const chs = el('div', 'chapters');
    for (const c of this.app.chapters) {
      const b = this._btn(`<span class="cn">第${'一二三'[c.num - 1]}章</span><span class="ct">${c.name}</span>${c.soon ? '<span class="cs">' + (c.note || '制作中') + '</span>' : ''}`, 'chapter' + (c.id === ch.id ? ' cur' : ''), () => this.app.switchChapter(c.id));
      b.dataset.ch = c.id;
      if (c.soon) b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-pressed', String(c.id === ch.id));
      b.setAttribute('aria-label', `第${'一二三'[c.num - 1]}章 ${c.name}` + (c.soon ? '（' + (c.note || '制作中') + '）' : c.id === ch.id ? '（当前）' : ''));
      chs.appendChild(b);
    }
    this.chapterRow = chs;
    const opts = el('div', 'opts');
    for (const k of Object.keys(OPTS)) if (OPTS[k].where.includes('m')) opts.appendChild(this._optBtn(k));
    this.btnFullM = this._btn('<span class="ol">全屏</span><span class="ov">切换</span>', 'opt', () => this.app.fullscreen());
    opts.appendChild(this.btnFullM);
    this.btnBili = this._btn('<span class="ol">作者B站主页</span><span class="ov">飞刀班长</span>', 'opt', () => this.app.openAuthor());
    opts.appendChild(this.btnBili);
    opts.appendChild(this._btn('<span class="ol">返回大厅</span><span class="ov">枪火集结</span>', 'opt', () => this.app.toLobby()));
    const foot = el('div', 'foot', '<span class="pc-only"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　鼠标瞄准（点一下画面接管，<kbd>Esc</kbd> 释放）、左键开火、右键开镜　<kbd>空格</kbd> 跳　<kbd>R</kbd> 换弹　<kbd>G</kbd> 手榴弹　<kbd>F</kbd> 互动　<kbd>V</kbd> 亮剑　<kbd>X</kbd> 骑兵连　<kbd>C</kbd> 切换人称<br>纯键盘：<kbd>Q</kbd><kbd>E</kbd> 左右转　<kbd>Y</kbd><kbd>H</kbd> 上下转　<kbd>J</kbd> 开火　<kbd>K</kbd> 跳　<kbd>U</kbd> 手榴弹　<kbd>I</kbd> 互动（上炮 / 上机枪）　<kbd>L</kbd> 亮剑　<kbd>N</kbd> 骑兵连　<kbd>O</kbd> 开镜　<kbd>Enter</kbd> 开始</span><span class="touch-only">左下摇杆移动，右半屏滑动瞄准，按住开火键也能拖着瞄；准星靠近敌人会自动吸一点。打掉机枪手后，阵地里的机枪可以接管。</span>');
    this.menuOpts = opts; this.menuModes = this._modes();
    p.append(head, start, chs, opts, this.menuModes, foot);
    menu.appendChild(p);
    this.menuPanel = p;

    // 暂停
    const pause = $('pause'), pp = el('div', 'panel');
    pp.setAttribute('role', 'dialog'); pp.setAttribute('aria-label', '暂停');
    pp.appendChild(el('div', 'title2', '暂停 · 原地待命'));
    const cols = el('div', 'cols'), c1 = el('div', 'col'), c2 = el('div', 'col');
    this.btnResume = this._btn('继续战斗', 'primary', () => this.app.resume());
    c1.append(this.btnResume, this._btn('从本阶段重来', 'center', () => this.app.retryPhase()), this._btn('重新开始', 'center', () => this.app.restart()), this._btn('返回主菜单', 'center', () => this.app.toMenu()));
    const o2 = el('div', 'opts');
    for (const k of Object.keys(OPTS)) if (OPTS[k].where.includes('p')) o2.appendChild(this._optBtn(k));
    o2.appendChild(this._btn('<span class="ol">全屏</span><span class="ov">切换</span>', 'opt', () => this.app.fullscreen()));
    c2.append(o2, this._modes());
    c2.appendChild(el('div', 'foot', '<span class="pc-only">准星对着敌人开火，靠近目标会吸附，打头伤害加倍；<kbd>R</kbd> 换弹，打空自动换。<kbd>空格</kbd>/<kbd>K</kbd> 跳：能跳过铁丝网、跳上箱子和土台、跳进机枪阵地侧面，也能跳起躲 Boss 的突进。<kbd>I</kbd>/<kbd>F</kbd> 互动：打掉机枪手后走进阵地接管机枪；炮位旁上炮，<kbd>A</kbd><kbd>D</kbd> 转炮口、<kbd>W</kbd><kbd>S</kbd> 调仰角、开火键开炮；再按一次离开。<kbd>U</kbd>/<kbd>G</kbd> 手榴弹，<kbd>L</kbd>/<kbd>V</kbd> 亮剑（撞上 Boss 的拔刀突进就是拼刀），<kbd>N</kbd>/<kbd>X</kbd> 骑兵连，<kbd>Esc</kbd> 继续。</span><span class="touch-only">准星对着敌人开火，靠近目标会吸附，打头伤害加倍。跳：能跳过铁丝网、跳上箱子和土台、跳进机枪阵地侧面，也能跳起躲 Boss 的突进。打掉机枪手后走进阵地点“机枪”接管；炮位旁点“操炮”，摇杆转炮口、调仰角，开火键开炮。亮剑撞上 Boss 的拔刀突进就是拼刀。</span>'));
    cols.append(c1, c2); pp.appendChild(cols); pause.appendChild(pp);

    // 结算
    const res = $('result'), rp = el('div', 'panel');
    rp.setAttribute('role', 'dialog'); rp.setAttribute('aria-label', '战报');
    this.resTitle = el('div', 'title2');
    this.resRank = el('div', 'rank');
    this.resQuote = el('div', 'quote');
    this.resStats = el('div', 'stats');
    this.resTotal = el('div', 'total');
    const rr = el('div', 'row');
    this.btnAgain = this._btn('再战一次', 'primary', () => this.app.restart());
    rr.append(this.btnAgain, this._btn('返回主菜单', 'center', () => this.app.toMenu()));
    rp.append(this.resTitle, this.resRank, this.resStats, this.resTotal, this.resQuote, rr);
    res.appendChild(rp);
  }

  layout(compact) {
    // 紧凑横屏：开始按钮并到标题同一行，省出高度
    if (compact) this.head.appendChild(this.startRow);
    else this.menuPanel.insertBefore(this.startRow, this.menuPanel.children[1]);
    // 紧凑横屏：选章三键并进“操作模式”那一行，省出一行高度
    if (compact) this.menuModes.insertBefore(this.chapterRow, this.menuModes.firstChild);
    else this.menuPanel.insertBefore(this.chapterRow, this.menuOpts);
    this.compact = compact;
  }

  refresh() {
    const a = this.app;
    for (const b of this.optBtns) {
      const k = b.dataset.opt;
      b.querySelector('.ov').textContent = '◂ ' + OPTS[k].fmt(a.get(k), a) + ' ▸';
      b.setAttribute('aria-label', OPTS[k].label + '：' + OPTS[k].fmt(a.get(k), a));
    }
    for (const b of this.modeBtns) b.setAttribute('aria-pressed', String(a.get('mode') === b.dataset.mode));
    const cp = a.checkpoint();
    this.btnCont.hidden = !cp;
    if (cp) this.btnCont.textContent = '继续 · 第' + cp + '阶段';
    $('demo-badge').hidden = !a.get('demo');
    $('view-name').textContent = VIEW_NAMES[a.get('view')];
  }

  show(which) {
    for (const id of ['menu', 'pause', 'result']) $(id).hidden = id !== which;
    this.active = which;
    this.hud.hidden = which === 'menu';
    this.refresh();
    if (which) {
      const first = which === 'menu' ? (this.btnCont.hidden ? this.btnStart : this.btnStart) : which === 'pause' ? this.btnResume : this.btnAgain;
      $(which).scrollTop = 0;
      try { first.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  navItems() {
    if (!this.active) return [];
    return Array.from($(this.active).querySelectorAll('.btn')).filter((b) => !b.hidden && b.getClientRects().length > 0);
  }
  // 菜单键盘：↑↓ 选择，←→ 调整或在同组内移动，Enter/空格确认
  menuKey(e) {
    const items = this.navItems();
    if (!items.length) return false;
    let i = items.indexOf(document.activeElement);
    const code = e.code;
    if (code === 'ArrowDown' || code === 'ArrowUp' || code === 'KeyS' || code === 'KeyW') {
      const d = code === 'ArrowDown' || code === 'KeyS' ? 1 : -1;
      i = i < 0 ? 0 : (i + d + items.length) % items.length;
      items[i].focus(); items[i].scrollIntoView({ block: 'nearest' });
      this.app.sfx('ui');
      return true;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      const d = code === 'ArrowRight' || code === 'KeyD' ? 1 : -1;
      const cur = items[i];
      if (!cur) { items[0].focus(); return true; }
      if (cur.dataset.opt) { this.app.cycle(cur.dataset.opt, d); this.refresh(); this.app.sfx('ui'); }
      else {
        const sib = Array.from(cur.parentElement.querySelectorAll(':scope > .btn')).filter((b) => !b.hidden);
        const j = sib.indexOf(cur);
        const n = sib[(j + d + sib.length) % sib.length];
        if (n && n !== cur) { n.focus(); this.app.sfx('ui'); }
      }
      return true;
    }
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      const cur = items[i] || items[0];
      cur.click();
      return true;
    }
    return false;
  }

  // ---------- 右上角按钮（按下即触发） ----------
  _bindTop() {
    const bind = (id, fn) => {
      const b = $(id);
      let last = 0;
      const run = (e) => { e.preventDefault(); e.stopPropagation(); const n = performance.now(); if (n - last < 250) return; last = n; fn(); };
      b.addEventListener('pointerdown', run);
      b.addEventListener('click', (e) => { if (e.detail === 0) run(e); });   // 键盘/读屏触发
    };
    bind('btn-view', () => this.app.nextView());
    bind('btn-pause', () => this.app.pause());
    bind('btn-full', () => this.app.fullscreen());
  }
  _skills() {
    const box = $('skills');
    this.chips = {};
    for (const k of ['fire', 'nade', 'dash', 'cav']) { const d = el('div'); box.appendChild(d); this.chips[k] = d; }
  }
  // 动作键状态：触屏按钮与电脑右下角的状态条共用
  setAction(key, label, sub, disabled, keyText) {
    const sig = label + '|' + sub + '|' + disabled;
    if (this.cache['a' + key] === sig) return;
    this.cache['a' + key] = sig;
    for (const id of key === 'fire' ? ['act-fire', 'act-fire2'] : ['act-' + key]) {
      const b = $(id);
      if (!b) continue;
      b.querySelector('span').textContent = label;
      const em = b.querySelector('em');
      if (em) em.textContent = sub || '';
      b.setAttribute('aria-disabled', String(!!disabled));
      b.setAttribute('aria-label', label + (sub ? ' ' + sub : ''));
    }
    const c = this.chips[key];
    if (c) { c.innerHTML = `<b>${keyText || ''}</b>${label}<em>${sub || '就绪'}</em>`; c.classList.toggle('off', !!disabled); }
  }
  // 互动键（操炮 / 接管机枪 / 离开）：电脑显示提示条，触屏显示按钮
  setUse(label) {
    if (this.cache.use === label) return;
    this.cache.use = label;
    const b = $('act-use');
    b.hidden = !label;
    if (label) b.querySelector('span').textContent = label;
  }
  setLeftFire(on) { $('act-fire2').hidden = !on; }
  setTouch(on, compact) {
    document.body.classList.toggle('touch-on', on);
    this.touch.hidden = !on;
    this.touchOn = on;
  }
  // 每一项单独不换行，窄了就整项换到下一行，不把“切换人称”这样的词拆开
  setKeyHint(html) { if (this.cache.kh !== html) { this.cache.kh = html; $('keyhint').innerHTML = html.split('　').map((x) => '<span class="kh">' + x + '</span>').join(' '); } }

  // ---------- 战斗信息 ----------
  setHP(hp, max, blink) {
    const sig = hp + '/' + max;
    const box = $('hp-pips');
    if (this.cache.hp !== sig) {
      this.cache.hp = sig;
      box.innerHTML = '';
      for (let i = 0; i < max; i++) box.appendChild(el('i', i < hp ? '' : 'off'));
      box.classList.toggle('low', hp <= 1 && max > 1);
    }
    box.classList.toggle('blink', !!blink);
  }
  setLives(t) { if (this.cache.lv !== t) { this.cache.lv = t; $('lives').textContent = t; } }
  setScore(n) { if (this.cache.sc !== n) { this.cache.sc = n; $('score').textContent = '战功 ' + n; } }
  setObjective(html) { if (this.cache.ob !== html) { this.cache.ob = html; $('objective').innerHTML = html; } }
  setCannon(frac, label = '炮组') {
    const row = $('cannon-row');
    if (frac === null) { if (!row.hidden) row.hidden = true; return; }
    row.hidden = false;
    if (this.cache.cl !== label) { this.cache.cl = label; row.firstElementChild.textContent = label; }
    const w = Math.round(clamp(frac, 0, 1) * 100);
    // 只有炮组血量低才标红；转移进度这类往上涨的进度条不标
    if (this.cache.cn !== w) { this.cache.cn = w; const b = $('cannon-bar'); b.style.width = w + '%'; b.classList.toggle('low', w < 35 && label === '炮组'); }
  }
  setBoss(frac, stun) {
    const b = $('boss');
    if (frac === null) { if (!b.hidden) b.hidden = true; return; }
    b.hidden = false;
    const w = Math.round(clamp(frac, 0, 1) * 1000) / 10;
    if (this.cache.bs !== w) { this.cache.bs = w; b.querySelector('b').style.width = w + '%'; }
    b.classList.toggle('stun', !!stun);
  }
  setAim(html, ok) {
    const a = $('aim-info');
    if (html === null) { if (!a.hidden) a.hidden = true; return; }
    a.hidden = false;
    if (this.cache.aim !== html) { this.cache.aim = html; a.innerHTML = html; }
    a.classList.toggle('ok', !!ok);
  }
  setCross(on, mag, ads, hit) {
    const c = $('crosshair');
    if (c.hidden === on) c.hidden = !on;
    const cls = (mag ? 'mag ' : '') + (ads ? 'ads ' : '') + (hit === 2 ? 'head' : hit === 1 ? 'hit' : '');
    if (this.cache.cx !== cls) { this.cache.cx = cls; c.className = cls; }
  }
  setCrossTip(t, head) { const e = $('cross-tip'); const sig = (t || '') + (head ? '!' : ''); if (this.cache.ct === sig) return; this.cache.ct = sig; e.hidden = !t; if (t) { e.textContent = t; e.className = head ? 'head' : ''; } }
  setVignette(v) { const s = v.toFixed(2); if (this.cache.vg !== s) { this.cache.vg = s; $('vignette').style.opacity = s; } }
  setPrompt(t) { const p = $('prompt'); if (this.cache.pr === t) return; this.cache.pr = t; p.hidden = !t; if (t) p.textContent = t; }
  setFps(t) { const f = $('fps'); if (t === null) { f.hidden = true; return; } f.hidden = false; f.textContent = t; }

  marker(show, x, y, text, rot) {
    const m = $('marker');
    if (!show) { if (!m.hidden) m.hidden = true; return; }
    m.hidden = false;
    m.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    m.firstElementChild.style.transform = `rotate(${rot.toFixed(2)}rad)`;
    if (this.cache.mk !== text) { this.cache.mk = text; m.lastElementChild.textContent = text; }
  }
  label(id, text, x, y, show, foe) {
    let s = this.labels[id];
    if (!s) { s = this.labels[id] = el('span', foe ? 'foe' : ''); s.textContent = text; $('labels').appendChild(s); }
    if (!show) { if (s.style.display !== 'none') s.style.display = 'none'; return; }
    if (s.style.display === 'none') s.style.display = '';
    s.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  clearLabels() { for (const k in this.labels) this.labels[k].style.display = 'none'; }

  say(name, text, opts = {}) {
    const item = { name, text, foe: !!opts.foe, dur: opts.dur || 1.3 + text.length * 0.11 };
    if (opts.now) { this.dlgQ.length = 0; this.dlgT = 0; }
    this.dlgQ.push(item);
  }
  stamp(text, dur = 1.3, cls = '') {
    const s = $('stamp');
    s.textContent = text; s.className = cls; s.hidden = false;
    // 字数多就按比例缩小，保证整句落在画面里
    const w = this.app.size()[0], base = this.compact ? 64 : 110;
    s.style.fontSize = Math.round(Math.min(base, (w * 0.8) / (text.length * 1.12))) + 'px';
    this.stampT = 0; this.stampD = dur;
  }
  toast(text, dur = 2.4) { const t = $('toast'); t.textContent = text; t.hidden = false; this.toastT = dur; }

  // 望远镜遮罩（过场里看远处用）：画在一张画布上，两个圆孔
  setBinoc(on) {
    let c = this.binoc;
    if (!on) { if (c && !c.hidden) c.hidden = true; return; }
    if (!c) { c = this.binoc = document.createElement('canvas'); c.id = 'binoc'; $('stage').insertBefore(c, $('hud')); }
    const [w, h] = this.app.size();
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = '#06080b'; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-out';
      const r = Math.min(h * 0.47, w * 0.27);
      for (const cx of [w / 2 - r * 0.8, w / 2 + r * 0.8]) {
        const g = x.createRadialGradient(cx, h / 2, r * 0.8, cx, h / 2, r);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, h / 2, r, 0, 7); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
    }
    c.hidden = false;
  }
  clearDialog() { this.dlgQ.length = 0; this.dlgT = 0; $('dialog').hidden = true; }
  clearTransient() {
    this.dlgQ.length = 0; this.dlgT = 0; $('dialog').hidden = true;
    $('stamp').hidden = true; this.stampD = 0;
    $('toast').hidden = true; this.toastT = 0;
    this.setPrompt(null); this.setAim(null); this.marker(false); this.setBoss(null); this.setCannon(null); this.setUse(null); this.setCrossTip(null); this.setCross(false);
    this.clearLabels();
    this.setVignette(0);
    this.setBinoc(false);
  }

  // 按游戏时间推进的动效（暂停时不走）
  update(dt) {
    // 字幕
    const dlg = $('dialog');
    if (this.dlgT > 0) { this.dlgT -= dt; if (this.dlgT <= 0) dlg.hidden = true; }
    if (this.dlgT <= 0 && this.dlgQ.length) {
      const it = this.dlgQ.shift();
      dlg.firstElementChild.textContent = it.name;
      dlg.lastElementChild.textContent = it.text;
      dlg.classList.toggle('foe', it.foe);
      dlg.hidden = false; this.dlgT = it.dur;
    }
    // 大字
    if (this.stampD > 0) {
      this.stampT += dt;
      const s = $('stamp'), t = this.stampT, d = this.stampD;
      if (t >= d) { s.hidden = true; this.stampD = 0; }
      else {
        const k = t < 0.14 ? 1.5 - (t / 0.14) * 0.5 : 1 + Math.max(0, 0.06 - (t - 0.14) * 0.3);
        s.style.transform = `translate(-50%,-50%) scale(${k.toFixed(3)}) rotate(-4deg)`;
        s.style.opacity = t > d - 0.28 ? ((d - t) / 0.28).toFixed(2) : '1';
      }
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').hidden = true; }
  }

  result(d) {
    this.resTitle.textContent = d.win ? (d.title || this.app.chapter.winTitle) : (this.app.chapter.loseTitle || '战斗受挫');
    this.resRank.textContent = d.win ? '评价：' + d.rank : '命数用尽';
    this.resQuote.innerHTML = d.quote;
    this.resStats.innerHTML = d.rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.resTotal.innerHTML = '战功合计 <b>' + d.score + '</b>' + (d.best ? '　最高 ' + d.best : '') + (d.demo ? '　（演示局不计最高）' : '');
    this.btnAgain.textContent = d.win ? '再战一次' : '重整再战';
    this.show('result');
  }
}
export { fmtTime };
