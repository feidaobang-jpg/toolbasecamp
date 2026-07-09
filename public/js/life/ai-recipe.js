document.addEventListener('DOMContentLoaded', function () {
    const API_BASE = (typeof siteConfig !== 'undefined' && siteConfig.apiBase)
        ? siteConfig.apiBase
        : 'http://127.0.0.1:8001';
    const TOKEN_KEY = 'auth_token';
    const MAX_IMAGES = 5;

    const ingredientsText = document.getElementById('ingredients-text');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewGrid = document.getElementById('image-preview-grid');
    const detectBtn = document.getElementById('detect-btn');
    const clearBtn = document.getElementById('clear-btn');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPct = document.getElementById('progress-percent');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const selectCard = document.getElementById('select-card');
    const ingredientChoices = document.getElementById('ingredient-choices');
    const selectAllBtn = document.getElementById('select-all-btn');
    const selectNoneBtn = document.getElementById('select-none-btn');
    const generateBtn = document.getElementById('generate-btn');
    const resultCard = document.getElementById('result-card');
    const recipeTitle = document.getElementById('recipe-title');
    const recipeMeta = document.getElementById('recipe-meta');
    const detectedWrap = document.getElementById('detected-wrap');
    const detectedList = document.getElementById('detected-list');
    const ingredientsList = document.getElementById('ingredients-list');
    const stepsList = document.getElementById('steps-list');
    const tipsWrap = document.getElementById('tips-wrap');
    const tipsList = document.getElementById('tips-list');

    const requiredEls = {
        'ingredients-text': ingredientsText,
        'drop-zone': dropZone,
        'file-input': fileInput,
        'image-preview-grid': previewGrid,
        'detect-btn': detectBtn,
        'clear-btn': clearBtn,
        'select-card': selectCard,
        'ingredient-choices': ingredientChoices,
        'select-all-btn': selectAllBtn,
        'select-none-btn': selectNoneBtn,
        'generate-btn': generateBtn
    };
    const missing = Object.keys(requiredEls).filter(function (id) { return !requiredEls[id]; });
    if (missing.length) {
        console.error('ai-recipe: missing DOM nodes:', missing.join(', '));
        if (errorBox && errorMsg) {
            errorBox.style.display = 'flex';
            errorMsg.textContent = 'Page assets are out of date. Please hard-refresh (Ctrl+F5).';
        }
        return;
    }

    let imageItems = [];
    let detectNotes = '';
    let nextImageId = 1;

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
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        errorBox.style.display = 'none';
    }

    function isValidImage(file) {
        const mime = (file.type || '').toLowerCase();
        const okMime = ['image/jpeg', 'image/png', 'image/webp'];
        const okExt = /\.(jpe?g|png|webp)$/i.test(file.name || '');
        return okMime.includes(mime) || okExt;
    }

    function sourceLabel(sources) {
        const hasText = sources.indexOf('text') >= 0;
        const hasImage = sources.indexOf('image') >= 0;
        if (hasText && hasImage) return tr('tools.aiRecipe.sourceBoth');
        if (hasImage) return tr('tools.aiRecipe.sourceImage');
        return tr('tools.aiRecipe.sourceText');
    }

    function renderPreviews() {
        previewGrid.innerHTML = '';
        imageItems.forEach(function (item) {
            const wrap = document.createElement('div');
            wrap.className = 'recipe-preview-item';

            const img = document.createElement('img');
            img.src = item.url;
            img.alt = item.file.name;

            const meta = document.createElement('div');
            meta.className = 'recipe-preview-meta';
            meta.textContent = formatSize(item.file.size);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'recipe-preview-remove';
            remove.title = tr('tools.aiRecipe.removeImage');
            remove.textContent = '✕';
            remove.addEventListener('click', function () {
                removeImage(item.id);
            });

            wrap.appendChild(img);
            wrap.appendChild(meta);
            wrap.appendChild(remove);
            previewGrid.appendChild(wrap);
        });

        dropZone.classList.toggle('has-file', imageItems.length > 0);
    }

    function addImages(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;

        hideError();
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (imageItems.length >= MAX_IMAGES) {
                showError(tr('tools.aiRecipe.maxImages', { max: MAX_IMAGES }));
                break;
            }
            if (!isValidImage(file)) {
                showError(tr('tools.aiRecipe.invalidImage'));
                continue;
            }
            if (file.size > 5 * 1024 * 1024) {
                showError(tr('tools.aiRecipe.imageTooLarge'));
                continue;
            }
            imageItems.push({
                id: nextImageId++,
                file: file,
                url: URL.createObjectURL(file)
            });
        }
        renderPreviews();
        fileInput.value = '';
    }

    function removeImage(id) {
        const idx = imageItems.findIndex(function (item) { return item.id === id; });
        if (idx < 0) return;
        URL.revokeObjectURL(imageItems[idx].url);
        imageItems.splice(idx, 1);
        renderPreviews();
    }

    function clearImages() {
        imageItems.forEach(function (item) {
            URL.revokeObjectURL(item.url);
        });
        imageItems = [];
        fileInput.value = '';
        renderPreviews();
    }

    function hideSelection() {
        selectCard.style.display = 'none';
        ingredientChoices.innerHTML = '';
        detectNotes = '';
    }

    function clearAll() {
        ingredientsText.value = '';
        clearImages();
        hideError();
        hideProgress();
        hideSelection();
        resultCard.style.display = 'none';
    }

    function renderIngredientChoices(items) {
        ingredientChoices.innerHTML = '';
        items.forEach(function (item, index) {
            const li = document.createElement('li');
            li.className = 'recipe-ingredient-choice';

            const id = 'ingredient-choice-' + index;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = id;
            checkbox.value = item.name;
            checkbox.checked = true;
            checkbox.className = 'recipe-ingredient-checkbox';

            const label = document.createElement('label');
            label.htmlFor = id;
            label.className = 'recipe-ingredient-label';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'recipe-ingredient-name';
            nameSpan.textContent = item.name;

            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'recipe-ingredient-source';
            sourceSpan.textContent = sourceLabel(item.sources || []);

            label.appendChild(nameSpan);
            label.appendChild(sourceSpan);
            li.appendChild(checkbox);
            li.appendChild(label);
            ingredientChoices.appendChild(li);
        });

        selectCard.style.display = 'block';
        selectCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getSelectedIngredients() {
        return Array.from(ingredientChoices.querySelectorAll('.recipe-ingredient-checkbox:checked'))
            .map(function (el) { return el.value; });
    }

    function setAllChoices(checked) {
        ingredientChoices.querySelectorAll('.recipe-ingredient-checkbox').forEach(function (el) {
            el.checked = checked;
        });
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

    async function doDetect() {
        const text = (ingredientsText.value || '').trim();
        if (!text && !imageItems.length) {
            showError(tr('tools.aiRecipe.needInput'));
            return;
        }

        hideError();
        resultCard.style.display = 'none';
        hideSelection();
        detectBtn.disabled = true;
        showProgress(tr('tools.aiRecipe.uploading'), 15);

        try {
            const form = new FormData();
            form.append('ingredients_text', text);
            form.append('locale', getLocale());
            imageItems.forEach(function (item) {
                form.append('images', item.file);
            });

            showProgress(tr('tools.aiRecipe.detecting'), 50);
            const res = await fetch(API_BASE + '/recipe/detect', {
                method: 'POST',
                headers: authHeaders(),
                body: form
            });

            showProgress(tr('tools.aiRecipe.processing'), 85);

            if (typeof check502Error !== 'undefined' && check502Error(res)) {
                throw new Error(tr('common.serviceUnavailable'));
            }

            const data = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                throw new Error(data.detail || tr('tools.aiRecipe.detectFailed'));
            }

            const items = data.ingredients || [];
            if (!items.length) {
                throw new Error(tr('tools.aiRecipe.needInput'));
            }

            detectNotes = data.notes || '';
            renderIngredientChoices(items);
            showProgress(tr('tools.aiRecipe.detectDone'), 100);
        } catch (e) {
            showError(e.message || tr('tools.aiRecipe.detectFailed'));
        } finally {
            hideProgress();
            detectBtn.disabled = false;
        }
    }

    async function doGenerate() {
        const selected = getSelectedIngredients();
        if (!selected.length) {
            showError(tr('tools.aiRecipe.noSelection'));
            return;
        }

        hideError();
        resultCard.style.display = 'none';
        generateBtn.disabled = true;
        showProgress(tr('tools.aiRecipe.generating'), 35);

        try {
            const res = await fetch(API_BASE + '/recipe/generate', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    ingredients: selected,
                    locale: getLocale(),
                    notes: detectNotes
                })
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
        addImages(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function (e) {
        addImages(e.target.files);
    });
    selectAllBtn.addEventListener('click', function () { setAllChoices(true); });
    selectNoneBtn.addEventListener('click', function () { setAllChoices(false); });
    clearBtn.addEventListener('click', clearAll);
    detectBtn.addEventListener('click', doDetect);
    generateBtn.addEventListener('click', doGenerate);
});
