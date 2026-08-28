// server.js — Kingdom Territory Game
//
// Mechanic:
// - Each unique viewer who LIKES the stream claims a "territory" blob on the map.
// - Their blob grows in real time while they keep liking.
// - If they stop liking, their blob slowly shrinks and eventually despawns,
//   freeing up that spot on the map for someone new.
// - GIFTS give an instant big growth boost, trigger an on-screen popup card
//   with the gifter's name/avatar, and are permanently recorded on the
//   leaderboard (leaderboard totals never decay — that's the "proof" record).

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

// ⬇️ CHANGE THIS to your TikTok username (no @), or set the TIKTOK_USERNAME env var on Render
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'YOUR_TIKTOK_USERNAME';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 8081;

// ---------------------------------------------------------------------------
// Tunable game config
// ---------------------------------------------------------------------------
const CONFIG = {
  MAP_W: 800,
  MAP_H: 600,
  MIN_RADIUS: 22,
  MAX_RADIUS: 130,
  GROWTH_PER_LIKE: 2.2,      // energy added per like unit
  DECAY_PER_SEC: 3.5,        // energy lost per second when not liking
  TICK_MS: 200,              // simulation tick rate
  DESPAWN_BELOW: 1,          // energy threshold to remove a blob
  GIFT_ENERGY_PER_DIAMOND: 5,// energy added per diamond of gift value
  LEADERBOARD_SIZE: 5,
  LOG_MAX: 500,
};

const PALETTE = [
  '#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9d4edd',
  '#ffb703', '#06d6a0', '#ef476f', '#118ab2', '#e76f51',
];

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const blobs = new Map(); // uniqueId -> blob state
const giftTotals = new Map(); // uniqueId -> { nickname, avatarUrl, diamonds }
const likeTotals = new Map();  // uniqueId -> { nickname, avatarUrl, likes }
const eventLog = []; // { type, uniqueId, nickname, value, ts } — capped, for "proof" after the stream

let colorCursor = 0;
function nextColor() {
  const c = PALETTE[colorCursor % PALETTE.length];
  colorCursor++;
  return c;
}

function randomSpawnPoint() {
  const pad = CONFIG.MAX_RADIUS * 0.6;
  return {
    x: pad + Math.random() * (CONFIG.MAP_W - pad * 2),
    y: pad + Math.random() * (CONFIG.MAP_H - pad * 2),
  };
}

function extractAvatarUrl(user) {
  // TikTok's live protocol has changed field shapes across versions; try the
  // common ones defensively and fall back to nothing (client draws initials).
  return (
    user?.avatarThumb?.urlList?.[0] ||
    user?.avatarThumb?.url_list?.[0] ||
    user?.avatarMedium?.urlList?.[0] ||
    user?.avatarLarger?.urlList?.[0] ||
    user?.profilePicture?.urls?.[0] ||
    user?.profilePictureUrl ||
    null
  );
}

function getOrCreateBlob(uniqueId, nickname, avatarUrl) {
  let b = blobs.get(uniqueId);
  if (!b) {
    const spawn = randomSpawnPoint();
    b = {
      uniqueId,
      nickname: nickname || uniqueId,
      avatarUrl: avatarUrl || null,
      color: nextColor(),
      energy: 0,
      x: spawn.x,
      y: spawn.y,
      lastGiftAt: 0,
    };
    blobs.set(uniqueId, b);
  } else {
    if (nickname) b.nickname = nickname;
    if (avatarUrl) b.avatarUrl = avatarUrl;
  }
  return b;
}

function radiusForEnergy(energy) {
  const r = CONFIG.MIN_RADIUS + Math.sqrt(Math.max(0, energy)) * 6;
  return Math.min(CONFIG.MAX_RADIUS, r);
}

function pushLog(entry) {
  eventLog.push({ ...entry, ts: Date.now() });
  if (eventLog.length > CONFIG.LOG_MAX) eventLog.shift();
}

