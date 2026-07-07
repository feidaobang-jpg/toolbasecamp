import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const DEFAULT_CODE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process A]
    B -->|No| D[Process B]
    C --> E[End]
    D --> E
`;

const codeInput = document.getElementById('mermaid-input');
const renderBtn = document.getElementById('render-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const errorBox = document.getElementById('error-box');
const previewEmpty = document.getElementById('preview-empty');
const outputEl = document.getElementById('mermaid-output');

let renderCounter = 0;

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: { useMaxWidth: true, htmlLabels: true }
});

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

async function renderDiagram() {
    hideError();
    const code = (codeInput.value || '').trim();
    if (!code) {
        outputEl.innerHTML = '';
        setPreviewVisible(false);
        return;
    }

    try {
        renderCounter += 1;
        const id = 'mermaid-diagram-' + renderCounter;
        const { svg } = await mermaid.render(id, code);
        outputEl.innerHTML = svg;
        setPreviewVisible(true);
    } catch (err) {
        outputEl.innerHTML = '';
        setPreviewVisible(false);
        const msg = err.message || String(err);
        showError(tr('tools.mermaid.renderError') + ': ' + msg);
    }
}

function downloadSvg() {
    const svg = outputEl.querySelector('svg');
    if (!svg) {
        showError(tr('tools.mermaid.nothingToExport'));
        return;
    }
    hideError();
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
}

function clearAll() {
    codeInput.value = '';
    outputEl.innerHTML = '';
    hideError();
    setPreviewVisible(false);
}

codeInput.value = DEFAULT_CODE;
setPreviewVisible(false);

renderBtn.addEventListener('click', renderDiagram);
downloadBtn.addEventListener('click', downloadSvg);
clearBtn.addEventListener('click', clearAll);

codeInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        renderDiagram();
    }
});
