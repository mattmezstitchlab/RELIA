// Tests du connecteur YouTube Data API v3. Transport factice : aucun appel réseau n’est déclenché.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  channelRefFromURL, createYouTubeClient, listUploads, parseChannel, parsePlaylistPage, parseVideos,
  YouTubeApiError,
} from './client.js';

const KEY = 'TEST-KEY-SENTINEL-do-not-leak';

function fakeTransport(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    async transport(url) {
      calls.push(url);
      const next = queue.shift();
      if (!next) throw new Error('Aucune réponse préparée pour cette requête.');
      return typeof next === 'function' ? next(url) : next;
    },
  };
}

function ok(body) { return { status: 200, body }; }

test('channelRefFromURL accepts only explicit references', () => {
  assert.deepEqual(channelRefFromURL('https://www.youtube.com/channel/UCabcdefghij1234567890'), { kind: 'id', value: 'UCabcdefghij1234567890' });
  assert.deepEqual(channelRefFromURL('https://www.youtube.com/@mezofon/videos'), { kind: 'handle', value: 'mezofon' });
  assert.deepEqual(channelRefFromURL('https://www.youtube.com/@mattmezsax/videos'), { kind: 'handle', value: 'mattmezsax' });
  assert.deepEqual(channelRefFromURL('http://www.youtube.com/@mattmezsax'), { kind: 'handle', value: 'mattmezsax' });
  assert.deepEqual(channelRefFromURL('https://youtube.com/@Matt.Mez_Sax'), { kind: 'handle', value: 'Matt.Mez_Sax' });
  assert.deepEqual(channelRefFromURL('https://www.youtube.com/user/mattmezsax'), { kind: 'user', value: 'mattmezsax' });
  assert.deepEqual(channelRefFromURL('UCabcdefghij1234567890'), { kind: 'id', value: 'UCabcdefghij1234567890' });
  assert.deepEqual(channelRefFromURL('@mattmezsax'), { kind: 'handle', value: 'mattmezsax' });
  // URL personnalisée « /c/ » : non résoluble sans devinette → refusée.
  assert.equal(channelRefFromURL('https://www.youtube.com/c/MattMezSax'), null);
  assert.equal(channelRefFromURL('https://vimeo.com/channel/x'), null);
  assert.equal(channelRefFromURL('https://www.youtube.com/watch?v=abc'), null);
  assert.equal(channelRefFromURL('Matt Mez Sax'), null);
  assert.equal(channelRefFromURL(''), null);
  assert.equal(channelRefFromURL(null), null);
});

test('client refuses to start without a key', () => {
  assert.throws(() => createYouTubeClient({}), /YOUTUBE_API_KEY/);
  assert.throws(() => createYouTubeClient({ apiKey: '  ' }), /YOUTUBE_API_KEY/);
});

test('client resolves a channel by handle and exposes its uploads playlist', async () => {
  const fake = fakeTransport([ok({
    items: [{
      id: 'UCabcdefghij1234567890',
      snippet: { title: 'Matt Mez Sax', thumbnails: { high: { url: 'https://yt3.example/a.jpg' } } },
      contentDetails: { relatedPlaylists: { uploads: 'UUabcdefghij1234567890' } },
    }],
  })]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  const channel = await client.channel({ kind: 'handle', value: 'mattmezsax' });
  assert.equal(channel.channelId, 'UCabcdefghij1234567890');
  assert.equal(channel.title, 'Matt Mez Sax');
  assert.equal(channel.uploadsPlaylistId, 'UUabcdefghij1234567890');
  assert.match(fake.calls[0], /forHandle=mattmezsax/);
  assert.ok(!fake.calls[0].includes(KEY), 'la clé ne doit jamais apparaître dans l’URL');
  assert.equal(client.quotaUnitsUsed(), 1);
});

test('client sends the key in a header only and never in the URL or error messages', async () => {
  const fake = fakeTransport([() => ({ status: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }] } } })]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  await assert.rejects(() => client.channel({ kind: 'id', value: 'UCabcdefghij1234567890' }), error => {
    assert.ok(error instanceof YouTubeApiError);
    assert.equal(error.reason, 'quotaExceeded');
    assert.ok(!error.message.includes(KEY), 'le message d’erreur ne doit pas contenir la clé');
    return true;
  });
});

