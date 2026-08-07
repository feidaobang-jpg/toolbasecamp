/**
 * Local generation history (IndexedDB) for instruct-edit / text-to-image.
 * Kept on-device only; capped per tool.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'tbc_img_gen_hist_v1';
  var STORE = 'items';
  var MAX_PER_TOOL = 24;
  var PROMPT_MAX = 240;

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
          store.createIndex('by_tool', 'tool', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('open failed')); };
    });
  }

  function b64ToBlob(b64, contentType) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: contentType || 'image/png' });
  }

  function trimPrompt(text) {
    var s = String(text || '').trim();
    if (s.length <= PROMPT_MAX) return s;
    return s.slice(0, PROMPT_MAX - 1) + '…';
  }

  function list(tool) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).index('by_tool').getAll(IDBKeyRange.only(tool));
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

  function pruneTool(tool) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.index('by_tool').getAll(IDBKeyRange.only(tool));
        req.onsuccess = function () {
          var rows = req.result || [];
          if (rows.length <= MAX_PER_TOOL) return;
          rows.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
          var drop = rows.length - MAX_PER_TOOL;
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

  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl || '').split(',');
      if (parts.length < 2) return null;
      var meta = parts[0] || '';
      var b64 = parts[1] || '';
      var ctypeMatch = /data:([^;]+)/i.exec(meta);
      return b64ToBlob(b64, (ctypeMatch && ctypeMatch[1]) || 'image/png');
    } catch (e) {
      return null;
    }
  }

  function itemToBlob(item) {
    if (!item) return Promise.resolve(null);
    if (item.imageBase64) {
      return Promise.resolve(b64ToBlob(item.imageBase64, item.contentType || 'image/png'));
    }
    if (item._wechatDataUrl) {
      var fromData = dataUrlToBlob(item._wechatDataUrl);
      if (fromData) return Promise.resolve(fromData);
    }
    if (item.imageUrl) {
      return fetch(item.imageUrl).then(function (res) {
        if (!res.ok) throw new Error('fetch failed');
        return res.blob();
      }).catch(function () {
        return null;
      });
    }
    return Promise.resolve(null);
  }

  function addFromBase64(tool, images, meta) {
    meta = meta || {};
    var prompt = trimPrompt(meta.prompt || '');
    var now = Date.now();
    var listIn = images || [];
    if (!listIn.length) return Promise.resolve();

    return Promise.all(listIn.map(itemToBlob)).then(function (blobs) {
      var rows = [];
      for (var i = 0; i < listIn.length; i++) {
        var item = listIn[i];
        var blob = blobs[i];
        if (!item || !blob) continue;
        rows.push({
          tool: tool,
          createdAt: now + i,
          model: item.model || '',
          prompt: prompt,
          contentType: blob.type || item.contentType || 'image/png',
          blob: blob,
          index: typeof item.index === 'number' ? item.index : null
        });
      }
      if (!rows.length) return Promise.resolve();

      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          var store = tx.objectStore(STORE);
          for (var j = 0; j < rows.length; j++) store.add(rows[j]);
          tx.oncomplete = function () {
            db.close();
            pruneTool(tool).then(resolve).catch(function () { resolve(); });
          };
          tx.onerror = function () {
            db.close();
            reject(tx.error);
          };
        });
      });
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

  function clear(tool) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var req = store.index('by_tool').openCursor(IDBKeyRange.only(tool));
        req.onsuccess = function () {
          var cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
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

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch (e) {
      return '';
    }
  }

  /**
   * Bind a history panel.
   * opts: { tool, gridEl, emptyEl, clearBtn, tr, modelTitle, onDownload, onEditAgain? }
   */
  function bindPanel(opts) {
    var tool = opts.tool;
    var gridEl = opts.gridEl;
    var emptyEl = opts.emptyEl;
    var clearBtn = opts.clearBtn;
    var tr = opts.tr;
    var modelTitle = opts.modelTitle || function (m) { return m; };
    var onDownload = opts.onDownload;
    var onEditAgain = opts.onEditAgain;
    var objectUrls = [];

    function revoke() {
      for (var i = 0; i < objectUrls.length; i++) {
        try { URL.revokeObjectURL(objectUrls[i]); } catch (e) {}
      }
      objectUrls = [];
    }

    function refresh() {
      if (!gridEl) return Promise.resolve();
      return list(tool).then(function (rows) {
        revoke();
        gridEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = rows.length > 0;
        if (clearBtn) clearBtn.hidden = rows.length === 0;
        for (var i = 0; i < rows.length; i++) {
          (function (row) {
            var card = document.createElement('div');
            card.className = 'instruct-result-card img-hist-card';
            var title = document.createElement('div');
            title.className = 'instruct-result-title';
            title.textContent = modelTitle(row.model) + (row.createdAt ? ' · ' + formatTime(row.createdAt) : '');
            var img = document.createElement('img');
            img.alt = '';
            if (row.prompt) img.title = row.prompt;
            if (global.TBImageCloud && global.TBImageCloud.isWeChat && global.TBImageCloud.isWeChat()) {
              var reader = new FileReader();
              reader.onload = function () {
                img.src = String(reader.result || '');
              };
              reader.readAsDataURL(row.blob);
            } else {
              var url = URL.createObjectURL(row.blob);
              objectUrls.push(url);
              img.src = url;
            }
            var actions = document.createElement('div');
            actions.className = 'img-hist-actions';
            if (typeof onEditAgain === 'function') {
              var again = document.createElement('button');
              again.type = 'button';
              again.className = 'tb-btn';
              again.textContent = tr('tools.instructEdit.editAgain');
              again.addEventListener('click', function () {
                onEditAgain(row.blob, row);
              });
              actions.appendChild(again);
            }
            var dl = document.createElement('button');
            dl.type = 'button';
            dl.className = 'tb-btn';
            dl.textContent = tr('tools.imageCloud.historyDownload');
            dl.addEventListener('click', function () {
              if (typeof onDownload === 'function') onDownload(row.blob, row);
            });
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tb-btn';
            rm.textContent = tr('tools.imageCloud.historyDelete');
            rm.addEventListener('click', function () {
              remove(row.id).then(refresh).catch(function () {});
            });
            actions.appendChild(dl);
            actions.appendChild(rm);
            card.appendChild(title);
            card.appendChild(img);
            if (global.TBImageCloud && global.TBImageCloud.isWeChat && global.TBImageCloud.isWeChat()) {
              var tip = document.createElement('p');
              tip.className = 'instruct-result-save-tip';
              tip.textContent = tr('tools.imageCloud.longPressSave');
              card.appendChild(tip);
            }
            card.appendChild(actions);
            gridEl.appendChild(card);
          })(rows[i]);
        }
      }).catch(function () {
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = tr('tools.imageCloud.historyUnavailable');
        }
        if (clearBtn) clearBtn.hidden = true;
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clear(tool).then(refresh).catch(function () {});
      });
    }

    return {
      refresh: refresh,
      save: function (images, meta) {
        return addFromBase64(tool, images, meta).then(refresh).catch(function () {
          return refresh();
        });
      }
    };
  }

  global.TBImageGenHistory = {
    MAX_PER_TOOL: MAX_PER_TOOL,
    list: list,
    addFromBase64: addFromBase64,
    remove: remove,
    clear: clear,
    b64ToBlob: b64ToBlob,
    bindPanel: bindPanel
  };
})(window);
