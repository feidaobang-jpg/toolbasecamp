import { Transformer } from 'https://cdn.jsdelivr.net/npm/markmap-lib@0.18.11/+esm';
import { Markmap, loadCSS, loadJS } from 'https://cdn.jsdelivr.net/npm/markmap-view@0.18.11/+esm';

const DEFAULT_MD = `# Project Plan

## Goals
- Launch MVP
- Gather user feedback
- Iterate quickly

## Tasks
- Design UI
- Build API
- Deploy to production

## Risks
- Scope creep
- Timeline pressure
`;

const mdInput = document.getElementById('md-input');
const renderBtn = document.getElementById('render-btn');
const fitBtn = document.getElementById('fit-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const errorBox = document.getElementById('error-box');
const previewEmpty = document.getElementById('preview-empty');
const svgEl = document.getElementById('markmap-svg');

const transformer = new Transformer();
let markmap = null;

function tr(key) {
    return typeof window.t === 'function' ? window.t(key) : key;
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('is-visible');
}

function hideError() {
    errorBox.textContent = '';
    errorBox.classList.remove('is-visible');
}

function setPreviewVisible(hasContent) {
    previewEmpty.style.display = hasContent ? 'none' : 'flex';
}

async function renderMindmap() {
    hideError();
    const md = (mdInput.value || '').trim();
    if (!md) {
        if (markmap) markmap.setData({ content: '' });
        setPreviewVisible(false);
        return;
    }

    try {
        const { root, features } = transformer.transform(md);
        const { styles, scripts } = transformer.getUsedAssets(features);
        if (styles) await loadCSS(styles);
        if (scripts) await loadJS(scripts);

        if (!markmap) {
            markmap = Markmap.create(svgEl, { autoFit: true });
        }
        markmap.setData(root);
        markmap.fit();
        setPreviewVisible(true);
    } catch (err) {
        showError(tr('tools.mindmap.renderError') + ': ' + (err.message || String(err)));
        setPreviewVisible(false);
    }
}

function downloadSvg() {
    const svg = svgEl.cloneNode(true);
    if (!svg.querySelector('g')) {
        showError(tr('tools.mindmap.nothingToExport'));
        return;
    }
    hideError();
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.svg';
    a.click();
    URL.revokeObjectURL(url);
}

function clearAll() {
    mdInput.value = '';
    hideError();
    if (markmap) markmap.setData({ content: '' });
    svgEl.innerHTML = '';
    markmap = null;
    setPreviewVisible(false);
}

mdInput.value = DEFAULT_MD;
setPreviewVisible(false);

renderBtn.addEventListener('click', renderMindmap);
fitBtn.addEventListener('click', () => { if (markmap) markmap.fit(); });
downloadBtn.addEventListener('click', downloadSvg);
clearBtn.addEventListener('click', clearAll);

mdInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        renderMindmap();
    }
});
