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
  var meshDetailInput = document.getElementById('mesh-detail-input');
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
  var viewerHint = document.getElementById('viewer-hint');
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
  var currentViewUrl = '';
  var meshCache = Object.create(null);
  var loadSeq = 0;
  var animId = 0;
  var viewerLoadingEl = document.getElementById('viewer-loading');
  var viewerLoadingText = document.getElementById('viewer-loading-text');
  var viewerShadeBar = document.getElementById('viewer-shade-bar');
  var viewerOrientBtn = document.getElementById('viewer-orient-btn');
  var shadeMode = 'clay';
  var orientStep = 0;

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
    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
    camera.position.set(1.6, 1.2, 1.8);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // 保留 loading 遮罩，只清空其它子节点后挂 canvas
    Array.prototype.slice.call(viewerEl.childNodes).forEach(function (n) {
      if (n.id === 'viewer-loading') return;
      viewerEl.removeChild(n);
    });
    viewerEl.appendChild(renderer.domElement);
    if (viewerLoadingEl && viewerLoadingEl.parentNode !== viewerEl) {
      viewerEl.appendChild(viewerLoadingEl);
    }
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.4, 0);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    hemi.userData.i23dPersist = true;
    scene.add(hemi);
    var dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 2);
    dir.userData.i23dPersist = true;
    scene.add(dir);
    var grid = new THREE.GridHelper(4, 16, 0x444444, 0x2a2a2a);
    grid.userData.i23dPersist = true;
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

  function setViewerLoading(on, text) {
    if (!viewerLoadingEl) return;
    if (text && viewerLoadingText) viewerLoadingText.textContent = text;
    if (on) viewerLoadingEl.removeAttribute('hidden');
    else viewerLoadingEl.setAttribute('hidden', '');
  }

  function disposeRoot(root) {
    if (!root) return;
    root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
  }

  /** 只保留灯光/网格；去掉场景里所有 mesh（含竞态多加的） */
  function purgeSceneMeshes() {
    if (!scene) return;
    var remove = [];
    for (var i = 0; i < scene.children.length; i++) {
      var ch = scene.children[i];
      if (ch.userData && ch.userData.i23dPersist) continue;
      remove.push(ch);
    }
    remove.forEach(function (ch) {
      scene.remove(ch);
    });
    currentRoot = null;
  }

  function clearMeshCache() {
    loadSeq += 1;
    purgeSceneMeshes();
    Object.keys(meshCache).forEach(function (k) {
      disposeRoot(meshCache[k]);
      delete meshCache[k];
    });
    currentViewUrl = '';
    setViewerLoading(false);
  }

  function clearMesh() {
    purgeSceneMeshes();
  }

  function fitCamera(object3d) {
    // 保留 rotation（摆正），重置位移/缩放再适配
    object3d.scale.set(1, 1, 1);
    object3d.position.set(0, 0, 0);
    object3d.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z, 0.001);
    var scale = 1.2 / maxDim;
    object3d.scale.setScalar(scale);
    object3d.updateMatrixWorld(true);
    box.setFromObject(object3d);
    size = box.getSize(new THREE.Vector3());
    center = box.getCenter(new THREE.Vector3());
    object3d.position.x -= center.x;
    object3d.position.y -= center.y;
    object3d.position.z -= center.z;
    object3d.position.y += size.y * 0.5;
    controls.target.set(0, size.y * 0.35, 0);
    camera.near = 0.01;
    camera.far = 500;
    camera.position.set(1.8, 1.4, 2.2);
    camera.updateProjectionMatrix();
    controls.update();
  }

  /** TripoSR 等常侧躺：在 4 种正交朝向里选「贴地投影面积」最大的（车/物体更稳） */
  function autoOrientMaxFootprint(root) {
    var rots = [
      [0, 0, 0],
      [-Math.PI / 2, 0, 0],
      [Math.PI / 2, 0, 0],
      [0, 0, Math.PI / 2],
      [0, 0, -Math.PI / 2],
      [Math.PI, 0, 0],
    ];
    var best = rots[0];
    var bestArea = -1;
    var i;
    for (i = 0; i < rots.length; i++) {
      root.rotation.set(rots[i][0], rots[i][1], rots[i][2]);
      root.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(root);
      var size = box.getSize(new THREE.Vector3());
      var area = size.x * size.z;
      if (area > bestArea) {
        bestArea = area;
        best = rots[i];
      }
    }
    root.rotation.set(best[0], best[1], best[2]);
    orientStep = 0;
  }

  function cycleOrient(root) {
    if (!root) return;
    orientStep = (orientStep + 1) % 4;
    // 绕 X 每次 +90°
    root.rotation.x += Math.PI / 2;
    fitCamera(root);
  }

  function meshHasVertexColor(root) {
    var found = false;
    root.traverse(function (c) {
      if (c.isMesh && c.geometry && c.geometry.getAttribute('color')) found = true;
    });
    return found;
  }

  function meshHasUsefulMaterial(root) {
    var found = false;
    root.traverse(function (c) {
      if (!c.isMesh) return;
      var mats = c.userData.i23dOrigMat;
      if (!mats) return;
      var list = Array.isArray(mats) ? mats : [mats];
      list.forEach(function (m) {
        if (!m) return;
        if (m.map || m.normalMap || m.emissiveMap || m.roughnessMap) found = true;
        if (m.isMeshStandardMaterial && m.color && m.color.getHex() !== 0xffffff) found = true;
      });
    });
    return found;
  }

  function applyShadeMode(mode) {
    shadeMode = mode || shadeMode;
    if (viewerShadeBar) {
      Array.prototype.forEach.call(viewerShadeBar.querySelectorAll('.i23d-shade-btn'), function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-shade') === shadeMode);
      });
    }
    if (!currentRoot) return;
    if (shadeMode === 'vertex' && !meshHasVertexColor(currentRoot)) {
      alert(tr('privateHub.homePc.i23dShadeNoVertex', '当前模型无顶点色'));
      shadeMode = 'clay';
      if (viewerShadeBar) {
        Array.prototype.forEach.call(viewerShadeBar.querySelectorAll('.i23d-shade-btn'), function (btn) {
          btn.classList.toggle('is-active', btn.getAttribute('data-shade') === 'clay');
        });
      }
    }
    if (shadeMode === 'material' && !meshHasUsefulMaterial(currentRoot)) {
      // 无贴图时仍可切回「原材质」（多为灰白 Standard），不弹窗打断；提示一次即可
    }
    currentRoot.traverse(function (c) {
      if (!c.isMesh || !c.geometry) return;
      var hasColor = !!c.geometry.getAttribute('color');
      if (shadeMode === 'material' && c.userData.i23dOrigMat) {
        c.material = c.userData.i23dOrigMat;
        return;
      }
      if (shadeMode === 'wire') {
        c.material = new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          wireframe: true,
          side: THREE.DoubleSide,
        });
        return;
      }
      if (shadeMode === 'vertex' && hasColor) {
        c.material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          side: THREE.DoubleSide,
        });
        return;
      }
      // clay 白模：Lambert + 灯光，比纯 Basic 更有体积感
      if (!c.geometry.getAttribute('normal')) {
        c.geometry.computeVertexNormals();
      }
      c.material = new THREE.MeshLambertMaterial({
        color: 0xd1d5db,
        side: THREE.DoubleSide,
      });
    });
  }

  /**
   * 保存原材质；默认白模预览。顶点色/贴图用工具栏切换。
   */
  function prepareMeshRoot(root, urlHint) {
    if (root.userData && root.userData.i23dPrepared) {
      applyShadeMode(shadeMode);
      return root;
    }
    root.traverse(function (c) {
      if (!c.isMesh || !c.geometry) return;
      c.userData.i23dOrigMat = c.material;
      c.castShadow = false;
      c.receiveShadow = false;
    });
    root.userData.i23dPrepared = true;
    // TripoSR 路径常侧躺：自动选贴地面积最大朝向
    if (String(urlHint || '').toLowerCase().indexOf('triposr') >= 0) {
      autoOrientMaxFootprint(root);
    } else {
      root.rotation.set(0, 0, 0);
      orientStep = 0;
    }
    applyShadeMode(shadeMode);
    return root;
  }

  function formatBytes(n) {
    var b = Number(n) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }

  /** 首屏优先最小 GLB（通常 TripoSR），避免一上来拉 Hunyuan 几十 MB */
  function pickPreviewItem(items, preferredUrl) {
    var ok = (items || []).filter(function (x) {
      return x && x.url && !x.error;
    });
    if (!ok.length) return preferredUrl ? { url: preferredUrl } : null;
    if (preferredUrl) {
      for (var i = 0; i < ok.length; i++) {
        if (ok[i].url === preferredUrl) return ok[i];
      }
    }
    ok.sort(function (a, b) {
      return (a.bytes || 1e15) - (b.bytes || 1e15);
    });
    return ok[0];
  }

  function loadMeshUrl(url, opts) {
    ensureViewer();
    var full = assetUrl(url);
    if (!full) return Promise.reject(new Error('no mesh'));
    opts = opts || {};
    var bytesHint = opts.bytes;

    // 已在显示同一模型：跳过
    if (currentViewUrl === full && currentRoot && currentRoot.parent === scene) {
      setViewerLoading(false);
      return Promise.resolve(currentRoot);
    }

    var seq = ++loadSeq;
    currentViewUrl = full;
    purgeSceneMeshes();

    // 缓存命中：瞬时切换（大 GLB 只解析一次）
    if (meshCache[full]) {
      if (seq !== loadSeq) return Promise.reject(new Error('aborted'));
      currentRoot = meshCache[full];
      scene.add(currentRoot);
      applyShadeMode(shadeMode);
      fitCamera(currentRoot);
      setViewerLoading(false);
      return Promise.resolve(currentRoot);
    }

    var lower = String(url).toLowerCase();
    var loadingMsg = tr('privateHub.homePc.i23dViewerLoading', '加载 3D 模型…');
    if (bytesHint) loadingMsg += ' (' + formatBytes(bytesHint) + ')';
    setViewerLoading(true, loadingMsg);

    return new Promise(function (resolve, reject) {
      function onProgress(ev) {
        if (seq !== loadSeq) return;
        if (ev && ev.total) {
          var pct = Math.min(99, Math.round((100 * ev.loaded) / ev.total));
          var msg = tr('privateHub.homePc.i23dViewerLoading', '加载 3D 模型…') + ' ' + pct + '%';
          if (bytesHint) msg += ' · ' + formatBytes(bytesHint);
          setViewerLoading(true, msg);
        }
      }

      function finish(root) {
        // prepare 可能较慢：之后必须再校验 seq，否则旧任务会叠到当前场景
        if (seq !== loadSeq) {
          disposeRoot(root);
          reject(new Error('aborted'));
          return;
        }
        try {
          prepareMeshRoot(root, full);
        } catch (e) {
          if (seq !== loadSeq) {
            disposeRoot(root);
            reject(new Error('aborted'));
            return;
          }
          setViewerLoading(false);
          reject(e);
          return;
        }
        if (seq !== loadSeq) {
          disposeRoot(root);
          reject(new Error('aborted'));
          return;
        }
        meshCache[full] = root;
        purgeSceneMeshes();
        if (seq !== loadSeq) {
          reject(new Error('aborted'));
          return;
        }
        currentRoot = root;
        currentViewUrl = full;
        scene.add(root);
        fitCamera(root);
        setViewerLoading(false);
        resolve(root);
      }

      function fail(err) {
        if (seq !== loadSeq) {
          reject(new Error('aborted'));
          return;
        }
        setViewerLoading(false);
        reject(err);
      }

      if (lower.indexOf('.obj') >= 0) {
        new OBJLoader().load(full, finish, onProgress, fail);
      } else {
        new GLTFLoader().load(
          full,
          function (gltf) {
            finish(gltf.scene);
          },
          onProgress,
          fail
        );
      }
    });
  }

  function selectMeshItem(it, cardEl) {
    if (!it || !it.url) return;
    lastMeshUrl = assetUrl(it.url);
    lastMeshName =
      it.filename || (String(it.url).toLowerCase().indexOf('.obj') >= 0 ? 'mesh.obj' : 'mesh.glb');
    metaLine.textContent =
      (it.label || it.engine || '') +
      (it.elapsed_sec ? ' · ' + Number(it.elapsed_sec).toFixed(1) + 's' : '') +
      (it.bytes ? ' · ' + Math.round(it.bytes / 1024) + ' KB' : '');
    downloadBtn.style.display = '';
    if (viewerHint) viewerHint.style.display = '';
    Array.prototype.forEach.call(compareList.querySelectorAll('.i23d-mesh-card'), function (c) {
      c.classList.toggle('is-active', c === cardEl);
    });
    loadMeshUrl(it.url, { bytes: it.bytes }).catch(function (e) {
      if (e && String(e.message || e) === 'aborted') return;
      alert(tr('privateHub.homePc.i23dPreviewFail', '预览加载失败') + ': ' + e);
    });
  }

  function renderCompareButtons(items, activeUrl) {
    meshItems = items || [];
    compareList.innerHTML = '';
    var okItems = meshItems.filter(function (x) { return x && x.url; });
    if (!meshItems.length) {
      compareList.style.display = 'none';
      if (viewerHint) viewerHint.style.display = 'none';
      return null;
    }
    compareList.style.display = 'grid';
    if (viewerHint) viewerHint.style.display = okItems.length ? '' : 'none';
    var activeItem = pickPreviewItem(okItems, activeUrl);
    var activeCard = null;
    meshItems.forEach(function (it) {
      var failed = !!(it.error || !it.url);
      var label = it.label || it.engine || 'mesh';
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'i23d-mesh-card' + (failed ? ' is-failed' : '');
      if (failed) {
        card.title = it.error || tr('privateHub.homePc.i23dEngineFail', '失败');
        card.disabled = true;
      }

      var thumb = document.createElement('div');
      thumb.className = 'i23d-mesh-card-thumb';
      thumb.textContent = failed
        ? tr('privateHub.homePc.i23dEngineFail', '失败')
        : (it.engine || '3D').toUpperCase();

      var title = document.createElement('div');
      title.className = 'i23d-mesh-card-title';
      title.textContent = label;

      var meta = document.createElement('div');
      meta.className = 'i23d-mesh-card-meta';
      meta.textContent = failed
        ? (it.error || tr('privateHub.homePc.i23dEngineFail', '失败'))
        : (it.elapsed_sec ? Number(it.elapsed_sec).toFixed(1) + 's' : 'OK') +
          (it.bytes ? ' · ' + Math.round(it.bytes / 1024) + ' KB' : '');

      card.appendChild(thumb);
      card.appendChild(title);
      card.appendChild(meta);

      if (!failed) {
        card.addEventListener('click', function () {
          selectMeshItem(it, card);
        });
      }
      if (activeItem && it.url === activeItem.url) {
        card.classList.add('is-active');
        activeCard = card;
      }
      compareList.appendChild(card);
    });
    return activeItem;
  }

  function showResult(url, items, meta) {
    resultBox.style.display = 'block';
    if (viewerHint) viewerHint.style.display = '';
    if (viewerShadeBar) viewerShadeBar.style.display = '';
    metaLine.textContent = meta || '';
    // 默认预览体积最小的成功模型，而不是最后一个（常是最大的）
    var active = renderCompareButtons(items || (url ? [{ url: url, label: 'mesh' }] : []), null);
    var previewUrl = (active && active.url) || url || '';
    lastMeshUrl = assetUrl(previewUrl);
    lastMeshName =
      (active && active.filename) ||
      (String(previewUrl || '').toLowerCase().indexOf('.obj') >= 0 ? 'mesh.obj' : 'mesh.glb');
    downloadBtn.style.display = previewUrl ? '' : 'none';
    if (active) {
      metaLine.textContent =
        (meta ? meta + ' · ' : '') +
        (active.label || active.engine || '') +
        (active.elapsed_sec ? ' · ' + Number(active.elapsed_sec).toFixed(1) + 's' : '') +
        (active.bytes ? ' · ' + Math.round(active.bytes / 1024) + ' KB' : '');
    }
    if (previewUrl) {
      loadMeshUrl(previewUrl, { bytes: active && active.bytes }).catch(function (e) {
        if (e && String(e.message || e) === 'aborted') return;
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
      clearMeshCache();
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
    form.append(
      'mesh_detail',
      String((meshDetailInput && meshDetailInput.value) || 'game')
    );

    setBusy(true, tr('privateHub.homePc.processing', '处理中…'));
    logOutput.textContent = '';
    clearMeshCache();
    resultBox.style.display = 'none';
    compareList.innerHTML = '';
    compareList.style.display = 'none';
    if (viewerHint) viewerHint.style.display = 'none';
    metaLine.textContent = '';
    downloadBtn.style.display = 'none';
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
    clearMeshCache();
    resultBox.style.display = 'none';
    downloadBtn.style.display = 'none';
    metaLine.textContent = '';
    compareList.innerHTML = '';
    compareList.style.display = 'none';
    if (viewerHint) viewerHint.style.display = 'none';
    if (viewerShadeBar) viewerShadeBar.style.display = 'none';
    logOutput.textContent = '';
  });
  if (viewerShadeBar) {
    viewerShadeBar.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.i23d-shade-btn') : null;
      if (!btn) return;
      applyShadeMode(btn.getAttribute('data-shade') || 'clay');
    });
  }
  if (viewerOrientBtn) {
    viewerOrientBtn.addEventListener('click', function () {
      if (!currentRoot) return;
      cycleOrient(currentRoot);
    });
  }
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
