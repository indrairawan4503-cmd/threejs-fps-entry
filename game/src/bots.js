// Jackal bots: patrol routes, hold angles, react to what they see and hear.
// A bot is a small state machine — route, hold, engage, defuse, retreat —
// with a reaction delay and distance-based aim error, so fights feel fair.
import { BOT_NAMES, BOT_SKILL, MAP } from './config.js';
import { hasLineOfSight } from './map.js';
import { clamp, pick } from './rng.js';

export function spawnBots(rand) {
  return BOT_NAMES.map((name, i) => {
    const skill = BOT_SKILL[i];
    const spawn = MAP.botSpawn[i];
    return {
      id: i, name, skill,
      pos: [spawn[0], 0, spawn[2]],
      yaw: Math.PI / 2, // facing west (-x), toward the player
      hp: 100, alive: true,
      state: 'route',
      route: i % 2 === 0 ? 'toA' : 'toB',
      wpIndex: 0,
      speed: 3.2,
      reactAt: 0, // time when the bot may first shoot after spotting
      lastShotAt: -10,
      burstLeft: 0,
      burstUntil: 0,
      spottedAt: 0,
      targetPos: null, // last known player position
      strafeDir: 1,
      strafeUntil: 0,
      holdUntil: 0,
      defusing: false,
      flashUntil: 0,
      moving: false,
    };
  });
}

function dist2d(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function moveToward(bot, target, dt, colliders, moveBody) {
  const dx = target[0] - bot.pos[0], dz = target[1] - bot.pos[2];
  const d = Math.hypot(dx, dz);
  if (d < 0.15) return true;
  const step = Math.min(d, bot.speed * dt);
  const delta = [(dx / d) * step, 0, (dz / d) * step];
  moveBody(bot.pos, delta, 0.4, 1.7, colliders);
  bot.yaw = Math.atan2(-delta[2], delta[0]) + Math.PI / 2;
  bot.yaw = Math.atan2(delta[0], delta[2]);
  bot.moving = true;
  return false;
}

// A bot hears a gunshot within 30 m: it learns the shooter's position.
export function alertBots(bots, pos, now) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    if (dist2d(bot.pos, pos) < 30) {
      bot.targetPos = [pos[0], pos[2]];
      if (bot.state === 'route' || bot.state === 'hold') {
        bot.state = 'engage';
        bot.spottedAt = now;
        bot.reactAt = now + bot.skill.react;
      }
    }
  }
}

// A flash grenade blinds bots that can see its burst point.
export function flashBots(bots, burstPos, now, colliders) {
  for (const bot of bots) {
    if (!bot.alive) continue;
    const d = dist2d(bot.pos, burstPos);
    if (d > 28) continue;
    const eye = [bot.pos[0], 1.5, bot.pos[2]];
    if (!hasLineOfSight(eye, [burstPos[0], burstPos[1], burstPos[2]], colliders)) continue;
    bot.flashUntil = now + Math.max(0.6, 2.6 - d * 0.08);
    bot.state = 'hold';
    bot.holdUntil = bot.flashUntil;
  }
}

