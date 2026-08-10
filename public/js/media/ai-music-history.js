/**
 * Local AI music history (IndexedDB) — on-device only, capped.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'tbc_ai_music_hist_v1';
  var STORE = 'items';
  var MAX_ITEMS = 24;
  var TOOL = 'ai_music';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_created', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('open failed')); };
    });
  }

  function list() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          rows.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
          resolve(rows);
        };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () { db.close(); };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function prune() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          if (rows.length <= MAX_ITEMS) return;
          rows.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
          var drop = rows.length - MAX_ITEMS;
          for (var i = 0; i < drop; i++) store.delete(rows[i].id);
        };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function add(item) {
    var row = {
      tool: TOOL,
      createdAt: Date.now(),
      model: item.model || '',
      title: item.title || '',
      prompt: item.prompt || '',
      lyrics: item.lyrics || '',
      duration: item.duration || 0,
      contentType: item.contentType || 'audio/mpeg',
      publicId: item.publicId || '',
      blob: item.blob
    };
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var req = tx.objectStore(STORE).add(row);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
        tx.oncomplete = function () { db.close(); };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    }).then(function (id) {
      return prune().then(function () { return id; });
    });
  }

  function remove(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function clear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  function bindPanel(opts) {
    opts = opts || {};
    var wrap = opts.wrap;
    var grid = opts.grid;
    var emptyEl = opts.empty;
    var clearBtn = opts.clearBtn;
    var tr = opts.tr || function (k) { return k; };
    var onPlay = opts.onPlay || function () {};

    function refresh() {
      if (!grid) return Promise.resolve();
      return list().then(function (rows) {
        grid.innerHTML = '';
        if (wrap) wrap.hidden = false;
        if (!rows.length) {
          if (emptyEl) emptyEl.hidden = false;
          return;
        }
        if (emptyEl) emptyEl.hidden = true;
        rows.forEach(function (row) {
          var card = document.createElement('div');
          card.className = 'ai-music-hist-card';
          var title = row.title || row.prompt || tr('tools.aiMusic.untitled');
          var meta = (row.model || '') + (row.duration ? (' · ' + row.duration + 's') : '');
          card.innerHTML =
            '<div class="ai-music-hist-title"></div>' +
            '<div class="ai-music-hist-meta"></div>' +
            '<div class="action-row" style="margin-top:8px">' +
              '<button type="button" class="tb-btn hist-play"></button>' +
              '<button type="button" class="tb-btn hist-dl"></button>' +
              '<button type="button" class="tb-btn hist-del"></button>' +
            '</div>';
          card.querySelector('.ai-music-hist-title').textContent = title;
          card.querySelector('.ai-music-hist-meta').textContent = meta;
          var playBtn = card.querySelector('.hist-play');
          var dlBtn = card.querySelector('.hist-dl');
          var delBtn = card.querySelector('.hist-del');
          playBtn.textContent = tr('tools.aiMusic.play');
          dlBtn.textContent = tr('tools.aiMusic.download');
          delBtn.textContent = tr('tools.aiMusic.delete');
          playBtn.addEventListener('click', function () {
            onPlay(row);
          });
          dlBtn.addEventListener('click', function () {
            if (!row.blob) return;
            var name = (row.title || 'ai-music').replace(/[\\/:*?"<>|]+/g, '') + '.mp3';
            if (typeof tbTriggerDownload === 'function') tbTriggerDownload(row.blob, name);
          });
          delBtn.addEventListener('click', function () {
            remove(row.id).then(refresh);
          });
          grid.appendChild(card);
        });
      }).catch(function () {
        if (wrap) wrap.hidden = true;
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clear().then(refresh);
      });
    }

    return {
      refresh: refresh,
      save: function (blob, meta) {
        if (!blob) return Promise.resolve();
        return add({
          blob: blob,
          model: meta && meta.model,
          title: meta && meta.title,
          prompt: meta && meta.prompt,
          lyrics: meta && meta.lyrics,
          duration: meta && meta.duration,
          contentType: meta && meta.contentType,
          publicId: meta && meta.publicId
        }).then(function () { return refresh(); });
      }
    };
  }

  global.TBAiMusicHistory = {
    list: list,
    add: add,
    remove: remove,
    clear: clear,
    bindPanel: bindPanel,
    TOOL: TOOL,
    MAX_ITEMS: MAX_ITEMS
  };
})(typeof window !== 'undefined' ? window : this);
