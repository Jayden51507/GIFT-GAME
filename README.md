# Kingdom Territory 🏰

A free, live TikTok gift + like-reactive game overlay. Every viewer who
likes your stream claims a colored "territory" blob on a map. Their
territory grows while they keep liking, and shrinks and despawns if they
stop — freeing the spot for someone else. Gifts give an instant big growth
boost, trigger an on-screen popup with the gifter's name/avatar, and are
permanently recorded on a leaderboard (the leaderboard never decays — it's
your proof/record of who gifted what, even after their blob despawns).

## How it works
- `server.js` connects to your **public** TikTok LIVE stream using the
  open-source `tiktok-live-connector` library (no API key needed).
- It listens for `like` and `gift` events, runs a small simulation loop
  (grow on activity, decay over time, despawn when empty), and pushes
  the live map + leaderboard + gift popups to `public/overlay.html` over
  a websocket.
- You add that page as a source in your streaming app (PRISM Live Studio
  on mobile, OBS on desktop) so it appears live on camera.

## Setup
1. Push this project to a **private** GitHub repo.
2. Deploy it to Render (or any Node host) as a Web Service:
   - Build command: `npm install`
   - Start command: `node server.js`
3. Add an environment variable: `TIKTOK_USERNAME` = your TikTok username
   (no @).
4. Deploy — you'll get a URL like `https://your-app.onrender.com`.

## Testing
Open `https://your-app.onrender.com/overlay.html` in a browser. Two
buttons in the bottom-right — **Test Like** and **Test Gift** — simulate
random fake viewers so you can watch blobs spawn/grow/shrink and see
gift popups + leaderboard updates without being live.

## Going live
1. Go live on TikTok first — the connector needs an active stream to
   attach to.
2. Open **PRISM Live Studio** (free, iOS/Android) → My Studio → Widget →
   Web → paste your overlay URL.
3. Position it over your camera preview and go live to TikTok from
   inside PRISM.

## Tuning the game
All the knobs are in the `CONFIG` object at the top of `server.js`:
- `GROWTH_PER_LIKE` — how much a blob grows per like
- `DECAY_PER_SEC` — how fast a blob shrinks when the person stops liking
- `GIFT_ENERGY_PER_DIAMOND` — how big a boost gifts give (relative to
  their diamond value)
- `MIN_RADIUS` / `MAX_RADIUS` — smallest/largest a territory can get
- `LEADERBOARD_SIZE` — how many names show on each leaderboard

Visuals (colors, fonts, card styling, map background) are all in
`public/overlay.html` — plain HTML/CSS/canvas, no build step.

## The "proof" record
Every like and gift is logged with a timestamp in memory and available
as JSON at:
```
https://your-app.onrender.com/log
```
Open that URL any time during or after a stream to see the full event
history — who gifted what, and when.

## Notes
- This uses an **unofficial** connector that reads public live-stream
  data — the standard approach TikTok streamers use for these kinds of
  overlays, not an official TikTok API. If it stops connecting, check
  for a newer version (`npm update`).
- Profile picture support depends on exactly which fields TikTok sends
  in the live event for your account/region — the code tries several
  common field names and falls back to a colored initial if none are
  found. If pictures aren't showing up once you're live, send me a
  screenshot and I can adjust the field lookup.
- Free hosting (Render free tier) sleeps after 15 minutes idle — use
  UptimeRobot (free) to ping `/overlay.html` every 5 minutes during your
  stream window to keep it alive.
