import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

document.addEventListener('DOMContentLoaded', function () {
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');
  var refPreviewWrap = document.getElementById('ref-preview-wrap');
  var refPreview = document.getElementById('ref-preview');
  var refClearBtn = document.getElementById('ref-clear-btn');
  var engineChecks = document.getElementById('engine-checks');
  var seedInput = document.getElementById('seed-input');
  var promptInput = document.getElementById('prompt-input');
  var startBtn = document.getElementById('start-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var downloadBtn = document.getElementById('download-btn');
  var clearBtn = document.getElementById('clear-btn');
  var progressWrap = document.getElementById('progress-wrap');
  var progressStatus = document.getElementById('progress-status');
  var progressPercent = document.getElementById('progress-percent');
  var progressBar = document.getElementById('progress-bar');
  var resultBox = document.getElementById('result-box');
  var metaLine = document.getElementById('meta-line');
  var compareList = document.getElementById('compare-mesh-list');
  var viewerEl = document.getElementById('viewer');
  var logOutput = document.getElementById('log-output');
  var engineLine = document.getElementById('engine-line');
  var historyList = document.getElementById('history-list');
  var copyLogBtn = document.getElementById('copy-log-btn');
  var openDirBtn = document.getElementById('open-dir-btn');
  var historyRefreshBtn = document.getElementById('history-refresh-btn');

  var API_BASE_URL = window.HomePcApi.base();
  var lastMeshUrl = '';
  var lastMeshName = 'mesh.glb';
  var lastFolder = '';
  var lastTaskId = '';
  var meshItems = [];
  var pollTimer = null;
  var fileBlob = null;
  var fileObjectUrl = '';
  var defaults = null;

  var renderer = null;
  var scene = null;
  var camera = null;
  var controls = null;
  var currentRoot = null;
  var animId = 0;

  function tr(key, fallback) {
    if (typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function log(msg) {
    logOutput.textContent += msg + '\n';
  }

  function assetUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path) || path.indexOf('blob:') === 0) return path;
    return HomePcApi.assetUrl(path);
  }

  function setBusy(busy, text) {
    progressWrap.style.display = busy ? 'block' : 'none';
    if (text) progressStatus.textContent = text;
    progressPercent.textContent = busy ? '…' : '';
    progressBar.style.width = busy ? '40%' : '0%';
    startBtn.disabled = busy;
    cancelBtn.style.display = busy ? '' : 'none';
  }

  function ensureViewer() {
    if (renderer) return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(1.6, 1.2, 1.8);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    viewerEl.innerHTML = '';
    viewerEl.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 2);
    scene.add(dir);
    var grid = new THREE.GridHelper(4, 16, 0x444444, 0x2a2a2a);
    scene.add(grid);
    function resize() {
      var w = viewerEl.clientWidth || 480;
      var h = viewerEl.clientHeight || w;
      if (h < 8) h = w;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    resize();
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(viewerEl);
    }
    function tick() {
      animId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    }
    tick();
  }

  function clearMesh() {
    if (!scene || !currentRoot) return;
    scene.remove(currentRoot);
    currentRoot.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
    currentRoot = null;
  }

  function fitCamera(object3d) {
    var box = new THREE.Box3().setFromObject(object3d);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z, 0.001);
    object3d.position.sub(center);
    object3d.position.y += size.y * 0.5;
    controls.target.set(0, size.y * 0.35, 0);
    camera.position.set(maxDim * 1.4, maxDim * 1.1, maxDim * 1.5);
    controls.update();
  }

  function loadMeshUrl(url) {
    ensureViewer();
    clearMesh();
    var full = assetUrl(url);
    if (!full) return Promise.reject(new Error('no mesh'));
    var lower = String(url).toLowerCase();
    return new Promise(function (resolve, reject) {
      if (lower.indexOf('.obj') >= 0) {
        new OBJLoader().load(
          full,
          function (obj) {
            obj.traverse(function (c) {
              if (c.isMesh) {
                c.material = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.05, roughness: 0.85 });
              }
            });
            currentRoot = obj;
            scene.add(obj);
            fitCamera(obj);
            resolve(obj);
          },
          undefined,
          reject
        );
      } else {
        new GLTFLoader().load(
          full,
          function (gltf) {
            currentRoot = gltf.scene;
            scene.add(gltf.scene);
            fitCamera(gltf.scene);
            resolve(gltf.scene);
          },
          undefined,
          reject
        );
      }
    });
  }

  function renderCompareButtons(items) {
    meshItems = (items || []).filter(function (x) { return x && x.url; });
    compareList.innerHTML = '';
    if (meshItems.length <= 1) {
      compareList.style.display = 'none';
      return;
    }
    compareList.style.display = 'flex';
    meshItems.forEach(function (it, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-btn';
      btn.textContent =
        (it.label || it.engine || 'mesh') +
        (it.elapsed_sec ? ' · ' + Number(it.elapsed_sec).toFixed(1) + 's' : '');
      btn.addEventListener('click', function () {
        lastMeshUrl = assetUrl(it.url);
        lastMeshName = it.filename || (String(it.url).toLowerCase().indexOf('.obj') >= 0 ? 'mesh.obj' : 'mesh.glb');
        metaLine.textContent =
          (it.label || it.engine || '') +
          (it.elapsed_sec ? ' · ' + Number(it.elapsed_sec).toFixed(1) + 's' : '') +
          (it.bytes ? ' · ' + Math.round(it.bytes / 1024) + ' KB' : '');
        downloadBtn.style.display = '';
        loadMeshUrl(it.url).catch(function (e) {
          alert(tr('privateHub.homePc.i23dPreviewFail', '预览加载失败') + ': ' + e);
        });
        Array.prototype.forEach.call(compareList.querySelectorAll('.tb-btn'), function (b, i) {
          b.classList.toggle('is-active', i === idx);
        });
      });
      if (idx === meshItems.length - 1) btn.classList.add('is-active');
      compareList.appendChild(btn);
    });
  }

  function showResult(url, items, meta) {
    lastMeshUrl = assetUrl(url);
    lastMeshName = String(url || '').toLowerCase().indexOf('.obj') >= 0 ? 'mesh.obj' : 'mesh.glb';
    resultBox.style.display = 'block';
    downloadBtn.style.display = url ? '' : 'none';
    metaLine.textContent = meta || '';
    renderCompareButtons(items || (url ? [{ url: url, label: 'mesh' }] : []));
    if (url) {
      loadMeshUrl(url).catch(function (e) {
        log('preview: ' + e);
      });
    }
  }

  function clearFile() {
    fileBlob = null;
    if (fileObjectUrl) {
      try { URL.revokeObjectURL(fileObjectUrl); } catch (e) {}
      fileObjectUrl = '';
    }
    fileInput.value = '';
    refPreview.removeAttribute('src');
    refPreviewWrap.hidden = true;
    if (dropZone) dropZone.style.display = '';
  }

  async function setFile(file) {
    if (!file) return;
    var prepared = file;
    if (window.TBImageUploadCompress && typeof TBImageUploadCompress.compressIfNeeded === 'function') {
      prepared = await TBImageUploadCompress.compressIfNeeded(file, 'default');
    }
    clearFile();
    fileBlob = prepared;
    fileObjectUrl = URL.createObjectURL(prepared);
    refPreview.src = fileObjectUrl;
    refPreviewWrap.hidden = false;
    if (dropZone) dropZone.style.display = 'none';
  }

  function selectedEngines() {
    var out = [];
    engineChecks.querySelectorAll('input[type=checkbox]:checked').forEach(function (el) {
      out.push(el.value);
    });
    return out;
  }

  function buildEngineChecks(meta, preferred) {
    engineChecks.innerHTML = '';
    var keys = Object.keys(meta || {});
    if (!keys.length) keys = ['triposr', 'hunyuan3d', 'trellis'];
    var pref = preferred && preferred.length ? preferred : ['triposr'];
    keys.forEach(function (k) {
      var st = (meta && meta[k]) || {};
      var label = document.createElement('label');
      label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:14px;cursor:pointer';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = k;
      cb.checked = pref.indexOf(k) >= 0;
      var span = document.createElement('span');
      span.textContent =
        (st.label || k) +
        (st.ready ? '' : ' · ' + tr('privateHub.homePc.i23dNotReady', '未就绪'));
      if (!st.ready) span.style.opacity = '0.65';
      label.appendChild(cb);
      label.appendChild(span);
      engineChecks.appendChild(label);
    });
  }

  async function loadDefaults() {
    var res = await fetch(API_BASE_URL + '/image-to-3d/defaults');
    var data = await res.json();
    defaults = data;
    buildEngineChecks(data.engine_meta || data.engines, data.default_engines || ['triposr']);
    if (data.hint) {
      var hint = document.getElementById('i23d-hint');
      if (hint) hint.textContent = data.hint;
    }
    var parts = [];
    var meta = data.engine_meta || {};
    Object.keys(meta).forEach(function (k) {
      var st = meta[k];
      parts.push((st.label || k) + (st.ready ? ' ✓' : ' ✗'));
    });
    engineLine.textContent =
      tr('privateHub.homePc.i23dEngineStatus', '图生 3D 引擎') + '：' + (parts.join(' · ') || '—');
  }

  function historyActions(it) {
    var row = document.createElement('div');
    row.className = 'action-row';
    function addBtn(text, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-btn';
      b.textContent = text;
      b.addEventListener('click', onClick);
      row.appendChild(b);
    }
    if (it.mesh_url) {
      addBtn(tr('privateHub.homePc.historyDownload', '下载'), function () {
        HomePcApi.downloadAsset(it.mesh_url, 'mesh.glb').catch(function (e) {
          alert(String((e && e.message) || e));
        });
      });
    }
    addBtn(tr('privateHub.homePc.historyOpen', '打开'), function () {
      openHistory(it);
    });
    addBtn(tr('privateHub.homePc.historyDelete', '删除'), function () {
      HomePcApi.deleteHistoryTask('/image-to-3d/delete', { folder: it.folder || '' })
        .then(function (r) {
          if (r && r.cancelled) return;
          if (lastFolder && it.folder && lastFolder === it.folder) lastFolder = '';
          loadHistory();
        })
        .catch(function (e) {
          alert(String((e && e.message) || e));
        });
    });
    return row;
  }

  async function openHistory(it) {
    try {
      var fd = new FormData();
      fd.append('folder', it.folder || '');
      var res = await fetch(API_BASE_URL + '/image-to-3d/open', { method: 'POST', body: fd });
      var data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.detail || data.error || 'open failed');
      promptInput.value = data.prompt || '';
      if (data.seed != null && Number(data.seed) >= 0) seedInput.value = String(data.seed);
      else seedInput.value = '';
      var engs = data.engines || it.engines || [];
      engineChecks.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.checked = engs.indexOf(cb.value) >= 0;
      });
      lastFolder = data.folder || it.folder || '';
      if (data.image_url) {
        refPreview.src = assetUrl(data.image_url);
        refPreviewWrap.hidden = false;
        fileBlob = null;
        if (dropZone) dropZone.style.display = 'none';
      }
      var urls = data.mesh_urls || it.mesh_urls || [];
      var mesh = data.mesh_url || it.mesh_url || '';
      if (mesh || urls.length) {
        showResult(
          mesh || (urls[urls.length - 1] && urls[urls.length - 1].url) || '',
          urls,
          (engs || []).join(', ')
        );
      }
    } catch (e) {
      alert(HomePcApi.friendlyFetchError(e));
    }
  }

  async function loadHistory() {
    historyList.innerHTML = '';
    try {
      var res = await fetch(API_BASE_URL + '/image-to-3d/history?limit=20');
      var data = await res.json();
      (data.items || []).forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'home-pc-history-item';
        row.style.cssText =
          'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #e5e7eb';
        var info = document.createElement('div');
        info.style.flex = '1';
        var engLabel = (it.engines || []).join(', ') || '—';
        info.innerHTML =
          '<div style="font-size:13px;color:#374151">' +
          (it.created_at || '') +
          ' · ' +
          engLabel +
          '</div><div style="font-size:14px">' +
          (it.prompt || '').replace(/</g, '&lt;') +
          '</div>';
        if (it.thumb_url) {
          var thumb = document.createElement('img');
          thumb.src = assetUrl(it.thumb_url);
          thumb.alt = '';
          thumb.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:6px';
          row.appendChild(thumb);
        }
        row.appendChild(info);
        row.appendChild(historyActions(it));
        historyList.appendChild(row);
      });
    } catch (e) {
      log('history: ' + e);
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollOnce(taskId) {
    var res = await fetch(API_BASE_URL + '/image-to-3d/task/' + taskId);
    var data = await res.json();
    if (Array.isArray(data.logs)) {
      logOutput.textContent = data.logs.join('\n') + '\n';
    }
    lastFolder = data.output_dir || lastFolder;
    var prog = data.progress || {};
    if (prog.total) {
      var pct = Math.round((100 * (prog.current || 0)) / prog.total);
      progressPercent.textContent = pct + '%';
      progressBar.style.width = Math.max(8, pct) + '%';
      progressStatus.textContent =
        tr('privateHub.homePc.processing', '处理中…') +
        (data.stage ? ' · ' + data.stage : '');
    }
    if (data.status === 'done') {
      stopPoll();
      setBusy(false);
      var urls = data.mesh_urls || [];
      showResult(
        data.mesh_url || '',
        urls,
        (data.engines || []).join(', ') +
          (data.timing && data.timing.total_sec ? ' · 总耗时 ' + data.timing.total_sec + 's' : '')
      );
      loadHistory();
      return;
    }
    if (data.status === 'error' || data.status === 'cancelled') {
      stopPoll();
      setBusy(false);
      if (data.status === 'error') alert(data.error || 'Image-to-3D failed');
    }
  }

  async function start() {
    if (!fileBlob) {
      alert(tr('privateHub.homePc.i23dNeedImage', '请先上传参考图'));
      return;
    }
    var engines = selectedEngines();
    if (!engines.length) {
      alert(tr('privateHub.homePc.i23dNeedEngine', '请至少选择一个引擎'));
      return;
    }
    var form = new FormData();
    form.append('image', fileBlob, fileBlob.name || 'input.png');
    form.append('engines', JSON.stringify(engines));
    form.append('prompt', (promptInput.value || '').trim());
    form.append('seed', String((seedInput.value || '').trim() || '-1'));

    setBusy(true, tr('privateHub.homePc.processing', '处理中…'));
    logOutput.textContent = '';
    resultBox.style.display = 'none';
    try {
      var res = await fetch(API_BASE_URL + '/image-to-3d/start', { method: 'POST', body: form });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.detail || data.error || 'HTTP ' + res.status);
      lastTaskId = data.task_id || '';
      lastFolder = data.output_dir || '';
      stopPoll();
      pollOnce(lastTaskId);
      pollTimer = setInterval(function () {
        pollOnce(lastTaskId);
      }, 2500);
    } catch (e) {
      setBusy(false);
      alert(HomePcApi.friendlyFetchError(e));
    }
  }

  dropZone.addEventListener('click', function () { fileInput.click(); });
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
  });
  refClearBtn.addEventListener('click', clearFile);

  startBtn.addEventListener('click', start);
  cancelBtn.addEventListener('click', function () {
    if (!lastTaskId) return;
    var fd = new FormData();
    fd.append('task_id', lastTaskId);
    fetch(API_BASE_URL + '/image-to-3d/cancel', { method: 'POST', body: fd }).catch(function () {});
  });
  clearBtn.addEventListener('click', function () {
    stopPoll();
    setBusy(false);
    clearFile();
    promptInput.value = '';
    seedInput.value = '';
    lastMeshUrl = '';
    lastFolder = '';
    lastTaskId = '';
    meshItems = [];
    clearMesh();
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    metaLine.textContent = '';
    compareList.innerHTML = '';
    compareList.style.display = 'none';
    logOutput.textContent = '';
  });
  downloadBtn.addEventListener('click', function () {
    if (!lastMeshUrl) return;
    HomePcApi.downloadAsset(lastMeshUrl, lastMeshName).catch(function (e) {
      alert(String((e && e.message) || e));
    });
  });
  copyLogBtn.addEventListener('click', function () {
    var s = logOutput.textContent || '';
    if (!s) {
      alert(tr('privateHub.homePc.logEmpty', '暂无日志可复制'));
      return;
    }
    HomePcApi.copyText(s)
      .then(function () { alert(tr('privateHub.homePc.logCopied', '已复制')); })
      .catch(function () { alert(tr('privateHub.homePc.logCopyFail', '复制失败')); });
  });
  openDirBtn.addEventListener('click', function () {
    if (!lastFolder && !lastTaskId) {
      alert(tr('privateHub.homePc.i23dNoOutputYet', '暂无输出目录'));
      return;
    }
    var form = new FormData();
    if (lastFolder) form.append('folder', lastFolder);
    if (lastTaskId) form.append('task_id', lastTaskId);
    fetch(API_BASE_URL + '/image-to-3d/reveal-output', { method: 'POST', body: form }).catch(function (e) {
      alert(HomePcApi.friendlyFetchError(e));
    });
  });
  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);

  loadDefaults()
    .then(loadHistory)
    .catch(function (e) {
      log('defaults: ' + e);
      engineLine.textContent = tr('privateHub.homePc.i23dEngineStatus', '图生 3D 引擎') + '：' + e;
    });
});
