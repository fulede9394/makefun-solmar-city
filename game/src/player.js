// Solmar City — the player: on foot, driving, combat, wanted level
// (written fresh for gta6-01, 2026-11-17).

import { angleDiff, clamp, collideCircleBoxes, dist2, lerp } from './util.js';

export class Player {
  constructor(scene, world, entities, missions, hud, audio) {
    this.scene = scene;
    this.world = world;
    this.entities = entities;
    this.missions = missions;
    this.hud = hud;
    this.audio = audio;
    this.x = 0; this.z = 40;
    this.yaw = 0;            // facing, radians (forward = (cos yaw, -sin yaw))
    this.camYaw = 0;         // camera orbit yaw
    this.camPitch = 0.42;
    this.health = 100;
    this.car = null;         // stolen/driven car object or null
    this.carSpeed = 0;
    this.carHealth = 100;
    this.carHeading = 0;
    this.wanted = 0;
    this.lastCrimeAt = -100;
    this.layLowAt = 0;
    this.time = 0;
    this.weapon = 1;         // 1 fists, 2 pistol
    this.wastedAt = -100;
    this.hurtAt = -100;
    this.speedKmh = 0;

    // on-foot body: yellow jacket, easy to spot
    const THREE = window.THREE;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8c13c })
    );
    body.position.y = 1.0;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a })
    );
    head.position.y = 1.8;
    head.castShadow = true;
    g.add(head);
    this.mesh = g;
    this.mesh.position.set(this.x, 0, this.z);
    scene.add(g);
  }

  get driving() { return this.car !== null; }

  addWanted(n, reason) {
    if (this.wanted >= 5) return;
    this.wanted = Math.min(5, this.wanted + n);
    this.lastCrimeAt = this.time;
    this.layLowAt = this.time;
    this.entities.setPoliceCount(this.wanted, this.x, this.z);
    if (reason) this.hud.toast(reason);
  }

  damagePlayer(amount) {
    this.health -= amount;
    this.hurtAt = this.time;
    if (this.health <= 0) this.wasted();
  }

  damageCar(amount) {
    if (!this.car) return;
    this.carHealth -= amount;
    if (this.carHealth <= 0) {
      this.hud.toast('Your car is wrecked — get out and find another one.');
      this.exitCar();
      // the wreck disappears; traffic refills itself over time
      this.scene.remove(this.car.group);
      this.car = null;
      this.carSpeed = 0;
    }
  }

  pushCar(px, pz) {
    if (!this.car) return;
    this.car.x += px * 0.3;
    this.car.z += pz * 0.3;
  }

  wasted() {
    this.health = 100;
    this.wanted = 0;
    this.missions.cash = Math.max(0, this.missions.cash - 200);
    this.entities.setPoliceCount(0, this.x, this.z);
    if (this.car) { this.exitCar(); }
    this.x = 0; this.z = 40;
    this.mesh.position.set(this.x, 0, this.z);
    this.wastedAt = this.time;
    this.hud.showWasted(true);
    this.hud.toast('Busted — you woke up at the clinic, $200 lighter.');
    setTimeout(() => this.hud.showWasted(false), 1800);
  }

  tryEnterCar() {
    if (this.car) { this.exitCar(); return; }
    let best = null, bestD = 5;
    for (const car of this.entities.traffic) {
      const d = dist2(this.x, this.z, car.x, car.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return;
    // steal it: take it out of traffic, the player drives it now
    const idx = this.entities.traffic.indexOf(best);
    if (idx >= 0) this.entities.traffic.splice(idx, 1);
    best.playerDriven = true;
    this.car = best;
    this.carHeading = best.heading;
    this.carSpeed = 0;
    this.carHealth = 100;
    this.mesh.visible = false;
    this.addWanted(2, 'Car stolen — the law noticed.');
    if (this.audio) this.audio.pickup();
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    this.car = null;
    this.carSpeed = 0;
    // park the car back in traffic, cruising away
    const THREE = window.THREE;
    car.playerDriven = false;
    car.cruise = 9;
    car.speed = 0;
    // snap it to the nearest street lane
    let bestS = this.world.streets[0], bestD = 1e9;
    for (const s of this.world.streets) {
      const d = Math.min(Math.abs(car.x - s), Math.abs(car.z - s));
      if (d < bestD) { bestD = d; bestS = s; }
    }
    if (Math.abs(car.x - bestS) < Math.abs(car.z - bestS)) {
      car.axis = 'z'; car.lane = bestS; car.dir = car.heading > 0 ? -1 : 1;
      car.x = bestS - 3.5 * car.dir;
    } else {
      car.axis = 'x'; car.lane = bestS; car.dir = car.heading > 0 ? 1 : -1;
      car.z = bestS + 3.5 * car.dir;
    }
    this.entities.traffic.push(car);
    // step out beside the car
    this.x = car.x + 3; this.z = car.z + 2;
    const fixed = collideCircleBoxes(this.x, this.z, 0.6, this.world.colliders);
    this.x = fixed.x; this.z = fixed.z;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
  }

  punch() {
    if (this.driving) return;
    if (this.audio) this.audio.punch();
    let best = null, bestD = 2.6;
    for (const ped of this.entities.peds) {
      if (ped.down) continue;
      const d = dist2(this.x, this.z, ped.x, ped.z);
      if (d < bestD) {
        const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);
        const dot = ((ped.x - this.x) * fx + (ped.z - this.z) * fz) / d;
        if (dot > 0.4) { best = ped; bestD = d; }
      }
    }
    if (best) {
      best.down = true;
      best.downTimer = 4;
      this.addWanted(1, 'You knocked someone out — witnesses called it in.');
      this.entities.scarePeds(this.x, this.z, 25);
    }
  }

  shoot(raycaster) {
    if (this.driving || this.weapon !== 2) return;
    if (this.audio) this.audio.gunshot();
    const targets = [];
    for (const ped of this.entities.peds) if (!ped.down) targets.push(ped.mesh);
    for (const car of this.entities.traffic) targets.push(car.group);
    for (const cop of this.entities.police) targets.push(cop.group);
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length || hits[0].distance > 90) {
      this.entities.scarePeds(this.x, this.z, 20);
      return;
    }
    let obj = hits[0].object;
    while (obj && !obj.userData.kind) obj = obj.parent;
    if (!obj) return;
    if (obj.userData.kind === 'ped') {
      const ped = obj.userData.ref;
      ped.down = true;
      ped.downTimer = 6;
      this.addWanted(1, 'Shots fired — the police are coming.');
      this.entities.scarePeds(ped.x, ped.z, 30);
    } else if (obj.userData.kind === 'car') {
      const car = obj.userData.ref;
      car.speed = 0;
      car.cruise = 0;
      this.addWanted(1, 'Shots fired — the police are coming.');
      this.entities.scarePeds(car.x, car.z, 25);
    }
  }

  update(dt, keys, camYaw) {
    this.time += dt;
    this.camYaw = camYaw;

    // wanted decay: lay low for a while and the heat drops
    if (this.wanted > 0 && this.time - this.lastCrimeAt > 25) {
      let nearestCop = 1e9;
      for (const cop of this.entities.police) {
        nearestCop = Math.min(nearestCop, dist2(cop.x, cop.z, this.x, this.z));
      }
      if (nearestCop > 45 && this.time - this.layLowAt > 12) {
        this.wanted--;
        this.layLowAt = this.time;
        this.entities.setPoliceCount(this.wanted, this.x, this.z);
        if (this.wanted === 0) this.hud.toast('You lost the heat. Lay low.');
      }
    }

    // health regen when safe
    if (this.time - this.hurtAt > 8 && this.health < 100) {
      this.health = Math.min(100, this.health + 4 * dt);
    }

    if (this.car) this.updateDriving(dt, keys);
    else this.updateOnFoot(dt, keys);
  }

  updateOnFoot(dt, keys) {
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = sprint ? 10 : 6;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz += 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    const len = Math.sqrt(ix * ix + iz * iz) || 1;
    ix /= len; iz /= len;
    // camera-relative: camera looks along -Z rotated by camYaw
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    const mx = fx * iz + rx * ix;
    const mz = fz * iz + rz * ix;
    this.x += mx * speed * dt;
    this.z += mz * speed * dt;
    // keep inside the playable area
    this.x = clamp(this.x, -this.world.half - 20, this.world.half + 20);
    this.z = clamp(this.z, -this.world.half - 20, this.world.half + 20);
    const fixed = collideCircleBoxes(this.x, this.z, 0.6, this.world.colliders);
    this.x = fixed.x; this.z = fixed.z;
    if (ix !== 0 || iz !== 0) {
      const wantYaw = Math.atan2(-mz, mx);
      this.yaw += angleDiff(wantYaw, this.yaw) * Math.min(1, dt * 10);
    }
    this.speedKmh = Math.sqrt(mx * mx + mz * mz) * speed * 3.6;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.time * 9)) * 0.05, this.z);
    this.mesh.rotation.y = this.yaw;
  }

  updateDriving(dt, keys) {
    const car = this.car;
    const accel = keys['KeyW'] || keys['ArrowUp'] ? 1 : 0;
    const brake = keys['KeyS'] || keys['ArrowDown'] ? 1 : 0;
    const steerL = keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0;
    const steerR = keys['KeyD'] || keys['ArrowRight'] ? 1 : 0;
    const handbrake = keys['Space'] ? 1 : 0;

    if (accel) this.carSpeed += 15 * dt;
    if (brake) this.carSpeed -= this.carSpeed > 0.5 ? 26 * dt : 9 * dt;
    if (handbrake) this.carSpeed -= Math.sign(this.carSpeed) * 22 * dt;
    if (!accel && !brake) this.carSpeed -= Math.sign(this.carSpeed) * 6 * dt;
    if (Math.abs(this.carSpeed) < 0.2 && !accel && !brake) this.carSpeed = 0;
    this.carSpeed = clamp(this.carSpeed, -9, 32);

    const steer = steerR - steerL;
    const steerFactor = clamp(Math.abs(this.carSpeed) / 9, 0, 1) * (handbrake ? 1.5 : 1);
    this.carHeading -= steer * steerFactor * 1.9 * dt * Math.sign(this.carSpeed || 1);

    const prevX = car.x, prevZ = car.z;
    car.x += Math.cos(this.carHeading) * this.carSpeed * dt;
    car.z += -Math.sin(this.carHeading) * this.carSpeed * dt;
    car.x = clamp(car.x, -this.world.half - 20, this.world.half + 20);
    car.z = clamp(car.z, -this.world.half - 20, this.world.half + 20);
    const fixed = collideCircleBoxes(car.x, car.z, 2.2, this.world.colliders);
    if (fixed.hit) {
      const impact = Math.abs(this.carSpeed);
      car.x = fixed.x; car.z = fixed.z;
      this.carSpeed *= -0.25;
      if (impact > 9) this.damageCar(impact * 0.9);
    }
    // bump traffic cars
    for (const other of this.entities.traffic) {
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / d;
        const dx = (car.x - other.x) * push * 0.5;
        const dz = (car.z - other.z) * push * 0.5;
        car.x += dx; car.z += dz;
        other.x -= dx; other.z -= dz;
        this.carSpeed *= 0.72;
        other.speed *= 0.5;
        if (Math.abs(this.carSpeed) > 6) this.damageCar(2);
      }
    }
    // running over pedestrians
    for (const ped of this.entities.peds) {
      if (ped.down) continue;
      if (dist2(car.x, car.z, ped.x, ped.z) < 2.4 && Math.abs(this.carSpeed) > 3) {
        ped.down = true;
        ped.downTimer = 6;
        this.addWanted(1, 'You hit a pedestrian — witnesses called it in.');
        this.entities.scarePeds(ped.x, ped.z, 30);
      }
    }
    this.x = car.x; this.z = car.z;
    this.speedKmh = Math.abs(this.carSpeed) * 3.6;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = this.carHeading;
    // keep the player's position in sync for camera + missions
    this.yaw = this.carHeading;
  }
}
