// What kind of task each mastery achievement is, from the wiki: the achievement table links every achievement to a page
// (an event, a group event, an adventure, an NPC, a jumping puzzle, a place, a story instance) and some rows carry notes.
// The page's infobox says more about the effort than the achievement's text does. Writes the ACH_INFO block of index.html:
// { achId: { k: kind, n: "wiki note" } } for the achievements every mastery meta counts (MASTERY_OBJECTIVES).
const { loadData, api, achTable, achRow, wikiRaw, writeBlock, saveCache } = require('./lib');

// wiki markup to plain text
const plain = t => t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  // a template keeps its first argument ({{wp|Lion's Arch}} -> Lion's Arch, {{coin|500}} -> 500); one without arguments goes
  .replace(/\{\{\s*[^}|]*\|\s*([^}|]*)[^}]*\}\}/g, '$1')
  .replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<[^>]+>/g, ' ').replace(/^\s*[*:#]+\s*/gm, '').replace(/\s+/g, ' ').trim();

async function pageKind(page) {
  let raw = await wikiRaw(page);
  for (let i = 0; i < 3 && raw && /^#REDIRECT/i.test(raw); i++) {
    const to = raw.match(/\[\[([^\]|]+)/);
    if (!to || to[1].includes('#')) return null;        // a section of an achievements page: nothing to learn
    raw = await wikiRaw(to[1]);
  }
  if (!raw) return null;
  const box = raw.match(/\{\{\s*([A-Za-z ]+?)\s+infobox([\s\S]*?)\n\}\}/i);
  if (!box) return null;
  const kind = box[1].toLowerCase(), type = ((box[2].match(/\|\s*type\s*=\s*([^\n|]*)/i) || [])[1] || '').trim().toLowerCase();
  if (kind === 'story') return 'story';
  if (kind === 'event') return /group|meta|legendary|boss/.test(type) ? 'groupevent' : 'event';
  if (kind === 'adventure') return 'adventure';
  if (kind === 'npc') return 'npc';
  if (kind === 'location') return /jumping puzzle/.test(type) ? 'jp' : 'place';
  return null;
}

(async () => {
  const MO = loadData({ ret: 'MASTERY_OBJECTIVES' });
  const cats = await api('/v2/achievements/categories?ids=all');
  const catOf = {}; for (const c of cats) for (const a of c.achievements || []) catOf[a] = c;
  const out = {}, count = {};
  for (const [meta, ids] of Object.entries(MO)) {
    const metaRaw = await achTable(catOf[meta].name, meta);
    for (const id of ids) {
      const raw = metaRaw && achRow(metaRaw, id) ? metaRaw : catOf[id] && await achTable(catOf[id].name, id);
      const row = raw && achRow(raw, id);
      if (!row) { console.log('no wiki row for', id); continue; }
      const k = row.page ? await pageKind(plain(row.page)) : null;
      const n = row.notes ? plain(row.notes).slice(0, 220) : '';
      if (!k && !n) continue;
      out[id] = Object.assign(k ? { k } : {}, n ? { n } : {});
      count[k || '-'] = (count[k || '-'] || 0) + 1;
    }
  }
  saveCache();
  console.log('achievements with wiki info', Object.keys(out).length, JSON.stringify(count));
  const keys = Object.keys(out).map(Number).sort((a, b) => a - b);
  const body = '// Mastery achievements: the kind of page the wiki links them to, and the wiki notes (tools/gen/achinfo.js)\n' +
    '// k: groupevent | event | adventure | npc | jp | place | story\nconst ACH_INFO = {\n' +
    keys.map(id => `  ${id}: ${JSON.stringify(out[id])}`).join(',\n') + '\n};';
  writeBlock('achinfo', body);
})().catch(e => { saveCache(); console.error(e.message); process.exit(1); });
