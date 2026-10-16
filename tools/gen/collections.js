// Expand every collection achievement in DATA into what its missing parts cost.
// Sources, in order: trading post (a leaf: buy it), official API recipe, the wiki's vendor data ("Sells item" +
// "Has item cost"), the wiki's Mystic Forge {{Recipe}}, otherwise a drop / event reward (leaf with the item's description).
// Skin pieces are resolved to the item that unlocks them ("Has skin"). Writes the COLLECTIONS block of index.html:
// parts (only names DATA.parts does not define by hand) and bits (achievement -> [[part, qty, bit index]]).
// Hand fixes do not go here: define the part in DATA.parts (it wins), or add DATA.parts[ach].bitsExtra.
const { loadData, api, apiIds, ask, wikiRaw, writeBlock, saveCache } = require('./lib');

const DATA = loadData({ without: ['collections', 'vendorreqs', 'skins'] });
const items = {}, priced = {};
async function loadItems(ids) {
  ids = [...new Set(ids)].filter(i => i && !items[i]);
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    for (const x of (await api('/v2/items?ids=' + chunk.join(','))) || []) items[x.id] = x;
    for (const x of (await api('/v2/commerce/prices?ids=' + chunk.join(','))) || []) priced[x.id] = !!(x.sells && x.sells.unit_price);
  }
}
const currencies = {}, curByName = {};

