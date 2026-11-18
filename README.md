# Solmar City

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/fulede9394/makefun-solmar-city/rank.svg)](https://make.fun/bounty/gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/fulede9394/makefun-solmar-city/reward.svg)](https://make.fun/bounty/gta6-01)

An original 3D open-world crime game built for the [Make GTA 6](https://make.fun/bounty/gta6-01) bounty on make.fun.
Play it free here: https://make.fun/r/5kkq1ant

## The game

Solmar City is a sun-soaked coastal city you explore on foot and by car.
You are a new driver in town, taking work from Mara, the fixer who runs
the east side. Five jobs stand between you and the big score.

- **Open city** — a grid of streets, shops, parks and street lamps, built
  from scratch with three.js (vendored, no network requests).
- **Cars** — walk up to any traffic car and press E to steal it and drive.
  Stealing is a crime: the law notices.
- **Wanted system** — five stars. Stealing cars, shooting and hitting
  pedestrians raise your heat; police cars spawn, chase and ram you.
  Lay low and the stars fade.
- **Missions** — five numbered jobs with a live objective banner and a
  distance readout, a 3D beacon marking the target, and cash rewards.
  Progress (cash and job number) saves in your browser.
- **Combat** — fists (F) and a pistol (2, then click to shoot).
- **HUD** — wanted stars, cash, health, a live minimap with the mission
  marker and police dots, speed and car health.
- **Sound** — everything is synthesized with WebAudio: engine hum, police
  sirens, gunshots and cash blips. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| Mouse drag | Look around |
| E | Enter / steal a car (or get out) |
| F | Punch |
| 1 / 2 | Fists / pistol |
| Click | Shoot (pistol) |
| Shift | Sprint |
| Space | Handbrake |
| P | Pause |
| M | Mute |
| R | Restart the current job |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only: `game/index.html` and its ES modules, three.js vendored
under `game/vendor/`. No build step, no network requests.

## License

MIT. See [LICENSE](LICENSE).
