(function () {
    'use strict';

    var container = document.getElementById('logicflow-root');
    var errorBox = document.getElementById('error-box');
    if (!container || typeof Core === 'undefined') {
        if (errorBox) {
            errorBox.textContent = 'LogicFlow failed to load';
            errorBox.classList.add('is-visible');
        }
        return;
    }

    var LogicFlow = Core.default || Core.LogicFlow;
    if (!LogicFlow) return;

    function tr(key) {
        return typeof window.t === 'function' ? window.t(key) : key;
    }

    function localeIsZh() {
        var lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
        return lang.startsWith('zh');
    }

    function defaultLabel(type) {
        if (localeIsZh()) {
            if (type === 'rect') return '步骤';
            if (type === 'circle') return '开始/结束';
            return '判断';
        }
        if (type === 'rect') return 'Step';
        if (type === 'circle') return 'Start/End';
        return 'Decision';
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.add('is-visible');
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.classList.remove('is-visible');
    }

    var lf = new LogicFlow({
        container: container,
        grid: true,
        background: { color: '#f8fafc' },
        keyboard: { enabled: true },
        edgeType: 'polyline',
        snapline: true,
        nodeTextEdit: true,
        edgeTextEdit: true,
        adjustNodePosition: true,
        hoverOutline: true,
        nodeSelectedOutline: true
    });

    lf.render({ nodes: [], edges: [] });

    var pendingType = null;

    function resize() {
        if (!container) return;
        lf.resize(container.clientWidth, Math.max(container.clientHeight, 480));
    }

    function addNode(type, x, y) {
        lf.addNode({
            id: 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: type,
            x: x,
            y: y,
            text: defaultLabel(type)
        });
    }

    function setPending(type) {
        pendingType = type;
        container.style.cursor = 'crosshair';
    }

    lf.on('blank:click', function (ev) {
        if (!pendingType) return;
        addNode(pendingType, ev.x, ev.y);
        pendingType = null;
        container.style.cursor = 'default';
    });

    document.getElementById('add-rect-btn').addEventListener('click', function () {
        setPending('rect');
    });
    document.getElementById('add-circle-btn').addEventListener('click', function () {
        setPending('circle');
    });
    document.getElementById('add-diamond-btn').addEventListener('click', function () {
        setPending('diamond');
    });

    document.getElementById('export-json-btn').addEventListener('click', function () {
        hideError();
        var data = lf.getGraphData();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'flowchart.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('import-json-btn').addEventListener('click', function () {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            hideError();
            try {
                var data = JSON.parse(String(reader.result || ''));
                lf.render(data);
                resize();
            } catch (err) {
                showError(tr('tools.flowchart.importError'));
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('clear-btn').addEventListener('click', function () {
        if (window.confirm(tr('tools.flowchart.clearConfirm'))) {
            lf.render({ nodes: [], edges: [] });
            hideError();
        }
    });

    window.addEventListener('resize', resize);
    setTimeout(resize, 200);
    setTimeout(resize, 800);
})();
