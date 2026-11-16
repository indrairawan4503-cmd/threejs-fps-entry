// Weapons: pure firing math. A shot is a ray from the camera with spread;
// recoil kicks the pitch up and recovers, spread grows while moving or
// firing and shrinks when still or crouched, so stopping to aim pays.
import { WEAPONS } from './config.js';
import { rayBox } from './map.js';
import { clamp } from './rng.js';

export function newLoadout() {
  return {
    primary: null, // weapon id or null
    current: 'p9',
    mag: { p9: WEAPONS.p9.mag },
    reserve: { p9: WEAPONS.p9.reserve },
    flash: 0,
    kevlar: false,
    lastShotAt: -10,
    reloadingUntil: 0,
    recoil: 0, // accumulated pitch kick, radians
    spreadHeat: 0, // 0..1, grows per shot
  };
}

export function buyWeapon(loadout, id, money) {
  const w = WEAPONS[id];
  if (!w || money < w.price) return { ok: false, money };
  loadout.primary = id;
  loadout.current = id;
  loadout.mag[id] = w.mag;
  loadout.reserve[id] = w.reserve;
  return { ok: true, money: money - w.price };
}

export function switchWeapon(loadout, id) {
  if (id === 'p9' || loadout.primary === id) {
    loadout.current = id;
    loadout.reloadingUntil = 0;
    return true;
  }
  return false;
}

export function startReload(loadout, now) {
  const w = WEAPONS[loadout.current];
  if (loadout.mag[loadout.current] >= w.mag) return false;
  if (loadout.reserve[loadout.current] <= 0) return false;
  if (now < loadout.reloadingUntil) return false;
  loadout.reloadingUntil = now + w.reload;
  return true;
}

export function finishReload(loadout) {
  const w = WEAPONS[loadout.current];
  const need = w.mag - loadout.mag[loadout.current];
  const take = Math.min(need, loadout.reserve[loadout.current]);
  loadout.mag[loadout.current] += take;
  loadout.reserve[loadout.current] -= take;
  loadout.reloadingUntil = 0;
}

// Current spread in radians: base + movement + heat, crouch tightens it.
export function currentSpread(loadout, speed, crouched) {
  const w = WEAPONS[loadout.current];
  let s = w.spread + loadout.spreadHeat * 0.02;
  if (speed > 0.5) s += w.moveSpread * Math.min(1, speed / 5);
  if (crouched) s *= 0.55;
  return s;
}

export function canFire(loadout, now) {
  const w = WEAPONS[loadout.current];
  if (now < loadout.reloadingUntil) return false;
  if (loadout.mag[loadout.current] <= 0) return false;
  return now - loadout.lastShotAt >= 60 / w.rpm;
}

// Fire one shot. Returns null when it cannot fire, else the ray to trace:
// { origin:[x,y,z], dir:[x,y,z], weapon, damage, headMult, range }.
export function fireShot(loadout, origin, dir, now, rand) {
  if (!canFire(loadout, now)) return null;
  const w = WEAPONS[loadout.current];
  loadout.mag[loadout.current] -= 1;
  loadout.lastShotAt = now;
  loadout.spreadHeat = clamp(loadout.spreadHeat + (w.auto ? 0.09 : 0.05), 0, 1);
  loadout.recoil = clamp(loadout.recoil + (w.damage >= 80 ? 0.05 : 0.022), 0, 0.14);
  const spread = currentSpread(loadout, 0, false);
  // Random cone around dir: perturb by two perpendicular offsets.
  const ux = [-dir[2], 0, dir[0]];
  const ul = Math.hypot(ux[0], ux[2]) || 1;
  ux[0] /= ul; ux[2] /= ul;
  const uy = [
    dir[1] * ux[2] - dir[2] * 0,
    dir[2] * ux[0] - dir[0] * ux[2],
    dir[0] * 0 - dir[1] * ux[0],
  ];
  const a = (rand() - 0.5) * 2 * spread;
  const b = (rand() - 0.5) * 2 * spread;
  const d = [
    dir[0] + ux[0] * a + uy[0] * b,
    dir[1] + ux[1] * a + uy[1] * b,
    dir[2] + ux[2] * a + uy[2] * b,
  ];
  const len = Math.hypot(d[0], d[1], d[2]);
  return {
    origin, dir: [d[0] / len, d[1] / len, d[2] / len],
    weapon: loadout.current, damage: w.damage, headMult: w.headMult, range: w.range,
  };
}

// Trace a shot ray against bot capsules (body cylinder + head sphere) and
// map boxes. Returns { bot, part: 'head'|'body', dist } or { dist } for a wall
// hit, or null when nothing is hit within range.
export function traceShot(shot, bots, colliders) {
  let best = null;
  for (const bot of bots) {
    if (!bot.alive) continue;
    const hit = rayCapsule(shot.origin, shot.dir, bot);
    if (hit && (!best || hit.dist < best.dist)) best = { bot, ...hit };
  }
  let wallDist = Infinity;
  for (const c of colliders) {
    const d = rayBox(shot.origin, shot.dir, c.min, c.max);
    if (d < wallDist) wallDist = d;
  }
  // Ground plane y=0.
  if (shot.dir[1] < -1e-6) {
    const t = -shot.origin[1] / shot.dir[1];
    if (t > 0 && t < wallDist) wallDist = t;
  }
  if (best && best.dist < wallDist && best.dist <= shot.range) return best;
  if (wallDist <= shot.range) return { dist: wallDist, wall: true };
  return null;
}

// A bot is a vertical capsule: body from feet to shoulders, head sphere above.
function rayCapsule(origin, dir, bot) {
  const p = bot.pos; // [x, y(feet), z]
  const bodyTop = 1.35, headY = 1.52, headR = 0.26, bodyR = 0.42;
  // Head sphere.
  const oc = [origin[0] - p[0], origin[1] - headY, origin[2] - p[2]];
  const b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
  const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - headR * headR;
  const disc = b * b - c;
  let headDist = Infinity;
  if (disc >= 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0) headDist = t;
  }
  // Body cylinder: horizontal distance to the vertical axis.
  const dx = origin[0] - p[0], dz = origin[2] - p[2];
  const a = dir[0] * dir[0] + dir[2] * dir[2];
  let bodyDist = Infinity;
  if (a > 1e-9) {
    const bb = (dx * dir[0] + dz * dir[2]) / a;
    const cc = (dx * dx + dz * dz - bodyR * bodyR) / a;
    const dd = bb * bb - cc;
    if (dd >= 0) {
      const t = -bb - Math.sqrt(dd);
      if (t > 0) {
        const y = origin[1] + dir[1] * t;
        if (y >= 0 && y <= bodyTop) bodyDist = t;
      }
    }
  }
  if (headDist < bodyDist) return { part: 'head', dist: headDist };
  if (bodyDist < Infinity) return { part: 'body', dist: bodyDist };
  return null;
}
