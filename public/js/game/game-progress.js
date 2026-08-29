/**
 * Shared campaign progress + 5-slot save/load for Treasure Box action games.
 *
 * Chapter layout (10 stages each):
 *   normal (1–2,4–5,7–8): mobs only
 *   miniboss (3,6,9): mobs + mini-boss
 *   boss (10): big-boss arena only (no mobs)
 * ≥10 chapters; each chapter has distinct theme; later chapters stronger.
 * After all chapters clear → next cycle (infinite), difficulty rises each cycle.
 *
 * PC extras: P and B both pause/resume (FC-style Start). V = select / soft function.
 */
(function (global) {
  'use strict';

  var LEVELS_PER_CHAPTER = 10;
  var DEFAULT_CHAPTERS = 12;
  var SLOTS = 5;

  /**
   * 12 chapter themes — distinct look + base multipliers.
   * chapterTheme() further scales by chapter index so ch N+1 > ch N.
   */
  var CHAPTER_THEMES = [
    { id: 1, name: '锈湾', mob: '巡逻杂兵', mini: '锈甲队长', boss: '锈湾堡垒', c1: '#8a9aa8', c2: '#3a4450', accent: '#c8d4e0', hue: 210 },
    { id: 2, name: '青苔沼', mob: '沼地爬虫', mini: '苔盾卫士', boss: '沼心巨兽', c1: '#5a8a58', c2: '#243028', accent: '#a8d090', hue: 130 },
    { id: 3, name: '熔岩脊', mob: '炎晶小怪', mini: '熔核先锋', boss: '火脊领主', c1: '#c06040', c2: '#401810', accent: '#ff9040', hue: 20 },
    { id: 4, name: '霜原', mob: '霜狼斥候', mini: '冰棱骑士', boss: '永冻王座', c1: '#7ab0c8', c2: '#183040', accent: '#d0f0ff', hue: 195 },
    { id: 5, name: '紫雾林', mob: '迷雾幽影', mini: '咒纹祭师', boss: '紫雾魔树', c1: '#8a6ab0', c2: '#2a1838', accent: '#e0a0ff', hue: 280 },
    { id: 6, name: '砂海', mob: '沙蝎游兵', mini: '风蚀巨镰', boss: '砂海沙皇', c1: '#c8a060', c2: '#403018', accent: '#ffe080', hue: 40 },
    { id: 7, name: '深渊礁', mob: '深水游魂', mini: '触须守卫', boss: '深渊海魔', c1: '#3a6a90', c2: '#0a1830', accent: '#60e0ff', hue: 200 },
    { id: 8, name: '雷暴原', mob: '静电游兵', mini: '雷锤战将', boss: '风暴巨像', c1: '#d0d060', c2: '#303010', accent: '#ffff80', hue: 55 },
    { id: 9, name: '夜鸦城', mob: '鸦影刺客', mini: '暗刃队长', boss: '夜鸦君主', c1: '#606878', c2: '#141820', accent: '#a0b0ff', hue: 240 },
    { id: 10, name: '赤晶矿', mob: '晶壳矿工', mini: '赤晶重甲', boss: '赤心晶龙', c1: '#e05070', c2: '#401020', accent: '#ff90b0', hue: 350 },
    { id: 11, name: '翡翠宫', mob: '翠卫步兵', mini: '玉锋将军', boss: '翡翠帝魂', c1: '#40c080', c2: '#104028', accent: '#90ffc0', hue: 150 },
    { id: 12, name: '终焉虚空', mob: '虚空碎灵', mini: '裂隙看守', boss: '终焉之眼', c1: '#a050ff', c2: '#180828', accent: '#ffd060', hue: 270 }
  ];

  function clampInt(n, a, b) {
    n = n | 0;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function roleOfStage(stage) {
    stage = clampInt(stage, 1, LEVELS_PER_CHAPTER);
    if (stage === 10) return 'boss';
    if (stage === 3 || stage === 6 || stage === 9) return 'miniboss';
    return 'normal';
  }

  function roleLabel(role) {
    if (role === 'boss') return '大Boss';
    if (role === 'miniboss') return '小Boss';
    return '普通';
  }

  /** cycle/chapter/stage are 1-based */
  function difficultyMul(cycle, chapter, stage) {
    cycle = Math.max(1, cycle | 0);
    chapter = Math.max(1, chapter | 0);
    stage = Math.max(1, stage | 0);
    return 1 + (cycle - 1) * 0.32 + (chapter - 1) * 0.045 + (stage - 1) * 0.012;
  }

  function label(cycle, chapter, stage, withRole) {
    var role = roleOfStage(stage);
    var s =
      '第' +
      cycle +
      '周目 · 第' +
      chapter +
      '章 · 第' +
      stage +
      '关';
    if (withRole !== false && role !== 'normal') s += ' · ' + roleLabel(role);
    return s;
  }

  function shortLabel(cycle, chapter, stage) {
    return 'W' + cycle + ' C' + chapter + '-' + stage;
  }

  function flatIndex(cycle, chapter, stage, chapters) {
    chapters = chapters || DEFAULT_CHAPTERS;
    return (
      (Math.max(1, cycle | 0) - 1) * chapters * LEVELS_PER_CHAPTER +
      (Math.max(1, chapter | 0) - 1) * LEVELS_PER_CHAPTER +
      (Math.max(1, stage | 0) - 1)
    );
  }

  function fromFlat(flat, chapters) {
    chapters = chapters || DEFAULT_CHAPTERS;
    flat = Math.max(0, flat | 0);
    var perCycle = chapters * LEVELS_PER_CHAPTER;
    var cycle = Math.floor(flat / perCycle) + 1;
    var rem = flat % perCycle;
    var chapter = Math.floor(rem / LEVELS_PER_CHAPTER) + 1;
    var stage = (rem % LEVELS_PER_CHAPTER) + 1;
    return { cycle: cycle, chapter: chapter, stage: stage, role: roleOfStage(stage) };
  }

  /** Advance one stage; wraps chapter → next chapter, last chapter → next cycle. */
  function nextProgress(cycle, chapter, stage, chapters) {
    chapters = chapters || DEFAULT_CHAPTERS;
    cycle = Math.max(1, cycle | 0);
    chapter = Math.max(1, chapter | 0);
    stage = Math.max(1, stage | 0);
    if (stage < LEVELS_PER_CHAPTER) {
      return { cycle: cycle, chapter: chapter, stage: stage + 1, role: roleOfStage(stage + 1) };
    }
    if (chapter < chapters) {
      return { cycle: cycle, chapter: chapter + 1, stage: 1, role: roleOfStage(1) };
    }
    return { cycle: cycle + 1, chapter: 1, stage: 1, role: roleOfStage(1) };
  }

  function pad2(n) {
    n = n | 0;
    return n < 10 ? '0' + n : String(n);
  }

  function formatSavedAt(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return (
      d.getFullYear() +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      ' ' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes())
    );
  }

  function emptySlots() {
    return [null, null, null, null, null];
  }

  /**
   * @param {string} storageKey e.g. 'tbc_bomberman_slots_v1'
   */
  function createSlots(storageKey) {
    function readAll() {
      try {
        var raw = localStorage.getItem(storageKey);
        if (!raw) return emptySlots();
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.slots)) return emptySlots();
        var slots = data.slots.slice(0, SLOTS);
        while (slots.length < SLOTS) slots.push(null);
        return slots;
      } catch (e) {
        return emptySlots();
      }
    }
    function writeAll(slots) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ v: 1, slots: slots }));
      } catch (e) {}
    }
    return {
      slots: SLOTS,
      list: readAll,
      save: function (i, payload) {
        i = i | 0;
        if (i < 0 || i >= SLOTS || !payload) return false;
        var slots = readAll();
        slots[i] = Object.assign({}, payload, { savedAt: Date.now() });
        writeAll(slots);
        return true;
      },
      load: function (i) {
        i = i | 0;
        if (i < 0 || i >= SLOTS) return null;
        return readAll()[i] || null;
      },
      clear: function (i) {
        i = i | 0;
        if (i < 0 || i >= SLOTS) return;
        var slots = readAll();
        slots[i] = null;
        writeAll(slots);
      },
      formatMeta: function (slot) {
        if (!slot) return '（空）';
        var head =
          '周目' +
          (slot.cycle || 1) +
          ' · 章' +
          (slot.chapter || 1) +
          '-' +
          (slot.stage || 1);
        if (slot.score != null) head += ' · 分' + Math.floor(slot.score);
        var t = formatSavedAt(slot.savedAt);
        return t ? head + ' · ' + t : head;
      }
    };
  }

  /** Last-continue cursor (separate from the 5 manual slots). */
  function createContinue(storageKey) {
    return {
      save: function (payload) {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify(Object.assign({}, payload, { savedAt: Date.now() }))
          );
        } catch (e) {}
      },
      load: function () {
        try {
          var raw = localStorage.getItem(storageKey);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      },
      clear: function () {
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {}
      }
    };
  }

  /**
   * Scale a numeric field with difficulty (enemies, quota, etc.).
   * @param {number} base
   * @param {number} diff
   * @param {{min?:number,max?:number,round?:boolean}} opt
   */
  function scaleNum(base, diff, opt) {
    opt = opt || {};
    var v = base * diff;
    if (opt.round !== false) v = Math.round(v);
    if (opt.min != null) v = Math.max(opt.min, v);
    if (opt.max != null) v = Math.min(opt.max, v);
    return v;
  }

  /**
   * Build one level cfg from templates + position.
   * templates: array of base cfgs (cycled by chapter); make(pos, base, diff) mutates/returns cfg.
   */
  function makeLevelCfg(templates, cycle, chapter, stage, chapters, make) {
    chapters = chapters || DEFAULT_CHAPTERS;
    var role = roleOfStage(stage);
    var diff = difficultyMul(cycle, chapter, stage);
    var ti = ((chapter - 1) + (stage - 1)) % Math.max(1, templates.length);
    var base = templates[ti];
    var cfg = make
      ? make(
          {
            cycle: cycle,
            chapter: chapter,
            stage: stage,
            role: role,
            diff: diff,
            chapters: chapters
          },
          base,
          diff
        )
      : Object.assign({}, base);
    if (!cfg.name) cfg.name = label(cycle, chapter, stage, true);
    cfg._meta = {
      cycle: cycle,
      chapter: chapter,
      stage: stage,
      role: role,
      diff: diff
    };
    return cfg;
  }

  /**
   * Per-chapter look + strength. Later chapters always stronger than earlier ones.
   * @param {number} chapter 1-based
   * @param {number} [cycle=1]
   */
  function chapterTheme(chapter, cycle) {
    chapter = Math.max(1, chapter | 0);
    cycle = Math.max(1, cycle | 0);
    var base = CHAPTER_THEMES[(chapter - 1) % CHAPTER_THEMES.length];
    var gen = Math.floor((chapter - 1) / CHAPTER_THEMES.length);
    var chScale = 1 + (chapter - 1) * 0.09 + (cycle - 1) * 0.22;
    return {
      id: base.id,
      chapter: chapter,
      cycle: cycle,
      name: gen ? base.name + '·改' + (gen + 1) : base.name,
      mob: base.mob,
      mini: base.mini,
      boss: base.boss,
      c1: base.c1,
      c2: base.c2,
      accent: base.accent,
      hue: base.hue,
      mobMul: +(chScale * 0.92).toFixed(3),
      miniMul: +(chScale * 1.15).toFixed(3),
      bossMul: +(chScale * 1.45).toFixed(3),
      label: '第' + chapter + '章 · ' + (gen ? base.name + '·改' + (gen + 1) : base.name)
    };
  }

  /**
   * Spawn composition for a stage:
   *  normal  → mobs only
   *  miniboss→ mobs + mini-boss
   *  boss    → big boss only (no mobs)
   */
  function spawnPlan(stage) {
    var role = roleOfStage(stage);
    if (role === 'boss') {
      return { role: role, mobs: false, miniboss: false, boss: true };
    }
    if (role === 'miniboss') {
      return { role: role, mobs: true, miniboss: true, boss: false };
    }
    return { role: role, mobs: true, miniboss: false, boss: false };
  }

  /** Convenience: theme + plan + diff for a position. */
  function encounter(cycle, chapter, stage) {
    var role = roleOfStage(stage);
    var theme = chapterTheme(chapter, cycle);
    var plan = spawnPlan(stage);
    var diff = difficultyMul(cycle, chapter, stage);
    return {
      cycle: cycle,
      chapter: chapter,
      stage: stage,
      role: role,
      theme: theme,
      plan: plan,
      diff: diff,
      strength:
        role === 'boss' ? theme.bossMul * diff : role === 'miniboss' ? theme.miniMul * diff : theme.mobMul * diff
    };
  }

  /** Pause keys: P / Escape / B (FC Start). */
  function isPauseCode(code) {
    return code === 'KeyP' || code === 'Escape' || code === 'KeyB';
  }
  function isPauseKey(k) {
    k = String(k || '').toLowerCase();
    return k === 'p' || k === 'escape' || k === 'b';
  }

  /** V = select / soft function (FC Select). */
  function isSelectCode(code) {
    return code === 'KeyV';
  }

  global.TBGameProgress = {
    LEVELS_PER_CHAPTER: LEVELS_PER_CHAPTER,
    DEFAULT_CHAPTERS: DEFAULT_CHAPTERS,
    SLOTS: SLOTS,
    CHAPTER_THEMES: CHAPTER_THEMES,
    roleOfStage: roleOfStage,
    roleLabel: roleLabel,
    difficultyMul: difficultyMul,
    label: label,
    shortLabel: shortLabel,
    flatIndex: flatIndex,
    fromFlat: fromFlat,
    nextProgress: nextProgress,
    createSlots: createSlots,
    createContinue: createContinue,
    scaleNum: scaleNum,
    makeLevelCfg: makeLevelCfg,
    chapterTheme: chapterTheme,
    spawnPlan: spawnPlan,
    encounter: encounter,
    isPauseCode: isPauseCode,
    isPauseKey: isPauseKey,
    isSelectCode: isSelectCode,
    formatSavedAt: formatSavedAt
  };
})(typeof window !== 'undefined' ? window : this);
