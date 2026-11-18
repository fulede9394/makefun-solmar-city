// Solmar City — jobs and story (written fresh for gta6-01, 2026-11-17).
// Five numbered jobs from the fixer Mara, a short story frame, stage
// targets with a 3D beacon, cash rewards and localStorage saves.

import { dist2 } from './util.js';

const SAVE_KEY = 'solmar-save-v1';

// Job targets are placed on the grid: streets at -174..174, blocks between.
export const JOBS = [
  {
    title: 'Job 1 — The Pickup',
    objective: 'Meet Mara\'s runner at the east-side garage',
    reward: 300,
    stages: [{ label: 'Garage', x: 160, z: -58, radius: 8, inCar: false }],
  },
  {
    title: 'Job 2 — The Courier',
    objective: 'Drive the package to the north-side diner — don\'t walk, drive',
    reward: 500,
    stages: [
      { label: 'Package', x: 160, z: -58, radius: 8, inCar: false },
      { label: 'Diner', x: -58, z: -160, radius: 9, inCar: true },
    ],
  },
  {
    title: 'Job 3 — The Getaway',
    objective: 'Grab the stash, then lose the heat — reach the west-side safehouse',
    reward: 800,
    heat: 2,
    stages: [
      { label: 'Stash', x: 116, z: 145, radius: 8, inCar: false },
      { label: 'Safehouse', x: -160, z: 116, radius: 9, inCar: false },
    ],
  },
  {
    title: 'Job 4 — The Drop',
    objective: 'Drive the crate to the west-side stash — watch your back',
    reward: 1200,
    stages: [
      { label: 'Crate', x: 29, z: 174, radius: 8, inCar: false },
      { label: 'Stash', x: -160, z: -58, radius: 9, inCar: true },
    ],
  },
  {
    title: 'Job 5 — The Big Score',
    objective: 'Deliver to the harbor office — the whole city will be watching',
    reward: 2500,
    heat: 3,
    stages: [
      { label: 'Score', x: -87, z: -116, radius: 8, inCar: false },
      { label: 'Harbor office', x: 160, z: 116, radius: 9, inCar: true },
    ],
  },
];

export class Missions {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.jobIndex = 0;
    this.stageIndex = 0;
    this.cash = 0;
    this.done = false;
    this.beacon = null;
    this.marker = null;
    this.buildBeacon();
    this.load();
  }

  buildBeacon() {
    const THREE = window.THREE;
    const geo = new THREE.CylinderGeometry(3, 3, 60, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.28,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 30;
    this.scene.add(this.beacon);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2),
      new THREE.MeshBasicMaterial({ color: 0xffd23c })
    );
    diamond.position.y = 14;
    this.marker = new THREE.Group();
    this.marker.add(diamond);
    this.scene.add(this.marker);
  }

  currentJob() { return this.done ? null : JOBS[this.jobIndex]; }

  currentStage() {
    const job = this.currentJob();
    return job ? job.stages[this.stageIndex] : null;
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.cash === 'number') this.cash = s.cash;
      if (typeof s.job === 'number' && s.job >= 0 && s.job < JOBS.length) {
        this.jobIndex = s.job;
        this.stageIndex = 0;
      }
    } catch (e) { /* fresh start */ }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: this.cash, job: this.jobIndex }));
    } catch (e) { /* storage unavailable */ }
  }

  resetSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.cash = 0; this.jobIndex = 0; this.stageIndex = 0; this.done = false;
  }

  setJob(index, stage) {
    this.jobIndex = index;
    this.stageIndex = stage || 0;
    this.done = false;
  }

  // Called every frame; returns an event string or null.
  update(dt, playerX, playerZ, driving, addWanted) {
    const job = this.currentJob();
    if (!job) {
      this.beacon.visible = false;
      this.marker.visible = false;
      return null;
    }
    const stage = this.currentStage();
    this.beacon.visible = true;
    this.marker.visible = true;
    this.beacon.position.x = stage.x;
    this.beacon.position.z = stage.z;
    this.marker.position.x = stage.x;
    this.marker.position.z = stage.z;
    this.marker.rotation.y += dt * 1.5;
    this.marker.children[0].position.y = 14 + Math.sin(performance.now() / 300) * 1.2;

    const d = dist2(playerX, playerZ, stage.x, stage.z);
    if (d < stage.radius && (!stage.inCar || driving)) {
      if (this.stageIndex === 0 && job.heat && addWanted) addWanted(job.heat, 'The heat is on — lose them!');
      if (this.stageIndex < job.stages.length - 1) {
        this.stageIndex++;
        if (this.audio) this.audio.pickup();
        return 'picked';
      }
      // job complete
      this.cash += job.reward;
      if (this.audio) this.audio.cash();
      this.save();
      const finished = job;
      if (this.jobIndex < JOBS.length - 1) {
        this.jobIndex++;
        this.stageIndex = 0;
        return 'jobDone:' + finished.title + ' — paid $' + finished.reward;
      }
      this.done = true;
      this.save();
      return 'allDone:' + finished.title + ' — paid $' + finished.reward;
    }
    return null;
  }

  targetInfo(playerX, playerZ) {
    const stage = this.currentStage();
    if (!stage) return null;
    return { x: stage.x, z: stage.z, dist: dist2(playerX, playerZ, stage.x, stage.z) };
  }
}
