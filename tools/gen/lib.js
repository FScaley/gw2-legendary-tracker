// Shared helpers for the data generators in tools/gen (Node 18+, no packages).
// Each generator owns one block in index.html between "// <gen:NAME>" and "// </gen:NAME>" and rewrites only that block.
// "--check" compares instead of writing and exits 1 when the block would change (the weekly GitHub Action uses it).
const fs = require('fs');
const path = require('path');
const INDEX = path.join(__dirname, '..', '..', 'index.html');
const UA = { headers: { 'User-Agent': 'gw2-legendary-tracker-datagen/1.0 (github.com/FScaley/gw2-legendary-tracker)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readIndex() { return fs.readFileSync(INDEX, 'utf8'); }
// What a generated block holds when a generator must not see its own previous output
const EMPTY = {
  collections: 'const COLLECTIONS = { parts: {}, bits: {} };',
  vendorreqs: 'const VENDOR_REQS = {};',
  mastery: 'const MASTERY_OBJECTIVES = {};',
  skins: 'const PART_SKINS = {};',
};
// DATA as the page sees it (with the generated blocks applied); without: block names to load empty
function loadData({ without = [] } = {}) {
  let script = [...readIndex().matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  for (const name of without) {
    const open = `// <gen:${name}>`, close = `// </gen:${name}>`;
    const i = script.indexOf(open), j = script.indexOf(close);
    script = script.slice(0, i) + EMPTY[name] + '\n' + script.slice(j + close.length);
  }
  return new Function(script + '; return DATA;')();
}
// optional disk cache for repeated local runs: GEN_CACHE=path/to/cache.json (never used by the GitHub Action)
const cacheFile = process.env.GEN_CACHE;
const cache = cacheFile && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
function saveCache() { if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(cache)); }
async function getJson(url, opts) {
  if (cacheFile && cache[url] !== undefined) return cache[url];
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 404) { cache[url] = null; return null; }
      if (r.ok) { const j = await r.json(); cache[url] = j; return j; }
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
  const url = 'https://wiki.guildwars2.com/index.php?title=' + encodeURIComponent(title.replace(/ /g, '_')) + '&action=raw';
  if (cacheFile && cache[url] !== undefined) return cache[url];
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, UA);
      if (r.status === 404) { cache[url] = null; return null; }
      if (r.ok) { const t = await r.text(); cache[url] = t; return t; }
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

module.exports = { readIndex, loadData, api, apiIds, ask, wikiRaw, writeBlock, js, sleep, saveCache };
