# GW2 Legendary Tracker

A single-page Guild Wars 2 legendary planner (UI in Turkish, item names in English).

**Open it:** https://fscaley.github.io/gw2-legendary-tracker/

- **Bugün (Today):** daily and weekly tasks grouped by where you do them, with step-by-step "how", reset countdowns and the next start of timed events. Tasks the GW2 API can see tick themselves.
- **Şimdiden başla (Start now):** the longest timegates, a Mystic Clover plan, and what is faster to buy with gold than to do.
- **Hedefler (Targets):** component trees for each legendary with what you own, progress, days left and trading post cost.
- **Achievement avcısı (Achievement hunter):** the missing parts of the collections and mastery achievements behind each legendary, easiest first.
- **Ayarlar (Settings):** API key, targets on/off, order, buy-finished toggle, JSON backup.

## Privacy

Your API key is stored only in your browser (`localStorage`) and sent only to `https://api.guildwars2.com`. There is no server. Needed permissions: `account`, `progression`, `inventories`, `wallet`, `unlocks`, `characters` (`tradingpost` optional).

## Data

All game data (recipes, item and achievement IDs, schedules) sits in the `const DATA` block at the top of `index.html`. Mystic Forge recipes are not in the API and come from the [GW2 Wiki](https://wiki.guildwars2.com); the rest was checked against the official API on 4 October 2026. Anything that could not be confirmed is marked "doğrulanmadı" in the page.

The default targets are one player's plan (heavy Obsidian armor, Aurora, Vision, Endless Summer, Conflux, Ad Infinitum, Legendary Relic, Gen 1 weapons); turn them on or off in Settings.

Guild Wars 2 is a trademark of ArenaNet, LLC. This is a fan-made tool, not affiliated with ArenaNet.

## Checking the data

Node 18+ (no dependencies, no API key):

- `node tools/verify.js` checks every item, achievement, currency, map chest, daily craft and Wizard's Vault ID in `DATA` against the official API.
- `node tools/recipecheck.js` compares every recipe in `DATA` with the API recipe or the wiki's `{{Recipe}}` template and lists the differences (vendor and achievement-reward items show up there by design).
