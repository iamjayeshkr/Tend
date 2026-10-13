import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINK_RELS = new Set([
  'apple-touch-icon',
  'icon',
  'manifest',
  'mask-icon',
  'stylesheet',
]);

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:(["'])(.*?)\\1|([^\\s>]+))`, 'i'));
  return match ? (match[2] ?? match[3] ?? '') : '';
}

function localReference(value) {
  const reference = value.trim();
  if (!reference || reference.startsWith('#') || reference.startsWith('//')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(reference)) return null;
  const withoutFragment = reference.split('#', 1)[0].split('?', 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment).replaceAll('\\', '/');
  } catch {
    throw new Error(`Invalid encoded local asset reference: ${reference}`);
  }
}

function withinRoot(path, root) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function referencedPath(reference, fromPath, root) {
  const candidate = reference.startsWith('/')
    ? resolve(root, reference.replace(/^\/+/, ''))
    : resolve(dirname(fromPath), reference);
  if (!withinRoot(candidate, root)) {
    throw new Error(`Local asset reference escapes bundle root: ${reference} from ${relative(root, fromPath)}`);
  }
  return candidate;
}

function htmlReferences(source) {
  const references = [];
  for (const tag of source.match(/<script\b[^>]*>/gi) ?? []) {
    const src = attribute(tag, 'src');
    if (src) references.push(src);
  }
  for (const tag of source.match(/<link\b[^>]*>/gi) ?? []) {
    const rels = attribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (!rels.some((rel) => LINK_RELS.has(rel))) continue;
    const href = attribute(tag, 'href');
    if (href) references.push(href);
  }
  return references;
}

function serviceWorkerReferences(source) {
  const references = [];
  const pattern = /serviceWorker\s*\.\s*register\s*\(\s*(["'])(.*?)\1/g;
  for (const match of source.matchAll(pattern)) references.push(match[2]);
  return references;
}

function cssReferences(source) {
  const references = [];
  const pattern = /url\(\s*(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)/gi;
  for (const match of source.matchAll(pattern)) references.push(match[2] ?? match[3]);
  return references;
}

function manifestReferences(source, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid web manifest ${manifestPath}: ${error.message}`);
  }
  const references = [];
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'src' || key === 'url') && typeof child === 'string') references.push(child);
      else visit(child);
    }
  }
  visit(manifest);
  return references;
}

function serviceWorkerCacheReferences(source, workerPath) {
  const references = [];
  const files = source.match(/\bFILES\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (files) {
    try {
      const values = JSON.parse(files[1]);
      if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
        throw new Error('FILES must be an array of strings');
      }
      references.push(...values);
    } catch (error) {
      throw new Error(`Invalid service-worker FILES list ${workerPath}: ${error.message}`);
    }
  }
  for (const call of source.matchAll(/\bimportScripts\s*\(([^)]*)\)/g)) {
    for (const item of call[1].matchAll(/(["'])(.*?)\1/g)) references.push(item[2]);
  }
  return references;
}

export async function verifyAssetReferences(htmlPath, rootDir) {
  const root = resolve(rootDir);
  const entry = resolve(htmlPath);
  if (!withinRoot(entry, root)) throw new Error(`HTML entrypoint is outside bundle root: ${htmlPath}`);

  const canonicalRoot = await realpath(root);
  const visited = new Set();
  const verified = [];

  async function inspect(path, kind = extname(path).toLowerCase()) {
    if (visited.has(path)) return;
    visited.add(path);

    let details;
    try {
      details = await stat(path);
    } catch {
      throw new Error(`Missing local asset: ${relative(root, path) || path}`);
    }
    if (!details.isFile()) throw new Error(`Local asset is not a file: ${relative(root, path)}`);
    const canonicalPath = await realpath(path);
    if (!withinRoot(canonicalPath, canonicalRoot)) {
      throw new Error(`Local asset resolves outside bundle root: ${relative(root, path)}`);
    }
    verified.push(path);

    if (!['.css', '.html', '.js', '.mjs', '.service-worker', '.webmanifest'].includes(kind)) return;
    const source = await readFile(path, 'utf8');
    const found = [];
    if (kind === '.html') found.push(...htmlReferences(source));
    if (kind === '.css') found.push(...cssReferences(source));
    if (kind === '.webmanifest') found.push(...manifestReferences(source, relative(root, path)));
    if (kind === '.js' || kind === '.mjs' || kind === '.html') {
      for (const reference of serviceWorkerReferences(source)) {
        const local = localReference(reference);
        if (local) await inspect(referencedPath(local, entry, root), '.service-worker');
      }
    }
    if (kind === '.service-worker') {
      found.push(...serviceWorkerCacheReferences(source, relative(root, path)));
    }
    for (const reference of found) {
      const local = localReference(reference);
      if (local) await inspect(referencedPath(local, path, root));
    }
  }

  await inspect(entry, '.html');
  return verified;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const htmlPath = resolve(process.argv[2] ?? 'dist/index.html');
  const rootDir = resolve(process.argv[3] ?? dirname(htmlPath));
  const references = await verifyAssetReferences(htmlPath, rootDir);
  process.stdout.write(`Verified ${references.length} local bundle files under ${rootDir}.\n`);
}
