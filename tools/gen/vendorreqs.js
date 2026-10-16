// Vendor requirements: for every part bought from a vendor, the wiki's "Has requirement" on that vendor's offer
// (an achievement, a mastery level, a renown heart, "obtained once"). Writes the VENDOR_REQS block of index.html.
// A requirement the page cannot map stops the run: add it to MAP below (ach / mast / first / name).
const { loadData, ask, writeBlock, saveCache } = require('./lib');

const MAP = {
  "A Star to Guide Us (achievements)#achievement4359": { ach: 4359, name: '"A Star to Guide Us" Mastery' },
  "Rude Awakening": { ach: 4235, name: "Rude Awakening" },
  "Follows Advice": { ach: 2248, name: "Follows Advice" },
  "Agony Channeler": { mast: [5, 1], name: "Fractal Attunement: Agony Channeler" },
  "the item to have already been obtained once": { first: true, name: "önce bir kez drop olarak bulunmalı" },
  // the item is itself a part of this collection: only a note, no cycle
  "Coalescence III: Culmination": { name: "Coalescence III: Culmination koleksiyonu açılmış olmalı" },
};
const HEART = /\[\[(.+?)\|renown heart\]\] to be complete/;
const loose = v => Array.isArray(v) ? '[' + v.map(loose).join(', ') + ']'
  : v && typeof v === 'object' ? '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + loose(x)).join(', ') + '}'
  : JSON.stringify(v);

(async () => {
  const DATA = loadData({ without: ['vendorreqs'] });
  const out = {};
  let unmapped = 0;
  for (const [name, p] of Object.entries(DATA.parts)) {
    if (!/^Vendor: /.test(p.src || '')) continue;
    const vendor = p.src.replace(/^Vendor: /, '').replace(/ \(.*$/, '').replace(/;.*$/, '').trim();
    const j = await ask(`[[Sells item::${name}]]|?Has requirement|?Located in|limit=50`);
    const res = j && j.query && j.query.results && !Array.isArray(j.query.results) ? Object.entries(j.query.results) : [];
    const mine = res.filter(([k]) => k.split('#')[0] === vendor).map(([, v]) => v.printouts['Has requirement'] || []);
    // a requirement counts only when every offer of the chosen vendor has one
    if (!mine.length || !mine.every(r => r.length)) continue;
    const reqs = [];
    for (const r of [...new Set(mine.flat())]) {
      if (MAP[r]) reqs.push(MAP[r]);
      else if (HEART.test(r)) reqs.push({ name: 'heart bitmiş olmalı: ' + r.match(HEART)[1] });
      else { console.log('UNMAPPED requirement', JSON.stringify(r), 'for', name); unmapped++; }
    }
    if (reqs.length) out[name] = reqs;
  }
  saveCache();
  if (unmapped) { console.log('add the requirements above to MAP in tools/gen/vendorreqs.js'); process.exit(1); }
  console.log('vendor parts with a requirement', Object.keys(out).length);
  const body = `// Satıcı şartları (wiki "Has requirement"; tools/gen/vendorreqs.js). Şart yerine gelmeden satıcı satmaz.
// ach: achievement bitmeli (ağaca alt madde olarak girer) · mast: [mastery track, seviye] · first: önce drop olarak bir kez bulunmalı · yalnız name: sadece not.
const VENDOR_REQS = {
${Object.entries(out).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + loose(v)).join(',\n')}
};`;
  writeBlock('vendorreqs', body);
})().catch(e => { saveCache(); console.error(e.message); process.exit(1); });
