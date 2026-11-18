// Solmar City — small helpers (written fresh for gta6-01, 2026-11-17).
// Seeded RNG, math helpers and collision primitives shared by the modules.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function randInt(rng, lo, hi) { return Math.floor(rand(rng, lo, hi + 1)); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Shortest signed angle difference, radians.
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Push a circle (x, z, radius) out of axis-aligned boxes. Returns true if it hit.
export function collideCircleBoxes(x, z, r, boxes) {
  let hit = false;
  for (const b of boxes) {
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push; z += dz * push;
      } else {
        // Center inside the box: push out along the smallest penetration axis.
        const px = Math.min(x - b.minX + r, b.maxX - x + r);
        const pz = Math.min(z - b.minZ + r, b.maxZ - z + r);
        if (px < pz) x += (x < (b.minX + b.maxX) / 2 ? -px : px);
        else z += (z < (b.minZ + b.maxZ) / 2 ? -pz : pz);
      }
    }
  }
  return { x, z, hit };
}

// Point inside any box?
export function pointInBoxes(x, z, boxes) {
  for (const b of boxes) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}