function topN(map, key, n) {
  return [...map.entries()]
    .map(([uniqueId, v]) => ({ uniqueId, ...v }))
    .sort((a, b) => b[key] - a[key])
    .slice(0, n);
}

function broadcastLeaderboard() {
  io.emit('leaderboard', {
    topGifters: topN(giftTotals, 'diamonds', CONFIG.LEADERBOARD_SIZE),
    topLikers: topN(likeTotals, 'likes', CONFIG.LEADERBOARD_SIZE),
  });
}

// ---------------------------------------------------------------------------
// Simulation tick: decay energy, despawn empty blobs, broadcast map state
// ---------------------------------------------------------------------------
setInterval(() => {
  const decayAmount = CONFIG.DECAY_PER_SEC * (CONFIG.TICK_MS / 1000);
  for (const [uniqueId, b] of blobs) {
    b.energy = Math.max(0, b.energy - decayAmount);
    if (b.energy < CONFIG.DESPAWN_BELOW) {
      blobs.delete(uniqueId);
    }
  }

  const snapshot = [...blobs.values()].map((b) => ({
    uniqueId: b.uniqueId,
    nickname: b.nickname,
    avatarUrl: b.avatarUrl,
    color: b.color,
    x: b.x,
    y: b.y,
    radius: radiusForEnergy(b.energy),
    recentlyGifted: Date.now() - b.lastGiftAt < 3000,
  }));

  io.emit('map', snapshot);
}, CONFIG.TICK_MS);

// ---------------------------------------------------------------------------
// TikTok Live connection
// ---------------------------------------------------------------------------
let tiktok;

async function connectToTikTok() {
  tiktok = new TikTokLiveConnection(TIKTOK_USERNAME, {});

  tiktok.on(WebcastEvent.LIKE, (data) => {
    const uniqueId = data.user?.uniqueId || data.user?.userId || 'unknown';
    const nickname = data.user?.nickname || uniqueId;
    const avatarUrl = extractAvatarUrl(data.user);
    const likeCount = data.likeCount || 1;

    const b = getOrCreateBlob(uniqueId, nickname, avatarUrl);
    b.energy += likeCount * CONFIG.GROWTH_PER_LIKE;

    const totals = likeTotals.get(uniqueId) || { nickname, avatarUrl, likes: 0 };
    totals.likes += likeCount;
    totals.nickname = nickname;
    if (avatarUrl) totals.avatarUrl = avatarUrl;
    likeTotals.set(uniqueId, totals);

    pushLog({ type: 'like', uniqueId, nickname, value: likeCount });
    broadcastLeaderboard();
  });

  tiktok.on(WebcastEvent.GIFT, (data) => {
    if (data.giftType === 1 && !data.repeatEnd) return; // wait for streak to finish

    const uniqueId = data.user?.uniqueId || data.user?.userId || 'unknown';
    const nickname = data.user?.nickname || uniqueId;
    const avatarUrl = extractAvatarUrl(data.user);
    const diamondValue = (data.diamondCount || 1) * (data.repeatCount || 1);

    const b = getOrCreateBlob(uniqueId, nickname, avatarUrl);
    b.energy += diamondValue * CONFIG.GIFT_ENERGY_PER_DIAMOND;
    b.lastGiftAt = Date.now();

    const totals = giftTotals.get(uniqueId) || { nickname, avatarUrl, diamonds: 0 };
    totals.diamonds += diamondValue;
    totals.nickname = nickname;
    if (avatarUrl) totals.avatarUrl = avatarUrl;
    giftTotals.set(uniqueId, totals);

    pushLog({
      type: 'gift',
      uniqueId,
      nickname,
      value: diamondValue,
      giftName: data.giftName,
      repeatCount: data.repeatCount,
    });

    io.emit('gift-popup', {
      uniqueId,
      nickname,
      avatarUrl,
      giftName: data.giftName,
      value: diamondValue,
      repeatCount: data.repeatCount,
    });

    broadcastLeaderboard();
  });

  tiktok.on(ControlEvent.CONNECTED, (state) => {
    console.log(`✅ Connected to @${TIKTOK_USERNAME}'s live room (id: ${state.roomId})`);
  });

  tiktok.on(ControlEvent.DISCONNECTED, () => {
    console.log('⚠️  Disconnected from TikTok Live. Retrying in 10s...');
    setTimeout(connectToTikTok, 10000);
  });

  tiktok.on(ControlEvent.ERROR, (err) => {
    console.error('TikTok connector error:', err?.info || err?.message || err);
  });

  try {
    await tiktok.connect();
  } catch (err) {
    console.error(`❌ Could not connect (is @${TIKTOK_USERNAME} live right now?):`, err?.info || err?.message || err);
    console.log('Retrying in 15s...');
    setTimeout(connectToTikTok, 15000);
  }
}

