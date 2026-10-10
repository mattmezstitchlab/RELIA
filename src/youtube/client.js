// Connecteur YouTube Data API v3 — exécution hors navigateur uniquement (Node).
// La clé ne circule que dans l’en-tête « X-Goog-Api-Key », au moment de l’appel :
// elle n’apparaît jamais dans les URL, les messages d’erreur, les journaux ni les données produites.
// Aucun téléchargement ni réhébergement de vidéo : seules des métadonnées publiques sont lues.
export const API_ROOT = 'https://www.googleapis.com/youtube/v3';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{10,}$/;
const HANDLE = /^[A-Za-z0-9._-]{3,30}$/;

export class YouTubeApiError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'YouTubeApiError';
    this.status = status;
    this.reason = reason;
  }
}

// Référence de chaîne déclarée explicitement par le propriétaire : URL officielle ou identifiant brut.
// Une URL « /c/… » (URL personnalisée historique) n’est pas résoluble sans devinette : elle est refusée.
export function channelRefFromURL(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^UC[A-Za-z0-9_-]{10,}$/.test(text)) return { kind: 'id', value: text };
  if (/^@[A-Za-z0-9._-]{3,30}$/.test(text)) return { kind: 'handle', value: text.slice(1) };
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(url.hostname)) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'channel' && CHANNEL_ID.test(segments[1] || '')) return { kind: 'id', value: segments[1] };
  if (segments[0]?.startsWith('@') && HANDLE.test(segments[0].slice(1))) return { kind: 'handle', value: segments[0].slice(1) };
  if (segments[0] === 'user' && HANDLE.test(segments[1] || '')) return { kind: 'user', value: segments[1] };
  return null;
}

export function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

function apiError(status, body) {
  // Ne jamais réémettre le texte arbitraire du corps de réponse : il pourrait contenir une donnée
  // sensible. Seuls des codes d’erreur YouTube connus sont conservés dans l’erreur/journal.
  const rawReason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  const safeReasons = new Set([
    'accessNotConfigured', 'dailyLimitExceeded', 'forbidden', 'ipRefererBlocked', 'keyInvalid',
    'playlistNotFound', 'quotaExceeded', 'rateLimitExceeded', 'refererBlocked', 'userRateLimitExceeded',
  ]);
  const reason = safeReasons.has(rawReason) ? rawReason : '';
  const messages = {
    accessNotConfigured: 'YouTube Data API v3 non activée ou non autorisée pour ce projet Google Cloud.',
    dailyLimitExceeded: 'Quota de l’API YouTube dépassé pour aujourd’hui. Réessayez demain ou augmentez le quota du projet.',
    forbidden: 'Accès refusé par l’API YouTube. Vérifiez la clé et les restrictions du projet.',
    ipRefererBlocked: 'Clé API YouTube refusée par ses restrictions IP ou HTTP-referrer. Vérifiez les restrictions de YOUTUBE_API_KEY.',
    keyInvalid: 'Clé API YouTube refusée. Vérifiez YOUTUBE_API_KEY et les restrictions de la clé.',
    playlistNotFound: 'Playlist introuvable : la chaîne n’a peut-être aucune vidéo publique.',
    quotaExceeded: 'Quota de l’API YouTube dépassé pour aujourd’hui. Réessayez demain ou augmentez le quota du projet.',
    rateLimitExceeded: 'Limite de débit de l’API YouTube atteinte. Réessayez plus tard.',
    refererBlocked: 'Clé API YouTube refusée par ses restrictions HTTP-referrer. Vérifiez les restrictions de YOUTUBE_API_KEY.',
    userRateLimitExceeded: 'Limite de débit de l’API YouTube atteinte. Réessayez plus tard.',
  };
  const base = messages[reason] || `L’API YouTube a répondu HTTP ${status}. Vérifiez la clé, les autorisations et le quota du projet.`;
  return new YouTubeApiError(base, { status, reason });
}

function pickThumbnail(thumbnails) {
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbnails?.[key]?.url;
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return null;
}

export function parseChannel(data) {
  const item = data?.items?.[0];
  if (!item?.id) return null;
  return {
    channelId: item.id,
    title: String(item.snippet?.title || '').trim(),
    thumbnail: pickThumbnail(item.snippet?.thumbnails),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || null,
  };
}

export function parsePlaylistPage(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const videoIds = [];
  for (const item of items) {
    const id = item?.contentDetails?.videoId;
    if (isVideoId(id) && !videoIds.includes(id)) videoIds.push(id);
  }
  const nextPageToken = typeof data?.nextPageToken === 'string' && data.nextPageToken ? data.nextPageToken : null;
  return { videoIds, nextPageToken };
}

