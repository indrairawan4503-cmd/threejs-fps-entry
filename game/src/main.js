// EMBERLINE — bootstrap, render loop and wiring. The simulation runs on a
// fixed 60 Hz step kept apart from rendering; input, HUD and menus only
// feed the simulation, they never own game state.
import * as THREE from 'three';
import { MAP, WEAPONS, SHOP, ECONOMY } from './config.js';
import { mulberry32, clamp } from './rng.js';
import { buildMap, hasLineOfSight, moveBody } from './map.js';
import { SoundBank } from './audio.js';
import {
  newLoadout, buyWeapon, switchWeapon, startReload, finishReload,
  currentSpread, fireShot, traceShot,
} from './weapons.js';
import { spawnBots, alertBots, flashBots, updateBots } from './bots.js';
import {
  newPlayer, stepPlayer, eyePos, eyeHeight, damagePlayer, inSiteA, PLAYER_HALF,
} from './player.js';
import {
  newMatch, startMatch, startRound, beginLive, endRound, nextRound,
  stepPlant, stepPlanted, aliveBots, buyItem,
} from './rounds.js';
import * as hud from './hud.js';
import { shotPlan, applyShotBots } from './shots.js';

const SIM_DT = 1 / 60;
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const shotSeed = parseInt(params.get('seed') || '1', 10);
const plan = shotMode ? shotPlan(shotMode, shotSeed) : null;

const rand = mulberry32((Math.random() * 1e9) | 0);
const sounds = new SoundBank();

// --- Renderer / scene -------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';

const { colliders, waypoints, routes } = buildMap(scene);

// --- State ------------------------------------------------------------------
const match = newMatch();
const player = newPlayer();
const loadout = newLoadout();
let bots = spawnBots(rand);
const state = { player, loadout, match, bots, weapons: WEAPONS, spreadPx: 6 };

const input = { fwd: 0, back: 0, left: 0, right: 0, crouch: 0, plant: 0, fire: 0 };
let now = 0; // match clock, seconds
let accumulator = 0;
let lastTs = performance.now();
let beepAt = 0;

// --- Bot meshes ---------------------------------------------------------------
const botGroup = new THREE.Group();
scene.add(botGroup);
const botMeshes = new Map();

function botMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15 });
}

function makeBotMesh(bot) {
  const g = new THREE.Group();
  const bodyMat = botMaterial(0xc23b1e); // Jackal orange-red
  const gearMat = botMaterial(0x2a2019);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: 0xff5a1a, emissiveIntensity: 0.9, roughness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), bodyMat);
  body.position.y = 0.85;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), gearMat);
  head.position.y = 1.52;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.06), visorMat);
  visor.position.set(0, 1.54, 0.22);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.36), gearMat);
  legs.position.y = 0.25;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.85), gearMat);
  gun.position.set(0.28, 1.15, 0.45);
  g.add(body, head, visor, legs, gun);
  g.userData = { bodyMat, head, visorMat };
  g.position.set(bot.pos[0], 0, bot.pos[2]);
  botGroup.add(g);
  botMeshes.set(bot.id, g);
  return g;
}

function refreshBotMeshes() {
  for (const bot of bots) {
    let g = botMeshes.get(bot.id);
    if (!g) g = makeBotMesh(bot);
    g.visible = true;
    g.position.set(bot.pos[0], 0, bot.pos[2]);
    if (bot.alive) {
      g.rotation.set(0, bot.yaw, 0);
      // Walk bob.
      g.position.y = bot.moving ? Math.abs(Math.sin(now * 9 + bot.id * 2)) * 0.05 : 0;
      g.userData.bodyMat.emissive.setHex(0x000000);
    } else {
      g.rotation.set(0, bot.yaw, Math.PI / 2);
      g.position.y = 0.28;
      g.userData.bodyMat.emissive.setHex(0x000000);
    }
  }
}

