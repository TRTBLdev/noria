import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const INITIAL_GZIP_BUDGET = 120 * 1024;
const CHUNK_SIZE_LIMIT = 500 * 1024;
const distUrl = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', distUrl), 'utf8'));
const entryKey = manifest['index.html']?.isEntry
  ? 'index.html'
  : Object.keys(manifest).find(key => manifest[key].isEntry);

if (!entryKey) throw new Error('No se encontró el entrypoint en el manifiesto de Vite.');

const initialFiles = new Set();
const visitedEntries = new Set();

function collectInitialFiles(key) {
  if (visitedEntries.has(key)) return;
  visitedEntries.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`El manifiesto referencia una entrada inexistente: ${key}`);
  if (entry.file?.endsWith('.js')) initialFiles.add(entry.file);
  for (const importedKey of entry.imports || []) collectInitialFiles(importedKey);
}

collectInitialFiles(entryKey);

const initialGzipBytes = [...initialFiles].reduce((total, file) => {
  const contents = readFileSync(new URL(file, distUrl));
  return total + gzipSync(contents).length;
}, 0);

const oversizedChunks = [...new Set(Object.values(manifest).map(entry => entry.file))]
  .filter(file => file?.endsWith('.js'))
  .map(file => ({ file, bytes: statSync(new URL(file, distUrl)).size }))
  .filter(({ bytes }) => bytes > CHUNK_SIZE_LIMIT);

const serviceWorker = readFileSync(new URL('sw.js', distUrl), 'utf8');
const expectedPrecacheFiles = new Set(['index.html', 'manifest.json', 'favicon.svg']);
for (const entry of Object.values(manifest)) {
  if (entry.file) expectedPrecacheFiles.add(entry.file);
  for (const cssFile of entry.css || []) expectedPrecacheFiles.add(cssFile);
  for (const assetFile of entry.assets || []) expectedPrecacheFiles.add(assetFile);
}
const missingPrecacheFiles = [...expectedPrecacheFiles].filter(file => !serviceWorker.includes(file));

const kib = bytes => (bytes / 1024).toFixed(1);

console.log(`JavaScript inicial: ${kib(initialGzipBytes)} KiB gzip en ${initialFiles.size} archivo(s); presupuesto: ${kib(INITIAL_GZIP_BUDGET)} KiB.`);
console.log(`Precache PWA: ${expectedPrecacheFiles.size} recurso(s) verificados.`);

if (initialGzipBytes > INITIAL_GZIP_BUDGET) {
  throw new Error(`El JavaScript inicial supera el presupuesto por ${kib(initialGzipBytes - INITIAL_GZIP_BUDGET)} KiB gzip.`);
}

if (oversizedChunks.length > 0) {
  const details = oversizedChunks.map(({ file, bytes }) => `${file} (${kib(bytes)} KiB)`).join(', ');
  throw new Error(`Hay chunks mayores de ${kib(CHUNK_SIZE_LIMIT)} KiB: ${details}`);
}

if (missingPrecacheFiles.length > 0) {
  throw new Error(`El service worker no precachea estos recursos: ${missingPrecacheFiles.join(', ')}`);
}
