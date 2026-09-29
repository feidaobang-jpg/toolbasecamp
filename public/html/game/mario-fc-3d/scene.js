import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import { LEVEL_END } from './world.js?v=1';

const matCache = new Map();
function mat(color, roughness = .75) {
    const k = color + ':' + roughness;
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness }));
    return matCache.get(k);
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1), ballGeo = new THREE.SphereGeometry(1, 16, 10);
function box(parent, x, y, z, sx, sy, sz, color) {
    const m = new THREE.Mesh(boxGeo, mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(parent, x, y, z, sx, sy, sz, color) {
    const m = new THREE.Mesh(ballGeo, mat(color));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cylinder(parent, x, y, z, r, h, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, .4));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function canvasTexture(draw) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
function questionTexture() {
    return canvasTexture(g => {
        g.fillStyle = '#e69c1e'; g.fillRect(0, 0, 128, 128);
        g.fillStyle = '#ffc23e'; g.fillRect(6, 6, 116, 116);
        g.fillStyle = '#ffe08a'; g.fillRect(10, 10, 108, 108);
        g.fillStyle = '#8c4d13'; g.font = 'bold 86px monospace'; g.textAlign = 'center';
        g.fillText('?', 66, 100); g.fillStyle = '#fff2c0'; g.fillText('?', 62, 96);
        for (const [x, y] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
            g.fillStyle = '#a06a17'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
        }
    });
}
function brickTexture() {
    return canvasTexture(g => {
        g.fillStyle = '#8f4a2c'; g.fillRect(0, 0, 128, 128);
        for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
            const x = col * 64 + (row % 2) * 32;
            g.fillStyle = row % 2 ? '#c9784a' : '#bb6a3e'; g.fillRect(x + 3, row * 32 + 3, 58, 26);
            g.fillStyle = '#e09467'; g.fillRect(x + 4, row * 32 + 4, 56, 4);
        }
    });
}

// -- characters (all procedural) -------------------------------------------
function mario() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    // overalls + torso
    ball(body, 0, .66, 0, .26, .3, .2, '#e63f2e');
    box(body, 0, .48, .05, .42, .3, .32, '#2a6fd4');
    for (const x of [-.13, .13]) { box(body, x, .68, .17, .08, .25, .05, '#2a6fd4'); ball(body, x, .7, .21, .035, .035, .03, '#ffd23e'); }
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
        const l = new THREE.Group(); l.position.set(s * .14, .36, 0); body.add(l);
        box(l, 0, -.09, 0, .19, .28, .21, '#2a6fd4'); ball(l, 0, -.26, .05, .16, .11, .23, '#5b3a26'); legs.push(l);
        const a = new THREE.Group(); a.position.set(s * .28, .76, 0); body.add(a);
        ball(a, s * .03, -.12, 0, .1, .21, .11, '#e63f2e'); ball(a, s * .05, -.27, .02, .12, .12, .13, '#fff3dd'); arms.push(a);
    }
    // head + face
    ball(body, 0, 1.02, 0, .25, .26, .24, '#f4c394');
    ball(body, 0, 1, .24, .12, .1, .13, '#f0b183');
    for (const s of [-1, 1]) {
        ball(body, s * .1, 1.08, .2, .038, .058, .02, '#1b2f3a');
        ball(body, s * .1, .94, .22, .1, .045, .045, '#4c3222');
        ball(body, s * .26, 1.02, 0, .06, .085, .055, '#f4c394');
    }
    // cap + brim + emblem
    ball(body, 0, 1.24, -.01, .28, .15, .27, '#e63f2e');
    box(body, 0, 1.2, .22, .44, .06, .22, '#e63f2e');
    ball(body, 0, 1.3, .22, .09, .08, .02, '#fff3d6');
    return { group: g, body, legs, arms };
}
function goomba() {
    const g = new THREE.Group();
    ball(g, 0, .45, 0, .44, .4, .36, '#9a5530');
    ball(g, 0, .2, .04, .28, .24, .26, '#e6c088');
    for (const s of [-1, 1]) {
        ball(g, s * .22, .09, .07, .22, .1, .25, '#4d382b');
        ball(g, s * .14, .53, .29, .11, .15, .055, '#fff5df');
        ball(g, s * .12, .5, .34, .04, .08, .02, '#233138');
        const brow = box(g, s * .15, .66, .33, .25, .06, .04, '#4d382b');
        brow.rotation.z = s * .35;
    }
    return g;
}
function mushroomMesh() {
    const g = new THREE.Group();
    cylinder(g, 0, .2, 0, .2, .4, '#ffefd0');
    ball(g, 0, .46, 0, .43, .29, .43, '#e8402e');
    for (const [x, z] of [[0, .3], [-.28, -.1], [.28, -.1]]) ball(g, x, .6, z, .11, .07, .1, '#fff3df');
    return g;
}
function coinMesh() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .08, 18), mat('#ffc72e', .3));
    m.rotation.x = Math.PI / 2; m.castShadow = true; return m;
}

