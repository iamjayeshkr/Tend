import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { verifyAssetReferences } from './verify-assets.mjs';

async function withBundle(files, run) {
  const root = await mkdtemp(join(tmpdir(), 'tend-assets-'));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('rejects an HTML bundle with a missing hashed script', async () => {
  await withBundle({
    'index.html': '<script type="module" src="./assets/index-missing.js"></script>',
  }, async (root) => {
    await assert.rejects(
      verifyAssetReferences(join(root, 'index.html'), root),
      /Missing local asset.*assets\/index-missing\.js/,
    );
  });
});

test('accepts complete HTML, stylesheet, manifest, icon, font, and service-worker references', async () => {
  await withBundle({
    'index.html': [
      '<link rel="icon" href="./icons/tend.svg">',
      '<link rel="manifest" href="./manifest.webmanifest">',
      '<link rel="stylesheet" href="./assets/index-ok.css">',
      '<script type="module" src="./assets/index-ok.js"></script>',
    ].join(''),
    'assets/index-ok.js': "navigator.serviceWorker.register('./sw.js');",
    'assets/index-ok.css': "@font-face{src:url('./font-ok.woff2')} .remote{background:url('https://example.com/ignored.png')}",
    'assets/font-ok.woff2': 'font',
    'icons/tend.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'icons/tend-192.png': 'png',
    'manifest.webmanifest': JSON.stringify({ icons: [{ src: './icons/tend-192.png' }] }),
    'sw.js': 'const FILES=["./index.html","./assets/index-ok.js","./assets/index-ok.css"];',
  }, async (root) => {
    const references = await verifyAssetReferences(join(root, 'index.html'), root);
    assert.ok(references.some((path) => path.endsWith('sw.js')));
    assert.ok(references.some((path) => path.endsWith('font-ok.woff2')));
  });
});

test('rejects local references that escape the bundle root', async () => {
  await withBundle({
    'index.html': '<script src="../outside.js"></script>',
  }, async (root) => {
    await assert.rejects(
      verifyAssetReferences(join(root, 'index.html'), root),
      /escapes bundle root/,
    );
  });
});
