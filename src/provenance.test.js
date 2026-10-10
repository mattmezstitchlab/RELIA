import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvenance, isStale, safeHttpUrl, validateProvenance } from './provenance.js';

const captured = '2026-10-10T08:00:00Z';

test('provenance records the method, the source and the capture date', () => {
  const record = createProvenance({ method: 'wikidata_claim', sourceId: 'Q33977', url: 'https://example.org/notice', capturedAt: captured });
  assert.equal(record.method, 'wikidata_claim');
  assert.equal(record.url, 'https://example.org/notice');
  assert.ok(Object.isFrozen(record));
});

test('unsafe or non-web URLs are refused', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('not a url'), null);
  assert.equal(safeHttpUrl('https://example.org/x'), 'https://example.org/x');
  assert.throws(() => createProvenance({ method: 'wikidata_claim', sourceId: 'Q1', url: 'javascript:alert(1)', capturedAt: captured }), /URL de source/);
});

test('YouTube metadata must carry a refresh deadline and a source identifier', () => {
  assert.ok(validateProvenance({ method: 'youtube_api', sourceId: 'abc', capturedAt: captured }).some(message => message.includes('échéance')));
  assert.ok(validateProvenance({ method: 'youtube_api', capturedAt: captured, refreshBy: '2026-11-10T08:00:00Z' }).some(message => message.includes('identifiant ou une URL')));
  assert.deepEqual(validateProvenance({ method: 'youtube_api', sourceId: 'abc', capturedAt: captured, refreshBy: '2026-11-10T08:00:00Z' }), []);
});

test('a refresh deadline cannot precede the capture', () => {
  assert.ok(validateProvenance({ method: 'owner_declared', capturedAt: captured, refreshBy: '2026-01-01T00:00:00Z' }).some(message => message.includes('antérieure')));
});

test('a local record never claims an external source', () => {
  assert.deepEqual(validateProvenance({ method: 'local_record', capturedAt: captured }), []);
  assert.ok(validateProvenance({ method: 'local_record', capturedAt: captured, url: 'https://example.org' }).length > 0);
});

test('unknown methods and missing capture dates are refused', () => {
  assert.ok(validateProvenance({ method: 'scraped', capturedAt: captured }).includes('Méthode de provenance inconnue.'));
  assert.ok(validateProvenance({ method: 'human_review' }).some(message => message.includes('Date de capture')));
  assert.equal(validateProvenance(null)[0], 'Provenance absente.');
});

test('stale metadata is detected once its deadline has passed', () => {
  const record = { method: 'youtube_api', sourceId: 'abc', capturedAt: captured, refreshBy: '2026-11-10T08:00:00Z' };
  assert.equal(isStale(record, new Date('2026-11-09T00:00:00Z')), false);
  assert.equal(isStale(record, new Date('2026-11-11T00:00:00Z')), true);
  assert.equal(isStale({ method: 'human_review', capturedAt: captured }), false);
});
