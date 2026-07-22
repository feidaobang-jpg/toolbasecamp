(function () {
  'use strict';

  var SAVE = 'tbc_todo_list_v1';
  var STATUS = { pending: 'pending', doing: 'doing', done: 'done' };
  var items = [];
  var filter = 'all';
  var editingId = null;

  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var statsEl = document.getElementById('stats');
  var errorEl = document.getElementById('error-box');
  var inputEl = document.getElementById('todo-input');
  var formEl = document.getElementById('add-form');
  var filterRow = document.getElementById('filter-row');
  var footerEl = document.getElementById('footer-actions');
  var clearDoneBtn = document.getElementById('clear-done-btn');

  function t(key, params) {
    return typeof window.t === 'function' ? window.t(key, params) : key;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeStatus(raw, doneFlag) {
    if (raw === STATUS.doing || raw === STATUS.done || raw === STATUS.pending) return raw;
    return doneFlag ? STATUS.done : STATUS.pending;
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data.items)) return [];
      return data.items
        .filter(function (it) { return it && typeof it.text === 'string'; })
        .map(function (it) {
          return {
            id: String(it.id || uid()),
            text: String(it.text).slice(0, 200),
            status: normalizeStatus(it.status, it.done),
            createdAt: Number(it.createdAt) || Date.now()
          };
        });
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(SAVE, JSON.stringify({ items: items }));
      showError('');
    } catch (e) {
      showError(t('tools.todoList.saveFailed'));
    }
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
    errorEl.hidden = !msg;
  }

  function visibleItems() {
    if (filter === 'pending' || filter === 'doing' || filter === 'done') {
      return items.filter(function (it) { return it.status === filter; });
    }
    return items.slice();
  }

  function counts() {
    var pending = 0;
    var doing = 0;
    var done = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === STATUS.done) done++;
      else if (items[i].status === STATUS.doing) doing++;
      else pending++;
    }
    return { pending: pending, doing: doing, done: done, total: items.length };
  }

  function statusLabel(status) {
    if (status === STATUS.doing) return t('tools.todoList.statusDoing');
    if (status === STATUS.done) return t('tools.todoList.statusDone');
    return t('tools.todoList.statusPending');
  }

  function nextStatus(status) {
    if (status === STATUS.pending) return STATUS.doing;
    if (status === STATUS.doing) return STATUS.done;
    return STATUS.pending;
  }

  function render() {
    var c = counts();
    statsEl.textContent = t('tools.todoList.stats', {
      pending: c.pending,
      doing: c.doing,
      done: c.done,
      total: c.total
    });

    footerEl.hidden = c.done === 0;

    var chips = filterRow.querySelectorAll('[data-filter]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i].getAttribute('data-filter') === filter);
    }

    var view = visibleItems();
    listEl.innerHTML = '';
    emptyEl.hidden = view.length > 0;

    view.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'todo-item status-' + it.status;
      row.dataset.id = it.id;

      var statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'todo-status';
      statusBtn.textContent = statusLabel(it.status);
      statusBtn.title = t('tools.todoList.cycleStatus');
      statusBtn.setAttribute('aria-label', t('tools.todoList.cycleStatus'));
      statusBtn.addEventListener('click', function () {
        it.status = nextStatus(it.status);
        save();
        render();
      });

      var body = document.createElement('div');
      body.className = 'todo-body';

      if (editingId === it.id) {
        var edit = document.createElement('input');
        edit.type = 'text';
        edit.className = 'todo-edit-input';
        edit.value = it.text;
        edit.maxLength = 200;
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
        text.title = t('tools.todoList.editHint');
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
      editBtn.textContent = t('tools.records.edit');
      editBtn.addEventListener('click', function () {
        editingId = it.id;
        render();
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tb-btn';
      delBtn.textContent = t('tools.records.delete');
      delBtn.addEventListener('click', function () {
        items = items.filter(function (x) { return x.id !== it.id; });
        if (editingId === it.id) editingId = null;
        save();
        render();
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(statusBtn);
      row.appendChild(body);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  function commitEdit(it, value) {
    var text = String(value || '').trim().slice(0, 200);
    editingId = null;
    if (!text) {
      render();
      return;
    }
    it.text = text;
    save();
    render();
  }

  function addTodo(text) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) {
      showError(t('tools.todoList.emptyText'));
      inputEl.focus();
      return;
    }
    showError('');
    items.unshift({
      id: uid(),
      text: text,
      status: STATUS.pending,
      createdAt: Date.now()
    });
    filter = filter === 'done' || filter === 'doing' ? 'all' : filter;
    save();
    render();
  }

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    addTodo(inputEl.value);
    inputEl.value = '';
    inputEl.focus();
  });

  filterRow.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.getAttribute('data-filter') || 'all';
    editingId = null;
    render();
  });

  clearDoneBtn.addEventListener('click', function () {
    if (!counts().done) return;
    if (!window.confirm(t('tools.todoList.clearDoneConfirm'))) return;
    items = items.filter(function (it) { return it.status !== STATUS.done; });
    editingId = null;
    save();
    render();
  });

  document.addEventListener('tb:locale', function () {
    render();
  });

  items = load();
  render();
  inputEl.focus();
})();
