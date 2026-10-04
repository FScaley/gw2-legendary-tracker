// Checks every ID in DATA against the official GW2 API. Exit code 1 when something is wrong (used by the weekly GitHub Action).
const _log = console.log; let problems = 0;
console.log = (...a) => { const t = a.join(' '); if (/^(SYNTAX|missing|hunter bad|rec bad|ITEM|CUR|GATE|ACH|MAPCHEST|CRAFT|GROUP|SCHED|MASTERY|MPA)/.test(t)) problems++; _log(...a); };
process.on('beforeExit', () => { if (problems) { _log('PROBLEMS', problems); process.exitCode = 1; } });
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const DATA = new Function(scripts[0] + '; return DATA;')();
try { new Function(scripts[1]); console.log('main script: syntax ok'); } catch (e) { console.log('SYNTAX', e.message); }
const P = DATA.parts; let bad = 0;
for (const [n, p] of Object.entries(P)) for (const [c] of (p.in || [])) if (!P[c]) { console.log('missing ref', n, '->', c); bad++; }
for (const t of DATA.targets) if (!P[t.root]) { console.log('missing root', t.root); bad++; }
for (const h of DATA.hunter) if (!DATA.targets.find(t => t.key === h.target)) console.log('hunter bad target', h.key);
for (const r of DATA.recs) for (const k of r.targets) if (!DATA.targets.find(t => t.key === k)) console.log('rec bad target', k);
const get = async u => (await fetch('https://api.guildwars2.com' + u)).json();
(async () => {
  const items = Object.entries(P).filter(([, p]) => p.id);
  const ids = [...new Set(items.map(([, p]) => p.id))];
  const api = {};
  for (let i = 0; i < ids.length; i += 200) for (const x of await get('/v2/items?ids=' + ids.slice(i, i + 200).join(','))) api[x.id] = x.name;
  console.log("items checked", items.length, "api", Object.keys(api).length); for (const [n, p] of items) if (api[p.id] !== n) console.log('ITEM', p.id, 'data:', JSON.stringify(n), 'api:', JSON.stringify(api[p.id]));
  const cur = Object.fromEntries((await get('/v2/currencies?ids=all')).map(c => [c.id, c.name]));
  for (const [n, p] of Object.entries(P)) if (p.cur && cur[p.cur] !== n) console.log('CUR', p.cur, n, 'api:', cur[p.cur]);
  for (const t of DATA.targets) for (const g of t.gates) if (g.cur && cur[g.cur] !== g.label) console.log('GATE cur', g.cur, g.label, 'api:', cur[g.cur]);
  const achIds = [...new Set([...Object.values(P).filter(p => p.ach).map(p => p.ach), ...DATA.hunter.map(h => h.ach), ...DATA.daily.concat(DATA.weekly).filter(t => t.untilAch).map(t => t.untilAch), ...DATA.targets.flatMap(t => t.gates.flatMap(g => (g.steps || []).map(s => s[0])))])];
  const ach = Object.fromEntries((await get('/v2/achievements?ids=' + achIds.join(','))).map(a => [a.id, a.name]));
  for (const [n, p] of Object.entries(P)) if (p.ach && ach[p.ach] !== n.replace(/ \(achievement\)$/, '')) console.log('ACH part', p.ach, n, 'api:', ach[p.ach]);
  for (const h of DATA.hunter) if (!ach[h.ach]) console.log('ACH hunter missing', h.ach); else if (!ach[h.ach].startsWith(h.title.split(' (')[0])) console.log('ACH hunter', h.ach, h.title, 'api:', ach[h.ach]);
  for (const id of achIds) if (!ach[id]) console.log('ACH not found', id);
  const mc = await get('/v2/mapchests'); const dc = await get('/v2/dailycrafting');
  for (const t of DATA.daily) if (t.auto && t.auto.t === 'mapchest' && !mc.includes(t.auto.id)) console.log('MAPCHEST bad', t.auto.id);
  for (const t of DATA.daily) if (t.auto && t.auto.t === 'crafts') for (const id of t.auto.ids) if (!dc.includes(id)) console.log('CRAFT bad', id); for (const t of DATA.daily.concat(DATA.weekly)) { if (!DATA.groups.find(g => g.id === t.group)) console.log('GROUP bad', t.id); if (t.sched && !DATA.schedules[t.sched]) console.log('SCHED bad', t.id); }
  const wl = await get('/v2/wizardsvault/listings?ids=' + DATA.vault.map(v => v.listing).join(','));
  const wi = Object.fromEntries((await get('/v2/items?ids=' + wl.map(l => l.item_id).join(','))).map(x => [x.id, x.name]));
  for (const v of DATA.vault) { const l = wl.find(x => x.id === v.listing); console.log('VAULT', v.listing, v.name, '=>', l && wi[l.item_id], l && l.cost); }
  for (const c of [463, 472]) { const cat = await get('/v2/achievements/categories/' + c); console.log('cat', c, cat.name, cat.achievements.length); }
  const mast = Object.fromEntries((await get('/v2/masteries?ids=all')).map(m => [m.id, m]));
  for (const m of DATA.masteries || []) { const d = mast[m.track]; if (!d || !d.levels[m.level]) console.log('MASTERY bad', m.track, m.level); }
  for (const r of Object.keys(DATA.masteryRegions || {})) if (!Object.values(mast).some(m => m.region === r)) console.log('MASTERY region bad', r);
  { const ids = Object.values(DATA.masteryPointAch || {}).flat(); let found = 0;
    for (let i = 0; i < ids.length; i += 200) for (const a of await get('/v2/achievements?ids=' + ids.slice(i, i + 200).join(','))) if ((a.rewards || []).some(r => r.type === 'Mastery')) found++;
    if (found !== ids.length) console.log('MPA mismatch', found, '/', ids.length); }
  console.log('done; ref errors', bad);
})();
