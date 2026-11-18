// Solmar City — traffic, pedestrians and police (written fresh for gta6-01, 2026-11-17).
// AI cars drive the street grid and avoid each other, pedestrians walk the
// sidewalks and flee from danger, police chase the player and ram their car.

import { angleDiff, clamp, collideCircleBoxes, dist2, pick, rand, randInt } from './util.js';

const TRAFFIC_COLORS = [0xd8b13c, 0xb03a2e, 0x2e6db0, 0xe8e8e8, 0x22262b, 0x3d8a4f, 0xc96a1e];

function makeCarMesh(THREE, color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 2.0), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.75, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 })
  );
  cabin.position.set(-0.3, 1.5, 0);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // headlights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const wz of [0.6, -0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), lightMat);
    l.position.set(2.32, 0.8, wz);
    g.add(l);
  }
  let barL = null, barR = null;
  if (police) {
    barL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    barL.position.set(-0.3, 2.0, 0.45);
    barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.7), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    barR.position.set(-0.3, 2.0, -0.45);
    g.add(barL); g.add(barR);
  }
  return { group: g, barL, barR };
}

function makePedMesh(THREE, shirt, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.05, 8),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin })
  );
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  return g;
}

export class Entities {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.traffic = [];
    this.peds = [];
    this.police = [];
    this.leavingPolice = [];
    this.time = 0;
    this.spawnedPolice = 0;

