document.addEventListener('DOMContentLoaded', function () {
    var R = window.TBRecords;
    var tr = R.tr;

    var gate = document.getElementById('login-gate');
    var app = document.getElementById('app');
    var listView = document.getElementById('list-view');
    var formView = document.getElementById('form-view');
    var catView = document.getElementById('cat-view');
    var listEl = document.getElementById('list');
    var emptyEl = document.getElementById('empty');
    var errorBox = document.getElementById('error-box');
    var formError = document.getElementById('form-error');
    var catError = document.getElementById('cat-error');
    var searchInput = document.getElementById('search-input');
    var parentFilter = document.getElementById('parent-filter');
    var childFilter = document.getElementById('child-filter');
    var sortSelect = document.getElementById('sort-select');
    var moreWrap = document.getElementById('more-wrap');
    var moreBtn = document.getElementById('more-btn');
    var loginLink = document.getElementById('login-link');

    var gName = document.getElementById('g-name');
    var gParent = document.getElementById('g-parent');
    var gChild = document.getElementById('g-child');
    var gPrice = document.getElementById('g-price');
    var gRating = document.getElementById('g-rating');
    var gRemark = document.getElementById('g-remark');
    var formTitle = document.getElementById('form-title');
    var catName = document.getElementById('cat-name');
    var catParent = document.getElementById('cat-parent');
    var catList = document.getElementById('cat-list');

    var categories = [];
    var editId = null;
    var page = 1;
    var total = 0;
    var pageSize = 50;
    var items = [];

    loginLink.href = R.loginUrl();

    function parents() {
        return categories.filter(function (c) { return !c.parentId; });
    }

    function childrenOf(parentId) {
        return categories.filter(function (c) { return c.parentId === parentId; });
    }

    function fillSelect(sel, opts, allLabel) {
        sel.innerHTML = '';
        if (allLabel != null) {
            var opt0 = document.createElement('option');
            opt0.value = '0';
            opt0.textContent = allLabel;
            sel.appendChild(opt0);
        }
        opts.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = String(o.id);
            opt.textContent = o.name;
            sel.appendChild(opt);
        });
    }

    function refreshFilterSelects() {
        fillSelect(parentFilter, parents(), tr('tools.goods.allParents'));
        refreshChildFilter();
    }

    function refreshChildFilter() {
        var pid = parseInt(parentFilter.value, 10) || 0;
        fillSelect(childFilter, pid ? childrenOf(pid) : [], tr('tools.goods.allChildren'));
    }

    function refreshFormCategorySelects(selectedId) {
        fillSelect(gParent, parents(), null);
        if (!gParent.options.length) {
            gChild.innerHTML = '';
            return;
        }
        var preferredParent = null;
        var preferredChild = null;
        if (selectedId) {
            var selected = categories.find(function (c) { return c.id === selectedId; });
            if (selected) {
                if (selected.parentId) {
                    preferredParent = selected.parentId;
                    preferredChild = selected.id;
                } else {
                    preferredParent = selected.id;
                }
            }
        }
        if (preferredParent) gParent.value = String(preferredParent);
        refreshFormChildren(preferredChild);
    }

    function refreshFormChildren(selectedChildId) {
        var pid = parseInt(gParent.value, 10) || 0;
        var kids = childrenOf(pid);
        fillSelect(gChild, kids, kids.length ? tr('tools.goods.useParentCategory') : tr('tools.goods.noSubcategory'));
        if (!kids.length) {
            gChild.value = '0';
        } else if (selectedChildId) {
            gChild.value = String(selectedChildId);
        }
    }

    function selectedCategoryId() {
        var childId = parseInt(gChild.value, 10) || 0;
        if (childId > 0) return childId;
        return parseInt(gParent.value, 10) || 0;
    }

    function showList() {
        listView.hidden = false;
        formView.hidden = true;
        catView.hidden = true;
        editId = null;
        R.setError(formError, '');
    }

    function showForm(item) {
        listView.hidden = true;
        formView.hidden = false;
        catView.hidden = true;
        editId = item ? item.id : null;
        formTitle.textContent = editId ? tr('tools.goods.edit') : tr('tools.goods.add');
        gName.value = item ? item.name : '';
        gPrice.value = item ? item.price : '';
        gRating.value = item && item.rating != null ? String(item.rating) : '';
        gRemark.value = item ? item.remark || '' : '';
        refreshFormCategorySelects(item ? item.categoryId : null);
        R.setError(formError, '');
        gName.focus();
    }

    function showCats() {
        listView.hidden = true;
        formView.hidden = true;
        catView.hidden = false;
        catName.value = '';
        fillSelect(catParent, parents(), tr('tools.goods.noParent'));
        renderCats();
        R.setError(catError, '');
    }

    function renderCats() {
        catList.innerHTML = '';
        if (!categories.length) {
            catList.innerHTML = '<p class="rec-empty">' + R.escapeHtml(tr('tools.goods.noCategories')) + '</p>';
            return;
        }
        parents().forEach(function (p) {
            appendCatRow(p, false);
            childrenOf(p.id).forEach(function (c) {
                appendCatRow(c, true);
            });
        });
    }

    function appendCatRow(cat, isChild) {
        var el = document.createElement('div');
        el.className = 'rec-item';
        el.innerHTML =
            '<div class="rec-item-main"><div><p class="rec-item-title"></p></div></div>' +
            '<div class="rec-item-actions"><button type="button" class="tb-btn" data-act="del"></button></div>';
        el.querySelector('.rec-item-title').textContent = (isChild ? '↳ ' : '') + cat.name;
        el.querySelector('[data-act="del"]').textContent = tr('tools.records.delete');
        el.querySelector('[data-act="del"]').addEventListener('click', function () {
            if (!R.confirmDelete(tr('tools.goods.deleteCategoryConfirm', { name: cat.name }))) return;
            R.apiJson('/records/goods/categories/' + cat.id, { method: 'DELETE' })
                .then(function () { return loadCategories().then(showCats); })
                .catch(function (e) { R.setError(catError, e.message); });
        });
        catList.appendChild(el);
    }

    function renderGoods(append) {
        if (!append) listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        moreWrap.hidden = items.length >= total;
        items.forEach(function (item, idx) {
            if (append && idx < (page - 1) * pageSize) return;
            var el = document.createElement('div');
            el.className = 'rec-item';
            el.innerHTML =
                '<div class="rec-item-main">' +
                '<div><p class="rec-item-title"></p><p class="rec-item-meta"></p><p class="rec-item-meta" data-remark></p></div>' +
                '<div><div class="rec-item-value"></div><div class="rec-rating"></div></div>' +
                '</div>' +
                '<div class="rec-item-actions">' +
                '<button type="button" class="tb-btn" data-act="edit"></button>' +
                '<button type="button" class="tb-btn" data-act="del"></button>' +
                '</div>';
            el.querySelector('.rec-item-title').textContent = item.name;
            el.querySelector('.rec-item-meta').textContent = item.category || '';
            var remarkEl = el.querySelector('[data-remark]');
            if (item.remark) remarkEl.textContent = item.remark;
            else remarkEl.hidden = true;
            el.querySelector('.rec-item-value').textContent = '¥' + item.price;
            el.querySelector('.rec-rating').textContent =
                item.rating != null ? tr('tools.goods.ratingValue', { n: item.rating }) : '';
            el.querySelector('[data-act="edit"]').textContent = tr('tools.records.edit');
            el.querySelector('[data-act="del"]').textContent = tr('tools.records.delete');
            el.querySelector('[data-act="edit"]').addEventListener('click', function () { showForm(item); });
            el.querySelector('[data-act="del"]').addEventListener('click', function () {
                if (!R.confirmDelete(tr('tools.goods.deleteConfirm', { name: item.name }))) return;
                R.apiJson('/records/goods/' + item.id, { method: 'DELETE' })
                    .then(function () { page = 1; return loadGoods(false); })
                    .catch(function (e) { R.setError(errorBox, e.message); });
            });
            listEl.appendChild(el);
        });
    }

    function loadCategories() {
        return R.apiJson('/records/goods/categories').then(function (data) {
            categories = data.items || [];
            refreshFilterSelects();
        });
    }

    function loadGoods(append) {
        R.setError(errorBox, '');
        var sortParts = (sortSelect.value || 'rating:desc').split(':');
        var params = new URLSearchParams();
        params.set('page', String(page));
        params.set('page_size', String(pageSize));
        params.set('sort', sortParts[0]);
        params.set('order', sortParts[1] || 'desc');
        var q = searchInput.value.trim();
        if (q) params.set('q', q);
        var childId = parseInt(childFilter.value, 10) || 0;
        var parentId = parseInt(parentFilter.value, 10) || 0;
        if (childId > 0) params.set('category_id', String(childId));
        else if (parentId > 0) params.set('parent_category_id', String(parentId));

        return R.apiJson('/records/goods?' + params.toString()).then(function (data) {
            total = data.total || 0;
            var batch = data.items || [];
            if (append) items = items.concat(batch);
            else items = batch;
            renderGoods(!!append);
        }).catch(function (e) {
            R.setError(errorBox, e.message);
        });
    }

    function reloadAll() {
        page = 1;
        return loadCategories().then(function () { return loadGoods(false); });
    }

    document.getElementById('add-btn').addEventListener('click', function () {
        if (!categories.length) {
            R.setError(errorBox, tr('tools.goods.needCategoryFirst'));
            return;
        }
        showForm(null);
    });
    document.getElementById('cat-btn').addEventListener('click', showCats);
    document.getElementById('refresh-btn').addEventListener('click', reloadAll);
    document.getElementById('cancel-btn').addEventListener('click', showList);
    document.getElementById('cat-back-btn').addEventListener('click', function () {
        showList();
        reloadAll();
    });
    parentFilter.addEventListener('change', function () {
        refreshChildFilter();
        page = 1;
        loadGoods(false);
    });
    childFilter.addEventListener('change', function () { page = 1; loadGoods(false); });
    sortSelect.addEventListener('change', function () { page = 1; loadGoods(false); });
    var searchTimer = null;
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { page = 1; loadGoods(false); }, 300);
    });
    moreBtn.addEventListener('click', function () {
        page += 1;
        loadGoods(true);
    });
    gParent.addEventListener('change', function () { refreshFormChildren(null); });

    document.getElementById('save-btn').addEventListener('click', function () {
        var name = gName.value.trim();
        var categoryId = selectedCategoryId();
        var price = gPrice.value.trim();
        if (!name) {
            R.setError(formError, tr('tools.records.invalidName'));
            return;
        }
        if (!categoryId) {
            R.setError(formError, tr('tools.records.categoryNotFound'));
            return;
        }
        if (!price) {
            R.setError(formError, tr('tools.records.invalidPrice'));
            return;
        }
        var body = {
            name: name,
            category_id: categoryId,
            price: price,
            rating: gRating.value.trim() || null,
            remark: gRemark.value.trim()
        };
        var path = editId ? '/records/goods/' + editId : '/records/goods';
        var method = editId ? 'PUT' : 'POST';
        R.apiJson(path, { method: method, body: JSON.stringify(body) })
            .then(function () {
                showList();
                page = 1;
                return loadGoods(false);
            })
            .catch(function (e) { R.setError(formError, e.message); });
    });

    document.getElementById('cat-save-btn').addEventListener('click', function () {
        var name = catName.value.trim();
        if (!name) {
            R.setError(catError, tr('tools.records.invalidName'));
            return;
        }
        var parentId = parseInt(catParent.value, 10) || null;
        R.apiJson('/records/goods/categories', {
            method: 'POST',
            body: JSON.stringify({ name: name, parent_id: parentId })
        })
            .then(function () {
                catName.value = '';
                return loadCategories().then(showCats);
            })
            .catch(function (e) { R.setError(catError, e.message); });
    });

    R.requireLogin(gate, app).then(function (user) {
        if (user) reloadAll();
    });
});
