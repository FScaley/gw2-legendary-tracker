// Which achievements count toward each mastery meta achievement ("Complete N ... achievements").
// The API gives a meta only its category; the category also holds achievements the meta does not count
// (Insights, Requiem experiments ...). The wiki's achievement table lists the meta's real objectives.
// Writes the MASTERY_OBJECTIVES block of index.html: { metaAchId: [achId, ...] }.
const { loadData, api, apiIds, achTable, writeBlock } = require('./lib');

(async () => {
  const DATA = loadData({ without: ['mastery'] });
  const achIds = [...new Set(Object.values(DATA.parts).filter(p => p.ach).map(p => p.ach).concat(DATA.hunter.map(h => h.ach)))];
  const defs = await apiIds('/v2/achievements', achIds);
  const metas = defs.filter(d => d.flags.includes('CategoryDisplay'));
  const cats = await api('/v2/achievements/categories?ids=all');
  const catOf = {}; for (const c of cats) for (const a of c.achievements || []) catOf[a] = c;
  const out = {};
  for (const m of metas.sort((a, b) => a.id - b.id)) {
    const cat = catOf[m.id];
    if (!cat) { console.log('no category for', m.id, m.name); continue; }
    const raw = await achTable(cat.name, m.id);
    if (!raw) { console.log('MISSING wiki table for', m.id, m.name, '(category', cat.name + ')'); process.exitCode = 1; continue; }
    const row = raw.split('{{Achievement table row').find(r => new RegExp('\\|\\s*id\\s*=\\s*' + m.id + '\\b').test(r));
    const obj = (row.match(/\|\s*objectives\s*=([\s\S]*?)(\n\||\n\}\})/) || [])[1] || '';
    // objectives are links "[[Page#achievementNNNN|Name]]"; plain names are looked up in the category
    const ids = [...obj.matchAll(/#achievement(\d+)/g)].map(x => +x[1]);
    const names = obj.split('\n').filter(l => !/#achievement\d+/.test(l)).map(l => l.replace(/\[\[[^\]]*\]\]/g, '').trim()).filter(Boolean);
    if (names.length) {
      const inCat = await apiIds('/v2/achievements', cat.achievements);
      for (const n of names) { const a = inCat.find(d => d.name === n); if (a) ids.push(a.id); else { console.log('UNRESOLVED objective', m.name, '->', n); process.exitCode = 1; } }
    }
    const need = m.tiers[m.tiers.length - 1].count;
    if (ids.length < need) { console.log('SHORT', m.name, ids.length, '<', need); process.exitCode = 1; }
    out[m.id] = [...new Set(ids)].sort((a, b) => a - b);
    console.log(m.id, m.name, 'objectives', out[m.id].length, 'need', need);
  }
  const body = '// Mastery meta achievement -> the achievements it counts (wiki achievement tables; tools/gen/mastery.js)\nconst MASTERY_OBJECTIVES = {\n' +
    Object.entries(out).map(([k, v]) => `  ${k}: [${v.join(', ')}]`).join(',\n') + '\n};';
  writeBlock('mastery', body);
})().catch(e => { console.error(e.message); process.exit(1); });
