const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} = require("tiktok-live-connector");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8081;
const TIKTOK_USERNAME =
  process.env.TIKTOK_USERNAME || "YOUR_TIKTOK_USERNAME";

// =====================================================
// FRONTEND
// =====================================================

// The repository contains the game HTML as:
// Public
//
// It is a FILE, not a folder.
const GAME_FILE = path.join(__dirname, "Public");

app.use(express.json());

app.get("/", (req, res) => {
  res.type("html");
  res.sendFile(GAME_FILE);
});

app.get("/overlay.html", (req, res) => {
  res.type("html");
  res.sendFile(GAME_FILE);
});

// =====================================================
// GAME CONFIG
// =====================================================

const CONFIG = {
  MAP_W: 800,
  MAP_H: 600,

  MIN_RADIUS: 22,
  MAX_RADIUS: 130,

  GROWTH_PER_LIKE: 2.2,
  DECAY_PER_SEC: 3.5,

  TICK_MS: 200,
  DESPAWN_BELOW: 1,

  GIFT_ENERGY_PER_DIAMOND: 5,

  LEADERBOARD_SIZE: 5,
  LOG_MAX: 500
};

const PALETTE = [
  "#e63946",
  "#457b9d",
  "#2a9d8f",
  "#f4a261",
  "#9d4edd",
  "#ffb703",
  "#06d6a0",
  "#ef476f",
  "#118ab2",
  "#e76f51"
];

// =====================================================
// GAME STATE
// =====================================================

const blobs = new Map();
const giftTotals = new Map();
const likeTotals = new Map();
const eventLog = [];

let colorCursor = 0;

function nextColor() {
  const color =
    PALETTE[colorCursor % PALETTE.length];

  colorCursor++;

  return color;
}

function randomSpawnPoint() {
  const pad = CONFIG.MAX_RADIUS * 0.6;

  return {
    x:
      pad +
      Math.random() *
        (CONFIG.MAP_W - pad * 2),

    y:
      pad +
      Math.random() *
        (CONFIG.MAP_H - pad * 2)
  };
}

