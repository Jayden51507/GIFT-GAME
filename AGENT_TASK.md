# CRYPT RAID — DEVELOPMENT TASK

## IMPORTANT

This is an existing working game.

DO NOT rewrite the project from scratch.

Inspect the repository before making changes.

Preserve all existing functionality.

Do not remove working Socket.IO events.

Do not make unrelated changes.

---

# CURRENT GAME

The game is called CRYPT RAID.

It contains:

- CRYPT CREATURE boss
- Boss HP
- Top 5 gift leaderboard
- Likes
- Gifts
- Rose test gift
- Galaxy test gift
- Multi-player test panel
- Reset button
- Socket.IO
- Canvas battle
- Mobile portrait layout

---

# NEXT FEATURE

Build the first real battle-character system.

The Top 5 gift leaderboard should control five fighters.

Each player in:

state.heroes

should have a corresponding animated fighter on the battlefield.

There should be five possible fighter positions.

When someone enters the Top 5:

→ Their fighter appears.

When someone leaves:

→ Their fighter disappears.

---

# FIGHTERS

For now use stylish 2D neon placeholder characters.

Do NOT require external image assets.

Each fighter needs:

- recognizable silhouette
- player avatar
- player nickname
- rank
- neon glow
- idle animation
- floating/breathing animation

Use the existing CRYPT RAID visual style:

- black
- cyan
- electric purple
- neon green
- magenta
- futuristic circuitry
- glowing effects

---

# COMBAT

When hero-attack fires:

1. Identify the attacking player.
2. Animate that player's fighter.
3. Have the fighter attack CRYPT CREATURE.
4. Create a projectile/effect traveling toward the boss.
5. Create a hit effect.
6. Make the boss react.
7. Return the fighter to idle.

---

# GIFTS

Existing gifts must continue working.

Rose:

→ normal attack

Galaxy:

→ powerful attack

Powerful gifts should produce noticeably larger visual effects.

---

# LIKES

Likes should continue adding players to THE CRYPT ARMY.

Create a satisfying heart/particle effect.

---

# DO NOT BREAK

Preserve these existing events:

raid-state
gift-event
like-event
hero-attack
boss-hit
boss-phase
boss-defeated
new-round
raid-reset
manual-test-like
manual-test-gift
manual-test-reset

The test panel must continue working.

The test button must continue working.

Reset must continue working.

---

# MOBILE

The game is designed for iPhone portrait first.

Requirements:

- no horizontal scrolling
- no broken viewport
- fighters fit on screen
- boss remains visible
- Top 5 remains usable
- test panel remains usable
- no elements pushed off-screen

---

# ARCHITECTURE

Make the fighter system modular.

Later we will replace the placeholder fighters with actual character artwork.

Do not hard-code the fighters in a way that requires rewriting the game.

---

# TESTING

After implementing:

1. Run the project.
2. Check browser console for errors.
3. Open the test panel.
4. Test Like.
5. Test Rose.
6. Test Galaxy.
7. Test Reset.
8. Verify Top 5 changes.
9. Verify fighters appear.
10. Verify fighters attack.
11. Verify boss HP changes.
12. Verify fighters disappear when they leave Top 5.

Fix any errors before finishing.

---

# FINAL RESPONSE

When finished, report:

1. Files changed.
2. Features implemented.
3. Tests performed.
4. Any remaining issues.

Do not make unrelated changes.
