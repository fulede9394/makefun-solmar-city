// Solmar City — boot and game loop (written fresh for gta6-01, 2026-11-17).
// Renderer, lights, camera, input, the frame loop and the ?shot= hook.

import { mulberry32, clamp } from './util.js';
import { buildCity } from './world.js';
import { Entities } from './entities.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot');
const rng = mulberry32(seed);
const THREE = window.THREE;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec7e8);
scene.fog = new THREE.Fog(0x8ec7e8, 220, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe7b8, 1.9);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 500;
scene.add(sun);
scene.add(sun.target);

const world = buildCity(scene, rng);
const audio = new AudioEngine();
const missions = new Missions(scene, audio);
const entities = new Entities(scene, world, rng);
const hud = new HUD(world);
const player = new Player(scene, world, entities, missions, hud, audio);

const game = {
  started: false,
  frozen: false,
  shotMode: false,
  stagedKeys: null,
  camYaw: 0,
  camPitch: 0.42,
  camDist: 12,
  player, entities, missions, hud, audio, world,
  entityCtx() {
    return {
      playerX: player.x, playerZ: player.z,
      driving: player.driving, playerCar: player.car,
      world,
      pushCar: (px, pz) => player.pushCar(px, pz),
      damageCar: (a) => player.damageCar(a),
      damagePlayer: (a) => player.damagePlayer(a),
    };
  },
  refreshHud(dt) {
    const job = missions.currentJob();
    hud.update(dt, {
      wanted: player.wanted,
      cash: missions.cash,
      health: player.health,
      job,
      jobTarget: missions.targetInfo(player.x, player.z),
      driving: player.driving,
      speedKmh: player.speedKmh,
      carHealth: player.carHealth,
      playerX: player.x, playerZ: player.z,
      playerYaw: player.yaw,
      trafficDots: entities.traffic.map((c) => ({ x: c.x, z: c.z })),
      policeDots: entities.police.map((c) => ({ x: c.x, z: c.z })),
    });
  },
};

// --- input ---
const keys = {};
let dragging = false, lastX = 0, lastY = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (!game.started) return;
  if (e.code === 'KeyE') player.tryEnterCar();
  if (e.code === 'KeyF') player.punch();
  if (e.code === 'Digit1') player.weapon = 1;
  if (e.code === 'Digit2') player.weapon = 2;
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyP') {
    game.frozen = !game.frozen;
    hud.toast(game.frozen ? 'Paused — press P to continue' : 'Back on the streets');
  }
  if (e.code === 'KeyR') {
    const job = missions.currentJob();
    if (job) { missions.stageIndex = 0; hud.toast('Job restarted: ' + job.title); }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!game.started) return;
  if (e.button === 0) {
    // click shoots when armed with the pistol; otherwise starts a camera drag
    if (player.weapon === 2 && !player.driving) {
      shoot();
    } else {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    }
  } else if (e.button === 2) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  game.camYaw -= (e.clientX - lastX) * 0.005;
  game.camPitch = clamp(game.camPitch + (e.clientY - lastY) * 0.004, 0.12, 1.1);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const raycaster = new THREE.Raycaster();
function shoot() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 90;
  player.shoot(raycaster);
  // muzzle flash light, briefly
  flash.intensity = 3;
  setTimeout(() => { flash.intensity = 0; }, 60);
}
const flash = new THREE.PointLight(0xffd27a, 0, 18);
scene.add(flash);

// --- start screen ---
document.getElementById('start-button').addEventListener('click', () => {
  audio.init();
  game.started = true;
  hud.showStart(false);
  hud.toast('Mara: "New driver in town? I\'ve got work for you — check the banner."', 5);
});
document.getElementById('reset-button').addEventListener('click', () => {
  missions.resetSave();
  hud.toast('Save cleared — fresh start.');
});

// --- camera follow ---
function updateCamera(dt) {
  const targetX = player.x, targetZ = player.z;
  const dist = game.camDist;
  const fx = Math.sin(game.camYaw), fz = Math.cos(game.camYaw);
  const height = 3.2 + game.camPitch * dist * 0.9;
  const cx = targetX - fx * dist;
  const cz = targetZ - fz * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(targetX, 2.2, targetZ);
  // sun follows the player so shadows stay local
  sun.position.set(targetX + 120, 180, targetZ + 60);
  sun.target.position.set(targetX, 0, targetZ);
  sun.target.updateMatrixWorld();
  flash.position.set(targetX, 2.5, targetZ);
}

// --- mission events ---
function handleMissionEvent(ev) {
  if (!ev) return;
  if (ev.startsWith('jobDone:')) {
    hud.toast(ev.slice(8), 4);
    hud.showJobDone(true, 'JOB COMPLETE');
    setTimeout(() => hud.showJobDone(false), 2500);
  } else if (ev.startsWith('allDone:')) {
    hud.toast(ev.slice(8) + ' — Solmar City is yours now.', 6);
    hud.showJobDone(true, 'ALL JOBS DONE');
    setTimeout(() => hud.showJobDone(false), 4000);
  } else if (ev === 'picked') {
    hud.toast('Got it — now get it where it needs to go.', 3);
  }
}

// --- main loop ---
const clock = new THREE.Clock();
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  frames++;
  if (game.started && !game.frozen) {
    player.update(dt, keys, game.camYaw);
    entities.update(dt, game.entityCtx());
    const ev = missions.update(dt, player.x, player.z, player.driving,
      (n, reason) => player.addWanted(n, reason));
    handleMissionEvent(ev);
    audio.engine(player.driving ? clamp(Math.abs(player.carSpeed) / 32, 0, 1) : 0, player.driving);
    audio.siren(entities.police.length > 0);
    game.refreshHud(dt);
  } else if (game.shotMode && game.frozen) {
    // frozen staged shot: keep the beacon and HUD as staged, just render
    missions.update(0, player.x, player.z, player.driving, () => {});
    game.refreshHud(dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  if (frames === 5) window.__gameReady = true;
}

// --- boot ---
if (shotName) {
  // Deterministic staged shot: build the scene, stage it, render it.
  game.started = false;
  stageShot(game, shotName, seed);
  // keep rendering (frozen) so the screenshot catches the staged frame
  loop();
} else {
  hud.showStart(true);
  loop();
}

window.__game = game;
window.__errors = window.__errors || [];
