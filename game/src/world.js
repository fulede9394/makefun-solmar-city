// Solmar City — the city itself (written fresh for gta6-01, 2026-11-17).
// A sun-soaked grid city: streets, sidewalks, buildings with lit-window
// facades, shop signs, lamps, trees, crosswalks and road markings.
// Exports buildCity(scene, rng) -> { colliders, streets, pitch, half,
// blocks, parks, isOnRoad(x, z), randomStreetPoint(rng), randomSidewalkPoint(rng) }.

import { clamp, pick, rand, randInt } from './util.js';

export const PITCH = 58;          // street center to street center
export const ROAD_W = 14;         // road width
export const STREET_COORDS = [-174, -116, -58, 0, 58, 116, 174];
export const HALF = 200;          // playable half-extent

const PALETTES = [
  { base: '#e8c9a0', trim: '#c9a06f', win: '#3d5a74' },
  { base: '#d9a08a', trim: '#b57e66', win: '#33475e' },
  { base: '#f2e3c6', trim: '#d3bd93', win: '#4a6076' },
  { base: '#a9b8c4', trim: '#8698a8', win: '#2f4256' },
  { base: '#c98f7a', trim: '#a96f5c', win: '#37506b' },
  { base: '#e6d3ae', trim: '#c7ac7c', win: '#43586e' },
];

const SHOP_NAMES = ['SHOP', 'CAFE', 'PIZZA', 'TACOS', 'BAR', 'HOTEL', 'MARKET', 'GYM', 'DONUTS', 'FLOWERS'];

