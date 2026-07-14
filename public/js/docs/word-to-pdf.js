document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const removeBtn = document.getElementById('remove-btn');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPct = document.getElementById('progress-percent');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const resultWrap = document.getElementById('result-wrap');
    const resultName = document.getElementById('result-name');
    const resultSize = document.getElementById('result-size');
    const downloadBtn = document.getElementById('download-btn');

    const API_BASE = (typeof siteConfig !== 'undefined' && siteConfig.apiBase) ? siteConfig.apiBase : 'http://127.0.0.1:8001';
    let currentFile = null;

    function tr(key, params) {
        return typeof t === 'function' ? t(key, params) : key;
    }

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
    });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]); });
    removeBtn.addEventListener('click', clearAll);
    clearBtn.addEventListener('click', clearAll);
    convertBtn.addEventListener('click', doConvert);

    function setFile(f) {
        const name = f.name.toLowerCase();
        if (!name.endsWith('.doc') && !name.endsWith('.docx')) {
            showError(tr('tools.wordToPdf.invalidFile'));
            return;
        }
        if (f.size > 50 * 1024 * 1024) {
            showError(tr('tools.wordToPdf.fileTooLarge'));
            return;
        }
        currentFile = f;
        fileName.textContent = f.name;
        fileSize.textContent = formatSize(f.size);
        fileInfo.style.display = 'flex';
        dropZone.classList.add('has-file');
        convertBtn.disabled = false;
        hideError();
        hideResult();
    }

    function clearAll() {
        currentFile = null;
        fileInput.value = '';
        fileInfo.style.display = 'none';
        dropZone.classList.remove('has-file');
        convertBtn.disabled = true;
        hideError();
        hideResult();
        hideProgress();
    }

    async function doConvert() {
        if (!currentFile) return;
        hideError();
        hideResult();
        showProgress(tr('tools.wordToPdf.uploading'), 10);
        convertBtn.disabled = true;

        try {
            const form = new FormData();
            form.append('file', currentFile);
            showProgress(tr('tools.wordToPdf.converting'), 40);

            const res = await fetch(`${API_BASE}/word-to-pdf`, { method: 'POST', body: form });
            showProgress(tr('tools.wordToPdf.processing'), 80);

            if (typeof check502Error !== 'undefined' && check502Error(res)) {
                throw new Error(tr('tools.wordToPdf.serviceUnavailable'));
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || tr('tools.wordToPdf.serverError', { status: res.status }));
            }

            const blob = await res.blob();
            const outName = currentFile.name.replace(/\.(doc|docx)$/i, '') + '.pdf';
            const url = URL.createObjectURL(blob);
            showProgress(tr('tools.wordToPdf.done'), 100);
            showResult(outName, blob.size, url, outName, blob);
        } catch (e) {
            hideProgress();
            showError(e.message || tr('tools.wordToPdf.conversionFailed'));
        } finally {
            convertBtn.disabled = false;
        }
    }

    function showProgress(status, pct) {
        progressWrap.style.display = 'block';
        progressStatus.textContent = status;
        progressPct.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
    }
    function hideProgress() { progressWrap.style.display = 'none'; }
    function showError(msg) { errorBox.style.display = 'flex'; errorMsg.textContent = msg; }
    function hideError() { errorBox.style.display = 'none'; }

    function showResult(name, size, url, dlName, blob) {
        resultWrap.style.display = 'block';
        resultName.textContent = name;
        resultSize.textContent = tr('tools.wordToPdf.sizeLabel', { size: formatSize(size) });
        downloadBtn.href = url;
        downloadBtn.download = dlName;
        downloadBtn.onclick = async (e) => {
            if (window.showSaveFilePicker) {
                e.preventDefault();
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: dlName,
                        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = dlName;
                        a.click();
                    }
                }
            }
        };
    }
    function hideResult() { resultWrap.style.display = 'none'; }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }
});
