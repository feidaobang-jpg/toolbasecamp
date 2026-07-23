document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var R = window.TBRecords;
  var tr = R.tr;
  var STATUS = { pending: 'pending', done: 'done' };
  var items = [];
  var filter = 'all';
  var editingId = null;
  var busy = false;

  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var statsEl = document.getElementById('stats');
  var errorEl = document.getElementById('error-box');
  var inputEl = document.getElementById('todo-input');
  var formEl = document.getElementById('add-form');
  var filterRow = document.getElementById('filter-row');
  var footerEl = document.getElementById('footer-actions');
  var clearDoneBtn = document.getElementById('clear-done-btn');
  var refreshBtn = document.getElementById('refresh-btn');
  var loginLink = document.getElementById('login-link');

  loginLink.href = R.loginUrl();

  function showError(msg) {
    R.setError(errorEl, msg || '');
  }

  function normalizeItem(it) {
    var status = it.status === STATUS.done ? STATUS.done : STATUS.pending;
    return {
      id: it.id,
      text: String(it.text || ''),
      status: status,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt
    };
  }

  function visibleItems() {
    if (filter === STATUS.pending || filter === STATUS.done) {
      return items.filter(function (it) { return it.status === filter; });
    }
    return items.slice();
  }

  function counts() {
    var pending = 0;
    var done = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === STATUS.done) done++;
      else pending++;
    }
    return { pending: pending, done: done, total: items.length };
  }

  function statusLabel(status) {
    if (status === STATUS.done) return tr('tools.todoList.statusDone');
    return tr('tools.todoList.statusPending');
  }

  function nextStatus(status) {
    return status === STATUS.pending ? STATUS.done : STATUS.pending;
  }

  function render() {
    var c = counts();
    statsEl.textContent = tr('tools.todoList.stats', {
      pending: c.pending,
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
      row.dataset.id = String(it.id);

      var statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'todo-status';
      statusBtn.textContent = statusLabel(it.status);
      statusBtn.title = tr('tools.todoList.cycleStatus');
      statusBtn.setAttribute('aria-label', tr('tools.todoList.cycleStatus'));
      statusBtn.disabled = busy;
      statusBtn.addEventListener('click', function () {
        updateTodo(it, { text: it.text, status: nextStatus(it.status) });
      });

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
        text.title = tr('tools.todoList.editHint');
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
        deleteTodo(it);
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      row.appendChild(statusBtn);
      row.appendChild(body);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  function load() {
    showError('');
    return R.apiJson('/records/todos').then(function (data) {
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
    updateTodo(it, { text: text, status: it.status });
  }

  function updateTodo(it, body) {
    if (busy) return;
    busy = true;
    render();
    R.apiJson('/records/todos/' + it.id, {
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

  function deleteTodo(it) {
    if (busy) return;
    if (!R.confirmDelete(tr('tools.todoList.deleteConfirm', { text: it.text }))) return;
    busy = true;
    render();
    R.apiJson('/records/todos/' + it.id, { method: 'DELETE' }).then(function () {
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

  function addTodo(text) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) {
      showError(tr('tools.todoList.emptyText'));
      inputEl.focus();
      return;
    }
    if (busy) return;
    busy = true;
    showError('');
    render();
    R.apiJson('/records/todos', {
      method: 'POST',
      body: JSON.stringify({ text: text, status: STATUS.pending })
    }).then(function (created) {
      items.unshift(normalizeItem(created));
      if (filter === STATUS.done) filter = 'all';
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
    addTodo(value);
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

  refreshBtn.addEventListener('click', function () {
    if (busy) return;
    load();
  });

  clearDoneBtn.addEventListener('click', function () {
    if (busy || !counts().done) return;
    if (!window.confirm(tr('tools.todoList.clearDoneConfirm'))) return;
    busy = true;
    render();
    R.apiJson('/records/todos/clear-done', { method: 'POST', body: '{}' }).then(function () {
      items = items.filter(function (it) { return it.status !== STATUS.done; });
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
