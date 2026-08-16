/**
 * Shared campaign progress + 5-slot save/load for Tool Basecamp action games.
 *
 * Chapter layout (10 stages):
 *   1–3 normal → 4 mini-boss → 5–7 normal → 8 mini-boss → 9 normal → 10 big boss
 * After all chapters clear → next cycle (infinite), difficulty rises each cycle.
 *
 * PC extras: P and B both pause/resume (FC-style Start). V = select / soft function.
 */
(function (global) {
  'use strict';

  var LEVELS_PER_CHAPTER = 10;
  var DEFAULT_CHAPTERS = 10;
  var SLOTS = 5;

  function clampInt(n, a, b) {
    n = n | 0;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function roleOfStage(stage) {
    stage = clampInt(stage, 1, LEVELS_PER_CHAPTER);
    if (stage === 10) return 'boss';
    if (stage === 4 || stage === 8) return 'miniboss';
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
    isPauseCode: isPauseCode,
    isPauseKey: isPauseKey,
    isSelectCode: isSelectCode,
    formatSavedAt: formatSavedAt
  };
})(typeof window !== 'undefined' ? window : this);
