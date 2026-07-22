(function () {
  'use strict';

  var SAVE = 'tbc_todo_list_v1';
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

  function t(key, fallback) {
    try {
      if (window.i18n && typeof window.i18n.t === 'function') {
        var v = window.i18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback || key;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
            done: !!it.done,
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
      showError(t('tools.todoList.saveFailed', 'Could not save — check browser storage settings'));
    }
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || '';
    errorEl.hidden = !msg;
  }

  function visibleItems() {
    if (filter === 'pending') return items.filter(function (it) { return !it.done; });
    if (filter === 'done') return items.filter(function (it) { return it.done; });
    return items.slice();
  }

  function counts() {
    var pending = 0;
    var done = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].done) done++;
      else pending++;
    }
    return { pending: pending, done: done, total: items.length };
  }

  function render() {
    var c = counts();
    var tpl = t('tools.todoList.stats', '{pending} pending · {done} done');
    statsEl.textContent = tpl
      .replace('{pending}', String(c.pending))
      .replace('{done}', String(c.done))
      .replace('{total}', String(c.total));

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
      row.className = 'todo-item' + (it.done ? ' is-done' : '');
      row.dataset.id = it.id;

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'todo-check';
      check.checked = it.done;
      check.setAttribute('aria-label', t('tools.todoList.toggle', 'Toggle done'));
      check.addEventListener('change', function () {
        it.done = check.checked;
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
        text.title = t('tools.todoList.editHint', 'Double-click to edit');
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
      editBtn.textContent = t('tools.records.edit', 'Edit');
      editBtn.addEventListener('click', function () {
        editingId = it.id;
        render();
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tb-btn';
      delBtn.textContent = t('tools.records.delete', 'Delete');
      delBtn.addEventListener('click', function () {
        items = items.filter(function (x) { return x.id !== it.id; });
        if (editingId === it.id) editingId = null;
        save();
        render();
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(check);
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
      showError(t('tools.todoList.emptyText', 'Please enter a task'));
      inputEl.focus();
      return;
    }
    showError('');
    items.unshift({
      id: uid(),
      text: text,
      done: false,
      createdAt: Date.now()
    });
    filter = filter === 'done' ? 'all' : filter;
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
    if (!window.confirm(t('tools.todoList.clearDoneConfirm', 'Clear all completed tasks?'))) return;
    items = items.filter(function (it) { return !it.done; });
    editingId = null;
    save();
    render();
  });

  items = load();
  render();
  inputEl.focus();
})();
