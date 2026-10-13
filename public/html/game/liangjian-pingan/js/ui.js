// 界面：战斗信息、弹幕、字幕、菜单（主菜单 / 暂停 / 结算）与键盘导航
import { clamp, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export const PHASE_NAMES = ['', '扫清城外', '拉炮上阵', '开炮！', '打进县城', '决战山本'];
export const VIEW_NAMES = ['斜俯视', '战术俯视', '正视', '第一人称'];

const OPTS = {
  startPhase: { label: '起始阶段', where: 'm', fmt: (v) => v + ' ' + PHASE_NAMES[v] },
  lives: { label: '命数', where: 'm', fmt: (v) => (v === 'inf' ? '无限命' : '经典 3 命') },
  armor: { label: '耐久', where: 'm', fmt: (v) => ({ std: '标准 5 格', easy: '宽松 8 格', one: '一发 1 格' }[v]) },
  demo: { label: '演示模式', where: 'mp', fmt: (v) => (v ? '开（无敌）' : '关') },
  view: { label: '视角', where: 'mp', fmt: (v) => VIEW_NAMES[v] },
  quality: { label: '画质', where: 'mp', fmt: (v, app) => (v === 'auto' ? '自动（' + (app.actualQuality() === 'high' ? '高' : '流畅') + '）' : v === 'high' ? '高' : '流畅') },
  volume: { label: '音量', where: 'mp', fmt: (v) => (v === 0 ? '静音' : v + '%') },
  danmaku: { label: '弹幕', where: 'mp', fmt: (v) => (v ? '开' : '关') },
  touchKeys: { label: '触屏按键', where: 'm', fmt: (v) => ({ auto: '自动', show: '显示', hide: '隐藏' }[v]) },
  fps: { label: '帧率显示', where: 'mp', fmt: (v) => (v ? '开' : '关') },
};
const MODES = [['auto', '自动识别'], ['pc', '电脑键鼠'], ['touch', '手机触屏']];

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = $('hud'); this.touch = $('touch');
    this.dm = []; this.dmRows = []; this.dlgQ = []; this.dlgT = 0; this.stampT = 0; this.stampD = 0; this.toastT = 0;
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
    head.appendChild(el('div', 'sub', '<strong>攻打平安县城</strong><span>你是李云龙：带独立团扫清城外，把意大利炮拉上来，喊一声“开炮”轰开城楼，再打进县城会会山本一木。</span>'));
    head.appendChild(el('div', 'seal', '独立团<br>重做版'));
    this.head = head;
    const start = el('div', 'row');
    this.btnStart = this._btn('开始战斗', 'primary', () => this.app.start(false));
    this.btnCont = this._btn('继续', 'center', () => this.app.start(true));
    start.appendChild(this.btnStart); start.appendChild(this.btnCont);
    this.startRow = start;
    const opts = el('div', 'opts');
    for (const k of Object.keys(OPTS)) if (OPTS[k].where.includes('m')) opts.appendChild(this._optBtn(k));
    this.btnFullM = this._btn('<span class="ol">全屏</span><span class="ov">切换</span>', 'opt', () => this.app.fullscreen());
    opts.appendChild(this.btnFullM);
    this.btnBili = this._btn('<span class="ol">作者B站主页</span><span class="ov">飞刀班长</span>', 'opt', () => this.app.openAuthor());
    opts.appendChild(this.btnBili);
    const foot = el('div', 'foot', '<span class="pc-only"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动　<kbd>J</kbd> 射击/开炮　<kbd>K</kbd> 手榴弹　<kbd>U</kbd> 亮剑　<kbd>I</kbd> 骑兵连　<kbd>Q</kbd><kbd>E</kbd> 转视角　<kbd>C</kbd> 切换视角　鼠标按住空白处拖动转视角　<kbd>Enter</kbd> 开始</span><span class="touch-only">左下摇杆移动，右下四键出手，按住画面空白处拖动转视角。</span>');
    p.append(head, start, opts, this._modes(), foot);
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
    c2.appendChild(el('div', 'foot', '<span class="pc-only"><kbd>J</kbd> 射击（炮位旁按 J 操炮，操炮时 J 开炮、<kbd>W</kbd><kbd>S</kbd> 调仰角、<kbd>A</kbd><kbd>D</kbd> 转炮口、<kbd>K</kbd> 离开）　<kbd>K</kbd> 手榴弹　<kbd>U</kbd> 亮剑突进（能和山本拼刀）　<kbd>I</kbd> 骑兵连冲锋　<kbd>Esc</kbd> 继续</span><span class="touch-only">J 射击（炮位旁按 J 操炮，摇杆调炮口与仰角，K 离开）；K 手榴弹；U 亮剑突进，能和山本拼刀；I 呼叫骑兵连。</span>'));
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
    this.maxDm = compact ? 10 : 22;
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
    for (const k of ['J', 'K', 'U', 'I']) { const d = el('div'); box.appendChild(d); this.chips[k] = d; }
  }
  setAction(key, label, sub, disabled) {
    const sig = label + '|' + sub + '|' + disabled;
    if (this.cache['a' + key] === sig) return;
    this.cache['a' + key] = sig;
    const b = $('act-' + key);
    b.querySelector('span').textContent = label;
    b.querySelector('em').textContent = sub || '';
    b.setAttribute('aria-disabled', String(!!disabled));
    b.setAttribute('aria-label', key + ' ' + label + (sub ? ' ' + sub : ''));
    const c = this.chips[key];
    c.innerHTML = `<b>${key}</b>${label}<em>${sub || '就绪'}</em>`;
    c.classList.toggle('off', !!disabled);
  }
  setTouch(on, compact) {
    document.body.classList.toggle('touch-on', on);
    this.touch.hidden = !on;
    this.touchOn = on;
  }
  setKeyHint(html) { if (this.cache.kh !== html) { this.cache.kh = html; $('keyhint').innerHTML = html; } }

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
  setCannon(frac) {
    const row = $('cannon-row');
    if (frac === null) { if (!row.hidden) row.hidden = true; return; }
    row.hidden = false;
    const w = Math.round(clamp(frac, 0, 1) * 100);
    if (this.cache.cn !== w) { this.cache.cn = w; const b = $('cannon-bar'); b.style.width = w + '%'; b.classList.toggle('low', w < 35); }
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
  setCross(on, lock) { const c = $('crosshair'); if (c.hidden === on) c.hidden = !on; c.classList.toggle('lock', !!lock); }
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
    const w = this.app.size()[0], base = this.maxDm <= 10 ? 64 : 110;
    s.style.fontSize = Math.round(Math.min(base, (w * 0.8) / (text.length * 1.12))) + 'px';
    this.stampT = 0; this.stampD = dur;
  }
  toast(text, dur = 2.4) { const t = $('toast'); t.textContent = text; t.hidden = false; this.toastT = dur; }

  // 弹幕：可传一条或多条
  danmaku(texts, cls = '') {
    if (!this.app.get('danmaku')) return;
    const box = $('danmaku');
    const w = this.app.size()[0], h = box.clientHeight || 120;
    const rowH = this.maxDm <= 10 ? 22 : 30;
    const rows = Math.max(2, Math.floor(h / rowH));
    for (const t of [].concat(texts)) {
      if (this.dm.length >= this.maxDm) break;
      const s = el('span', cls); s.textContent = t;
      box.appendChild(s);
      // 选最空的一行
      let best = 0, bestX = Infinity;
      for (let r = 0; r < rows; r++) { const x = this.dmRows[r] || 0; if (x < bestX) { bestX = x; best = r; } }
      const x = Math.max(w + 20, (this.dmRows[best] || 0) + 40) + Math.random() * 120;
      const item = { el: s, x, y: best * rowH, w: t.length * (this.maxDm <= 10 ? 16 : 21) + 20, v: 150 + Math.random() * 90, row: best };
      this.dmRows[best] = x + item.w;
      this.dm.push(item);
      s.style.transform = `translate(${x}px,${item.y}px)`;
    }
  }
  clearTransient() {
    for (const d of this.dm) d.el.remove();
    this.dm.length = 0; this.dmRows.length = 0;
    this.dlgQ.length = 0; this.dlgT = 0; $('dialog').hidden = true;
    $('stamp').hidden = true; this.stampD = 0;
    $('toast').hidden = true; this.toastT = 0;
    this.setPrompt(null); this.setAim(null); this.marker(false); this.setBoss(null); this.setCannon(null);
    this.clearLabels();
    this.setVignette(0);
  }

  // 按游戏时间推进的动效（暂停时不走）
  update(dt) {
    // 弹幕
    if (this.dm.length) {
      for (let r = 0; r < this.dmRows.length; r++) if (this.dmRows[r]) this.dmRows[r] = Math.max(0, this.dmRows[r] - 200 * dt);
      for (let i = this.dm.length - 1; i >= 0; i--) {
        const d = this.dm[i];
        d.x -= d.v * dt;
        if (d.x < -d.w - 40) { d.el.remove(); this.dm.splice(i, 1); continue; }
        d.el.style.transform = `translate(${d.x.toFixed(1)}px,${d.y}px)`;
      }
    }
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
    this.resTitle.textContent = d.win ? '平安县城，拿下了！' : '攻城受挫';
    this.resRank.textContent = d.win ? '评价：' + d.rank : '命数用尽';
    this.resQuote.innerHTML = d.quote;
    this.resStats.innerHTML = d.rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.resTotal.innerHTML = '战功合计 <b>' + d.score + '</b>' + (d.best ? '　最高 ' + d.best : '') + (d.demo ? '　（演示局不计最高）' : '');
    this.btnAgain.textContent = d.win ? '再战一次' : '重整再战';
    this.show('result');
  }
}
export { fmtTime };