function facadeTexture(THREE, pal, floors, cols) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = pal.base; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  // windows
  const mw = 128 / cols, mh = 256 / (floors + 1);
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = col * mw + mw * 0.22, y = f * mh + mh * 0.3 + 8;
      const lit = Math.random() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : pal.win;
      g.fillRect(x, y, mw * 0.56, mh * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, mw * 0.56, 3);
    }
  }
  // ground floor storefront band
  g.fillStyle = pal.trim; g.fillRect(0, 256 - mh * 0.8, 128, mh * 0.8);
  g.fillStyle = 'rgba(20,30,45,0.85)';
  g.fillRect(8, 256 - mh * 0.62, 112, mh * 0.42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#fff';
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const THREE = window.THREE;
  const colliders = [];
  const blocks = [];   // {cx, cz, size} for minimap + sidewalk placement
  const parks = [];

  // --- ground: asphalt under the whole grid, sand/grass beyond it ---
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 60, HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x9aa578 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.15;
  outer.receiveShadow = true;
  scene.add(outer);

  // --- sidewalks + buildings, block by block ---
  const sidewalkGeo = new THREE.BoxGeometry(44, 0.3, 44);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb9b3a4 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5c5648 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const facadeMats = PALETTES.map((pal) => {
    const tex = facadeTexture(THREE, pal, randInt(rng, 3, 7), randInt(rng, 3, 5));
    return new THREE.MeshLambertMaterial({ map: tex });
  });

  // pick 3 park blocks
  const parkKeys = new Set();
  while (parkKeys.size < 3) parkKeys.add(randInt(rng, 0, 5) + ',' + randInt(rng, 0, 5));

  for (let bi = -3; bi <= 2; bi++) {
    for (let bj = -3; bj <= 2; bj++) {
      const cx = (bi + 0.5) * PITCH, cz = (bj + 0.5) * PITCH;
      const key = (bi + 3) + ',' + (bj + 3);
      const walk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      walk.position.set(cx, 0.15, cz);
      walk.receiveShadow = true;
      scene.add(walk);
      blocks.push({ cx, cz, size: 44 });

      if (parkKeys.has(key)) {
        parks.push({ cx, cz });
        const grass = new THREE.Mesh(
          new THREE.BoxGeometry(40, 0.5, 40),
          new THREE.MeshLambertMaterial({ color: 0x6f9a52 })
        );
        grass.position.set(cx, 0.25, cz);
        grass.receiveShadow = true;
        scene.add(grass);
        for (let t = 0; t < 7; t++) {
          addTree(scene, rng, cx + rand(rng, -16, 16), cz + rand(rng, -16, 16));
        }
        continue;
      }

      // 1-2 buildings per block
      const count = rng() < 0.55 ? 1 : 2;
      for (let b = 0; b < count; b++) {
        const w = rand(rng, 18, 30), d = rand(rng, 18, 30);
        const h = rand(rng, 10, 38);
        const ox = count === 1 ? 0 : (b === 0 ? -9 : 9);
        const oz = count === 1 ? 0 : (b === 0 ? 8 : -8);
        const bx = cx + ox, bz = cz + oz;
        const mat = pick(rng, facadeMats);
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(bx, h / 2 + 0.3, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        // roof cap
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.6, 0.7, d + 0.6);
        roof.position.set(bx, h + 0.6, bz);
        scene.add(roof);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });

        // shop sign on the street-facing side, ground floor
        if (rng() < 0.75) {
          const name = pick(rng, SHOP_NAMES);
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 3),
            new THREE.MeshBasicMaterial({ map: signTexture(name, pick(rng, ['#274b7a', '#7a2e2e', '#2e6b34', '#6b4a1f'])) })
          );
          // face the nearest street (south side of the block by default)
          sign.position.set(bx, 4.2, bz + d / 2 + 0.15);
          scene.add(sign);
        }
      }
    }
  }

  // --- road markings: center dashes + crosswalks (instanced) ---
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 4);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8b13c });
  const dashSpots = [];
  for (const s of STREET_COORDS) {
    for (let t = -HALF + 8; t < HALF - 8; t += 12) {
      // skip dashes inside intersections
      const nearCross = STREET_COORDS.some((c) => Math.abs(t - c) < 9);
      if (nearCross) continue;
      dashSpots.push([s, t, 0]);       // dash on a z-running street
      dashSpots.push([t, s, Math.PI / 2]); // dash on an x-running street
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  dashSpots.forEach(([x, z, rot], i) => {
    e.set(0, rot, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0.05, z), q, new THREE.Vector3(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);

  const stripeGeo = new THREE.BoxGeometry(1.2, 0.06, 5);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e2 });
  const stripeSpots = [];
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      for (let k = -3; k <= 3; k++) {
        stripeSpots.push([sx + k * 1.9, sz - 8.5, 0]);
        stripeSpots.push([sx + k * 1.9, sz + 8.5, 0]);
        stripeSpots.push([sx - 8.5, sz + k * 1.9, Math.PI / 2]);
        stripeSpots.push([sx + 8.5, sz + k * 1.9, Math.PI / 2]);
      }
    }
  }
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, stripeSpots.length);
  stripeSpots.forEach(([x, z, rot], i) => {
    e.set(0, rot, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0.05, z), q, new THREE.Vector3(1, 1, 1));
    stripes.setMatrixAt(i, m4);
  });
  scene.add(stripes);

  // --- street lamps ---
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  const lampHeadGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampSpots = [];
  for (const s of STREET_COORDS) {
    for (let t = -HALF + 20; t < HALF; t += 58) {
      lampSpots.push([s + 8, t]);
      lampSpots.push([s - 8, t + 29]);
    }
  }
  const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 3, z), q.identity(), new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 6.1, z), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles); scene.add(heads);

  // --- scattered trees along sidewalks ---
  for (let i = 0; i < 26; i++) {
    const b = pick(rng, blocks);
    addTree(scene, rng, b.cx + pick(rng, [-20, 20]) + rand(rng, -3, 3), b.cz + rand(rng, -18, 18));
  }

  function isOnRoad(x, z) {
    return STREET_COORDS.some((s) => Math.abs(x - s) < ROAD_W / 2 + 1) ||
      STREET_COORDS.some((s) => Math.abs(z - s) < ROAD_W / 2 + 1);
  }

  return {
    colliders, streets: STREET_COORDS, pitch: PITCH, half: HALF, blocks, parks,
    isOnRoad,
    randomStreetPoint(rng2) {
      const s = pick(rng2, STREET_COORDS);
      const along = rand(rng2, -HALF + 20, HALF - 20);
      return rng2() < 0.5 ? { x: s, z: along } : { x: along, z: s };
    },
    randomSidewalkPoint(rng2) {
      const b = pick(rng2, blocks);
      const edge = randInt(rng2, 0, 3);
      const off = rand(rng2, -19, 19);
      if (edge === 0) return { x: b.cx + off, z: b.cz - 20 };
      if (edge === 1) return { x: b.cx + off, z: b.cz + 20 };
      if (edge === 2) return { x: b.cx - 20, z: b.cz + off };
      return { x: b.cx + 20, z: b.cz + off };
    },
  };
}

const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const canopyGeo = new THREE.ConeGeometry(2.2, 5, 8);
const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f7a3a });

function addTree(scene, rng, x, z) {
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.set(x, 1.4, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  const s = rand(rng, 0.8, 1.3);
  canopy.scale.set(s, s, s);
  canopy.position.set(x, 4.6 * s, z);
  canopy.castShadow = true;
  scene.add(canopy);
}