function extractAvatarUrl(user) {
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

function getOrCreateBlob(
  uniqueId,
  nickname,
  avatarUrl
) {
  let blob = blobs.get(uniqueId);

  if (!blob) {
    const spawn = randomSpawnPoint();

    blob = {
      uniqueId,
      nickname: nickname || uniqueId,
      avatarUrl: avatarUrl || null,
      color: nextColor(),
      energy: 0,
      x: spawn.x,
      y: spawn.y,
      lastGiftAt: 0
    };

    blobs.set(uniqueId, blob);
  } else {
    if (nickname) {
      blob.nickname = nickname;
    }

    if (avatarUrl) {
      blob.avatarUrl = avatarUrl;
    }
  }

  return blob;
}

function radiusForEnergy(energy) {
  const radius =
    CONFIG.MIN_RADIUS +
    Math.sqrt(Math.max(0, energy)) * 6;

  return Math.min(
    CONFIG.MAX_RADIUS,
    radius
  );
}

function pushLog(entry) {
  eventLog.push({
    ...entry,
    ts: Date.now()
  });

  if (eventLog.length > CONFIG.LOG_MAX) {
    eventLog.shift();
  }
}

function topN(map, key, n) {
  return [...map.entries()]
    .map(([uniqueId, value]) => ({
      uniqueId,
      ...value
    }))
    .sort(
      (a, b) => b[key] - a[key]
    )
    .slice(0, n);
}

function mapSnapshot() {
  return [...blobs.values()].map(
    blob => ({
      uniqueId: blob.uniqueId,
      nickname: blob.nickname,
      avatarUrl: blob.avatarUrl,
      color: blob.color,
      x: blob.x,
      y: blob.y,
      radius:
        radiusForEnergy(blob.energy),
      recentlyGifted:
        Date.now() -
          blob.lastGiftAt <
        3000
    })
  );
}

function broadcastLeaderboard() {
  io.emit("leaderboard", {
    topGifters: topN(
      giftTotals,
      "diamonds",
      CONFIG.LEADERBOARD_SIZE
    ),

    topLikers: topN(
      likeTotals,
      "likes",
      CONFIG.LEADERBOARD_SIZE
    )
  });
}

// =====================================================
// GAME LOOP
// =====================================================

setInterval(() => {
  const decay =
    CONFIG.DECAY_PER_SEC *
    (CONFIG.TICK_MS / 1000);

  for (const [uniqueId, blob] of blobs) {
    blob.energy = Math.max(
      0,
      blob.energy - decay
    );

    if (
      blob.energy <
      CONFIG.DESPAWN_BELOW
    ) {
      blobs.delete(uniqueId);
    }
  }

  io.emit(
    "map",
    mapSnapshot()
  );
}, CONFIG.TICK_MS);

// =====================================================
// TEST DATA
// =====================================================

const TEST_NAMES = [
  "Skywalker22",
  "DragonQueen",
  "PixelPete",
  "MoonlitFox",
  "BardOfNorth",
  "RubyRaven",
  "ThornKnight"
];

const TEST_GIFTS = [
  {
    name: "Rose",
    diamonds: 1
  },
  {
    name: "Heart",
    diamonds: 5
  },
  {
    name: "GG",
    diamonds: 25
  },
  {
    name: "Galaxy",
    diamonds: 1000
  }
];

// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", socket => {
  console.log(
    "Browser connected:",
    socket.id
  );

  socket.emit(
    "map",
    mapSnapshot()
  );

  socket.emit(
    "leaderboard",
    {
      topGifters: topN(
        giftTotals,
        "diamonds",
        CONFIG.LEADERBOARD_SIZE
      ),

      topLikers: topN(
        likeTotals,
        "likes",
        CONFIG.LEADERBOARD_SIZE
      )
    }
  );

  // ===================================================
  // TEST LIKE
  // ===================================================

  socket.on(
    "manual-test-like",
    () => {
      const name =
        TEST_NAMES[
          Math.floor(
            Math.random() *
              TEST_NAMES.length
          )
        ];

      const uniqueId =
        "test_" + name;

      const blob =
        getOrCreateBlob(
          uniqueId,
          name,
          null
        );

      blob.energy +=
        5 *
        CONFIG.GROWTH_PER_LIKE;

      const totals =
        likeTotals.get(
          uniqueId
        ) || {
          nickname: name,
          avatarUrl: null,
          likes: 0
        };

      totals.likes += 5;

      likeTotals.set(
        uniqueId,
        totals
      );

      pushLog({
        type: "like",
        uniqueId,
        nickname: name,
        value: 5
      });

      broadcastLeaderboard();

      io.emit(
        "map",
        mapSnapshot()
      );

      console.log(
        "TEST LIKE:",
        name
      );
    }
  );

  // ===================================================
  // TEST GIFT
  // ===================================================

  socket.on(
    "manual-test-gift",
    () => {
      const name =
        TEST_NAMES[
          Math.floor(
            Math.random() *
              TEST_NAMES.length
          )
        ];

      const uniqueId =
        "test_" + name;

      const gift =
        TEST_GIFTS[
          Math.floor(
            Math.random() *
              TEST_GIFTS.length
          )
        ];

      const blob =
        getOrCreateBlob(
          uniqueId,
          name,
          null
        );

      blob.energy +=
        gift.diamonds *
        CONFIG.GIFT_ENERGY_PER_DIAMOND;

      blob.lastGiftAt =
        Date.now();

      const totals =
        giftTotals.get(
          uniqueId
        ) || {
          nickname: name,
          avatarUrl: null,
          diamonds: 0
        };

      totals.diamonds +=
        gift.diamonds;

      giftTotals.set(
        uniqueId,
        totals
      );

      pushLog({
        type: "gift",
        uniqueId,
        nickname: name,
        value: gift.diamonds,
        giftName: gift.name,
        repeatCount: 1
      });

      io.emit(
        "gift-popup",
        {
          uniqueId,
          nickname: name,
          avatarUrl: null,
          giftName: gift.name,
          value: gift.diamonds,
          repeatCount: 1
        }
      );

      broadcastLeaderboard();

      io.emit(
        "map",
        mapSnapshot()
      );

      console.log(
        "TEST GIFT:",
        name,
        gift.name
      );
    }
  );
});

// =====================================================
// LOG
// =====================================================

app.get(
  "/log",
  (req, res) => {
    res.json(eventLog);
  }
);

// =====================================================
// TIKTOK
// =====================================================

let tiktok = null;
let reconnectTimer = null;

