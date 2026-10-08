import test from 'node:test';
import assert from 'node:assert/strict';
import { commonsVideoURL, parseCommonsVideos, youtubeIdsFromClaims, youtubeItems } from './videos.js';

const yt = (value, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });

test('YouTube IDs come only from non-deprecated P1651 claims with a valid 11-character id', () => {
  const claims = { P1651: [yt('dQw4w9WgXcQ'), yt('dQw4w9WgXcQ'), yt('court'), yt('aaaaaaaaaaa', 'deprecated'), yt('abcdefghijk')] };
  assert.deepEqual(youtubeIdsFromClaims(claims), ['dQw4w9WgXcQ', 'abcdefghijk']);
  assert.deepEqual(youtubeIdsFromClaims({}), []);
});

test('YouTube items use the privacy-enhanced embed and the public watch page as source', () => {
  const [item] = youtubeItems(['abcdefghijk'], 'Exemple');
  assert.equal(item.kind, 'youtube');
  assert.equal(item.embed, 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
  assert.equal(item.source, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(item.poster, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
});

test('Commons query searches the exact name restricted to video files, without quote injection', () => {
  const url = new URL(commonsVideoURL('Marie "Curie"'));
  assert.equal(url.origin + url.pathname, 'https://commons.wikimedia.org/w/api.php');
  assert.equal(url.searchParams.get('gsrsearch'), '"Marie Curie" filetype:video');
  assert.equal(url.searchParams.get('generator'), 'search');
  assert.equal(url.searchParams.get('origin'), '*');
});

test('Commons parsing keeps only https video files, cleans titles and keeps the search order', () => {
  const data = { query: { pages: [
    { pageid: 3, index: 2, title: 'File:Conférence_de_Marie_Curie.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/a.webm', mime: 'video/webm', mediatype: 'VIDEO', thumburl: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.webm' }] },
    { pageid: 4, index: 1, title: 'File:Portrait.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/p.jpg', mime: 'image/jpeg', mediatype: 'BITMAP' }] },
    { pageid: 5, index: 3, title: 'File:Insecure.webm', imageinfo: [{ url: 'http://example.org/x.webm', mime: 'video/webm', mediatype: 'VIDEO' }] },
    { pageid: 6, index: 0, title: 'File:Interview.ogv', imageinfo: [{ url: 'https://upload.wikimedia.org/i.ogv', mime: 'video/ogg', mediatype: 'VIDEO', thumburl: 'javascript:alert(1)' }] },
  ] } };
  const items = parseCommonsVideos(data);
  assert.deepEqual(items.map(item => item.title), ['Interview', 'Conférence de Marie Curie']);
  assert.equal(items[0].poster, null);
  assert.equal(items[1].poster, 'https://upload.wikimedia.org/a.jpg');
  assert.equal(items[1].source, 'https://commons.wikimedia.org/wiki/File:A.webm');
  assert.equal('index' in items[0], false);
  assert.deepEqual(parseCommonsVideos({}), []);
});
