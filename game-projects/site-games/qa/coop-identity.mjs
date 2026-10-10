import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

globalThis.document = { addEventListener() {} };
globalThis.window = { addEventListener() {} };
const { CoopConnection } = await import('../../../public/js/game/coop.js');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let checks = 0;
for (const [name, api] of [
  ['native', webcrypto],
  ['no randomUUID', { getRandomValues: bytes => webcrypto.getRandomValues(bytes) }],
  ['no crypto', undefined],
  ['throwing crypto', { randomUUID() { throw Error('unavailable'); }, getRandomValues() { throw Error('unavailable'); } }]
]) {
  Object.defineProperty(globalThis, 'crypto', { value: api, configurable: true });
  for (const storage of ['available', 'read blocked', 'write blocked', 'unavailable']) {
    let saved = null;
    const local = {
      getItem() { if (storage === 'read blocked') throw Error('denied'); return saved; },
      setItem(key, value) { if (storage === 'write blocked') throw Error('quota'); saved = value; }
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, get() { if (storage === 'unavailable') throw Error('denied'); return local; }
    });
    const a = new CoopConnection(), b = new CoopConnection();
    assert.match(a.identity, uuid, name + '/' + storage);
    assert.match(b.identity, uuid, name + '/' + storage);
    if (storage === 'available') assert.equal(a.identity, b.identity, 'reload preserves player ID');
    else assert.notEqual(a.identity, b.identity, 'unpersisted sessions have distinct IDs');
    checks++;
  }
}
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID() { throw Error('must reuse saved ID'); } } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'existing-player-id', setItem() { throw Error('quota'); } } });
assert.equal(new CoopConnection().identity, 'existing-player-id');
console.log('PASS ' + (checks + 1) + ' player-ID compatibility/storage cases');
