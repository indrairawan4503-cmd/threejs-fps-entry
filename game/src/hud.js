// HUD: every DOM overlay the player sees — health, ammo, money, timer,
// score, crosshair, hitmarkers, killfeed, banners, buy menu, start/end.
// The HUD only reads the simulation; it never writes game state except
// through the callbacks main.js hands it (buy, deploy, restart).

export function el(id) { return document.getElementById(id); }

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function updateHud(state) {
  const { player, loadout, match, bots } = state;
  const w = state.weapons[loadout.current];
  el('hud-hp').textContent = Math.ceil(player.hp);
  el('hud-hp-bar').style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  el('hud-armor').textContent = player.armor > 0 ? `+${Math.ceil(player.armor)}` : '';
  el('hud-ammo').textContent = loadout.mag[loadout.current];
  el('hud-reserve').textContent = loadout.reserve[loadout.current];
  el('hud-weapon').textContent = w.short;
  el('hud-money').textContent = `$${match.money}`;
  el('hud-timer').textContent = match.phase === 'live'
    ? fmtTime(match.timer)
    : match.phase === 'buy' ? 'BUY' : fmtTime(match.timer);
  el('hud-timer').classList.toggle('danger', match.phase === 'live' && match.timer <= 15);
  el('hud-round').textContent = `ROUND ${match.round}`;
  el('hud-score').textContent = `${match.wins} — ${match.losses}`;
  el('hud-alive').textContent = `JACKALS LEFT: ${bots.filter((b) => b.alive).length}`;
  el('hud-flash').textContent = loadout.flash > 0 ? `FLASH ×${loadout.flash}` : '';
  el('hud-spike').textContent = match.spike.planted
    ? (match.spike.defuserId >= 0 ? 'DEFUSE IN PROGRESS!' : `SPIKE: ${match.spike.fuseLeft.toFixed(0)}s`)
    : (match.spike.carried ? 'CARRY THE SPIKE TO THE REACTOR [E]' : '');
  // Plant progress bar.
  const bar = el('plant-bar');
  if (player.planting > 0) {
    bar.style.display = 'block';
    bar.firstElementChild.style.width = `${player.planting * 100}%`;
  } else if (match.spike.planted && match.spike.defuserId >= 0) {
    bar.style.display = 'block';
    bar.firstElementChild.style.width =
      `${(1 - match.spike.defuseLeft / 4) * 100}%`;
  } else {
    bar.style.display = 'none';
  }
  // Crosshair gap follows spread: still = tight, moving/firing = wide.
  const gap = 4 + state.spreadPx;
  el('crosshair').style.setProperty('--gap', `${gap}px`);
  el('crosshair').style.opacity = match.phase === 'live' ? '1' : '0';
}

export function hitmarker(head, kill) {
  const m = el('hitmarker');
  m.classList.remove('show', 'kill', 'head');
  void m.offsetWidth; // restart the CSS animation
  m.classList.add('show');
  if (kill) m.classList.add('kill');
  if (head) m.classList.add('head');
}

export function killfeed(html) {
  const feed = el('killfeed');
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.innerHTML = html;
  feed.prepend(row);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
  setTimeout(() => row.classList.add('fade'), 4200);
}

export function banner(title, sub, ms = 2600) {
  const b = el('banner');
  el('banner-title').textContent = title;
  el('banner-sub').textContent = sub || '';
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove('show'), ms);
}

export function showOverlay(id) {
  for (const o of ['overlay-start', 'overlay-buy', 'overlay-end']) {
    el(o).classList.toggle('hidden', o !== id);
  }
}

export function hideOverlays() {
  for (const o of ['overlay-start', 'overlay-buy', 'overlay-end']) {
    el(o).classList.add('hidden');
  }
}

export function buildBuyMenu(match, loadout, shop, onBuy, onDeploy) {
  const list = el('buy-list');
  list.innerHTML = '';
  for (const item of shop) {
    const row = document.createElement('button');
    row.className = 'buy-row';
    const owned = item.id === 'kevlar'
      ? loadout.kevlar
      : item.id === 'flash'
        ? loadout.flash >= 2
        : loadout.primary === item.id;
    const afford = match.money >= item.price;
    row.disabled = owned || !afford;
    row.innerHTML = `<span class="buy-name">${item.label}</span>` +
      `<span class="buy-note">${owned ? 'OWNED' : item.note}</span>` +
      `<span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => {
      if (onBuy(item.id)) buildBuyMenu(match, loadout, shop, onBuy, onDeploy);
    });
    list.appendChild(row);
  }
  el('buy-money').textContent = `$${match.money}`;
  el('buy-deploy').onclick = onDeploy;
}

export function showEnd(match) {
  const won = match.matchWinner === 'Vanguard';
  el('end-title').textContent = won ? 'MATCH WON' : 'MATCH LOST';
  el('end-title').className = won ? 'win' : 'lose';
  el('end-sub').textContent = `Vanguard ${match.wins} — ${match.losses} Jackals · ` +
    `${match.stats.kills} kills · ${match.stats.headshots} headshots · ` +
    `${Math.round((match.stats.hits / Math.max(1, match.stats.shots)) * 100)}% accuracy`;
  showOverlay('overlay-end');
}

export function flashScreen(strength) {
  const f = el('flash-overlay');
  f.style.opacity = String(strength);
  if (strength > 0) {
    setTimeout(() => { f.style.opacity = '0'; }, 120);
  }
}

export function damageVignette() {
  const v = el('damage-overlay');
  v.classList.remove('show');
  void v.offsetWidth;
  v.classList.add('show');
  setTimeout(() => v.classList.remove('show'), 350);
}
