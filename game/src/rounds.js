// Rounds: the match state machine. Phases run menu -> buy -> live ->
// (planted) -> roundEnd -> buy ... -> matchEnd. Economy, plant/defuse and
// the scoreboard all live here; rendering and input only read it.
import { MAP, ECONOMY, WEAPONS } from './config.js';
import { clamp } from './rng.js';

export function newMatch() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseAt: 0, // time the current phase started (match clock)
    clock: 0, // seconds since the match started (excludes menu)
    round: 1,
    wins: 0,
    losses: 0,
    money: ECONOMY.startMoney,
    timer: MAP.roundTime,
    spike: {
      carried: true, planted: false, site: [MAP.siteA.core[0], 0, MAP.siteA.core[2]],
      plantAt: 0, fuseLeft: MAP.fuseTime, defuseLeft: MAP.defuseTime, defuserId: -1,
    },
    lastResult: null, // { won, reason, text } of the last finished round
    matchWinner: null, // 'Vanguard' | 'Jackals'
    roundKills: 0,
    stats: { kills: 0, deaths: 0, plants: 0, shots: 0, hits: 0, headshots: 0 },
  };
}

export function startMatch(match, now) {
  match.phase = 'buy';
  match.phaseAt = now;
  match.clock = now;
  match.timer = MAP.roundTime;
}

export function startRound(match, now) {
  match.round += 0; // round number is set by the caller on reset
  match.phase = 'buy';
  match.phaseAt = now;
  match.timer = MAP.roundTime;
  match.spike = {
    carried: true, planted: false, site: [MAP.siteA.core[0], 0, MAP.siteA.core[2]],
    plantAt: 0, fuseLeft: MAP.fuseTime, defuseLeft: MAP.defuseTime, defuserId: -1,
  };
  match.roundKills = 0;
}

export function beginLive(match, now) {
  match.phase = 'live';
  match.phaseAt = now;
}

// End a round: award money, update the score, decide the next phase.
export function endRound(match, won, reason, now) {
  match.lastResult = { won, reason };
  if (won) {
    match.wins += 1;
    match.money += ECONOMY.roundWin;
  } else {
    match.losses += 1;
    match.money += ECONOMY.roundLoss;
  }
  match.phase = 'roundEnd';
  match.phaseAt = now;
  if (match.wins >= MAP.roundsToWin || match.losses >= MAP.roundsToWin ||
    match.round >= MAP.maxRounds) {
    match.matchWinner = match.wins > match.losses ? 'Vanguard' : 'Jackals';
    match.phase = 'matchEnd';
  }
}

export function nextRound(match, now) {
  match.round += 1;
  startRound(match, now);
}

// Plant progress: call every step while the player holds E inside the site.
export function stepPlant(match, player, dt, now) {
  const spike = match.spike;
  if (match.phase !== 'live' || spike.planted || !player.alive) {
    player.planting = 0;
    return false;
  }
  const s = MAP.siteA;
  const inside = player.pos[0] >= s.minX && player.pos[0] <= s.maxX &&
    player.pos[2] >= s.minZ && player.pos[2] <= s.maxZ;
  if (!inside) { player.planting = 0; return false; }
  player.planting = clamp(player.planting + dt / MAP.plantTime, 0, 1);
  if (player.planting >= 1) {
    spike.planted = true;
    spike.carried = false;
    spike.plantAt = now;
    spike.fuseLeft = MAP.fuseTime;
    spike.defuseLeft = MAP.defuseTime;
    player.planting = 0;
    match.money += ECONOMY.plantReward;
    match.stats.plants += 1;
    return true;
  }
  return false;
}

// Fuse + defuse countdowns during the planted phase.
export function stepPlanted(match, bots, dt, now) {
  const spike = match.spike;
  if (!spike.planted) return null;
  spike.fuseLeft -= dt;
  const defuser = bots.find((b) => b.alive && b.defusing);
  if (defuser) {
    spike.defuseLeft -= dt;
    spike.defuserId = defuser.id;
    if (spike.defuseLeft <= 0) return 'defused';
  } else {
    spike.defuserId = -1;
    spike.defuseLeft = Math.min(MAP.defuseTime, spike.defuseLeft + dt * 0.5);
  }
  if (spike.fuseLeft <= 0) return 'detonated';
  return null;
}

export function aliveBots(bots) {
  return bots.filter((b) => b.alive).length;
}

export function buyItem(match, loadout, id) {
  if (id === 'flash') {
    if (match.money < 200 || loadout.flash >= 2) return false;
    match.money -= 200;
    loadout.flash += 1;
    return true;
  }
  if (id === 'kevlar') {
    if (match.money < 650 || loadout.kevlar) return false;
    match.money -= 650;
    loadout.kevlar = true;
    return true;
  }
  const w = WEAPONS[id];
  if (!w || match.money < w.price) return false;
  if (loadout.primary === id) {
    // Top up reserve ammo instead of re-buying.
    const maxReserve = w.reserve;
    if (loadout.reserve[id] >= maxReserve) return false;
    match.money -= Math.floor(w.price / 3);
    loadout.reserve[id] = maxReserve;
    return true;
  }
  match.money -= w.price;
  loadout.primary = id;
  loadout.current = id;
  loadout.mag[id] = w.mag;
  loadout.reserve[id] = w.reserve;
  return true;
}
