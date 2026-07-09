document.addEventListener('DOMContentLoaded', function () {
    const API_BASE = (typeof siteConfig !== 'undefined' && siteConfig.apiBase)
        ? siteConfig.apiBase
        : 'http://127.0.0.1:8001';
    const TOKEN_KEY = 'auth_token';

    const ingredientsText = document.getElementById('ingredients-text');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const removeBtn = document.getElementById('remove-btn');
    const generateBtn = document.getElementById('generate-btn');
    const clearBtn = document.getElementById('clear-btn');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPct = document.getElementById('progress-percent');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const resultCard = document.getElementById('result-card');
    const recipeTitle = document.getElementById('recipe-title');
    const recipeMeta = document.getElementById('recipe-meta');
    const detectedWrap = document.getElementById('detected-wrap');
    const detectedList = document.getElementById('detected-list');
    const ingredientsList = document.getElementById('ingredients-list');
    const stepsList = document.getElementById('steps-list');
    const tipsWrap = document.getElementById('tips-wrap');
    const tipsList = document.getElementById('tips-list');

    let currentFile = null;

    function tr(key, params) {
        return (typeof window.t === 'function' ? window.t(key, params) : key);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function getLocale() {
        if (typeof window.tbGetLocale === 'function') {
            return window.tbGetLocale();
        }
        return 'en';
    }

    function authHeaders(extra) {
        const headers = extra || {};
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        return headers;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function showProgress(status, pct) {
        progressWrap.style.display = 'block';
        progressStatus.textContent = status;
        progressPct.textContent = pct + '%';
        progressBar.style.width = pct + '%';
    }

    function hideProgress() {
        progressWrap.style.display = 'none';
    }

    function showError(msg) {
        errorBox.style.display = 'flex';
        errorMsg.textContent = msg;
    }

    function hideError() {
        errorBox.style.display = 'none';
    }

    function setFile(file) {
        const mime = (file.type || '').toLowerCase();
        const okMime = ['image/jpeg', 'image/png', 'image/webp'];
        const okExt = /\.(jpe?g|png|webp)$/i.test(file.name || '');
        if (!okMime.includes(mime) && !okExt) {
            showError(tr('tools.aiRecipe.invalidImage'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showError(tr('tools.aiRecipe.imageTooLarge'));
            return;
        }
        currentFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatSize(file.size);
        fileInfo.style.display = 'flex';
        dropZone.classList.add('has-file');
        hideError();
    }

    function clearImage() {
        currentFile = null;
        fileInput.value = '';
        fileInfo.style.display = 'none';
        dropZone.classList.remove('has-file');
    }

    function clearAll() {
        ingredientsText.value = '';
        clearImage();
        hideError();
        hideProgress();
        resultCard.style.display = 'none';
    }

    function renderRecipe(recipe) {
        recipeTitle.textContent = recipe.title || '-';

        const servings = recipe.servings || 2;
        const prep = recipe.prep_minutes || 0;
        const cook = recipe.cook_minutes || 0;
        recipeMeta.textContent = tr('tools.aiRecipe.meta', { servings: servings, prep: prep, cook: cook });

        const detected = recipe.detected_ingredients || [];
        if (detected.length) {
            detectedWrap.style.display = 'block';
            detectedList.textContent = detected.join(', ');
        } else {
            detectedWrap.style.display = 'none';
        }

        ingredientsList.innerHTML = '';
        (recipe.ingredients || []).forEach(function (item) {
            const li = document.createElement('li');
            const amount = (item.amount || '').trim();
            const name = (item.name || '').trim();
            li.textContent = amount ? amount + ' ' + name : name;
            ingredientsList.appendChild(li);
        });

        stepsList.innerHTML = '';
        (recipe.steps || []).forEach(function (step) {
            const li = document.createElement('li');
            li.textContent = step.text || '';
            stepsList.appendChild(li);
        });

        const tips = recipe.tips || [];
        if (tips.length) {
            tipsWrap.style.display = 'block';
            tipsList.innerHTML = '';
            tips.forEach(function (tip) {
                const li = document.createElement('li');
                li.textContent = tip;
                tipsList.appendChild(li);
            });
        } else {
            tipsWrap.style.display = 'none';
        }

        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function doGenerate() {
        const text = (ingredientsText.value || '').trim();
        if (!text && !currentFile) {
            showError(tr('tools.aiRecipe.needInput'));
            return;
        }

        hideError();
        resultCard.style.display = 'none';
        generateBtn.disabled = true;
        showProgress(tr('tools.aiRecipe.uploading'), 15);

        try {
            const form = new FormData();
            form.append('ingredients_text', text);
            form.append('locale', getLocale());
            if (currentFile) form.append('image', currentFile);

            showProgress(tr('tools.aiRecipe.generating'), 45);
            const res = await fetch(API_BASE + '/recipe/generate', {
                method: 'POST',
                headers: authHeaders(),
                body: form
            });

            showProgress(tr('tools.aiRecipe.processing'), 80);

            if (typeof check502Error !== 'undefined' && check502Error(res)) {
                throw new Error(tr('common.serviceUnavailable'));
            }

            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(data.detail || tr('tools.aiRecipe.failed'));
            }

            showProgress(tr('tools.aiRecipe.done'), 100);
            renderRecipe(data.recipe || {});
        } catch (e) {
            showError(e.message || tr('tools.aiRecipe.failed'));
        } finally {
            hideProgress();
            generateBtn.disabled = false;
        }
    }

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
    });
    fileInput.addEventListener('change', function (e) {
        if (e.target.files[0]) setFile(e.target.files[0]);
    });
    removeBtn.addEventListener('click', clearImage);
    clearBtn.addEventListener('click', clearAll);
    generateBtn.addEventListener('click', doGenerate);
});