// --- Viewmodel + effects -------------------------------------------------------
const viewmodel = new THREE.Group();
{
  // Warm gunmetal + wood grip, with a touch of emissive so the viewmodel
  // reads against the dusk scene instead of going black.
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6a625a, roughness: 0.5, metalness: 0.35,
    emissive: 0x2a1c10, emissiveIntensity: 0.7,
  });
  const grip = new THREE.MeshStandardMaterial({
    color: 0x8a5a28, roughness: 0.8,
    emissive: 0x2a1808, emissiveIntensity: 0.6,
  });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.45);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.12), grip);
  mag.position.set(0, -0.14, -0.05);
  mag.rotation.x = 0.25;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.25), grip);
  stock.position.set(0, -0.01, 0.36);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.12), metal);
  sight.position.set(0, 0.1, -0.15);
  viewmodel.add(receiver, barrel, mag, stock, sight);
  viewmodel.position.set(0.3, -0.3, -0.62);
  viewmodel.scale.setScalar(0.85);
  camera.add(viewmodel);
}
scene.add(camera);

const muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 2);
muzzleLight.position.set(0.34, -0.28, -1.1);
camera.add(muzzleLight);

const tracers = [];
function addTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...from), new THREE.Vector3(...to),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  }));
  scene.add(line);
  tracers.push({ line, life: 0.09 });
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

// Grenades in flight: { pos, vel, at } — simple parabola, bursts on landing.
const grenades = [];
function throwFlash() {
  if (loadout.flash <= 0 || match.phase !== 'live') return;
  loadout.flash -= 1;
  const dir = cameraDirection();
  const o = eyePos(player);
  grenades.push({
    pos: [o[0] + dir[0] * 0.5, o[1] - 0.1, o[2] + dir[2] * 0.5],
    vel: [dir[0] * 14, dir[1] * 14 + 3.5, dir[2] * 14],
    at: now,
  });
  sounds.flash();
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.vel[1] -= 12 * dt;
    g.pos[0] += g.vel[0] * dt;
    g.pos[1] += g.vel[1] * dt;
    g.pos[2] += g.vel[2] * dt;
    if (g.pos[1] <= 0.1) {
      flashBots(bots, g.pos, now, colliders);
      hud.flashScreen(0.85);
      sounds.flash();
      grenades.splice(i, 1);
    }
  }
}

// --- Input ---------------------------------------------------------------------
const keyMap = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ControlLeft: 'crouch', KeyC: 'crouch',
  KeyE: 'plant',
};
let locked = false;

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') tryReload();
  if (e.code === 'Digit1') switchWeapon(loadout, 'p9');
  if (e.code === 'Digit2' && loadout.primary) switchWeapon(loadout, loadout.primary);
  if (e.code === 'KeyG') throwFlash();
  if (e.code === 'KeyB' && match.phase === 'buy') openBuy();
  const k = keyMap[e.code];
  if (k) { input[k] = 1; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
  const k = keyMap[e.code];
  if (k) input[k] = 0;
});
document.addEventListener('mousemove', (e) => {
  if (!locked || !player.alive) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch = clamp(player.pitch - e.movementY * 0.0021, -1.45, 1.45);
});
canvas.addEventListener('mousedown', (e) => {
  if (match.phase === 'live' && player.alive) {
    if (!locked) canvas.requestPointerLock();
    input.fire = 1;
    tryFire();
  }
});
document.addEventListener('mouseup', () => { input.fire = 0; });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});
document.addEventListener('pointerlockerror', () => { locked = false; });

function cameraDirection() {
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  return [-sy * cp, sp, -cy * cp];
}

function tryReload() {
  if (match.phase !== 'live' || !player.alive) return;
  if (startReload(loadout, now)) sounds.reload();
}

function tryFire() {
  if (match.phase !== 'live' || !player.alive) return;
  const origin = eyePos(player);
  const dir = cameraDirection();
  const shot = fireShot(loadout, origin, dir, now, rand);
  if (!shot) {
    if (loadout.mag[loadout.current] === 0) sounds.dryFire();
    return;
  }
  match.stats.shots += 1;
  sounds.shot(shot.weapon);
  // Muzzle flash + recoil kick (recovered in step()).
  muzzleLight.intensity = 14;
  const hit = traceShot(shot, bots, colliders);
  const muzzle = [origin[0] + dir[0] * 0.6, origin[1] + dir[1] * 0.6 - 0.08, origin[2] + dir[2] * 0.6];
  if (hit && hit.bot) {
    const bot = hit.bot;
    const dmg = Math.round(shot.damage * (hit.part === 'head' ? shot.headMult : 1));
    bot.hp -= dmg;
    match.stats.hits += 1;
    if (hit.part === 'head') match.stats.headshots += 1;
    addTracer(muzzle, [origin[0] + dir[0] * hit.dist, origin[1] + dir[1] * hit.dist, origin[2] + dir[2] * hit.dist], WEAPONS[shot.weapon].tracer);
    hud.hitmarker(hit.part === 'head', bot.hp <= 0);
    sounds.hit();
    if (bot.hp <= 0) {
      bot.alive = false;
      match.stats.kills += 1;
      match.roundKills += 1;
      match.money += ECONOMY.killReward;
      sounds.kill();
      hud.killfeed(`<b class="you">YOU</b> ▸ <b>${bot.name}</b> ${hit.part === 'head' ? '— HEADSHOT' : ''}`);
    }
  } else if (hit) {
    addTracer(muzzle, [origin[0] + dir[0] * hit.dist, origin[1] + dir[1] * hit.dist, origin[2] + dir[2] * hit.dist], WEAPONS[shot.weapon].tracer);
  } else {
    addTracer(muzzle, [origin[0] + dir[0] * shot.range, origin[1] + dir[1] * shot.range, origin[2] + dir[2] * shot.range], WEAPONS[shot.weapon].tracer);
  }
  alertBots(bots, player.pos, now);
}