export function updateBots(bots, playerPos, playerAlive, spike, now, dt, rand, colliders, moveBody, waypoints, routes) {
  const events = []; // { type: 'botShot', bot, hit, damage } etc.
  for (const bot of bots) {
    if (!bot.alive) continue;
    bot.moving = false;
    const blind = now < bot.flashUntil;

    // Defuse duty: when the spike is planted, the nearest living bot goes.
    if (spike.planted && !blind) {
      const isDefuser = bots.filter((b) => b.alive).sort(
        (a, b) => dist2d(a.pos, spike.site) - dist2d(b.pos, spike.site))[0] === bot;
      if (isDefuser && bot.state !== 'defuse') {
        bot.state = 'defuse';
        bot.defusing = false;
      }
    }

    if (bot.state === 'defuse') {
      const d = dist2d(bot.pos, spike.site);
      if (d > 1.6) {
        moveToward(bot, spike.site, dt, colliders, moveBody);
      } else {
        bot.defusing = true;
      }
      continue;
    }

    // Perception: line of sight + facing + range.
    const eye = [bot.pos[0], 1.5, bot.pos[2]];
    const pEye = [playerPos[0], 1.4, playerPos[2]];
    const dPlayer = dist2d(bot.pos, playerPos);
    const sees = playerAlive && !blind && dPlayer < 42 &&
      hasLineOfSight(eye, pEye, colliders);

    if (sees) {
      bot.targetPos = [playerPos[0], playerPos[2]];
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.spottedAt = now;
        bot.reactAt = now + bot.skill.react;
      }
    } else if (bot.state === 'engage' && now - bot.spottedAt > 2.5) {
      // Lost the player: sweep toward the last known spot, then resume route.
      if (bot.targetPos) {
        if (moveToward(bot, bot.targetPos, dt, colliders, moveBody)) {
          bot.targetPos = null;
          bot.state = 'route';
          bot.wpIndex = 0;
        }
      } else {
        bot.state = 'route';
        bot.wpIndex = 0;
      }
      continue;
    }

    if (bot.state === 'engage') {
      // Face the player, strafe to be a harder target, fire in bursts.
      const dx = playerPos[0] - bot.pos[0], dz = playerPos[2] - bot.pos[2];
      bot.yaw = Math.atan2(dx, dz);
      if (now > bot.strafeUntil) {
        bot.strafeDir = rand() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + 0.6 + rand() * 0.9;
      }
      const side = [Math.cos(bot.yaw) * bot.strafeDir, 0, -Math.sin(bot.yaw) * bot.strafeDir];
      moveBody(bot.pos, [side[0] * bot.speed * 0.45 * dt, 0, side[2] * bot.speed * 0.45 * dt], 0.4, 1.7, colliders);
      bot.moving = true;
      if (sees && now >= bot.reactAt && !blind) {
        if (bot.burstLeft <= 0 && now - bot.lastShotAt > 0.9) {
          bot.burstLeft = bot.skill.burst;
          bot.burstUntil = now + bot.skill.burst * 0.14;
        }
        if (bot.burstLeft > 0 && now <= bot.burstUntil && now - bot.lastShotAt >= 0.14) {
          bot.lastShotAt = now;
          bot.burstLeft -= 1;
          // Aim error grows with distance and with the player's speed.
          const err = bot.skill.aim * (0.7 + dPlayer / 28);
          const hitChance = clamp(0.55 - dPlayer * 0.008 - err * 4, 0.08, 0.55);
          const hit = rand() < hitChance;
          const head = hit && rand() < 0.12;
          events.push({
            type: 'botShot', bot, hit,
            damage: hit ? bot.skill.damage * (head ? 2 : 1) : 0,
            head,
          });
        }
      }
      continue;
    }

    if (bot.state === 'hold') {
      if (now < bot.holdUntil) {
        // Scan: slow yaw sweep while holding an angle.
        bot.yaw += dt * 0.5 * (bot.id % 2 ? 1 : -1);
        continue;
      }
      bot.state = 'route';
      bot.wpIndex = 0;
    }

    // Route: follow waypoints; at the end, hold the position for a while.
    const route = routes[bot.route] || routes.toA;
    const wp = waypoints[route[bot.wpIndex % route.length]];
    if (moveToward(bot, wp, dt, colliders, moveBody)) {
      bot.wpIndex += 1;
      if (bot.wpIndex >= route.length) {
        bot.state = 'hold';
        bot.holdUntil = now + 3 + rand() * 3;
        // Pick a fresh route next time.
        bot.route = pick(rand, ['toA', 'toB', 'toMid', 'holdA', 'holdB']);
        bot.wpIndex = 0;
      }
    }
  }
  return events;
}
