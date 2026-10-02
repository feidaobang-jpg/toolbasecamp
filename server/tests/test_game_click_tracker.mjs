import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../../public/js/tb-stats.js', import.meta.url), 'utf8');

function tracker(excluded = false) {
    const requests = [], events = {}, timers = new Map();
    let timer = 0, visitorReads = 0;
    const context = {
        window: {
            location: { hostname: 'test.local', origin: 'https://test.local', pathname: '/html/admin/test.html' },
            tbGetVisitorId: () => { visitorReads++; return '11111111-1111-4111-8111-111111111111'; },
            addEventListener: (name, callback) => { events[name] = callback; }
        },
        document: { readyState: 'complete', addEventListener: (name, callback) => { events[name] = callback; } },
        localStorage: { getItem: key => key === 'tb-stats-exclude' && excluded ? '1' : null },
        setTimeout: callback => { timers.set(++timer, callback); return timer; },
        clearTimeout: id => timers.delete(id),
        fetch: (url, options) => { requests.push({ url, ...options }); return Promise.resolve({ ok: true }); }
    };
    vm.runInNewContext(source, context);
    function click(type = 'click', button = 0) {
        const link = { getAttribute: () => 'game.play.site.tank-3d', closest: () => link };
        events[type]({ type, button, target: { closest: () => link } });
    }
    return { requests, events, timers, click, context, visitorReads: () => visitorReads };
}

test('same-tab clicks send immediately with keepalive and a stable anonymous ID', () => {
    const t = tracker();
    t.click();
    assert.equal(t.requests.length, 1);
    assert.equal(t.requests[0].keepalive, true);
    assert.equal(t.timers.size, 0);
    const first = JSON.parse(t.requests[0].body);
    assert.equal(first.name, 'game.play.site.tank-3d');
    assert.equal(first.visitor_id, '11111111-1111-4111-8111-111111111111');
    t.click();
    t.click('auxclick', 1);
    t.click('auxclick', 2);
    t.events.pagehide();
    assert.equal(t.requests.length, 3);
    assert.equal(t.visitorReads(), 1);
});

test('excluded admin browsers send no clicks', () => {
    const t = tracker(true);
    t.click();
    t.click('auxclick', 1);
    assert.equal(t.requests.length, 0);
});

test('pagehide flushes queued events once and old pages work without the new helper', () => {
    const t = tracker();
    delete t.context.window.tbGetVisitorId;
    t.context.window.TBStats.track('page.games');
    assert.equal(t.requests.length, 0);
    t.events.pagehide();
    t.events.pagehide();
    assert.equal(t.requests.length, 1);
    assert.deepEqual(JSON.parse(t.requests[0].body), { name: 'page.games' });
});
