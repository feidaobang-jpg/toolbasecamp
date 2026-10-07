import { CoopConnection, endpoint } from '../../../js/game/coop.js?v=coop-live2';
export { CoopConnection, endpoint };

const WORLD_FIELDS = ['f', 't', 'eagle', 'playerSpawnT', 'nextId', 'roster', 'rosterIndex', 'remaining', 'freeze', 'shovel', 'playerFrozen', 'kills', 'killOrder', 'pickups', 'stageScore', 'status', 'endT', 'overRise', 'result', 'eagleBy', 'powerup', 'items', 'mines', 'mortars', 'lasers', 'curtainSet', 'playerShots'];
export function snapshot(world, terrain = true) {
  const data = Object.fromEntries(WORLD_FIELDS.map(k => [k, world[k]]));
  data.seats = world.seats;
  data.bots = world.bots;
  data.bullets = world.bullets.map(b => ({ ...b, owner: b.owner?.id }));
  data.bossId = world.boss?.id;
  data.terrainVersion = world.terrainVersion;
  if (terrain) data.terrain = Object.fromEntries(Object.entries(world.terrain).map(([k, v]) => [k, Array.from(v)]));
  return data;
}
export function hydrate(world, data, slot) {
  const previous = new Map([...world.seats.map(s => s.tank), ...world.bots, ...world.bullets].filter(Boolean).map(t => [t.id, t]));
  const changed = world.terrainVersion !== data.terrainVersion;
  Object.assign(world, data); world.localSlot = slot;
  if (data.terrain) {
    world.terrain = Object.fromEntries(Object.entries(data.terrain).map(([k, v]) => [k, Uint8Array.from(v)]));
    if (changed) world.changedAll = true;
  }
  const tanks = new Map([...world.seats.map(s => s.tank), ...world.bots].filter(Boolean).map(t => [t.id, t]));
  for (const b of world.bullets) b.owner = tanks.get(b.owner);
  for (const t of [...tanks.values(), ...world.bullets]) { const old = previous.get(t.id); t.ox = old?.x ?? t.x; t.oy = old?.y ?? t.y; }
  world.player = world.seats[0].tank; world.boss = tanks.get(data.bossId) || null;
  world.run.coopPlayers = world.seats.map(s => s.state);
  for (const state of world.run.coopPlayers) if (state.lives === null) state.lives = Infinity;
  return world;
}
