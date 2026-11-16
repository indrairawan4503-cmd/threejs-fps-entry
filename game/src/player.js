// The player: first-person movement with acceleration and crouch, AABB
// collision against the map, health and armor, and the plant channel.
import { MAP } from './config.js';
import { moveBody } from './map.js';
import { clamp } from './rng.js';

export const PLAYER_HALF = 0.38;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_CROUCH_HEIGHT = 1.15;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.1;

export function newPlayer() {
  return {
    pos: [MAP.playerSpawn[0], 0, MAP.playerSpawn[2]],
    yaw: MAP.playerYaw,
    pitch: 0,
    vel: [0, 0],
    hp: 150,
    maxHp: 150,
    armor: 0,
    crouched: false,
    alive: true,
    onGround: true,
    planting: 0, // 0..1 progress while holding E at the site
    defuseGuard: 0,
    speed: 0, // current horizontal speed, for spread + HUD
    flashUntil: 0,
    flashStrength: 0,
  };
}

// input: { fwd, back, left, right, crouch } each 0/1; dt in seconds.
export function stepPlayer(player, input, dt, colliders) {
  if (!player.alive) return;
  const crouch = !!input.crouch;
  player.crouched = crouch;
  const targetSpeed = crouch ? 2.1 : 5.2;
  const accel = crouch ? 22 : 34;
  // Wish direction in world space from yaw.
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // Forward is -z rotated by yaw: forward = (-sin(yaw), -cos(yaw)) in xz.
  let wx = 0, wz = 0;
  const fwd = [-sin, -cos];
  const right = [cos, -sin];
  if (input.fwd) { wx += fwd[0]; wz += fwd[1]; }
  if (input.back) { wx -= fwd[0]; wz -= fwd[1]; }
  if (input.right) { wx += right[0]; wz += right[1]; }
  if (input.left) { wx -= right[0]; wz -= right[1]; }
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }
  const tvx = wx * targetSpeed, tvz = wz * targetSpeed;
  // Accelerate toward the wish velocity; decelerate fast when no input.
  const rate = len > 0 ? accel : 40;
  player.vel[0] += clamp(tvx - player.vel[0], -rate * dt, rate * dt);
  player.vel[1] += clamp(tvz - player.vel[1], -rate * dt, rate * dt);
  player.speed = Math.hypot(player.vel[0], player.vel[1]);
  moveBody(
    player.pos,
    [player.vel[0] * dt, 0, player.vel[1] * dt],
    PLAYER_HALF, player.crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT,
    colliders,
  );
  // Keep inside the arena even if a collider is missed.
  player.pos[0] = clamp(player.pos[0], -MAP.halfX + 0.5, MAP.halfX - 0.5);
  player.pos[2] = clamp(player.pos[2], -MAP.halfZ + 0.5, MAP.halfZ - 0.5);
}

export function eyeHeight(player) {
  return player.crouched ? EYE_CROUCH : EYE_STAND;
}

export function eyePos(player) {
  return [player.pos[0], eyeHeight(player), player.pos[2]];
}

// Damage with kevlar absorbing half while it lasts.
export function damagePlayer(player, amount) {
  if (!player.alive) return 0;
  let rest = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * 0.5);
    player.armor -= absorbed;
    rest -= absorbed;
  }
  player.hp = Math.max(0, player.hp - rest);
  if (player.hp <= 0) player.alive = false;
  return rest;
}

export function healPlayer(player, amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
}

export function inSiteA(player) {
  const s = MAP.siteA;
  return player.pos[0] >= s.minX && player.pos[0] <= s.maxX &&
    player.pos[2] >= s.minZ && player.pos[2] <= s.maxZ;
}
