import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../public/js/admin/game-click-stats.js', import.meta.url), 'utf8');
const locale = fs.readFileSync(new URL('../../public/js/locales/zh-CN.js', import.meta.url), 'utf8');

function dashboard() {
    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { value: '', checked: false, innerHTML: '', textContent: '', hidden: false,
                listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; } });
            return elements.get(id);
        },
        querySelectorAll: () => []
    };
    const window = {};
    vm.runInNewContext(locale, {window});
    window.t = (key, params = {}) => {
        const value = key.split('.').reduce((obj, part) => obj?.[part], window.TB_LOCALES['zh-CN']) || key;
        return value.replace(/\{(\w+)\}/g, (_, part) => params[part] ?? '');
    };
    vm.runInNewContext(source, {document, window});
    const el = id => document.getElementById('game-click-' + id);
    el('scope').value = 'selected'; el('sort').value = 'combined.visitors';
    return { el, render: window.TBGameClickStats.render };
}

const stat = (clicks, visitors) => ({clicks, visitors});
function game(key, clicks, visitors) {
    return {key, titleKey: key, combined: stat(clicks, visitors), toy: stat(clicks, visitors), site: stat(0, 0)};
}
function data() {
    const selected = { from: '2026-10-05', to: '2026-10-05', combined: stat(12, 5),
        totals: {toy: stat(10, 5), site: stat(2, 2)},
        games: [game('丙', 0, 0), game('乙', 8, 2), game('甲', 4, 4)] };
    return {...selected, all_time: {...selected, from:'2026-10-03', combined: stat(33, 9),
        games: [game('甲', 6, 4), game('乙', 20, 8), game('丙', 7, 3)]}};
}

test('shows union totals rather than summing channels; ranks by people by default', () => {
    const ui = dashboard(); ui.render(data());
    assert.match(ui.el('cards').innerHTML, /总人数[\s\S]*?>5</);
    assert.match(ui.el('cards').innerHTML, /累计总人数[\s\S]*?>9</);
    const body = ui.el('body').innerHTML;
    assert.ok(body.indexOf('甲') < body.indexOf('乙'));
    assert.ok(!body.includes('丙'));
    assert.match(ui.el('footer').innerHTML, /<td>5<\/td><td>12<\/td>/);
});

test('sort, reverse, search, zeros and cumulative scope work without replacing summary totals', () => {
    const ui = dashboard(); ui.render(data());
    const cards = ui.el('cards').innerHTML;
    ui.el('sort').value = 'combined.clicks'; ui.el('sort').listeners.change();
    assert.ok(ui.el('body').innerHTML.indexOf('乙') < ui.el('body').innerHTML.indexOf('甲'));
    ui.el('direction').listeners.click();
    assert.ok(ui.el('body').innerHTML.indexOf('甲') < ui.el('body').innerHTML.indexOf('乙'));
    ui.el('zero').checked = true; ui.el('zero').listeners.change();
    assert.ok(ui.el('body').innerHTML.includes('丙'));
    ui.el('search').value = '甲'; ui.el('search').listeners.input();
    assert.ok(!ui.el('body').innerHTML.includes('乙'));
    assert.equal(ui.el('cards').innerHTML, cards);
    ui.el('scope').value = 'all_time'; ui.el('scope').listeners.change();
    assert.match(ui.el('footer').innerHTML, /<td>9<\/td><td>33<\/td>/);
    assert.equal(ui.el('cards').innerHTML, cards);
    ui.el('search').value = '不存在'; ui.el('search').listeners.input();
    assert.match(ui.el('body').innerHTML, /当前条件下没有游戏记录/);
});

test('missing API fields show unavailable instead of fabricated zero; titles are escaped', () => {
    const ui = dashboard(); ui.render({});
    assert.equal(ui.el('error').hidden, false);
    assert.ok(ui.el('cards').innerHTML.includes('—'));
    const fixture = data(); fixture.games[1].titleKey = '<img src=x onerror=alert(1)>';
    ui.render(fixture);
    assert.ok(!ui.el('body').innerHTML.includes('<img'));
    assert.ok(ui.el('body').innerHTML.includes('&lt;img'));
    assert.equal(ui.el('error').hidden, true);
});
