// Solmar City — deterministic screenshot staging (written fresh for gta6-01, 2026-11-17).
// The page reads ?shot=<name>&seed=<n> and places the camera and player in a
// fixed staged scene for each shot, so screenshots are reproducible.
// Shots: chase (cover), street, mission, start.

import { mulberry32 } from './util.js';

function stepWorld(game, steps) {
  // Advance the simulation a fixed number of ticks so traffic and
  // pedestrians settle into natural positions before the screenshot.
  for (let i = 0; i < steps; i++) {
    game.entities.update(1 / 30, game.entityCtx());
    game.player.update(1 / 30, game.stagedKeys || {}, game.player.camYaw);
  }
}

export function stageShot(game, name, seed) {
  const rng = mulberry32(seed || 1);
  const { player, entities, missions, hud, world } = game;
  game.shotMode = true;

  if (name === 'start') {
    // Start screen over a quiet city view.
    player.x = 0; player.z = 60; player.yaw = 0;
    player.mesh.position.set(player.x, 0, player.z);
    game.camYaw = 0.3;
    game.camPitch = 0.35;
    game.camDist = 14;
    stepWorld(game, 40);
    hud.showStart(true);
    window.__shotReady = true;
    return;
  }

  // All other shots start the game immediately (no start screen).
  game.started = true;
  hud.showStart(false);

  if (name === 'chase') {
    // Cover: driving chase, 3 wanted stars, police behind, Job 4 banner.
    missions.setJob(3, 0);
    missions.cash = 2450;
    player.health = 100;
    const car = entities.traffic[0];
    entities.traffic.splice(0, 1);
    car.playerDriven = true;
    player.car = car;
    player.carHeading = 0;
    player.carSpeed = 16;
    player.carHealth = 100;
    player.x = 0; player.z = 60;
    car.x = 0; car.z = 60;
    car.group.position.set(0, 0, 60);
    player.mesh.visible = false;
    player.wanted = 3;
    player.lastCrimeAt = player.time;
    player.layLowAt = player.time;
    entities.setPoliceCount(3, 0, 60);
    // police right behind the player, fanned out so they show on both sides
    // (the camera looks back at the player car, so the chase is in frame)
    entities.police[0].x = -12; entities.police[0].z = 52;
    entities.police[1].x = -20; entities.police[1].z = 66;
    entities.police[2].x = -28; entities.police[2].z = 58;
    for (const cop of entities.police) { cop.speed = 14; cop.heading = 0; }
    // two traffic cars ahead on the same road, so the street is alive
    const t1 = entities.traffic[1];
    t1.axis = 'x'; t1.lane = 58; t1.dir = 1; t1.heading = 0;
    t1.x = 46; t1.z = 61.5; t1.speed = 10; t1.cruise = 10;
    const t2 = entities.traffic[2];
    t2.axis = 'x'; t2.lane = 58; t2.dir = -1; t2.heading = Math.PI;
    t2.x = 70; t2.z = 54.5; t2.speed = 10; t2.cruise = 10;
    // keep the player on the move: hold W in the staged sim
    game.stagedKeys = { KeyW: true };
    stepWorld(game, 30);
    game.stagedKeys = null;
    // freeze the chase with the camera looking back at the player car:
    // the player drives toward the camera, police closing in behind it
    game.camYaw = -Math.PI / 2 + 0.22;
    game.camPitch = 0.3;
    game.camDist = 15;
    game.frozen = true;
  } else if (name === 'street') {
    // On foot at a busy corner, traffic and pedestrians around.
    player.x = 8; player.z = 8;
    player.yaw = Math.PI * 0.75;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.yaw;
    missions.setJob(0, 0);
    missions.cash = 300;
    game.camYaw = -2.36;
    game.camPitch = 0.38;
    game.camDist = 11;
    stepWorld(game, 60);
    game.frozen = true;
  } else if (name === 'mission') {
    // A mission in progress: driving toward the Job 2 diner marker.
    missions.setJob(1, 1);
    missions.cash = 800;
    player.health = 100;
    const car = entities.traffic[1];
    entities.traffic.splice(1, 1);
    car.playerDriven = true;
    player.car = car;
    player.carHeading = Math.PI / 2;
    player.carSpeed = 12;
    player.carHealth = 100;
    player.x = -58; player.z = -100;
    car.x = -58; car.z = -100;
    car.group.position.set(-58, 0, -100);
    player.mesh.visible = false;
    player.wanted = 1;
    entities.setPoliceCount(1, -58, -100);
    game.stagedKeys = { KeyW: true };
    stepWorld(game, 40);
    game.stagedKeys = null;
    game.camYaw = Math.PI;
    game.camPitch = 0.35;
    game.camDist = 14;
    game.frozen = true;
  }

  // One HUD refresh so the staged state is visible in the screenshot.
  // Position the mission beacon first (it only moves in missions.update).
  game.missions.update(0, player.x, player.z, player.driving, () => {});
  game.refreshHud(0.016);
  window.__shotReady = true;
}