    for (let i = 0; i < 14; i++) this.addTrafficCar(true);
    for (let i = 0; i < 18; i++) this.addPed(true);
  }

  randomStreetSpot() {
    const s = pick(this.rng, this.world.streets);
    const along = rand(this.rng, -this.world.half + 20, this.world.half - 20);
    const dir = this.rng() < 0.5 ? 1 : -1;
    return { s, along, dir };
  }

  addTrafficCar(anywhere) {
    const THREE = window.THREE;
    const { group } = makeCarMesh(THREE, pick(this.rng, TRAFFIC_COLORS), false);
    const spot = this.randomStreetSpot();
    const axis = this.rng() < 0.5 ? 'x' : 'z';
    const car = {
      group, axis, lane: spot.s, dir: spot.dir,
      speed: rand(this.rng, 8, 13), cruise: rand(this.rng, 8, 13),
      x: 0, z: 0, heading: 0, turnCooldown: 0,
    };
    if (axis === 'x') { car.z = spot.s + 3.5 * spot.dir; car.x = spot.along; car.heading = spot.dir > 0 ? 0 : Math.PI; }
    else { car.x = spot.s - 3.5 * spot.dir; car.z = spot.along; car.heading = spot.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    // forward = (cos h, -sin h) must match dir along axis
    if (axis === 'x') car.heading = spot.dir > 0 ? 0 : Math.PI;
    else car.heading = spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    // note: forward is (cos h, 0, -sin h); for axis 'z' moving +z needs h = -PI/2
    if (axis === 'z') car.heading = spot.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    car.group.userData = { kind: 'car', ref: car };
    this.scene.add(group);
    this.traffic.push(car);
    return car;
  }

  addPed(anywhere) {
    const THREE = window.THREE;
    const shirts = [0xc94f4f, 0x4f7ec9, 0x5aa864, 0xd8a13c, 0x8a5fc9, 0xe8e8e8, 0x22262b];
    const skins = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0];
    const mesh = makePedMesh(THREE, pick(this.rng, shirts), pick(this.rng, skins));
    const p = this.world.randomSidewalkPoint(this.rng);
    const ped = {
      mesh, x: p.x, z: p.z, yaw: rand(this.rng, 0, Math.PI * 2),
      speed: rand(this.rng, 1.0, 1.9), walkPhase: rand(this.rng, 0, 6),
      target: this.world.randomSidewalkPoint(this.rng),
      flee: 0, down: false, downTimer: 0,
    };
    mesh.position.set(ped.x, 0, ped.z);
    mesh.userData = { kind: 'ped', ref: ped };
    this.scene.add(mesh);
    this.peds.push(ped);
    return ped;
  }

  addPolice(x, z) {
    const THREE = window.THREE;
    const { group, barL, barR } = makeCarMesh(THREE, 0x11151a, true);
    const cop = { group, barL, barR, x, z, heading: 0, speed: 0, leaving: false };
    group.position.set(x, 0, z);
    group.userData = { kind: 'car', ref: cop };
    this.scene.add(group);
    this.police.push(cop);
    return cop;
  }

  setPoliceCount(n, playerX, playerZ) {
    while (this.police.length < n) {
      // spawn on a street 50-70 m from the player
      let x = playerX, z = playerZ, tries = 0;
      while (tries++ < 12) {
        const p = this.world.randomStreetPoint(this.rng);
        const d = dist2(p.x, p.z, playerX, playerZ);
        if (d > 45 && d < 80) { x = p.x; z = p.z; break; }
      }
      this.addPolice(x, z);
    }
    // extra cops stop chasing and drive off; update() despawns them at the edge
    while (this.police.length > n) {
      const cop = this.police.pop();
      cop.leaving = true;
      this.leavingPolice.push(cop);
    }
  }

  // threat: {x, z} gunshot / explosion point that scares pedestrians
  scarePeds(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.down) continue;
      if (dist2(ped.x, ped.z, x, z) < radius) {
        ped.flee = 3;
        ped.target = { x: ped.x + (ped.x - x) * 2, z: ped.z + (ped.z - z) * 2 };
      }
    }
  }

  update(dt, ctx) {
    this.time += dt;
    const { playerX, playerZ, driving, playerCar, world } = ctx;

    // ---- traffic ----
    for (const car of this.traffic) {
      car.turnCooldown -= dt;
      // car ahead in the same lane?
      let blocked = false;
      for (const other of this.traffic) {
        if (other === car || other.axis !== car.axis || other.lane !== car.lane || other.dir !== car.dir) continue;
        const along = car.axis === 'x' ? other.x - car.x : other.z - car.z;
        if (along * car.dir > 0 && along * car.dir < 11) { blocked = true; break; }
      }
      // player car ahead?
      if (driving && playerCar) {
        const px = playerCar.x, pz = playerCar.z;
        const laneDist = car.axis === 'x' ? Math.abs(pz - car.z) : Math.abs(px - car.x);
        const along = car.axis === 'x' ? (px - car.x) * car.dir : (pz - car.z) * car.dir;
        if (laneDist < 3 && along > 0 && along < 12) blocked = true;
      }
      const target = blocked ? 0 : car.cruise;
      car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
      const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      // turn at intersections
      if (car.turnCooldown <= 0) {
        const alongPos = car.axis === 'x' ? car.x : car.z;
        for (const s of world.streets) {
          if (Math.abs(alongPos - s) < 1.2 && this.rng() < 0.02) {
            const newAxis = car.axis === 'x' ? 'z' : 'x';
            const newLane = s;
            const newDir = this.rng() < 0.5 ? 1 : -1;
            if (newAxis === 'x') {
              car.z = newLane + 3.5 * newDir; car.heading = newDir > 0 ? 0 : Math.PI;
            } else {
              car.x = newLane - 3.5 * newDir; car.heading = newDir > 0 ? -Math.PI / 2 : Math.PI / 2;
            }
            car.axis = newAxis; car.lane = newLane; car.dir = newDir;
            car.turnCooldown = 4;
            break;
          }
        }
      }
      // wrap at city edge, onto a new random street
      const pos = car.axis === 'x' ? car.x : car.z;
      if (Math.abs(pos) > world.half + 12) {
        const spot = this.randomStreetSpot();
        const axis = this.rng() < 0.5 ? 'x' : 'z';
        car.axis = axis; car.lane = spot.s; car.dir = spot.dir;
        if (axis === 'x') { car.z = spot.s + 3.5 * spot.dir; car.x = -spot.dir * (world.half + 8); car.heading = spot.dir > 0 ? 0 : Math.PI; }
        else { car.x = spot.s - 3.5 * spot.dir; car.z = -spot.dir * (world.half + 8); car.heading = spot.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
      }
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
    }

    // ---- pedestrians ----
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.mesh.rotation.x = 0;
          ped.mesh.visible = false; // the fallen pedestrian is gone for good
        }
        continue;
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.speed = 5;
      } else {
        ped.speed = 1.4;
        if (dist2(ped.x, ped.z, ped.target.x, ped.target.z) < 2) {
          ped.target = this.world.randomSidewalkPoint(this.rng);
        }
      }
      const dx = ped.target.x - ped.x, dz = ped.target.z - ped.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const wantYaw = Math.atan2(-dz, dx);
      ped.yaw += clamp(angleDiff(wantYaw, ped.yaw), -3 * dt, 3 * dt);
      ped.x += Math.cos(ped.yaw) * ped.speed * dt;
      ped.z += -Math.sin(ped.yaw) * ped.speed * dt;
      ped.walkPhase += dt * ped.speed * 4;
      ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.06, ped.z);
      ped.mesh.rotation.y = ped.yaw;
      // keep pedestrians out of buildings
      const fixed = collideCircleBoxes(ped.x, ped.z, 0.5, world.colliders);
      ped.x = fixed.x; ped.z = fixed.z;
    }

    // ---- police ----
    for (let i = this.leavingPolice.length - 1; i >= 0; i--) {
      const cop = this.leavingPolice[i];
      const away = Math.atan2(-(playerZ - cop.z), playerX - cop.x);
      cop.heading += clamp(angleDiff(away, cop.heading), -2 * dt, 2 * dt);
      cop.speed = Math.min(cop.speed + 8 * dt, 18);
      cop.x += Math.cos(cop.heading) * cop.speed * dt;
      cop.z += -Math.sin(cop.heading) * cop.speed * dt;
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.heading;
      if (Math.abs(cop.x) > world.half + 30 || Math.abs(cop.z) > world.half + 30) {
        this.scene.remove(cop.group);
        this.leavingPolice.splice(i, 1);
      }
    }
    for (const cop of this.police) {
      const want = Math.atan2(-(playerZ - cop.z), playerX - cop.x);
      cop.heading += clamp(angleDiff(want, cop.heading), -2.4 * dt, 2.4 * dt);
      const d = dist2(cop.x, cop.z, playerX, playerZ);
      const targetSpeed = d < 6 ? 10 : 21;
      cop.speed += clamp(targetSpeed - cop.speed, -16 * dt, 10 * dt);
      cop.x += Math.cos(cop.heading) * cop.speed * dt;
      cop.z += -Math.sin(cop.heading) * cop.speed * dt;
      const fixed = collideCircleBoxes(cop.x, cop.z, 2.2, world.colliders);
      if (fixed.hit) { cop.x = fixed.x; cop.z = fixed.z; cop.speed *= 0.5; }
      // ram the player's car / hurt the player on foot
      if (driving && playerCar && d < 5) {
        const push = 3.2;
        const px = playerCar.x - cop.x, pz = playerCar.z - cop.z;
        const pl = Math.sqrt(px * px + pz * pz) || 1;
        if (ctx.pushCar) ctx.pushCar((px / pl) * push, (pz / pl) * push);
        if (ctx.damageCar) ctx.damageCar(10 * dt);
      } else if (!driving && d < 3) {
        if (ctx.damagePlayer) ctx.damagePlayer(12 * dt);
      }
      // flash the light bar
      const phase = Math.floor(this.time * 6) % 2 === 0;
      if (cop.barL) cop.barL.material.color.setHex(phase ? 0xff2a2a : 0x550000);
      if (cop.barR) cop.barR.material.color.setHex(phase ? 0x002266 : 0x2a6bff);
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.heading;
    }
  }
}