async function connectToTikTok() {
  if (
    !TIKTOK_USERNAME ||
    TIKTOK_USERNAME ===
      "YOUR_TIKTOK_USERNAME"
  ) {
    console.log(
      "TikTok disabled — no username configured."
    );

    return;
  }

  try {
    tiktok =
      new TikTokLiveConnection(
        TIKTOK_USERNAME,
        {}
      );

    // =================================================
    // LIKES
    // =================================================

    tiktok.on(
      WebcastEvent.LIKE,
      data => {
        const uniqueId =
          data.user?.uniqueId ||
          data.user?.userId ||
          "unknown";

        const nickname =
          data.user?.nickname ||
          uniqueId;

        const avatarUrl =
          extractAvatarUrl(
            data.user
          );

        const likeCount =
          data.likeCount || 1;

        const blob =
          getOrCreateBlob(
            uniqueId,
            nickname,
            avatarUrl
          );

        blob.energy +=
          likeCount *
          CONFIG.GROWTH_PER_LIKE;

        const totals =
          likeTotals.get(
            uniqueId
          ) || {
            nickname,
            avatarUrl,
            likes: 0
          };

        totals.likes +=
          likeCount;

        totals.nickname =
          nickname;

        if (avatarUrl) {
          totals.avatarUrl =
            avatarUrl;
        }

        likeTotals.set(
          uniqueId,
          totals
        );

        pushLog({
          type: "like",
          uniqueId,
          nickname,
          value: likeCount
        });

        broadcastLeaderboard();
      }
    );

    // =================================================
    // GIFTS
    // =================================================

    tiktok.on(
      WebcastEvent.GIFT,
      data => {
        if (
          data.giftType === 1 &&
          !data.repeatEnd
        ) {
          return;
        }

        const uniqueId =
          data.user?.uniqueId ||
          data.user?.userId ||
          "unknown";

        const nickname =
          data.user?.nickname ||
          uniqueId;

        const avatarUrl =
          extractAvatarUrl(
            data.user
          );

        const diamondValue =
          (data.diamondCount || 1) *
          (data.repeatCount || 1);

        const blob =
          getOrCreateBlob(
            uniqueId,
            nickname,
            avatarUrl
          );

        blob.energy +=
          diamondValue *
          CONFIG.GIFT_ENERGY_PER_DIAMOND;

        blob.lastGiftAt =
          Date.now();

        const totals =
          giftTotals.get(
            uniqueId
          ) || {
            nickname,
            avatarUrl,
            diamonds: 0
          };

        totals.diamonds +=
          diamondValue;

        totals.nickname =
          nickname;

        if (avatarUrl) {
          totals.avatarUrl =
            avatarUrl;
        }

        giftTotals.set(
          uniqueId,
          totals
        );

        pushLog({
          type: "gift",
          uniqueId,
          nickname,
          value: diamondValue,
          giftName:
            data.giftName,
          repeatCount:
            data.repeatCount
        });

        io.emit(
          "gift-popup",
          {
            uniqueId,
            nickname,
            avatarUrl,
            giftName:
              data.giftName,
            value:
              diamondValue,
            repeatCount:
              data.repeatCount
          }
        );

        broadcastLeaderboard();
      }
    );

    // =================================================
    // CONNECTION EVENTS
    // =================================================

    tiktok.on(
      ControlEvent.CONNECTED,
      state => {
        console.log(
          `TikTok connected: @${TIKTOK_USERNAME}`
        );

        console.log(
          `Room ID: ${state.roomId}`
        );
      }
    );

    tiktok.on(
      ControlEvent.DISCONNECTED,
      () => {
        console.log(
          "TikTok disconnected."
        );

        scheduleTikTokReconnect();
      }
    );

    tiktok.on(
      ControlEvent.ERROR,
      error => {
        console.error(
          "TikTok error:",
          error?.info ||
            error?.message ||
            error
        );
      }
    );

    await tiktok.connect();

  } catch (error) {
    console.error(
      "TikTok connection failed:",
      error?.info ||
        error?.message ||
        error
    );

    scheduleTikTokReconnect();
  }
}

function scheduleTikTokReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer =
    setTimeout(
      () => {
        reconnectTimer = null;
        connectToTikTok();
      },
      15000
    );
}

// =====================================================
// START SERVER
// =====================================================

server.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "🏰 GIFT GAME IS RUNNING"
    );

    console.log(
      `Game: http://localhost:${PORT}/`
    );

    console.log(
      `Overlay: http://localhost:${PORT}/overlay.html`
    );

    console.log(
      `Log: http://localhost:${PORT}/log`
    );

    console.log("");

    // TikTok is optional.
    // The game MUST start without TikTok.
    connectToTikTok();
  }
);
