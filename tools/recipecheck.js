// Compare every DATA.parts recipe (in: [...]) with the official API recipe or the wiki {{Recipe}} template.
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const DATA = new Function([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1] + '; return DATA;')();
const P = DATA.parts;
const api = async u => { const r = await fetch('https://api.guildwars2.com' + u); return r.ok ? r.json() : null; };
const wikiRaw = async n => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch('https://wiki.guildwars2.com/index.php?title=' + encodeURIComponent(n.replace(/ /g, '_')) + '&action=raw', { headers: { 'User-Agent': 'gw2-legendary-tracker-verify/1.0 (curl-compatible)' } });
    if (!r.ok) return null;
    const t = await r.text();
    const m = t.match(/^#REDIRECT\s*\[\[([^\]#|]+)/i);
    if (m) { n = m[1]; continue; }
    return t;
  }
  return null;
};
const norm = s => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
  .replace(/^piles of /, 'pile of ').replace(/^vials of /, 'vial of ').replace(/^bolts of /, 'bolt of ').replace(/^lumps of /, 'lump of ').replace(/^globs of /, 'glob of ').replace(/^gifts of /, 'gift of ')
  .replace(/(runestone|shard|ingot|plank|square|lodestone|clover|coin|bead|reagent|essence|fang|bone|claw|scale|totem|sac|orb|crystal|token|note|relic|insight|matrix|ticket|badge|memory|memories|facet|aspect|mote|scroll|dye|pepper|ruby|pearl|wood|winterberry|blossom|incense|star|stone|fragment|ore)s\b/g, '$1')
  .replace(/memorie\b/, 'memory').replace(/\bmemories of battle\b/, 'memory of battle').replace(/\bbadges? of honor\b/, 'badge of honor');
const idName = {};
(async () => {
  const ids = [...new Set(Object.values(P).filter(p => p.id).map(p => p.id))];
  for (let i = 0; i < ids.length; i += 200) for (const x of await api('/v2/items?ids=' + ids.slice(i, i + 200).join(','))) idName[x.id] = x.name;
  const curName = Object.fromEntries((await api('/v2/currencies?ids=all')).map(c => [c.id, c.name]));
  const out = [];
  for (const [name, p] of Object.entries(P)) {
    if (!p.in || p.ach || !p.id) continue;
    const mine = p.in.map(([c, q]) => [norm(c), q]).sort();
    // 1) official API
    const rids = await api('/v2/recipes/search?output=' + p.id);
    let matched = false, seen = [];
    if (rids && rids.length) {
      for (const r of await api('/v2/recipes?ids=' + rids.join(','))) {
        const theirs = [];
        for (const g of r.ingredients) {
          const iid = g.id ?? g.item_id;
          let nm = g.type === 'Currency' ? curName[iid] : idName[iid];
          if (!nm) { const it = await api('/v2/items/' + iid); nm = it ? it.name : '#' + iid; idName[iid] = nm; }
          theirs.push([norm(nm), g.count]);
        }
        theirs.sort(); seen.push('API: ' + theirs.map(x => x[1] + ' ' + x[0]).join(', '));
        if (JSON.stringify(theirs) === JSON.stringify(mine)) matched = true;
      }
    }
    // 2) wiki {{Recipe}} blocks
    if (!matched) {
      const t = await wikiRaw(name);
      if (t) {
        for (const blk of t.split(/\{\{\s*recipe/i).slice(1)) {
          const ing = [...blk.matchAll(/\|\s*ingredient\d\s*=\s*([0-9,]+)\s+([^\n|}]+)/g)].map(m => [norm(m[2]), +m[1].replace(/,/g, '')]).sort();
          if (!ing.length) continue;
          seen.push('WIKI: ' + ing.map(x => x[1] + ' ' + x[0]).join(', '));
          // allow DATA to list fewer entries (e.g. "any T6 gem" left out) only if all of ours match
          if (JSON.stringify(ing) === JSON.stringify(mine)) matched = true;
        }
        if (!matched && !seen.length) {
          // vendor / currency costs: look for "cost = N Currency" lines
          const costs = [...t.matchAll(/cost\s*=\s*([^\n|}]+)/gi)].map(m => m[1].trim()).slice(0, 4);
          if (costs.length) seen.push('WIKI cost: ' + costs.join(' ; '));
        }
      }
    }
    if (!matched) out.push(`MISMATCH ${name} (${p.id})\n   DATA: ${mine.map(x => x[1] + ' ' + x[0]).join(', ')}\n   ${seen.join('\n   ') || 'no recipe found'}`);
  }
  console.log(out.join('\n'));
  console.log('checked', Object.values(P).filter(p => p.in && !p.ach && p.id).length, 'mismatches', out.length);
})();
