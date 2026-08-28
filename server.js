// server.js
// Connects to a public TikTok LIVE stream, listens for gift/like/follow events,
// and forwards them to the browser overlay (public/overlay.html) via Socket.IO.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

// ⬇️ CHANGE THIS to your TikTok username (no @), e.g. 'beckwebsolutions'
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'YOUR_TIKTOK_USERNAME';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8081;

// --- Game state (server is source of truth so refreshing OBS doesn't lose progress) ---
let fuel = 0;
const GOAL = 1000; // total "fuel" needed to launch the rocket

function resetGame() {
  fuel = 0;
  io.emit('state', { fuel, goal: GOAL });
}

// --- TikTok Live connection ---
let tiktok;

async function connectToTikTok() {
  tiktok = new TikTokLiveConnection(TIKTOK_USERNAME, {});

  tiktok.on(WebcastEvent.GIFT, (data) => {
    // Only count "streak finished" for repeatable gifts so a combo counts once
    if (data.giftType === 1 && !data.repeatEnd) return;

    const diamondValue = (data.diamondCount || 1) * (data.repeatCount || 1);
    fuel = Math.min(GOAL, fuel + diamondValue);

    io.emit('gift', {
      user: data.user?.nickname || data.user?.uniqueId || 'Someone',
      giftName: data.giftName,
      value: diamondValue,
      repeatCount: data.repeatCount,
    });
    io.emit('state', { fuel, goal: GOAL });

    if (fuel >= GOAL) {
      io.emit('launch');
      setTimeout(resetGame, 4000); // pause on the launch animation, then reset
    }
  });

  tiktok.on(ControlEvent.CONNECTED, (state) => {
    console.log(`✅ Connected to @${TIKTOK_USERNAME}'s live room (id: ${state.roomId})`);
  });

  tiktok.on(ControlEvent.DISCONNECTED, () => {
    console.log('⚠️  Disconnected from TikTok Live. Retrying in 10s...');
    setTimeout(connectToTikTok, 10000);
  });

  tiktok.on(ControlEvent.ERROR, (err) => {
    console.error('TikTok connector error:', err?.message || err);
  });

  try {
    await tiktok.connect();
  } catch (err) {
    console.error(`❌ Could not connect (is @${TIKTOK_USERNAME} live right now?):`, err?.message || err);
    console.log('Retrying in 15s...');
    setTimeout(connectToTikTok, 15000);
  }
}

// --- Socket.IO: send current state to any overlay that (re)connects ---
io.on('connection', (socket) => {
  socket.emit('state', { fuel, goal: GOAL });

  // Lets you test the overlay from the browser console without being live:
  // io.emit is also triggered by this for real testing via /test-gift
  socket.on('manual-test-gift', () => {
    fuel = Math.min(GOAL, fuel + 50);
    io.emit('gift', { user: 'TestUser', giftName: 'Rose', value: 50, repeatCount: 1 });
    io.emit('state', { fuel, goal: GOAL });
    if (fuel >= GOAL) {
      io.emit('launch');
      setTimeout(resetGame, 4000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Overlay running at: http://localhost:${PORT}\n`);
  console.log(`   Add this URL as a Browser Source in OBS (size ~800x600).`);
  console.log(`   Open it in a normal browser tab too — click "Test Gift" to try it without going live.\n`);
  connectToTikTok();
});
