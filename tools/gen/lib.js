// Shared helpers for the data generators in tools/gen (Node 18+, no packages).
// Each generator owns one block in index.html between "// <gen:NAME>" and "// </gen:NAME>" and rewrites only that block.
// "--check" compares instead of writing and exits 1 when the block would change (the weekly GitHub Action uses it).
const fs = require('fs');
const path = require('path');
const INDEX = path.join(__dirname, '..', '..', 'index.html');
const UA = { headers: { 'User-Agent': 'gw2-legendary-tracker-datagen/1.0 (github.com/FScaley/gw2-legendary-tracker)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readIndex() { return fs.readFileSync(INDEX, 'utf8'); }
// DATA as the page sees it (with the generated blocks applied)
function loadData(html = readIndex()) {
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  return new Function(script + '; return DATA;')();
}
async function getJson(url, opts) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch (e) { }
    await sleep(800 * (i + 1));
  }
  throw new Error('fetch failed: ' + url);
}
const api = u => getJson('https://api.guildwars2.com' + u);
async function apiIds(base, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await api(base + '?ids=' + ids.slice(i, i + 200).join(',')) || []));
  return out;
}
const ask = q => getJson('https://wiki.guildwars2.com/api.php?action=ask&format=json&query=' + encodeURIComponent(q), UA);
async function wikiRaw(title) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch('https://wiki.guildwars2.com/index.php?title=' + encodeURIComponent(title.replace(/ /g, '_')) + '&action=raw', UA);
      if (r.status === 404) return null;
      if (r.ok) return await r.text();
    } catch (e) { }
    await sleep(800 * (i + 1));
  }
  throw new Error('wiki failed: ' + title);
}

// replace (or check) the generated block NAME; body is JavaScript
function writeBlock(name, body) {
  const html = readIndex();
  const open = `// <gen:${name}>`, close = `// </gen:${name}>`;
  const i = html.indexOf(open), j = html.indexOf(close);
  if (i < 0 || j < i) throw new Error(`index.html has no ${open} ... ${close} block`);
  const nl = html.includes('\r\n') ? '\r\n' : '\n';   // keep the file's line endings
  const next = html.slice(0, i) + open + nl + body.trimEnd().replace(/\r?\n/g, nl) + nl + html.slice(j);
  const changed = next !== html;
  if (process.argv.includes('--check')) {
    console.log(changed ? `CHANGED: the ${name} block differs from the wiki/API (run: node tools/gen/${name}.js)` : `${name}: up to date`);
    if (changed) process.exitCode = 1;
    return changed;
  }
  if (changed) fs.writeFileSync(INDEX, next);
  console.log(changed ? `${name}: block updated` : `${name}: no change`);
  return changed;
}
const js = v => JSON.stringify(v, null, 0).replace(/,"/g, ', "').replace(/":/g, '": ');

module.exports = { readIndex, loadData, api, apiIds, ask, wikiRaw, writeBlock, js, sleep };