export function parseVideos(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const out = [];
  for (const item of items) {
    if (!isVideoId(item?.id)) continue;
    out.push({
      videoId: item.id,
      title: String(item.snippet?.title || '').trim(),
      channelId: String(item.snippet?.channelId || '').trim(),
      channelTitle: String(item.snippet?.channelTitle || '').trim(),
      publishedAt: String(item.snippet?.publishedAt || '').trim(),
      durationISO: String(item.contentDetails?.duration || '').trim(),
      embeddable: item.status?.embeddable !== false,
      privacyStatus: String(item.status?.privacyStatus || ''),
      uploadStatus: String(item.status?.uploadStatus || ''),
      thumbnail: pickThumbnail(item.snippet?.thumbnails),
    });
  }
  return out;
}

async function defaultTransport(url, { headers, signal } = {}) {
  const response = await fetch(url, { headers, signal });
  let body = null;
  try { body = await response.json(); } catch { /* corps absent sur certaines erreurs réseau */ }
  return { status: response.status, body };
}

// Transport injectable : les tests remplacent fetch, aucun appel réel n’est jamais déclenché dans les tests.
export function createYouTubeClient({ apiKey, transport, timeoutMs = 15000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Clé API YouTube absente : définissez YOUTUBE_API_KEY dans l’environnement du processus de synchronisation.');
  }
  const call = transport || defaultTransport;
  let quotaUnits = 0;

  async function request(endpoint, params, part) {
    quotaUnits += 1;
    const url = `${API_ROOT}/${endpoint}?${new URLSearchParams({ part, ...params })}`;
    const controller = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    let result;
    try {
      result = await call(url, { headers: { 'X-Goog-Api-Key': apiKey, Accept: 'application/json' }, ...controller });
    } catch (error) {
      quotaUnits -= 1; // une requête qui n’a pas atteint l’API ne consomme pas de quota
      throw new YouTubeApiError('L’API YouTube est injoignable depuis cet environnement. Exécutez la synchronisation depuis un environnement autorisé.', { status: 0, reason: 'network' });
    }
    if (!result || result.status < 200 || result.status >= 300) throw apiError(result?.status || 0, result?.body);
    if (!result.body || typeof result.body !== 'object' || Array.isArray(result.body) || result.body.error) {
      throw new YouTubeApiError('Réponse de l’API YouTube absente ou invalide : aucune modification du catalogue ne sera produite.', {
        status: result.status,
        reason: 'invalidResponse',
      });
    }
    return result.body;
  }

  return {
    // channels.list : identifie la chaîne et sa playlist « uploads ».
    async channel(ref) {
      const params = ref.kind === 'id' ? { id: ref.value, maxResults: '1' }
        : ref.kind === 'handle' ? { forHandle: ref.value, maxResults: '1' }
        : { forUsername: ref.value, maxResults: '1' };
      return parseChannel(await request('channels', params, 'snippet,contentDetails'));
    },
    // playlistItems.list : une page de la playlist des vidéos publiées.
    async playlistPage({ playlistId, pageToken = null, maxResults = 50, publishedAfter = null }) {
      const params = { playlistId, maxResults: String(Math.min(Math.max(1, maxResults), 50)) };
      if (pageToken) params.pageToken = pageToken;
      if (publishedAfter) params.publishedAfter = publishedAfter;
      return parsePlaylistPage(await request('playlistItems', params, 'snippet,contentDetails'));
    },
    // videos.list : métadonnées vérifiées par lots de 50 identifiants au maximum.
    async videos(ids) {
      const unique = [...new Set(ids)].filter(isVideoId);
      const all = [];
      for (let index = 0; index < unique.length; index += 50) {
        const chunk = unique.slice(index, index + 50);
        const body = await request('videos', { id: chunk.join(','), maxResults: String(chunk.length) }, 'snippet,contentDetails,status');
        all.push(...parseVideos(body));
      }
      return all;
    },
    quotaUnitsUsed() { return quotaUnits; },
  };
}

// Pagination complète de la playlist « uploads ». « complete » passe à false si l’on s’arrête
// avant la fin (garde de quota) : une liste incomplète ne doit jamais provoquer de suppression.
export async function listUploads(client, { playlistId, maxPages = 40, onPage = null } = {}) {
  const videoIds = [];
  let pageToken = null;
  let pages = 0;
  let complete = false;
  while (true) {
    if (pages >= maxPages) { complete = false; break; }
    const page = await client.playlistPage({ playlistId, pageToken });
    pages += 1;
    videoIds.push(...page.videoIds);
    onPage?.({ pages, collected: videoIds.length, nextPageToken: page.nextPageToken });
    if (!page.nextPageToken) { complete = true; break; }
    pageToken = page.nextPageToken;
  }
  return { videoIds, pages, complete };
}
