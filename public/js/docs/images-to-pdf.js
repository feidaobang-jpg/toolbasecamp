document.addEventListener('DOMContentLoaded', function () {
    const imgList = document.getElementById('img-list');
    const fileInput = document.getElementById('file-input');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');
    const orientSel = document.getElementById('orientation-select');
    const marginSel = document.getElementById('margin-select');
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

    let images = [];
    let dragSrcIdx = null;

    function tr(key, params) {
        return typeof t === 'function' ? t(key, params) : key;
    }

    renderList();

    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length) loadFiles(files);
    });

    fileInput.addEventListener('change', e => {
        loadFiles(Array.from(e.target.files));
        fileInput.value = '';
    });

    clearBtn.addEventListener('click', clearAll);
    convertBtn.addEventListener('click', doConvert);

    function loadFiles(files) {
        let loaded = 0;
        files.forEach(f => {
            const reader = new FileReader();
            reader.onload = ev => {
                const dataUrl = ev.target.result;
                const img = new Image();
                img.onload = () => {
                    images.push({ dataUrl, name: f.name, width: img.naturalWidth, height: img.naturalHeight });
                    loaded++;
                    if (loaded === files.length) {
                        renderList();
                        updateBtn();
                    }
                };
                img.src = dataUrl;
            };
            reader.readAsDataURL(f);
        });
    }

    function renderList() {
        imgList.innerHTML = '';

        images.forEach((img, idx) => {
            const item = document.createElement('div');
            item.className = 'img-item';
            item.draggable = true;
            item.dataset.idx = idx;

            const thumb = document.createElement('img');
            thumb.src = img.dataUrl;
            thumb.alt = img.name;
            item.appendChild(thumb);

            const caption = document.createElement('div');
            caption.className = 'img-caption';
            caption.textContent = `${idx + 1}. ${img.name}`;
            item.appendChild(caption);

            const rmBtn = document.createElement('button');
            rmBtn.className = 'img-remove';
            rmBtn.textContent = '✕';
            rmBtn.title = 'Remove';
            rmBtn.addEventListener('click', e => {
                e.stopPropagation();
                images.splice(idx, 1);
                renderList();
                updateBtn();
            });
            item.appendChild(rmBtn);

            item.addEventListener('dragstart', onDragStart);
            item.addEventListener('dragover', onDragOver);
            item.addEventListener('drop', onDrop);
            item.addEventListener('dragend', onDragEnd);

            imgList.appendChild(item);
        });

        const addBtn = document.createElement('div');
        addBtn.className = 'img-add-btn';
        addBtn.innerHTML = '<span>＋</span><span>Add images</span>';
        addBtn.addEventListener('click', () => fileInput.click());
        imgList.appendChild(addBtn);
    }

    function onDragStart() {
        dragSrcIdx = parseInt(this.dataset.idx);
        this.style.opacity = '0.4';
    }
    function onDragOver(e) {
        e.preventDefault();
        this.style.outline = '2px solid #3b82f6';
    }
    function onDrop(e) {
        e.preventDefault();
        this.style.outline = '';
        const targetIdx = parseInt(this.dataset.idx);
        if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
        const moved = images.splice(dragSrcIdx, 1)[0];
        images.splice(targetIdx, 0, moved);
        renderList();
    }
    function onDragEnd() {
        this.style.opacity = '';
        document.querySelectorAll('.img-item').forEach(el => (el.style.outline = ''));
        dragSrcIdx = null;
    }

    function updateBtn() {
        convertBtn.disabled = images.length === 0;
        hideError();
        hideResult();
    }

    function clearAll() {
        images = [];
        renderList();
        updateBtn();
        hideProgress();
    }

    async function doConvert() {
        if (images.length === 0) return;

        const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDF) {
            showError(tr('tools.imagesToPdf.jsPdfFailed'));
            return;
        }

        const margin = parseInt(marginSel.value);
        const orientMode = orientSel.value;

        hideError();
        hideResult();
        showProgress(tr('tools.imagesToPdf.generating'), 5);
        convertBtn.disabled = true;

        await tick();

        try {
            let pdf = null;

            for (let i = 0; i < images.length; i++) {
                const imgData = images[i];
                const pct = Math.round(((i + 1) / images.length) * 90) + 5;
                showProgress(tr('tools.imagesToPdf.processing', { current: i + 1, total: images.length }), pct);
                await tick();

                let orient;
                if (orientMode === 'auto') {
                    orient = imgData.width >= imgData.height ? 'landscape' : 'portrait';
                } else {
                    orient = orientMode;
                }

                const pageW = orient === 'landscape' ? 841.89 : 595.28;
                const pageH = orient === 'landscape' ? 595.28 : 841.89;
                const availW = pageW - margin * 2;
                const availH = pageH - margin * 2;
                const ratio = Math.min(availW / imgData.width, availH / imgData.height);
                const drawW = imgData.width * ratio;
                const drawH = imgData.height * ratio;
                const x = margin + (availW - drawW) / 2;
                const y = margin + (availH - drawH) / 2;

                if (i === 0) {
                    pdf = new jsPDF({ orientation: orient, unit: 'pt', format: 'a4' });
                } else {
                    pdf.addPage('a4', orient);
                }

                const fmt = getImgFormat(imgData.dataUrl);
                pdf.addImage(imgData.dataUrl, fmt, x, y, drawW, drawH);
            }

            showProgress(tr('tools.imagesToPdf.packaging'), 98);
            await tick();

            const pdfBlob = pdf.output('blob');
            const url = URL.createObjectURL(pdfBlob);
            const outName = 'images_' + Date.now() + '.pdf';

            showProgress(tr('tools.imagesToPdf.done'), 100);
            showResult(outName, pdfBlob.size, url, outName, pdfBlob);
        } catch (e) {
            hideProgress();
            showError(tr('tools.imagesToPdf.conversionFailed') + (e.message ? ' ' + e.message : ''));
        } finally {
            convertBtn.disabled = false;
        }
    }

    function getImgFormat(dataUrl) {
        if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
        if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
        return 'PNG';
    }

    function tick() {
        return new Promise(r => setTimeout(r, 0));
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
        resultSize.textContent = tr('tools.imagesToPdf.sizeLabel', { size: formatSize(size) });
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
