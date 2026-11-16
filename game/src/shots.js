// Screenshot staging: for ?shot=start|play|end&seed=N the game renders a
// fixed, deterministic scene — no pointer lock, no input — so the maker's
// screenshots are real renders of the game's own code, repeatable by seed.
import { MAP } from './config.js';
import { mulberry32 } from './rng.js';

// Returns staging instructions for a shot mode, or null for live play.
export function shotPlan(mode, seed) {
  const rand = mulberry32(seed || 1);
  if (mode === 'start') {
    return {
      mode,
      camera: { pos: [-19, 3.0, 6], yaw: -1.41, pitch: -0.1 },
      playerHp: 150,
      phase: 'menu',
      bots: [
        { pos: [12, 0, -9], yaw: 2.4, pose: 'hold' },
        { pos: [16, 0, 3], yaw: 2.9, pose: 'hold' },
        { pos: [4, 0, 8], yaw: -2.2, pose: 'patrol' },
      ],
      hud: { money: 800, round: 1, wins: 0, losses: 0, timer: 100, mag: 12, reserve: 48 },
    };
  }
  if (mode === 'play') {
    return {
      mode,
      camera: { pos: [3.5, 1.62, -9.5], yaw: -1.5, pitch: -0.01 },
      playerHp: 112,
      phase: 'live',
      bots: [
        { pos: [12, 0, -10.5], yaw: 1.4, pose: 'engage', hp: 100 },
        { pos: [15.5, 0, -8], yaw: 1.9, pose: 'engage', hp: 46 },
        { pos: [8, 0, -6], yaw: -2.6, pose: 'route', hp: 100 },
      ],
      tracers: [
        { from: [3.5, 1.5, -9.5], to: [12, 1.35, -10.5] },
        { from: [12, 1.45, -10.5], to: [4.4, 1.5, -9.2] },
      ],
      hud: { money: 2400, round: 3, wins: 2, losses: 1, timer: 65, mag: 18, reserve: 75, weapon: 'VK-47' },
    };
  }
  if (mode === 'end') {
    return {
      mode,
      camera: { pos: [11, 2.0, -5], yaw: -2.19, pitch: -0.1 },
      playerHp: 87,
      phase: 'roundEnd',
      bots: [
        { pos: [17, 0, -2], yaw: 0.4, pose: 'dead' },
        { pos: [19, 0, 4], yaw: 2.2, pose: 'dead' },
        { pos: [14.5, 0, 1.5], yaw: -1.1, pose: 'dead' },
        { pos: [16, 0, -5.5], yaw: 1.6, pose: 'dead' },
      ],
      hud: { money: 3025, round: 3, wins: 3, losses: 1, timer: 0, mag: 7, reserve: 75, weapon: 'VK-47' },
      banner: { title: 'ROUND WON', sub: 'Reactor secured — Jackals eliminated' },
    };
  }
  return null;
}

// Deterministic bot placement for a staged shot: pose the bots, no AI.
export function applyShotBots(bots, staged) {
  staged.forEach((s, i) => {
    const bot = bots[i];
    if (!bot) return;
    bot.pos = [s.pos[0], 0, s.pos[2]];
    bot.yaw = s.yaw;
    bot.alive = s.pose !== 'dead';
    bot.hp = s.hp ?? 100;
    bot.state = s.pose === 'dead' ? 'route' : s.pose;
  });
}

export { mulberry32 };
