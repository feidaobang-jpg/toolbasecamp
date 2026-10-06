// Two-player relay and render snapshots. The guest never runs enemy AI or damage.
const PROTOCOL = 'tank3d-v1';
export function endpoint() {
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    return 'ws://127.0.0.1:8792/game/tank-coop/ws?game=' + PROTOCOL;
  }
  return 'wss://www.zhengxiaohui.cn/api/game/tank-coop/ws?game=' + PROTOCOL;
}
export class CoopConnection {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage; this.onStatus = onStatus;
    this.socket = null; this.room = null; this.slot = -1; this.intentional = false;
    this.rtt = 0; this.lastReceive = 0; this.stateCount = 0;
  }
  get host() { return this.slot === 0; }
  get active() { return !!this.room?.started; }
  send(data) {
    if (this.socket?.readyState !== 1 || this.socket.bufferedAmount > 200000) return false;
    this.socket.send(JSON.stringify(data)); return true;
  }
  connect(type, name, code) {
    this.disconnect(); this.intentional = false;
    const socket = this.socket = new WebSocket(endpoint());
    this.onStatus('正在连接联机服务…');
    const timeout = setTimeout(() => { socket.close(); this.onStatus('连接超时，请检查网络后重试；单机仍可玩'); }, 12000);
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      this.lastReceive = performance.now();
      if (msg.type === 'hello') {
        clearTimeout(timeout);
        if (msg.protocol !== PROTOCOL) { this.disconnect(); this.onStatus('联机服务正在更新，请稍后重试；单机仍可玩'); return; }
        this.send({ type, name, code });
      }
      if (msg.type === 'joined') { this.slot = msg.slot; this.room = msg.room; }
      if (msg.type === 'roster') this.room = msg.room;
      if (msg.type === 'start' && this.room) this.room.started = true;
      if (msg.type === 'pong') this.rtt = Math.round(performance.now() - msg.at);
      if (msg.type === 'state') this.stateCount++;
      if (msg.type === 'error') this.onStatus(msg.message);
      this.onMessage(msg);
    };
    socket.onerror = () => { if (socket === this.socket) this.onStatus('联机连接失败，请检查网络后重试；单机仍可玩'); };
    socket.onclose = () => {
      clearTimeout(timeout);
      if (socket !== this.socket) return;
      clearInterval(this.heartbeat); this.room = null; this.slot = -1;
      if (!this.intentional) this.onMessage({ type: 'ended', message: '连接已断开，房间结束；请重新邀请' });
    };
    this.heartbeat = setInterval(() => this.send({ type: 'ping', at: performance.now() }), 10000);
  }
  disconnect() {
    this.intentional = true; clearInterval(this.heartbeat);
    const socket = this.socket; this.socket = null;
    if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'leave' }));
    socket?.close(); this.room = null; this.slot = -1; this.stateCount = 0;
  }
}

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
