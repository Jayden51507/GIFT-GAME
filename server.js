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
// CRYPT RAID CONFIG
// =====================================================

const CONFIG = {
  BOSS_MAX_HP: 100000,

  TICK_MS: 500,

  HERO_COUNT: 5,

  // Likes don't directly destroy the boss.
  // They create participation and a raid crowd.
  LIKE_POWER: 1,

  // Controls how quickly gifted heroes attack.
  HERO_DAMAGE_MULTIPLIER: 3,

  // Maximum number of visible crowd members.
  MAX_LIKERS: 250,

  // How long a liker remains active.
  LIKER_ACTIVE_MS: 30000,

  LOG_MAX: 500
};

// =====================================================
// TEST PLAYERS
// =====================================================

const TEST_PLAYERS = [
  {
    id: "test_jayden",
    nickname: "Jayden",
    avatarUrl: null
  },
  {
    id: "test_sarah",
    nickname: "Sarah",
    avatarUrl: null
  },
  {
    id: "test_mike",
    nickname: "Mike",
    avatarUrl: null
  },
  {
    id: "test_alex",
    nickname: "Alex",
    avatarUrl: null
  },
  {
    id: "test_josh",
    nickname: "Josh",
    avatarUrl: null
  },
  {
    id: "test_emma",
    nickname: "Emma",
    avatarUrl: null
  },
  {
    id: "test_daniel",
    nickname: "Daniel",
    avatarUrl: null
  }
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
// GAME STATE
// =====================================================

let roundNumber = 1;

const boss = {
  name: "CRYPT Creature",
  maxHp: CONFIG.BOSS_MAX_HP,
  hp: CONFIG.BOSS_MAX_HP,
  phase: 1,
  defeated: false
};

// All people who have gifted.
const players = new Map();

// All people who have liked.
const likers = new Map();

const eventLog = [];

// =====================================================
// UTILITIES
// =====================================================

function pushLog(entry) {
  eventLog.push({
    ...entry,
    ts: Date.now()
  });

  if (eventLog.length > CONFIG.LOG_MAX) {
    eventLog.shift();
  }
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

function getOrCreatePlayer(
  uniqueId,
  nickname,
  avatarUrl
) {
  let player = players.get(uniqueId);

  if (!player) {
    player = {
      uniqueId,
      nickname: nickname || uniqueId,
      avatarUrl: avatarUrl || null,

      diamonds: 0,

      likes: 0,

      createdAt: Date.now(),

      lastGiftAt: 0,

      lastLikeAt: 0
    };

    players.set(uniqueId, player);
  }

  if (nickname) {
    player.nickname = nickname;
  }

  if (avatarUrl) {
    player.avatarUrl = avatarUrl;
  }

  return player;
}

function getTopGifters() {
  return [...players.values()]
    .sort((a, b) => b.diamonds - a.diamonds)
    .slice(0, CONFIG.HERO_COUNT)
    .map((player, index) => ({
      uniqueId: player.uniqueId,
      nickname: player.nickname,
      avatarUrl: player.avatarUrl,
      diamonds: player.diamonds,
      likes: player.likes,
      rank: index + 1,

      // Used by the frontend to determine attack strength.
      power: Math.max(1, player.diamonds),

      recentlyGifted:
        Date.now() - player.lastGiftAt < 3000
    }));
}

function getActiveLikers() {
  const now = Date.now();

  return [...likers.values()]
    .filter(
      liker =>
        now - liker.lastLikeAt <
        CONFIG.LIKER_ACTIVE_MS
    )
    .sort(
      (a, b) =>
        b.lastLikeAt - a.lastLikeAt
    )
    .slice(0, CONFIG.MAX_LIKERS)
    .map(liker => ({
      uniqueId: liker.uniqueId,
      nickname: liker.nickname,
      avatarUrl: liker.avatarUrl,
      likes: liker.likes
    }));
}

function getBossPhase() {
  const percent =
    boss.hp / boss.maxHp;

  if (percent <= 0.25) {
    return 4;
  }

  if (percent <= 0.5) {
    return 3;
  }

  if (percent <= 0.75) {
    return 2;
  }

  return 1;
}

function getBossPercent() {
  return Math.max(
    0,
    Math.min(
      100,
      (boss.hp / boss.maxHp) * 100
    )
  );
}

function createState() {
  boss.phase = getBossPhase();

  return {
    roundNumber,

    boss: {
      name: boss.name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      percent: getBossPercent(),
      phase: boss.phase,
      defeated: boss.defeated
    },

    heroes: getTopGifters(),

    likers: getActiveLikers(),

    testPlayers: TEST_PLAYERS,

    timestamp: Date.now()
  };
}

function broadcastState() {
  io.emit(
    "raid-state",
    createState()
  );
}

function damageBoss(
  amount,
  attacker = null
) {
  if (boss.defeated) {
    return;
  }

  const damage = Math.max(
    1,
    Math.floor(amount)
  );

  boss.hp = Math.max(
    0,
    boss.hp - damage
  );

  const oldPhase = boss.phase;

  boss.phase = getBossPhase();

  io.emit("boss-hit", {
    damage,
    attacker,
    hp: boss.hp,
    maxHp: boss.maxHp,
    percent: getBossPercent(),
    phase: boss.phase
  });

  if (boss.phase !== oldPhase) {
    io.emit("boss-phase", {
      phase: boss.phase
    });

    pushLog({
      type: "boss-phase",
      phase: boss.phase
    });
  }

  if (boss.hp <= 0) {
    defeatBoss();
  }
}

function defeatBoss() {
  if (boss.defeated) {
    return;
  }

  boss.defeated = true;
  boss.hp = 0;

  io.emit("boss-defeated", {
    roundNumber,
    heroes: getTopGifters()
  });

  pushLog({
    type: "boss-defeated",
    roundNumber
  });

  // New boss after a short celebration.
  setTimeout(() => {
    startNewRound();
  }, 5000);
}

function startNewRound() {
  roundNumber++;

  boss.hp = boss.maxHp;
  boss.phase = 1;
  boss.defeated = false;

  io.emit("new-round", {
    roundNumber,
    boss: {
      name: boss.name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      phase: boss.phase
    }
  });

  pushLog({
    type: "new-round",
    roundNumber
  });

  broadcastState();
}

// =====================================================
// HERO ATTACK LOOP
// =====================================================

setInterval(() => {
  if (boss.defeated) {
    return;
  }

  const heroes = getTopGifters();

  for (const hero of heroes) {
    if (hero.diamonds <= 0) {
      continue;
    }

    /*
      Very simple damage formula.

      More gifted diamonds =
      more hero power =
      more damage.
    */

    const damage =
      Math.max(
        1,
        Math.floor(
          Math.sqrt(hero.diamonds) *
            CONFIG.HERO_DAMAGE_MULTIPLIER
        )
      );

    damageBoss(
      damage,
      {
        uniqueId: hero.uniqueId,
        nickname: hero.nickname,
        rank: hero.rank,
        avatarUrl: hero.avatarUrl
      }
    );

    io.emit("hero-attack", {
      uniqueId: hero.uniqueId,
      nickname: hero.nickname,
      rank: hero.rank,
      avatarUrl: hero.avatarUrl,
      damage
    });

    if (boss.defeated) {
      break;
    }
  }
}, CONFIG.TICK_MS);

// =====================================================
// LIKE HANDLER
// =====================================================

function processLike({
  uniqueId,
  nickname,
  avatarUrl,
  likeCount
}) {
  const player =
    getOrCreatePlayer(
      uniqueId,
      nickname,
      avatarUrl
    );

  const amount =
    Math.max(
      1,
      Number(likeCount) || 1
    );

  player.likes += amount;
  player.lastLikeAt = Date.now();

  likers.set(uniqueId, {
    uniqueId,
    nickname: player.nickname,
    avatarUrl: player.avatarUrl,
    likes: player.likes,
    lastLikeAt: Date.now()
  });

  pushLog({
    type: "like",
    uniqueId,
    nickname: player.nickname,
    value: amount
  });

  io.emit("like-event", {
    uniqueId,
    nickname: player.nickname,
    avatarUrl: player.avatarUrl,
    likes: player.likes,
    value: amount
  });

  broadcastState();
}

// =====================================================
// GIFT HANDLER
// =====================================================

function processGift({
  uniqueId,
  nickname,
  avatarUrl,
  giftName,
  diamonds,
  repeatCount
}) {
  const player =
    getOrCreatePlayer(
      uniqueId,
      nickname,
      avatarUrl
    );

  const value =
    Math.max(
      1,
      Number(diamonds) || 1
    );

  player.diamonds += value;

  player.lastGiftAt =
    Date.now();

  pushLog({
    type: "gift",

    uniqueId,

    nickname: player.nickname,

    giftName:
      giftName || "Gift",

    value,

    repeatCount:
      repeatCount || 1
  });

  io.emit("gift-event", {
    uniqueId,
    nickname: player.nickname,
    avatarUrl: player.avatarUrl,

    giftName:
      giftName || "Gift",

    value,

    repeatCount:
      repeatCount || 1
  });

  /*
    Important:

    The gift itself does NOT instantly destroy
    the boss.

    Instead it increases the hero's power.

    The hero then attacks automatically.
  */

  broadcastState();
}

// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", socket => {
  console.log(
    "Browser connected:",
    socket.id
  );

  // Send current state immediately.
  socket.emit(
    "raid-state",
    createState()
  );

  // ===================================================
  // TEST LIKE
  // ===================================================

  socket.on(
    "manual-test-like",
    payload => {
      let testPlayer;

      if (
        payload &&
        payload.playerId
      ) {
        testPlayer =
          TEST_PLAYERS.find(
            player =>
              player.id ===
              payload.playerId
          );
      }

      // If no player was specified,
      // use the first test player.
      if (!testPlayer) {
        testPlayer =
          TEST_PLAYERS[0];
      }

      processLike({
        uniqueId:
          testPlayer.id,

        nickname:
          testPlayer.nickname,

        avatarUrl:
          testPlayer.avatarUrl,

        likeCount:
          payload?.amount || 1
      });

      console.log(
        "TEST LIKE:",
        testPlayer.nickname
      );
    }
  );

  // ===================================================
  // TEST GIFT
  // ===================================================

  socket.on(
    "manual-test-gift",
    payload => {
      let testPlayer;

      if (
        payload &&
        payload.playerId
      ) {
        testPlayer =
          TEST_PLAYERS.find(
            player =>
              player.id ===
              payload.playerId
          );
      }

      if (!testPlayer) {
        testPlayer =
          TEST_PLAYERS[0];
      }

      const gift =
        payload?.gift || null;

      const diamonds =
        payload?.diamonds ||
        gift?.diamonds ||
        1;

      const giftName =
        payload?.giftName ||
        gift?.name ||
        "Rose";

      processGift({
        uniqueId:
          testPlayer.id,

        nickname:
          testPlayer.nickname,

        avatarUrl:
          testPlayer.avatarUrl,

        giftName,

        diamonds,

        repeatCount: 1
      });

      console.log(
        "TEST GIFT:",
        testPlayer.nickname,
        giftName,
        diamonds
      );
    }
  );

  // ===================================================
  // TEST RESET
  // ===================================================

  socket.on(
    "manual-test-reset",
    () => {
      players.clear();
      likers.clear();

      roundNumber = 1;

      boss.hp =
        boss.maxHp;

      boss.phase = 1;

      boss.defeated = false;

      io.emit(
        "raid-reset"
      );

      broadcastState();

      console.log(
        "TEST RAID RESET"
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
// TEST API
// =====================================================

app.get(
  "/test/players",
  (req, res) => {
    res.json(
      TEST_PLAYERS
    );
  }
);

app.get(
  "/test/state",
  (req, res) => {
    res.json(
      createState()
    );
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
    // REAL LIKES
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

        processLike({
          uniqueId,
          nickname,
          avatarUrl,
          likeCount
        });
      }
    );

    // =================================================
    // REAL GIFTS
    // =================================================

    tiktok.on(
      WebcastEvent.GIFT,
      data => {
        /*
          TikTok can send intermediate events for
          streakable gifts.

          We only process the final event.
        */

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

        processGift({
          uniqueId,
          nickname,
          avatarUrl,

          giftName:
            data.giftName ||
            "Gift",

          diamonds:
            diamondValue,

          repeatCount:
            data.repeatCount || 1
        });
      }
    );

    // =================================================
    // CONNECTION
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
      "⚡ CRYPT RAID IS RUNNING"
    );

    console.log(
      `Game: http://localhost:${PORT}/`
    );

    console.log(
      `Overlay: http://localhost:${PORT}/overlay.html`
    );

    console.log(
      `State: http://localhost:${PORT}/test/state`
    );

    console.log("");

    connectToTikTok();
  }
);