// Merge static meshes sharing geometry+material into InstancedMesh batches.
function batchStatic(root) {
    root.updateMatrixWorld(true);
    const groups = new Map(), pos = new THREE.Vector3();
    root.traverse(m => {
        if (!m.isMesh || m.userData.noBatch) return;
        pos.setFromMatrixPosition(m.matrixWorld);
        const key = [m.geometry.uuid, m.material.uuid, m.castShadow, m.receiveShadow, Math.floor(pos.x / 24)].join(':');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    });
    for (const meshes of groups.values()) {
        if (meshes.length < 2) continue;
        const first = meshes[0];
        const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
        batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
        meshes.forEach((m, i) => { batch.setMatrixAt(i, m.matrixWorld); m.removeFromParent(); });
        batch.computeBoundingSphere(); root.add(batch);
    }
}

export function createScene(canvas, world) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8fd0f2');
    scene.fog = new THREE.Fog('#8fd0f2', 42, 118);
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 180);

    scene.add(new THREE.HemisphereLight('#f2fbff', '#7f924d', 2.5));
    const sun = new THREE.DirectionalLight('#fff0d0', 3.1);
    sun.position.set(-12, 26, 13); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: .1, far: 85 });
    sun.shadow.bias = -.001;
    scene.add(sun); scene.add(sun.target);

    // -- static level --------------------------------------------------------
    const level = new THREE.Group(); scene.add(level);
    for (const [a, b] of world.ground) {
        // Soil slab sits strictly below the grass slab: their top faces must
        // never coincide, or the moving camera shows z-fighting stripes.
        box(level, (a + b) / 2, -1.17, 0, b - a, 2.06, 5.9, '#c08750').castShadow = false;
        box(level, (a + b) / 2, -.07, 0, b - a, .14, 6.1, '#7cba52').castShadow = false;
    }
    // rolling hills + clouds on the backdrop
    for (let x = -14; x < 238; x += 16) {
        const hill = ball(level, x, -.5, -13, 6 + (x % 3), 5 + (Math.abs(x) % 4), 4, '#6fb470');
        hill.castShadow = false;
        ball(level, x + 8, -.9, -20, 9, 7, 5, '#94c98d').castShadow = false;
        const cloud = new THREE.Group(); cloud.position.set(x + 4, 9.5 + (Math.abs(x) % 3), -16); level.add(cloud);
        for (let i = 0; i < 3; i++) { const m = ball(cloud, (i - 1) * 1.3, i === 1 ? .45 : 0, 0, 1.35, 1, 1, '#fffdf2'); m.castShadow = false; }
    }
    // bushes inside the corridor
    for (const [a, b] of world.ground) for (let x = a + 4; x < b - 2; x += 11) {
        for (let i = 0; i < 3; i++) ball(level, x + i * .5, .22, -2.5, .45, .5, .4, '#3f9c58').castShadow = false;
    }
    for (const [x, h] of world.pipes) {
        cylinder(level, x, h / 2, 0, .92, h, '#2a9a58');
        cylinder(level, x, h - .12, 0, 1.07, .3, '#43bb70');
        cylinder(level, x, h + .04, 0, .82, .04, '#15492f');
    }
    // final staircase
    for (const [x, y] of world.stairs) {
        const m = box(level, x, y + .5, 0, 1, 1, 3, '#cfa15f');
        m.material = mat('#cfa15f', .8);
    }
    batchStatic(level);

    // -- interactive blocks (kept individual: they bump, break, dim) ---------
    const qTex = questionTexture(), bTex = brickTexture();
    const qMat = new THREE.MeshStandardMaterial({ map: qTex, roughness: .5 });
    const bMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: .85 });
    const usedMat = mat('#a8844c', .8);
    const blockMeshes = new Map();
    for (const b of world.blocks) {
        const m = new THREE.Mesh(boxGeo, b.type === 'brick' ? bMat : qMat);
        m.position.set(b.x, b.y + .5, b.z); m.scale.setScalar(.96);
        m.castShadow = true; m.receiveShadow = true;
        level.add(m); blockMeshes.set(b, m);
    }
    // flagpole + castle
    cylinder(level, LEVEL_END, 4.5, 0, .06, 9, '#e9e4cc');
    ball(level, LEVEL_END, 9.05, 0, .15, .15, .15, '#f6c33e');
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1.5, -.45, 0, 0, -.9, 0], 3));
    flagGeo.computeVertexNormals();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: '#f5f7e0', side: THREE.DoubleSide }));
    flag.position.set(LEVEL_END, 8.4, .12); level.add(flag);
    box(level, LEVEL_END + 7, 1.6, -.4, 4.4, 3.2, 3.2, '#c98a5c');
    box(level, LEVEL_END + 7, 3.4, -.4, 4.8, .4, 3.6, '#dca47a');
    for (const x of [LEVEL_END + 5.2, LEVEL_END + 6.6, LEVEL_END + 8, LEVEL_END + 9.4]) box(level, x, 3.9, -.4, .8, .8, 3.3, '#c98a5c');
    box(level, LEVEL_END + 7, .85, 1.22, 1, 1.7, .08, '#503c2c');
    for (const x of [LEVEL_END + 5.8, LEVEL_END + 8.2]) box(level, x, 2.1, 1.22, .45, .75, .07, '#68503a');

    // -- actors ---------------------------------------------------------------
    const player = mario(); scene.add(player.group);
    const enemyMeshes = new Map();
    for (const e of world.enemies) { const g = goomba(); scene.add(g); enemyMeshes.set(e, g); }
    const itemMeshes = new Map(), sparks = [];
    let elapsed = 0, yaw = 0, pitch = .45, followX = 3, camY = 1.3;

    function burst(x, y, z, color, count = 9) {
        for (let i = 0; i < count; i++) {
            const m = box(scene, x, y, z, .11, .11, .11, color);
            sparks.push({ mesh: m, v: new THREE.Vector3((Math.random() - .5) * 3.4, 2 + Math.random() * 3, (Math.random() - .5) * 3.4), life: .7 });
        }
    }

    function update(dt, camInput = {}) {
        elapsed += dt;
        const p = world.player;
        followX = THREE.MathUtils.lerp(followX, p.x, 1 - Math.exp(-5.5 * dt));
        camY = THREE.MathUtils.lerp(camY, 1.4 + Math.max(0, p.y - 1.6) * .45, 1 - Math.exp(-3 * dt));
        const distance = canvas.clientWidth / Math.max(1, canvas.clientHeight) < 1.6 ? 19.5 : 17.5;
        const look = new THREE.Vector3(followX + 2.8, camY, 0);
        camera.position.set(look.x + Math.sin(yaw) * distance, camY + Math.sin(pitch) * distance, Math.cos(yaw) * distance * Math.cos(pitch));
        camera.lookAt(look);
        sun.position.set(followX - 12, 26, 13); sun.target.position.set(followX, 0, 0);

        player.group.position.set(p.x, p.y, p.z);
        player.group.rotation.y = p.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
        player.group.scale.setScalar(p.big ? 1.45 : 1);
        player.group.visible = p.invincible <= 0 || Math.floor(elapsed * 14) % 2 === 0;
        if (world.status === 'winning' && p.slide > 0) {
            player.group.rotation.y = 0; player.group.position.x += .35;
            player.legs.forEach(l => l.rotation.x = 0); player.arms.forEach(a => a.rotation.x = -.4);
        } else {
            const speed = Math.hypot(p.vx, p.vz);
            const swing = speed > .2 ? Math.sin(elapsed * speed * 2.4) * .65 : 0;
            player.legs.forEach((l, i) => l.rotation.x = p.grounded ? swing * (i ? 1 : -1) : -.45);
            player.arms.forEach((a, i) => a.rotation.x = p.grounded ? -swing * (i ? 1 : -1) : -1.7);
        }

        for (const [b, m] of blockMeshes) {
            m.visible = b.alive;
            m.position.y = b.y + .5 + Math.sin(Math.min(1, b.bump) * Math.PI) * .2;
            if (b.used) m.material = usedMat;
        }
        for (const [e, g] of enemyMeshes) {
            g.visible = e.alive || e.squash > 0;
            g.position.set(e.x, e.y, e.z);
            g.rotation.y = e.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            g.scale.y = e.alive ? 1 + Math.sin(elapsed * 9 + e.x) * .04 : .18;
        }
        for (const it of world.items) {
            if (!itemMeshes.has(it)) {
                const m = it.kind === 'mushroom' ? mushroomMesh() : coinMesh();
                scene.add(m); itemMeshes.set(it, m);
            }
            const m = itemMeshes.get(it);
            m.visible = true;
            if (it.kind === 'mushroom') m.position.set(it.x, it.y + .45, it.z);
            else { m.position.set(it.x, it.y + (it.kind === 'coin' ? Math.sin(elapsed * 3 + it.x) * .12 + .1 : 0), it.z); m.rotation.z = elapsed * 2; }
        }
        for (const [it, m] of itemMeshes) { if (!world.items.includes(it)) { scene.remove(m); itemMeshes.delete(it); } }
        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            s.life -= dt; s.v.y -= 10 * dt;
            s.mesh.position.addScaledVector(s.v, dt); s.mesh.rotation.x += dt * 4;
            if (s.life <= 0) { scene.remove(s.mesh); sparks.splice(i, 1); }
        }
        if (world.status === 'winning' || world.status === 'won') flag.position.y = Math.max(2.2, flag.position.y - dt * 2.2);
        renderer.render(scene, camera);
    }

    function resize() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
    }
    resize();
    return {
        setCamera(y, pt) { yaw = y; pitch = pt; },
        renderer, scene, camera, update, resize, burst,
        dispose() {
            qTex.dispose(); qMat.dispose(); bTex.dispose(); bMat.dispose(); flagGeo.dispose();
            renderer.dispose();
        }
    };
}
