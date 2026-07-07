import MindElixir from 'https://cdn.jsdelivr.net/npm/mind-elixir@5.0.4/+esm';

const rootEl = document.getElementById('mindmap-root');
const newBtn = document.getElementById('new-btn');
const exportPngBtn = document.getElementById('export-png-btn');
const exportJsonBtn = document.getElementById('export-json-btn');
const importJsonBtn = document.getElementById('import-json-btn');
const importFile = document.getElementById('import-file');
const errorBox = document.getElementById('error-box');

function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
}

function localeCode() {
    const lang = (typeof window.tbGetLocale === 'function' ? window.tbGetLocale() : 'en') || 'en';
    return lang.startsWith('zh') ? 'zh_CN' : 'en';
}

function defaultTopic() {
    return localeCode().startsWith('zh') ? '中心主题' : 'Central Topic';
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
}

function hideError() {
    errorBox.textContent = '';
    errorBox.classList.remove('is-visible');
}

let mind = null;

function createMind() {
    mind = new MindElixir({
        el: rootEl,
        direction: MindElixir.SIDE,
        draggable: true,
        contextMenu: true,
        toolBar: true,
        nodeMenu: true,
        keypress: true,
        locale: localeCode(),
        overflowHidden: false
    });
    mind.init(MindElixir.new(defaultTopic()));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

newBtn.addEventListener('click', () => {
    if (!mind) return;
    if (window.confirm(tr('tools.mindmap.newConfirm'))) {
        mind.init(MindElixir.new(defaultTopic()));
        hideError();
    }
});

exportPngBtn.addEventListener('click', async () => {
    if (!mind) return;
    hideError();
    try {
        const blob = await mind.exportPng();
        if (!blob) throw new Error('empty');
        downloadBlob(blob, 'mindmap.png');
    } catch (err) {
        showError(tr('tools.mindmap.exportError'));
    }
});

exportJsonBtn.addEventListener('click', () => {
    if (!mind) return;
    hideError();
    const json = mind.getDataString();
    downloadBlob(new Blob([json], { type: 'application/json' }), 'mindmap.json');
});

importJsonBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = '';
    if (!file || !mind) return;
    const reader = new FileReader();
    reader.onload = () => {
        hideError();
        try {
            const data = JSON.parse(String(reader.result || ''));
            mind.refresh(data);
        } catch (err) {
            showError(tr('tools.mindmap.importError'));
        }
    };
    reader.readAsText(file);
});

createMind();

document.addEventListener('tb:locale', () => {
    const data = mind ? mind.getData() : null;
    createMind();
    if (data) mind.refresh(data);
});