// --- Round flow ------------------------------------------------------------------
function resetRoundPositions() {
  player.pos = [MAP.playerSpawn[0], 0, MAP.playerSpawn[2]];
  player.yaw = MAP.playerYaw;
  player.pitch = 0;
  player.vel = [0, 0];
  player.hp = player.maxHp;
  player.alive = true;
  player.planting = 0;
  bots = spawnBots(rand);
  state.bots = bots;
  for (const g of botMeshes.values()) botGroup.remove(g);
  botMeshes.clear();
}

function openBuy() {
  hud.buildBuyMenu(match, loadout, SHOP,
    (id) => {
      const ok = buyItem(match, loadout, id);
      if (ok) sounds.buy(); else sounds.denied();
      return ok;
    },
    () => {
      beginLive(match, now);
      hud.hideOverlays();
      canvas.requestPointerLock();
    });
  hud.showOverlay('overlay-buy');
}

function finishRound(won, reason) {
  endRound(match, won, reason, now);
  if (won) {
    sounds.roundWin();
    hud.banner('ROUND WON', reason, 3200);
  } else {
    sounds.roundLose();
    hud.banner('ROUND LOST', reason, 3200);
  }
  if (document.pointerLockElement) document.exitPointerLock();
}

function stepSimulation(dt) {
  now += dt;
  // Recoil recovery + spread heat decay.
  loadout.recoil = Math.max(0, loadout.recoil - dt * 0.25);
  loadout.spreadHeat = Math.max(0, loadout.spreadHeat - dt * 0.5);
  player.pitch = clamp(player.pitch + loadout.recoil * dt * 0.6, -1.45, 1.45);
  if (now >= loadout.reloadingUntil && loadout.reloadingUntil > 0) finishReload(loadout);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 220);

  if (match.phase === 'buy') {
    if (now - match.phaseAt >= MAP.buyTime) {
      beginLive(match, now);
      hud.hideOverlays();
      canvas.requestPointerLock();
    }
    return;
  }
  if (match.phase !== 'live') return;

  match.timer -= dt;
  stepPlayer(player, input, dt, colliders);
  stepGrenades(dt);

  // Held fire for automatic weapons.
  if (input.fire && WEAPONS[loadout.current].auto) tryFire();

  // Plant channel.
  if (input.plant && player.alive) {
    if (now >= beepAt) {
      if (stepPlant(match, player, dt, now)) {
        sounds.plantDone();
        hud.banner('SPIKE PLANTED', 'Hold the site — 35 seconds to detonation', 3000);
      } else if (player.planting > 0) {
        sounds.plantBeep();
        beepAt = now + 0.55;
      }
    } else {
      stepPlant(match, player, dt, now);
    }
  } else {
    player.planting = 0;
  }

  // Bots act; their shots can hurt the player.
  const events = updateBots(bots, player.pos, player.alive, match.spike, now, dt, rand, colliders, moveBody, waypoints, routes);
  for (const ev of events) {
    if (ev.type === 'botShot' && ev.hit && player.alive) {
      const dealt = damagePlayer(player, ev.damage);
      if (dealt > 0) {
        sounds.hurt();
        hud.damageVignette();
        hud.killfeed(`<b>${ev.bot.name}</b> ▸ <b class="you">YOU</b> −${Math.round(dealt)}`);
      }
    }
  }

  // Planted-phase countdowns.
  if (match.spike.planted) {
    const outcome = stepPlanted(match, bots, dt, now);
    if (outcome === 'detonated') {
      sounds.explosion();
      finishRound(true, 'Spike detonated at the Reactor');
      return;
    }
    if (outcome === 'defused') {
      finishRound(false, 'Jackals defused the Spike');
      return;
    }
  }

  // Round end checks.
  if (!player.alive) { finishRound(false, 'You were eliminated'); return; }
  if (aliveBots(bots) === 0) {
    finishRound(true, match.spike.planted ? 'Site held — Spike detonated' : 'All Jackals eliminated');
    return;
  }
  if (match.timer <= 0) {
    finishRound(false, match.spike.planted ? 'Time expired' : 'Time expired — Spike never planted');
  }
}