// ---------------------------------------------------------------------------
// Socket.IO — send fresh clients the current state; support manual testing
// ---------------------------------------------------------------------------
const TEST_NAMES = ['Skywalker22', 'DragonQueen', 'PixelPete', 'MoonlitFox', 'BardOfNorth', 'RubyRaven', 'ThornKnight'];
const TEST_GIFTS = [
  { name: 'Rose', diamonds: 1 },
  { name: 'Heart', diamonds: 5 },
  { name: 'GG', diamonds: 25 },
  { name: 'Galaxy', diamonds: 1000 },
];

io.on('connection', (socket) => {
  socket.emit('map', [...blobs.values()].map((b) => ({
    uniqueId: b.uniqueId,
    nickname: b.nickname,
    avatarUrl: b.avatarUrl,
    color: b.color,
    x: b.x,
    y: b.y,
    radius: radiusForEnergy(b.energy),
    recentlyGifted: Date.now() - b.lastGiftAt < 3000,
  })));
  socket.emit('leaderboard', {
    topGifters: topN(giftTotals, 'diamonds', CONFIG.LEADERBOARD_SIZE),
    topLikers: topN(likeTotals, 'likes', CONFIG.LEADERBOARD_SIZE),
  });

  socket.on('manual-test-like', () => {
    const name = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
    const uniqueId = 'test_' + name;
    const b = getOrCreateBlob(uniqueId, name, null);
    b.energy += 5 * CONFIG.GROWTH_PER_LIKE;
    const totals = likeTotals.get(uniqueId) || { nickname: name, avatarUrl: null, likes: 0 };
    totals.likes += 5;
    likeTotals.set(uniqueId, totals);
    broadcastLeaderboard();
  });

  socket.on('manual-test-gift', () => {
    const name = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
    const uniqueId = 'test_' + name;
    const gift = TEST_GIFTS[Math.floor(Math.random() * TEST_GIFTS.length)];
    const b = getOrCreateBlob(uniqueId, name, null);
    b.energy += gift.diamonds * CONFIG.GIFT_ENERGY_PER_DIAMOND;
    b.lastGiftAt = Date.now();
    const totals = giftTotals.get(uniqueId) || { nickname: name, avatarUrl: null, diamonds: 0 };
    totals.diamonds += gift.diamonds;
    giftTotals.set(uniqueId, totals);
    io.emit('gift-popup', { uniqueId, nickname: name, avatarUrl: null, giftName: gift.name, value: gift.diamonds, repeatCount: 1 });
    broadcastLeaderboard();
  });
});

// Simple JSON log endpoint — your "proof" record after the stream ends
app.get('/log', (req, res) => res.json(eventLog));

server.listen(PORT, () => {
  console.log(`\n🏰 Kingdom Territory Game running at: http://localhost:${PORT}`);
  console.log(`   Overlay: http://localhost:${PORT}/overlay.html`);
  console.log(`   Log/proof feed: http://localhost:${PORT}/log\n`);
  connectToTikTok();
});
