# TikTok Live Gift Rocket 🚀

A free, local gift-reactive game overlay for TikTok LIVE. Every gift adds
"fuel" to a progress bar; when it fills, a rocket launches with confetti,
then the game resets. Runs as an OBS Browser Source.

## How it works
- `server.js` connects to your **public** TikTok LIVE stream using the
  open-source `tiktok-live-connector` library (no API key needed) and
  listens for gift events.
- It forwards those events over a local websocket to `public/overlay.html`.
- You add that page to OBS as a Browser Source, so it shows up in your
  live video as an overlay.

## Setup (one time)
1. Install [Node.js](https://nodejs.org) if you don't have it (v18+).
2. Open a terminal in this folder and run:
   ```
   npm install
   ```
3. Open `server.js` and change this line near the top to your TikTok
   username (no @):
   ```js
   const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME || 'YOUR_TIKTOK_USERNAME';
   ```

## Running it
1. Go live on TikTok first (the library needs your stream to already be live).
2. In the terminal:
   ```
   node server.js
   ```
3. You'll see `Overlay running at: http://localhost:8081`.
4. In OBS: **Sources → + → Browser Source** →
   URL: `http://localhost:8081/overlay.html`, size 800x600, check
   "Shutdown source when not visible" **off**.
5. Gifts on your live stream will now fill the rocket's fuel bar in
   real time.

## Testing without being live
Open `http://localhost:8081/overlay.html` directly in a normal browser
tab and click the **"Test Gift (+50)"** button in the top-right corner —
that simulates a gift so you can see the animation and tune the visuals.
Remove or hide that button (in `overlay.html`) before your real stream
if you don't want it visible on camera — it's outside the 800x600
capture area OBS typically frames, but double check.

## Tuning the game
Open `server.js`:
- `GOAL` — total fuel needed to trigger a launch (currently 1000,
  roughly diamond-value based, so bigger gifts = more fuel).
- Gift value uses TikTok's `diamondCount`, so this scales naturally
  with gift price without you needing to map every gift manually.

Open `public/overlay.html` to restyle: colors, rocket emoji/image,
bar shape, confetti, launch banner text, etc. It's plain HTML/CSS/JS —
no build step.

## Notes & limits
- This uses an **unofficial** connector that reads public live-stream
  data — it's the standard approach TikTok streamers use for chat/gift
  overlays, but it isn't an official TikTok API, so behavior can change
  if TikTok changes their site. If it stops connecting, check for a
  newer version of `tiktok-live-connector` (`npm update`).
- Your TikTok account must be live and gifting-eligible for gifts to fire.
- Everything runs locally — nothing is deployed or hosted, so it's free.

## Next steps if you want to extend it
- Different gift types could trigger different effects (e.g. a
  "Universe" gift instantly fills the bar).
- A leaderboard of top gifters this stream.
- Multiple rounds with increasing goals.
- Sound effects on launch (just drop an audio tag in overlay.html).

Ask me for any of these — the code is small and easy to extend.