function stepRoundEnd(dt) {
  now += dt;
  if (now - match.phaseAt >= 4.5) {
    if (match.phase === 'matchEnd') {
      hud.showEnd(match);
    } else {
      nextRound(match, now);
      resetRoundPositions();
      startRound(match, now);
      openBuy();
    }
  }
}

// --- Wiring: overlays -------------------------------------------------------------
document.getElementById('start-btn').addEventListener('click', () => {
  sounds.unlock();
  startMatch(match, now);
  openBuy();
});
document.getElementById('restart-btn').addEventListener('click', () => location.reload());
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shot staging ------------------------------------------------------------------
function applyShotPlan() {
  match.phase = plan.phase;
  match.money = plan.hud.money;
  match.round = plan.hud.round;
  match.wins = plan.hud.wins;
  match.losses = plan.hud.losses;
  match.timer = plan.hud.timer;
  player.hp = plan.playerHp;
  if (plan.hud.weapon) {
    loadout.primary = plan.hud.weapon === 'VK-47' ? 'vk47' : loadout.primary;
    loadout.current = loadout.primary || 'p9';
    loadout.mag[loadout.current] = plan.hud.mag;
    loadout.reserve[loadout.current] = plan.hud.reserve;
  } else {
    loadout.mag.p9 = plan.hud.mag;
    loadout.reserve.p9 = plan.hud.reserve;
  }
  if (plan.mode === 'end') {
    // Round already won: no spike to carry, nothing to plant.
    match.spike.carried = false;
    match.spike.planted = false;
  }
  applyShotBots(bots, plan.bots);
  camera.position.set(...plan.camera.pos);
  player.yaw = plan.camera.yaw;
  player.pitch = plan.camera.pitch;
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.position.set(plan.camera.pos[0], plan.camera.pos[1], plan.camera.pos[2]);
  if (plan.tracers) {
    for (const t of plan.tracers) addTracer(t.from, t.to, 0xffb347);
  }
  refreshBotMeshes();
  state.spreadPx = 10;
  hud.updateHud(state);
  if (plan.mode === 'start') hud.showOverlay('overlay-start');
  else hud.hideOverlays();
  if (plan.banner) hud.banner(plan.banner.title, plan.banner.sub, 90000);
  renderer.render(scene, camera);
}

// --- Main loop ----------------------------------------------------------------------
function frame(ts) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, ts - lastTs);
  lastTs = ts;
  const dt = dtMs / 1000;

  if (plan) {
    // Staged shot: static scene, keep rendering so headless capture works.
    // Tracers are staged props here — do not fade them.
    renderer.render(scene, camera);
    return;
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= SIM_DT && steps < 5) {
    if (match.phase === 'roundEnd' || match.phase === 'matchEnd') stepRoundEnd(SIM_DT);
    else stepSimulation(SIM_DT);
    accumulator -= SIM_DT;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;

  // Camera follows the player.
  const eye = eyePos(player);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.rotation.set(player.pitch + loadout.recoil * 0.4, player.yaw, 0);
  viewmodel.visible = player.alive && match.phase === 'live';
  // Spread in screen pixels for the crosshair gap.
  state.spreadPx = Math.round(currentSpread(loadout, player.speed, player.crouched) * 900);
  refreshBotMeshes();
  updateTracers(dt);
  hud.updateHud(state);
  renderer.render(scene, camera);
}

if (plan) {
  applyShotPlan();
} else {
  hud.showOverlay('overlay-start');
}
refreshBotMeshes();
requestAnimationFrame(frame);
