// The skin each wearable part unlocks (API item details.default_skin), so the page can count a part as done when
// the account has the skin unlocked (/v2/account/skins) - e.g. collections that are missing from the API.
// Writes the PART_SKINS block of index.html: { "Part name": skinId }.
const { loadData, apiIds, writeBlock } = require('./lib');

(async () => {
  const DATA = loadData();
  // only collection pieces: a skin unlock fills a collection part, but an ingredient (a weapon forged into another one)
  // is used up, so its unlocked skin says nothing about owning it
  const pieces = new Set();
  for (const p of Object.values(DATA.parts)) {
    for (const b of p.bits || []) pieces.add(b[0]);
    if (!p.id && !p.ach && !p.cur) for (const [c] of p.in || []) pieces.add(c);   // collections the API lacks (e.g. Forge Guard's Armor Collection)
  }
  const roots = new Set(DATA.targets.map(t => t.root));
  const byId = {};
  for (const [n, p] of Object.entries(DATA.parts)) if (p.id && pieces.has(n) && !roots.has(n)) (byId[p.id] = byId[p.id] || []).push(n);
  const items = await apiIds('/v2/items', Object.keys(byId).map(Number));
  const out = {};
  for (const it of items) {
    const sk = it.default_skin || (it.details && it.details.default_skin);
    if (!sk || !['Armor', 'Weapon', 'Back'].includes(it.type)) continue;
    for (const n of byId[it.id]) if (n === it.name) out[n] = sk;
  }
  const keys = Object.keys(out).sort();
  console.log('parts with a skin', keys.length);
  const body = "// Part -> the skin it unlocks (API default_skin; tools/gen/skins.js). An unlocked skin counts as the part.\nconst PART_SKINS = {\n" +
    keys.map(k => `  ${JSON.stringify(k)}: ${out[k]}`).join(',\n') + '\n};';
  writeBlock('skins', body);
})().catch(e => { console.error(e.message); process.exit(1); });