async function vendorOffers(name) {
  const j = await ask(`[[Sells item::${name}]]|?Has item cost|?Located in|limit=50`);
  const res = j && j.query && j.query.results && !Array.isArray(j.query.results) ? Object.entries(j.query.results) : [];
  const offers = [];
  for (const [vendor, v] of res) {
    const cost = (v.printouts['Has item cost'] || []).map(c => ({ n: +((c['Has item value'] || {}).item || [0])[0], what: ((c['Has item currency'] || {}).item || [''])[0] }));
    if (!cost.length) continue;
    offers.push({ vendor: vendor.split('#')[0], where: ((v.printouts['Located in'] || [])[0] || {}).fulltext || '', cost });
  }
  return offers;
}
function forgeRecipe(raw) {
  if (!raw) return null;
  for (const blk of raw.split(/\{\{\s*recipe/i).slice(1)) {
    if (!/source\s*=\s*mystic forge/i.test(blk.split('}}')[0])) continue;
    const ing = [...blk.matchAll(/\|\s*ingredient\d\s*=\s*([0-9,]+)\s+([^\n|}]+)/g)].map(m => [m[2].trim(), +m[1].replace(/,/g, '')]);
    if (ing.length) return ing;
  }
  return null;
}

const parts = {};
const report = { api: 0, vendor: 0, forge: 0, tp: 0, leaf: 0, skinItem: 0, skinNone: 0, text: 0 };
const ALIAS = { 'Ectoplasm': 'Glob of Ectoplasm', 'Globs of Ectoplasm': 'Glob of Ectoplasm' };
async function idByName(name) {
  name = ALIAS[name] || name;
  const raw = await wikiRaw(name);
  const m = raw && raw.match(/\|\s*id\s*=\s*([0-9]+)/);
  return m ? +m[1] : null;
}
function addCurrencyPart(curName) {
  const c = curByName[curName.toLowerCase()] || curByName[curName.toLowerCase().replace(/s$/, '')];
  if (!c) return null;
  if (!parts[c.name] && !DATA.parts[c.name]) parts[c.name] = { cur: c.id, src: 'Wallet' };
  return c.name;
}
async function resolveItem(id, depth = 0) {
  await loadItems([id]);
  const it = items[id]; if (!it) return null;
  const name = it.name;
  if (DATA.parts[name] && DATA.parts[name].id === id) return name;          // modelled by hand
  if (parts[name]) return name;
  parts[name] = { id, src: '' };                                             // reserve (cycles)
  if (priced[id]) { parts[name].src = 'TP'; report.tp++; return name; }
  if (depth > 6) { parts[name].src = 'kaynak derin — elle bak'; return name; }
  // 1) official recipe
  const rids = await api('/v2/recipes/search?output=' + id);
  if (rids && rids.length) {
    const r = await api('/v2/recipes/' + rids[0]);
    if (r) {
      const kids = [];
      for (const g of r.ingredients) {
        const gid = g.id ?? g.item_id;
        if (g.type === 'Currency') { const c = currencies[gid]; if (c) { const cn = addCurrencyPart(c.name); if (cn) kids.push([cn, g.count]); } continue; }
        const kn = await resolveItem(gid, depth + 1); if (kn) kids.push([kn, g.count]);
      }
      parts[name] = { id, src: 'Craft: ' + r.disciplines.join('/') + ' ' + r.min_rating, in: kids };
      report.api++; return name;
    }
  }
  // 2) vendor; festival and gem-store vendors only when nothing else exists (then not at all)
  const FEST = /Dragon Bash|Festival|Wintersday|Halloween|Mad King|Lunar|Super Adventure|Four Winds|Black Lion|Commemorative/i;
  let offers = await vendorOffers(name);
  const steady = offers.filter(o => !FEST.test(o.vendor) && !FEST.test(o.where));
  offers = steady.length ? steady : [];
  if (offers.length) {
    offers.sort((a, b) => a.cost.length - b.cost.length);
    const o = offers[0], kids = [], unresolved = [];
    for (const c of o.cost) {
      if (!c.what) continue;
      if (/^gold$/i.test(c.what)) { kids.push(['Coin', c.n * 10000]); continue; }   // wiki gives gold, the page counts copper
      const cn = addCurrencyPart(c.what);
      if (cn) { kids.push([cn, c.n]); continue; }
      const cid = await idByName(c.what);
      if (cid) { const kn = await resolveItem(cid, depth + 1); if (kn) { kids.push([kn, c.n]); continue; } }
      unresolved.push(c.n + ' ' + c.what);
    }
    parts[name] = { id, src: 'Vendor: ' + o.vendor + (o.where ? ' (' + o.where + ')' : '') + (unresolved.length ? '; ayrıca: ' + unresolved.join(', ') : ''), in: kids.length ? kids : undefined };
    report.vendor++; return name;
  }
  // 3) Mystic Forge recipe on the wiki
  const fr = forgeRecipe(await wikiRaw(name));
  if (fr) {
    const kids = [];
    for (const [n, q] of fr) {
      const cn = addCurrencyPart(n); if (cn) { kids.push([cn, q]); continue; }
      const cid = await idByName(n); if (cid) { const kn = await resolveItem(cid, depth + 1); if (kn) kids.push([kn, q]); }
    }
    parts[name] = { id, src: 'Mystic Forge', in: kids.length ? kids : undefined }; report.forge++; return name;
  }
  // 4) drop / event / achievement reward
  const d = (it.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  parts[name] = { id, src: d ? d.slice(0, 220) : 'Drop / event' }; report.leaf++;
  return name;
}

// requirements a trophy's vendor price hides (wiki notes), and what each extra child is
const EXTRA = {
  "Vision of Equipment: Astral Weapons": [[85804, 6], ["Astral weapon recipes", 1]],
  "Vision of Equipment: Dragonsblood Weapons": [[89774, 6]],
  "Vision of Equipment: Dragon Champion Armor": [["Mist Shard armor (heavy, 6 parça)", 1]],
  "Vision of Equipment: Elegy Armor": [["The Convergence of Sorrow I: Elegy", 1]],
  "Vision of Equipment: Olmakhan Bandolier": [[87225, 1]],
};
const EXTRA_NOTE = {
  "Vision of Equipment: Astral Weapons": "6 farklı Astral ya da Stellar silah craft et (fiyat örnek olarak dagger ile); sonra Yasna'dan al",
  "Vision of Equipment: Dragonsblood Weapons": "6 FARKLI türde Dragonsblood silah craft et (fiyat örnek olarak dagger ile); sonra Forge Master Hilina'dan al",
  "Vision of Equipment: Dragon Champion Armor": "Bir ağırlıkta Tier 1 Mist Shard seti; sonra Traveling Elonian Trader'dan al",
  "Vision of Equipment: Elegy Armor": "The Convergence of Sorrow I: Elegy bitince Amira'dan al",
  "Vision of Equipment: Olmakhan Bandolier": "Reinforced Olmakhan Bandolier'ı edin (Trance Stone'dan sonra yapılırsa kendiliğinden gelir)",
};
const LIFE = {
  'Lifeblood of Ignaxious': "Defeat Ignaxious (Heitor's Gate, Inner Nayos)", 'Lifeblood of Galene the Seething': "Defeat Galene the Seething (Droknar's Light, Skywatch Archipelago)",
  'Lifeblood of Nourys, Eyes of the Abyss': 'Defeat Nourys (The World Spire, Amnytas meta)', 'Lifeblood of Pherus the Subjugator': 'Defeat Pherus the Subjugator (Nyedra, Inner Nayos)',
  'Lifeblood of Knaebelag the Terror': 'The Fangs That Gnash metası (Nyedra Surrounds, Inner Nayos)', 'Lifeblood of Myros the Spiteful': 'Kryptis devriye liderleri (The Bleeding Wastes, Inner Nayos)',
};

// JSON with the spacing the block has always had (", " and ": ")
const loose = v => Array.isArray(v) ? '[' + v.map(loose).join(', ') + ']'
  : v && typeof v === 'object' ? '{' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ': ' + loose(x)).join(', ') + '}'
  : JSON.stringify(v);

(async () => {
  for (const c of (await api('/v2/currencies?ids=all')) || []) { currencies[c.id] = c; curByName[c.name.toLowerCase()] = c; }
  curByName['coin'] = currencies[1]; curByName['karma'] = currencies[2];
  const achParts = Object.entries(DATA.parts).filter(([, p]) => p.ach);
  const defs = Object.fromEntries((await apiIds('/v2/achievements', achParts.map(([, p]) => p.ach))).map(a => [a.id, a]));
  const bitsOut = {};
  for (const [pname, p] of achParts) {
    const def = defs[p.ach]; if (!def || !def.bits) continue;
    const list = [];
    for (let i = 0; i < def.bits.length; i++) {
      const b = def.bits[i];
      if (b.type === 'Item') { const nm = await resolveItem(b.id); if (nm) list.push([nm, 1, i]); }
      else if (b.type === 'Skin') {
        const sk = await api('/v2/skins/' + b.id);
        const sname = sk ? sk.name : null;
        let q = sname && await ask(`[[Has skin::${sname} (skin)]]|limit=5`);
        let hits = q && q.query && q.query.results && !Array.isArray(q.query.results) ? Object.keys(q.query.results) : [];
        if (!hits.length && sname) { q = await ask(`[[Has skin::${sname}]]|limit=5`); hits = q && q.query && q.query.results && !Array.isArray(q.query.results) ? Object.keys(q.query.results) : []; }
        let done = false;
        for (const h of hits) {
          const iid = await idByName(h.split('#')[0]);
          if (iid) { const nm = await resolveItem(iid); if (nm) { list.push([nm, 1, i]); report.skinItem++; done = true; break; } }
        }
        if (!done) report.skinNone++;
      } else report.text++;
    }
    if (list.length) bitsOut[pname] = list;
  }
  for (const [k, list] of Object.entries(EXTRA)) {
    if (!parts[k]) continue;
    const kids = parts[k].in ? parts[k].in.slice() : [];
    for (const [x, q] of list) { const nm = typeof x === 'number' ? await resolveItem(x) : x; if (nm) kids.push([nm, q]); }
    parts[k].in = kids; parts[k].src = EXTRA_NOTE[k] + ' · ' + parts[k].src;
  }
  { const n = await resolveItem(87225); if (n && parts[n]) { parts[n].in = [["Lasting Bonds: What Comes Next", 1]]; parts[n].src = "Lasting Bonds: What Comes Next koleksiyonunun ödülü"; } }
  { const enc = await resolveItem(91024); for (const k of Object.keys(parts)) if (k.startsWith('Vision of Enemies: ') && enc) { parts[k].in = [[enc, 1]]; parts[k].src = 'Memory Essence Encapsulator elindeyken: ' + parts[k].src; } }
  // an item that is another collection's reward is not a cost of its own
  const rewardOf = {};
  for (const [pname, p] of achParts) for (const r of (defs[p.ach] && defs[p.ach].rewards) || []) if (r.type === 'Item') rewardOf[r.id] = pname;
  for (const v of Object.values(parts)) if (v.id && rewardOf[v.id]) { v.src = rewardOf[v.id] + ' ödülü'; delete v.in; }
  for (const [k, v] of Object.entries(parts)) {
    if (LIFE[k]) v.src = 'Boss event, bir kez: ' + LIFE[k];
    if (/^Rift Hunter Heavy/.test(k)) v.src = 'SotO hikayesi (Rift Hunter kutuları) ya da SotO reward track';
    if (/^Heavy (Corsair|Dragonscale|Glacial|Houndskin|Mursaat)/.test(k)) v.src = "Bölüm mastery'sinin ödül kutusu ya da tekrarlanabilir LS3/LS4 reward track'i, hikaye şartı yok (Mastery kartı)";
    if (v.src === 'Drop / event' || v.src === '') v.src = 'Drop / event (wiki: ' + k + ')';
    if (v.in === undefined) delete v.in;
  }
  saveCache();
  console.log('achievements', achParts.length, 'parts', Object.keys(parts).length, JSON.stringify(report));
  const body = `// ---- Koleksiyon içerikleri (otomatik: GW2 API tarifleri + wiki satıcı verisi; tools/gen/collections.js) ----
// bits: achievement -> [[parça, adet, bit sırası]]. Sadece henüz toplanmamış parçalar hesaplara girer.
// Elle düzeltme burada yapılmaz (betik üzerine yazar): aynı adı DATA.parts'ta tanımla (DATA.parts önce gelir), eksik koleksiyon parçası için DATA.parts[ach].bitsExtra.
const COLLECTIONS = {
  parts: {
${Object.entries(parts).map(([k, v]) => '    ' + JSON.stringify(k) + ': ' + loose(v)).join(',\n')}
  },
  bits: {
${Object.entries(bitsOut).map(([k, v]) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n')}
  }
};`;
  writeBlock('collections', body);
})().catch(e => { saveCache(); console.error(e.message); process.exit(1); });