test('invalid API keys fail clearly without echoing the key or raw API response', async () => {
  const fake = fakeTransport([() => ({
    status: 403,
    body: { error: { errors: [{ reason: 'keyInvalid', message: KEY }], message: KEY } },
  })]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  await assert.rejects(() => client.channel({ kind: 'id', value: 'UCabcdefghij1234567890' }), error => {
    assert.ok(error instanceof YouTubeApiError);
    assert.equal(error.reason, 'keyInvalid');
    assert.match(error.message, /Clé API YouTube refusée/);
    assert.ok(!error.message.includes(KEY));
    return true;
  });

  const hostile = fakeTransport([() => ({
    status: 403,
    body: { error: { errors: [{ reason: KEY }], message: KEY } },
  })]);
  const hostileClient = createYouTubeClient({ apiKey: KEY, transport: hostile.transport });
  await assert.rejects(() => hostileClient.channel({ kind: 'id', value: 'UCabcdefghij1234567890' }), error => {
    assert.ok(!error.message.includes(KEY));
    assert.ok(!error.reason.includes(KEY));
    return true;
  });
});

test('network failures and malformed success responses fail closed', async () => {
  const offline = createYouTubeClient({ apiKey: KEY, transport: async () => { throw new Error(KEY); } });
  await assert.rejects(() => offline.channel({ kind: 'id', value: 'UCabcdefghij1234567890' }), error => {
    assert.match(error.message, /API YouTube est injoignable/);
    assert.ok(!error.message.includes(KEY));
    return true;
  });

  const malformed = createYouTubeClient({ apiKey: KEY, transport: async () => ok(null) });
  await assert.rejects(() => malformed.playlistPage({ playlistId: 'UUabcdefghij1234567890' }), /Réponse de l’API YouTube absente ou invalide/);
});

test('listUploads paginates the uploads playlist and reports completeness', async () => {
  const fake = fakeTransport([
    ok({ items: [{ contentDetails: { videoId: 'aaaaaaaaaaa' } }, { contentDetails: { videoId: 'bbbbbbbbbbb' } }], nextPageToken: 'T2' }),
    ok({ items: [{ contentDetails: { videoId: 'ccccccccccc' } }, { contentDetails: { videoId: 'ignored--id-too-long' } }], nextPageToken: 'T3' }),
    ok({ items: [{ contentDetails: { videoId: 'ddddddddddd' } }] }),
  ]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  const pages = [];
  const result = await listUploads(client, { playlistId: 'UUabcdefghij1234567890', onPage: page => pages.push(page) });
  assert.deepEqual(result, { videoIds: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'], pages: 3, complete: true });
  assert.equal(pages.length, 3);
  assert.ok(fake.calls.every(url => url.includes('playlistItems')), 'seules des pages de playlist sont demandées');
  assert.match(fake.calls[1], /pageToken=T2/);
});

test('listUploads flags an incomplete listing when the page guard is reached', async () => {
  const page = () => ok({ items: [{ contentDetails: { videoId: 'aaaaaaaaaaa' } }], nextPageToken: 'more' });
  const fake = fakeTransport([page(), page()]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  const result = await listUploads(client, { playlistId: 'UUabcdefghij1234567890', maxPages: 2 });
  assert.equal(result.complete, false);
  assert.equal(result.videoIds.length, 2);
});

test('videos.list batches identifiers fifty by fifty and verifies each returned id', async () => {
  const ids = Array.from({ length: 120 }, (_, index) => `v${String(index).padStart(10, '0')}`);
  const fake = fakeTransport([
    ok({ items: ids.slice(0, 50).map(id => ({ id, snippet: { title: `t-${id}`, channelId: 'UCx123456789012345678', channelTitle: 'C', publishedAt: '2024-01-02T03:04:05Z' }, contentDetails: { duration: 'PT3M' }, status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true } })) }),
    ok({ items: ids.slice(50, 100).map(id => ({ id, snippet: { title: `t-${id}`, channelId: 'UCx123456789012345678', channelTitle: 'C', publishedAt: '2024-01-02T03:04:05Z' }, contentDetails: { duration: 'PT3M' }, status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true } })) }),
    ok({ items: ids.slice(100).map(id => ({ id, snippet: { title: `t-${id}`, channelId: 'UCx123456789012345678', channelTitle: 'C', publishedAt: '2024-01-02T03:04:05Z' }, contentDetails: { duration: 'PT3M' }, status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: true } })) }),
  ]);
  const client = createYouTubeClient({ apiKey: KEY, transport: fake.transport });
  const videos = await client.videos(ids);
  assert.equal(fake.calls.length, 3, 'trois lots de cinquante au maximum');
  assert.equal(videos.length, 120);
  assert.ok(fake.calls.every(url => !url.includes(KEY)));
  assert.equal(client.quotaUnitsUsed(), 3);
});

test('parsers stay defensive on malformed payloads', () => {
  assert.equal(parseChannel({ items: [] }), null);
  assert.equal(parseChannel(null), null);
  assert.deepEqual(parsePlaylistPage({ items: [{ contentDetails: { videoId: 'bad' } }] }), { videoIds: [], nextPageToken: null });
  assert.deepEqual(parseVideos({ items: [{ id: 'nope' }] }).map(item => item.videoId), []);
  const parsed = parseVideos(ok({
    items: [{
      id: 'dQw4w9WgXcQ',
      snippet: { title: 'T', channelId: 'UCabcdefghij1234567890', channelTitle: 'C', publishedAt: '2020-05-17T10:00:00Z', thumbnails: { default: { url: 'http://insecure/x.jpg' }, maxres: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxres.jpg' } } },
      contentDetails: { duration: 'PT2M30S' },
      status: { privacyStatus: 'public', uploadStatus: 'processed', embeddable: false },
    }],
  }).body);
  assert.equal(parsed[0].thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxres.jpg', 'la meilleure miniature sûre gagne, la seule');
  assert.equal(parsed[0].embeddable, false);
  assert.equal(parsed[0].thumbnails, undefined, 'la carte brute des miniatures n’est pas conservée');
});
