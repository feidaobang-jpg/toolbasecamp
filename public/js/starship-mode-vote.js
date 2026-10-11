/** 虫潮模式单选投票；只加载于网站投票页，不进入游戏包。 */
(function (global) {
    'use strict';
    function init() {
        var V = global.TBGameVote;
        var list = document.getElementById('gv-mode-list');
        if (!V || !list) return;
        var summary = document.getElementById('gv-mode-summary');
        var message = document.getElementById('gv-mode-msg');
        var refresh = document.getElementById('gv-mode-refresh');
        // 存储不可用时，本页请求仍复用同一身份，不在每次请求时生成新设备。
        var device = V.deviceId();
        var poll = null;
        var busy = false;

        function tr(key) { return global.t('gameVote.' + key); }
        function format(key, values) {
            return tr(key).replace(/\{(\w+)\}/g, function (_, name) { return values[name]; });
        }
        function say(text, kind) {
            message.textContent = text;
            message.className = 'gv-msg' + (text ? ' gv-msg--' + kind : '');
        }
        function setBusy(value) {
            busy = value;
            refresh.disabled = value;
            list.setAttribute('aria-busy', String(value));
            list.querySelectorAll('button').forEach(function (button) { button.disabled = value; });
        }
        function render() {
            var esc = V.escapeHtml;
            summary.textContent = format('modeTotal', { count: poll.total }) + ' · ' +
                (poll.selected ? format('modeSelected', { name: tr('modes.' + poll.selected + '.name') }) : tr('modeUnselected'));
            list.innerHTML = poll.options.map(function (option) {
                var selected = poll.selected === option.key;
                var name = tr('modes.' + option.key + '.name');
                var percent = poll.total ? Math.round(option.votes / poll.total * 100) : 0;
                return '<li class="gv-row gv-mode-row' + (selected ? ' is-selected' : '') + '">' +
                    '<span class="gv-row-main"><span class="gv-name">' + esc(name) + '</span>' +
                    '<span class="gv-note">' + esc(tr('modes.' + option.key + '.note')) + '</span>' +
                    '<span class="gv-meta">' + option.votes + ' ' + esc(tr('voteSuffix')) + ' · ' + percent + '%</span>' +
                    '<span class="gv-mode-meter" aria-hidden="true"><span style="width:' + percent + '%"></span></span></span>' +
                    '<button type="button" class="tb-btn gv-mode-button" data-mode="' + esc(option.key) +
                    '" aria-pressed="' + selected + '" aria-label="' + esc(format(selected ? 'modeUndoLabel' : 'modeSupport', { name: name })) + '">' +
                    esc(tr(selected ? 'modeUndo' : poll.selected ? 'modeChange' : 'modePick')) + '</button></li>';
            }).join('');
        }
        function load() {
            if (busy) return;
            setBusy(true);
            V.request('/game-votes/starship-modes?device_id=' + encodeURIComponent(device)).then(function (data) {
                poll = data;
                render();
                say('', 'info');
            }).catch(function () {
                say(tr('modeLoadFail'), 'error');
                if (!poll) summary.textContent = tr('modeLoadFail');
            }).finally(function () { setBusy(false); });
        }
        list.addEventListener('click', function (event) {
            var button = event.target.closest('[data-mode]');
            if (!button || busy || !poll) return;
            var key = button.dataset.mode;
            var target = poll.selected === key ? '' : key;
            setBusy(true);
            say('', 'info');
            V.request('/game-votes/starship-modes/vote', {
                method: 'POST', json: { device_id: device, target: target }
            }).then(function (data) {
                poll = data;
                render();
                setBusy(false);
                // 重绘后保留键盘焦点，不自动滚动页面。
                var next = list.querySelector('[data-mode="' + key + '"]');
                if (next) next.focus({ preventScroll: true });
                say(tr(target ? 'modeSaved' : 'modeCleared'), 'ok');
            }).catch(function (error) {
                say(tr(error.status === 429 ? 'modeRateLimit' : 'modeWriteFail'), 'error');
            }).finally(function () { setBusy(false); });
        });
        refresh.addEventListener('click', load);
        load();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
