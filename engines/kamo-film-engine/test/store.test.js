import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SpectralDataStore, spectralStocks, outputsForStock } from '../src/index.js';

const DATA = new URL('../data/film-scan-calibration/', import.meta.url);

test('a failed read can be retried (rejections are not cached)', async () => {
  let offline = true, reads = 0;
  const store = new SpectralDataStore(async path => {
    reads++;
    if (offline) throw new Error(`offline: ${path}`);
    return JSON.parse(await readFile(new URL(path, DATA), 'utf8'));
  });
  const stock = spectralStocks[0], output = outputsForStock(stock)[0];
  await assert.rejects(store.pipeline(stock.id, output.id), /offline/);
  offline = false;
  const before = reads;
  const pipeline = await store.pipeline(stock.id, output.id);
  assert.ok(pipeline, 'pipeline builds once the data can be read');
  assert.ok(reads > before, 'the files were read again');
  assert.equal(await store.pipeline(stock.id, output.id), pipeline, 'a successful build stays cached');
});
