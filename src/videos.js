// Vidéos liées à une identité, sans clé d’API :
// - identifiants YouTube déclarés dans Wikidata (P1651), lus sur l’entité déjà chargée ;
// - fichiers vidéo de Wikimedia Commons dont le titre contient le nom (recherche exacte, filetype:video).
// Un échec n’est jamais bloquant : la liste reste vide.
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export const MAX_VIDEOS = 12;

function httpsURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function youtubeIdsFromClaims(claims = {}) {
  const ids = [];
  for (const claim of claims.P1651 || []) {
    if (claim.rank === 'deprecated') continue;
    const value = claim.mainsnak?.datavalue?.value;
    const id = typeof value === 'string' ? value.trim() : '';
    if (YOUTUBE_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 4);
}

export function youtubeItems(ids, label = '') {
  return ids.map(id => ({
    kind: 'youtube',
    id: `yt-${id}`,
    title: label ? `Vidéo YouTube · ${label}` : 'Vidéo YouTube',
    poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    source: `https://www.youtube.com/watch?v=${id}`,
  }));
}

export function commonsVideoURL(name) {
  const phrase = String(name || '').replace(/["\\]/g, '').trim();
  return `${COMMONS_API}?${new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrsearch: `"${phrase}" filetype:video`, gsrlimit: String(MAX_VIDEOS),
    prop: 'imageinfo', iiprop: 'url|mime|mediatype', iiurlwidth: '480',
  })}`;
}

export function parseCommonsVideos(data) {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];
  const items = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const src = httpsURL(info?.url);
    if (!src) continue;
    const isVideo = info.mediatype === 'VIDEO' || String(info.mime || '').startsWith('video/');
    if (!isVideo) continue;
    const title = String(page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ');
    items.push({
      kind: 'file',
      id: `commons-${page.pageid ?? title}`,
      title,
      poster: httpsURL(info.thumburl),
      src,
      mime: info.mime || 'video/webm',
      source: httpsURL(info.descriptionurl) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
      index: Number.isFinite(page.index) ? page.index : items.length,
    });
  }
  return items.sort((a, b) => a.index - b.index).slice(0, MAX_VIDEOS).map(({ index, ...item }) => item);
}

export async function fetchCommonsVideos(name, { signal } = {}) {
  const response = await fetch(commonsVideoURL(name), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseCommonsVideos(await response.json());
}
