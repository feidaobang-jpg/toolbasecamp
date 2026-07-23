document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var R = window.TBRecords;
  var tr = R.tr;
  var STATUS = { pending: 'pending', done: 'done' };
  var DEFAULT_CATS = [
    'moving', 'shopping', 'wishlist', 'daily', 'work', 'study', 'travel', 'party',
    'home', 'health', 'finance', 'packing', 'gift', 'car', 'baby', 'pet',
    'digital', 'errand', 'cleaning', 'other'
  ];
  var categories = DEFAULT_CATS.slice();
  var items = [];
  var categoryFilter = 'all';
  var statusFilter = 'all';
  var editingId = null;
  var busy = false;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var statsEl = document.getElementById('stats');
  var errorEl = document.getElementById('error-box');
  var inputEl = document.getElementById('task-input');
  var categorySelect = document.getElementById('category-select');
  var formEl = document.getElementById('add-form');
  var categoryFilterRow = document.getElementById('category-filter-row');
  var statusFilterRow = document.getElementById('status-filter-row');
  var footerEl = document.getElementById('footer-actions');
  var clearDoneBtn = document.getElementById('clear-done-btn');
  var refreshBtn = document.getElementById('refresh-btn');
  var loginLink = document.getElementById('login-link');

  loginLink.href = R.loginUrl();

  function showError(msg) {
    R.setError(errorEl, msg || '');
  }

  function catLabel(cat) {
    return tr('tools.taskList.cats.' + cat) || cat;
  }

  function normalizeItem(it) {
    var cat = String(it.category || 'other');
    if (categories.indexOf(cat) < 0) cat = 'other';
    return {
      id: it.id,
      text: String(it.text || ''),
      category: cat,
      status: it.status === STATUS.done ? STATUS.done : STATUS.pending,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt
    };
  }

  function visibleItems() {
    return items.filter(function (it) {
      if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
      if (statusFilter === STATUS.pending || statusFilter === STATUS.done) {
        return it.status === statusFilter;
      }
      return true;
    });
  }

  function counts() {
    var pending = 0;
    var done = 0;
    var scoped = items.filter(function (it) {
      return categoryFilter === 'all' || it.category === categoryFilter;
    });
    for (var i = 0; i < scoped.length; i++) {
      if (scoped[i].status === STATUS.done) done++;
      else pending++;
    }
    return { pending: pending, done: done, total: scoped.length };
  }

  function nextStatus(status) {
    return status === STATUS.pending ? STATUS.done : STATUS.pending;
  }

  function fillCategorySelect() {
    var prev = categorySelect.value || 'daily';
    categorySelect.innerHTML = '';
    categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = catLabel(cat);
      categorySelect.appendChild(opt);
    });
    categorySelect.value = categories.indexOf(prev) >= 0 ? prev : (categories[0] || 'daily');
  }

  function renderCategoryFilters() {
    categoryFilterRow.innerHTML = '';
    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'rec-chip' + (categoryFilter === 'all' ? ' is-active' : '');
    allBtn.setAttribute('data-category', 'all');
    allBtn.textContent = tr('tools.taskList.filterAllCats');
    categoryFilterRow.appendChild(allBtn);
    categories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-chip' + (categoryFilter === cat ? ' is-active' : '');
      btn.setAttribute('data-category', cat);
      btn.textContent = catLabel(cat);
      categoryFilterRow.appendChild(btn);
    });
  }

  function render() {
    var c = counts();
    statsEl.textContent = tr('tools.taskList.stats', {
      pending: c.pending,
      done: c.done
    });
    footerEl.hidden = c.done === 0;
    fillCategorySelect();
    renderCategoryFilters();

    var statusChips = statusFilterRow.querySelectorAll('[data-status]');
    for (var i = 0; i < statusChips.length; i++) {
      var chip = statusChips[i];
      chip.classList.toggle('is-active', chip.getAttribute('data-status') === statusFilter);
    }

    var view = visibleItems();
    listEl.innerHTML = '';
    emptyEl.hidden = view.length > 0;

    view.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'todo-item status-' + it.status;
      row.dataset.id = String(it.id);

      var statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'todo-status';
      statusBtn.textContent = it.status === STATUS.done
        ? tr('tools.taskList.statusDone')
        : tr('tools.taskList.statusPending');
      statusBtn.title = tr('tools.taskList.cycleStatus');
      statusBtn.setAttribute('aria-label', tr('tools.taskList.cycleStatus'));
      statusBtn.disabled = busy;
      statusBtn.addEventListener('click', function () {
        updateItem(it, { text: it.text, category: it.category, status: nextStatus(it.status) });
      });

      var tag = document.createElement('span');
      tag.className = 'task-cat-tag';
      tag.textContent = catLabel(it.category);

      var body = document.createElement('div');
      body.className = 'todo-body';

      if (editingId === it.id) {
        var edit = document.createElement('input');
        edit.type = 'text';
        edit.className = 'todo-edit-input';
        edit.value = it.text;
        edit.maxLength = 200;
        edit.disabled = busy;
        edit.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitEdit(it, edit.value);
          } else if (e.key === 'Escape') {
            editingId = null;
            render();
          }
        });
        edit.addEventListener('blur', function () {
          if (editingId === it.id) commitEdit(it, edit.value);
        });
        body.appendChild(edit);
        requestAnimationFrame(function () { edit.focus(); edit.select(); });
      } else {
        var text = document.createElement('p');
        text.className = 'todo-text';
        text.textContent = it.text;
        text.title = tr('tools.taskList.editHint');
        text.addEventListener('dblclick', function () {
          editingId = it.id;
          render();
        });
        body.appendChild(text);
      }

      var actions = document.createElement('div');
      actions.className = 'todo-item-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'tb-btn';
      editBtn.textContent = tr('tools.records.edit');
      editBtn.disabled = busy;
      editBtn.addEventListener('click', function () {
        editingId = it.id;
        render();
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tb-btn';
      delBtn.textContent = tr('tools.records.delete');
      delBtn.disabled = busy;
      delBtn.addEventListener('click', function () {
        deleteItem(it);
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(statusBtn);
      row.appendChild(tag);
      row.appendChild(body);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  function load() {
    showError('');
    var q = '';
    if (categoryFilter !== 'all') q += (q ? '&' : '?') + 'category=' + encodeURIComponent(categoryFilter);
    return R.apiJson('/records/task-lists' + q).then(function (data) {
      if (Array.isArray(data.categories) && data.categories.length) {
        categories = data.categories.slice();
      }
      items = (data.items || []).map(normalizeItem);
      render();
    }).catch(function (err) {
      showError(err.message || tr('tools.records.unknownError'));
    });
  }

  function commitEdit(it, value) {
    var text = String(value || '').trim().slice(0, 200);
    editingId = null;
    if (!text || text === it.text) {
      render();
      return;
    }
    updateItem(it, { text: text, category: it.category, status: it.status });
  }

  function updateItem(it, body) {
    if (busy) return;
    busy = true;
    render();
    R.apiJson('/records/task-lists/' + it.id, {
      method: 'PUT',
      body: JSON.stringify(body)
    }).then(function (updated) {
      var next = normalizeItem(updated);
      items = items.map(function (x) { return x.id === next.id ? next : x; });
      busy = false;
      render();
    }).catch(function (err) {
      busy = false;
      showError(err.message || tr('tools.records.unknownError'));
      render();
    });
  }

  function deleteItem(it) {
    if (busy) return;
    if (!R.confirmDelete(tr('tools.taskList.deleteConfirm', { text: it.text }))) return;
    busy = true;
    render();
    R.apiJson('/records/task-lists/' + it.id, { method: 'DELETE' }).then(function () {
      items = items.filter(function (x) { return x.id !== it.id; });
      if (editingId === it.id) editingId = null;
      busy = false;
      render();
    }).catch(function (err) {
      busy = false;
      showError(err.message || tr('tools.records.unknownError'));
      render();
    });
  }

  function addItem(text, category) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) {
      showError(tr('tools.taskList.emptyText'));
      inputEl.focus();
      return;
    }
    if (busy) return;
    busy = true;
    showError('');
    render();
    R.apiJson('/records/task-lists', {
      method: 'POST',
      body: JSON.stringify({ text: text, category: category, status: STATUS.pending })
    }).then(function (created) {
      items.unshift(normalizeItem(created));
      if (statusFilter === STATUS.done) statusFilter = 'all';
      busy = false;
      render();
    }).catch(function (err) {
      busy = false;
      showError(err.message || tr('tools.records.unknownError'));
      render();
    });
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = inputEl.value;
    var cat = categorySelect.value || 'daily';
    addItem(value, cat);
    inputEl.value = '';
    inputEl.focus();
  });

  categoryFilterRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-category]');
    if (!btn) return;
    categoryFilter = btn.getAttribute('data-category') || 'all';
    editingId = null;
    load();
  });

  statusFilterRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-status]');
    if (!btn) return;
    statusFilter = btn.getAttribute('data-status') || 'all';
    editingId = null;
    render();
  });

  refreshBtn.addEventListener('click', function () {
    if (busy) return;
    load();
  });

  clearDoneBtn.addEventListener('click', function () {
    if (busy || !counts().done) return;
    if (!window.confirm(tr('tools.taskList.clearDoneConfirm'))) return;
    busy = true;
    render();
    var q = categoryFilter !== 'all'
      ? ('?category=' + encodeURIComponent(categoryFilter))
      : '';
    R.apiJson('/records/task-lists/clear-done' + q, { method: 'POST', body: '{}' }).then(function () {
      return load();
    }).then(function () {
      editingId = null;
      busy = false;
      render();
    }).catch(function (err) {
      busy = false;
      showError(err.message || tr('tools.records.unknownError'));
      render();
    });
  });

  document.addEventListener('tb:locale', function () {
    render();
  });

  R.requireLogin(gate, app).then(function (user) {
    if (user) load().then(function () { inputEl.focus(); });
  });
});
