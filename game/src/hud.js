// Solmar City — HUD and minimap (written fresh for gta6-01, 2026-11-17).
// DOM HUD (stars, cash, health, mission banner, speed, controls, toasts)
// plus a live 2D-canvas minimap of the city.

import { clamp } from './util.js';

export class HUD {
  constructor(city) {
    this.city = city;
    this.el = {
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      missionTitle: document.getElementById('mission-title'),
      missionObj: document.getElementById('mission-obj'),
      missionDist: document.getElementById('mission-dist'),
      speed: document.getElementById('speed'),
      speedUnit: document.getElementById('speed-unit'),
      carHealth: document.getElementById('car-health'),
      minimap: document.getElementById('minimap'),
      toast: document.getElementById('toast'),
      startScreen: document.getElementById('start-screen'),
      wasted: document.getElementById('wasted'),
      jobDone: document.getElementById('job-done'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastCash = -1;
    this.lastJob = -1;
  }

  toast(msg, seconds) {
    this.el.toast.textContent = msg;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds || 3;
  }

  update(dt, s) {
    // toast fade
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }

    // wanted stars
    if (s.wanted !== this.lastStars) {
      this.lastStars = s.wanted;
      let html = '';
      for (let i = 0; i < 5; i++) html += `<span class="${i < s.wanted ? 'on' : ''}">★</span>`;
      this.el.stars.innerHTML = html;
    }
    // cash
    if (s.cash !== this.lastCash) {
      this.lastCash = s.cash;
      this.el.cash.textContent = '$' + s.cash.toLocaleString('en-US');
    }
    // health
    const hp = clamp(Math.round(s.health), 0, 100);
    this.el.healthFill.style.width = hp + '%';
    this.el.healthFill.style.background = hp > 50 ? '#37d67a' : hp > 25 ? '#e8a13c' : '#e05252';
    this.el.healthText.textContent = String(hp);

    // mission banner
    if (s.job) {
      this.el.missionTitle.textContent = s.job.title;
      this.el.missionObj.textContent = s.job.objective;
      this.el.missionDist.textContent = s.jobTarget
        ? Math.round(s.jobTarget.dist) + ' m'
        : '';
    } else {
      this.el.missionTitle.textContent = 'Free roam — Solmar City';
      this.el.missionObj.textContent = 'All jobs done. The city is yours.';
      this.el.missionDist.textContent = '';
    }

    // speed / car health
    if (s.driving) {
      this.el.speed.textContent = String(Math.round(Math.abs(s.speedKmh)));
      this.el.speedUnit.textContent = 'km/h · CAR ' + Math.round(s.carHealth) + '%';
      this.el.carHealth.style.display = 'none';
    } else {
      this.el.speed.textContent = String(Math.round(Math.abs(s.speedKmh)));
      this.el.speedUnit.textContent = 'km/h · ON FOOT';
      this.el.carHealth.style.display = 'none';
    }

    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const c = this.mapCtx;
    const W = 180, H = 180;
    const half = this.city.half + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * W, ((z + half) / (half * 2)) * H];
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(16, 22, 30, 0.85)';
    c.fillRect(0, 0, W, H);
    // blocks
    c.fillStyle = '#5a6672';
    for (const b of this.city.blocks) {
      const [x, z] = toMap(b.cx - b.size / 2, b.cz - b.size / 2);
      const w = (b.size / (half * 2)) * W;
      c.fillRect(x, z, w, w);
    }
    // parks
    c.fillStyle = '#4d7a3d';
    for (const p of this.city.parks) {
      const [x, z] = toMap(p.cx - 22, p.cz - 22);
      c.fillRect(x, z, (44 / (half * 2)) * W, (44 / (half * 2)) * W);
    }
    // mission marker
    if (s.jobTarget) {
      const [x, z] = toMap(s.jobTarget.x, s.jobTarget.z);
      c.fillStyle = '#ffd23c';
      c.save();
      c.translate(x, z);
      c.rotate(Math.PI / 4);
      const r = 5 + Math.sin(performance.now() / 250) * 1.5;
      c.fillRect(-r / 2, -r / 2, r, r);
      c.restore();
    }
    // traffic dots
    c.fillStyle = '#c8ccd2';
    for (const t of s.trafficDots || []) {
      const [x, z] = toMap(t.x, t.z);
      c.fillRect(x - 1, z - 1, 2, 2);
    }
    // police dots
    c.fillStyle = '#ff4d4d';
    for (const p of s.policeDots || []) {
      const [x, z] = toMap(p.x, p.z);
      c.beginPath(); c.arc(x, z, 3, 0, Math.PI * 2); c.fill();
    }
    // player arrow
    const [px, pz] = toMap(s.playerX, s.playerZ);
    c.save();
    c.translate(px, pz);
    c.rotate(Math.atan2(Math.sin(s.playerYaw), Math.cos(s.playerYaw)) + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath();
    c.fill();
    c.restore();
  }

  showStart(on) { this.el.startScreen.style.display = on ? 'flex' : 'none'; }
  showWasted(on) { this.el.wasted.style.display = on ? 'flex' : 'none'; }
  showJobDone(on, text) {
    this.el.jobDone.style.display = on ? 'block' : 'none';
    if (text) this.el.jobDone.textContent = text;
  }
}
