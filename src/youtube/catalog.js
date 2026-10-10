// Catalogue RELIA des vidéos YouTube d’une identité locale.
// Le fichier (src/data/youtube/*.json) ne contient que des métadonnées publiques écrites par
// tools/sync-youtube.mjs. Il ne porte jamais de clé API et n’est jamais écrit par le navigateur.
// Les vidéos deviennent des entrées « content » du moteur chronologique existant (src/dates.js) :
// elles portent une date de publication, jamais une date d’événement.
import { createProvenance, validateProvenance, isIsoTimestamp, safeHttpUrl } from '../provenance.js';
import { isLocalId } from '../identity.js';
import { makeDatedEntry, dateFromISO, chronologicalOrder } from '../dates.js';
import { isVideoId } from './client.js';

export const CATALOG_SCHEMA_VERSION = 1;
// Conditions d’utilisation de l’API YouTube : les métadonnées stockées doivent être rafraîchies
// (ou supprimées) au plus tard 30 jours après leur dernière capture.
export const REFRESH_AFTER_DAYS = 30;

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{10,}$/;
const CATALOG_KEYS = Object.freeze(['schemaVersion', 'identityId', 'channels', 'videos', 'sync']);
const CHANNEL_KEYS = Object.freeze(['channelId', 'title', 'url', 'thumbnail', 'declaredAt', 'declaredBy']);
const VIDEO_KEYS = Object.freeze(['videoId', 'title', 'channelId', 'channelTitle', 'publishedAt', 'durationSeconds', 'durationDisplay', 'thumbnail', 'embeddable', 'link', 'discoveredAt', 'provenance']);
const SYNC_KEYS = Object.freeze(['capturedAt', 'mode', 'complete']);

export function refreshByFor(capturedAt) {
  return new Date(Date.parse(capturedAt) + REFRESH_AFTER_DAYS * 86400000).toISOString();
}

// Durée ISO 8601 (PT#H#M#S, avec jours éventuels) → secondes entières.
export function durationSecondsFromISO(value) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(String(value ?? '').trim());
  if (!match || match.every(group => group === undefined)) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map(part => (part === undefined ? 0 : Number(part)));
  const total = days * 86400 + hours * 3600 + minutes * 60 + Math.floor(seconds);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

export function durationDisplay(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Une vidéo entre au catalogue seulement si elle est publique et traitée par YouTube.
// Les vidéos privées, supprimées ou rejetées sont exclues (et retirées à la synchronisation suivante).
export function isSyncableVideo(raw) {
  return raw.privacyStatus === 'public' && raw.uploadStatus === 'processed';
}

export function watchURL(videoId) {
  if (!isVideoId(videoId)) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Métadonnées brutes (videos.list) → entrée de catalogue validée, avec sa provenance datée.
export function catalogEntryFromVideo(raw, { capturedAt } = {}) {
  if (!raw || !isSyncableVideo(raw)) return null;
  if (!isVideoId(raw.videoId)) throw new Error(`Identifiant vidéo YouTube invalide : ${JSON.stringify(raw.videoId)}.`);
  const title = String(raw.title ?? '').trim();
  if (!title) throw new Error('Titre de vidéo YouTube manquant.');
  if (!isIsoTimestamp(raw.publishedAt)) throw new Error(`Date de publication invalide pour ${raw.videoId}.`);
  const channelId = String(raw.channelId ?? '').trim();
  if (!channelId) throw new Error(`Chaîne manquante pour la vidéo ${raw.videoId}.`);
  const link = watchURL(raw.videoId);
  if (!link) throw new Error(`Lien de vidéo invalide : ${raw.videoId}.`);
  const durationSeconds = durationSecondsFromISO(raw.durationISO);
  const provenance = createProvenance({
    method: 'youtube_api',
    sourceId: raw.videoId,
    url: link,
    capturedAt,
    refreshBy: refreshByFor(capturedAt),
    note: 'YouTube Data API v3 · videos.list',
  });
  return Object.freeze({
    videoId: raw.videoId,
    title,
    channelId,
    channelTitle: String(raw.channelTitle ?? '').trim(),
    publishedAt: raw.publishedAt,
    durationSeconds,
    durationDisplay: durationDisplay(durationSeconds),
    thumbnail: typeof raw.thumbnail === 'string' && raw.thumbnail.startsWith('https://') ? raw.thumbnail : null,
    embeddable: raw.embeddable !== false,
    link,
    discoveredAt: capturedAt,
    provenance: [provenance],
  });
}

function sameMetadata(a, b) {
  return a.title === b.title && a.publishedAt === b.publishedAt && a.durationSeconds === b.durationSeconds
    && a.thumbnail === b.thumbnail && a.embeddable === b.embeddable && a.channelTitle === b.channelTitle;
}

// Fusion incrémentale dans le fichier catalogue existant.
// - « full » et pagination complète : la liste remplace celle de la chaîne synchronisée — une vidéo
//   devenue privée ou supprimée est retirée (exigence de conservation des données YouTube).
// - pagination incomplète ou mode « incremental » (publishedAfter) : ajout/mise à jour sans suppression.
// - les vidéos des autres chaînes rattachées ne sont jamais touchées.
export function mergeCatalog(existing, { identityId, channel, entries, capturedAt, mode = 'full', complete = true }) {
  if (!isLocalId(identityId)) throw new Error(`Identité locale invalide : ${identityId}.`);
  if (existing && existing.identityId && existing.identityId !== identityId) {
    throw new Error(`Ce fichier catalogue appartient à ${existing.identityId}.`);
  }
  const previousVideos = Array.isArray(existing?.videos) ? existing.videos : [];
  const previousChannels = Array.isArray(existing?.channels) ? existing.channels : [];
  const others = previousVideos.filter(video => video.channelId !== channel.channelId);
  const sameChannel = previousVideos.filter(video => video.channelId === channel.channelId);

  const incoming = new Map();
  for (const entry of entries) {
    if (!incoming.has(entry.videoId)) incoming.set(entry.videoId, entry);
  }
  const kept = [];
  let updated = 0;
  if (mode === 'full' && complete) {
    kept.push(...others);
  } else {
    kept.push(...others, ...sameChannel.filter(video => !incoming.has(video.videoId)));
  }
  for (const entry of incoming.values()) {
    const previous = sameChannel.find(video => video.videoId === entry.videoId);
    if (previous && sameMetadata(previous, entry)) {
      kept.push({ ...entry, discoveredAt: previous.discoveredAt || entry.discoveredAt });
      updated += 1;
    } else {
      kept.push({ ...entry, discoveredAt: previous?.discoveredAt || entry.discoveredAt });
    }
  }

  const declaredAt = previousChannels.find(item => item.channelId === channel.channelId)?.declaredAt || capturedAt;
  const channels = [
    ...previousChannels.filter(item => item.channelId !== channel.channelId),
    {
      channelId: channel.channelId,
      title: channel.title || channel.channelId,
      url: channel.url || `https://www.youtube.com/channel/${channel.channelId}`,
      thumbnail: channel.thumbnail ?? null,
      declaredAt,
      declaredBy: 'owner',
    },
  ].sort((a, b) => a.channelId.localeCompare(b.channelId));

  const catalog = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    identityId,
    channels,
    videos: kept.sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : a.publishedAt > b.publishedAt ? 1 : a.videoId.localeCompare(b.videoId))),
    sync: { capturedAt, mode, complete },
  };
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(`Catalogue invalide après fusion : ${errors.join(' ')}`);
  const added = kept.length - sameChannel.length;
  const removed = mode === 'full' && complete ? Math.max(0, sameChannel.length - [...incoming.keys()].length) : 0;
  return { catalog, added, updated, removed };
}

function unknownKeys(record, allowed) {
  return Object.keys(record || {}).filter(key => !allowed.includes(key));
}

// Validation stricte du fichier catalogue : clés fermées (aucune donnée smugglée, aucune clé API),
// URL sûres, provenances complètes avec échéance de rafraîchissement.
export function validateCatalog(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['Catalogue absent ou invalide.'];
  errors.push(...unknownKeys(raw, CATALOG_KEYS).map(key => `Champ de catalogue inattendu : ${key}.`));
  if (raw.schemaVersion !== CATALOG_SCHEMA_VERSION) errors.push('Version de schéma inconnue.');
  if (!isLocalId(raw.identityId)) errors.push('Identité locale invalide.');
  const channels = Array.isArray(raw.channels) ? raw.channels : null;
  if (!channels) errors.push('Liste de chaînes manquante.');
  const channelIds = new Set();
  for (const channel of channels || []) {
    const prefix = `Chaîne ${channel?.channelId || '?'} :`;
    if (!channel || typeof channel !== 'object') { errors.push(`${prefix} enregistrement invalide.`); continue; }
    errors.push(...unknownKeys(channel, CHANNEL_KEYS).map(key => `${prefix} champ inattendu : ${key}.`));
    if (!CHANNEL_ID.test(channel.channelId || '')) errors.push(`${prefix} identifiant de chaîne invalide.`);
    if (channelIds.has(channel.channelId)) errors.push(`${prefix} déclarée deux fois.`);
    channelIds.add(channel.channelId);
    if (typeof channel.title !== 'string' || !channel.title.trim()) errors.push(`${prefix} titre manquant.`);
    if (!safeHttpUrl(channel.url || '')) errors.push(`${prefix} URL invalide.`);
    if (channel.thumbnail != null && !safeHttpUrl(channel.thumbnail)) errors.push(`${prefix} miniature invalide.`);
    if (!isIsoTimestamp(channel.declaredAt)) errors.push(`${prefix} date de déclaration manquante.`);
    if (channel.declaredBy !== 'owner') errors.push(`${prefix} rattachement non déclaré par le propriétaire.`);
  }
  const videos = Array.isArray(raw.videos) ? raw.videos : null;
  if (!videos) errors.push('Liste de vidéos manquante.');
  const seen = new Set();
  for (const video of videos || []) {
    const id = video?.videoId || '?';
    if (!video || typeof video !== 'object') { errors.push(`Vidéo ${id} : enregistrement invalide.`); continue; }
    errors.push(...unknownKeys(video, VIDEO_KEYS).map(key => `Vidéo ${id} : champ inattendu : ${key}.`));
    if (!isVideoId(video.videoId)) errors.push(`Vidéo ${id} : identifiant invalide.`);
    if (seen.has(video.videoId)) errors.push(`Vidéo ${id} : dupliquée.`);
    seen.add(video.videoId);
    if (typeof video.title !== 'string' || !video.title.trim()) errors.push(`Vidéo ${id} : titre manquant.`);
    if (!channelIds.has(video.channelId)) errors.push(`Vidéo ${id} : chaîne non rattachée (${video.channelId}).`);
    if (!isIsoTimestamp(video.publishedAt)) errors.push(`Vidéo ${id} : date de publication invalide.`);
    if (video.durationSeconds != null && (!Number.isInteger(video.durationSeconds) || video.durationSeconds < 0)) errors.push(`Vidéo ${id} : durée invalide.`);
    if (typeof video.durationDisplay !== 'string') errors.push(`Vidéo ${id} : affichage de durée invalide.`);
    if (video.thumbnail != null && !safeHttpUrl(video.thumbnail)) errors.push(`Vidéo ${id} : miniature invalide.`);
    if (typeof video.embeddable !== 'boolean') errors.push(`Vidéo ${id} : droit d’intégration invalide.`);
    if (safeHttpUrl(video.link || '') === null) errors.push(`Vidéo ${id} : lien invalide.`);
    if (!isIsoTimestamp(video.discoveredAt)) errors.push(`Vidéo ${id} : date de découverte invalide.`);
    if (!Array.isArray(video.provenance) || !video.provenance.length) {
      errors.push(`Vidéo ${id} : provenance manquante.`);
    } else {
      for (const provenance of video.provenance) {
        const provenanceErrors = validateProvenance(provenance);
        errors.push(...provenanceErrors.map(error => `Vidéo ${id} : ${error}`));
        if (provenance?.method !== 'youtube_api') errors.push(`Vidéo ${id} : méthode de provenance inattendue.`);
        if (provenance?.sourceId !== video.videoId) errors.push(`Vidéo ${id} : provenance d’une autre vidéo.`);
      }
    }
  }
  errors.push(...unknownKeys(raw.sync, SYNC_KEYS).map(key => `Champ de synchronisation inattendu : ${key}.`));
  if (!isIsoTimestamp(raw.sync?.capturedAt)) errors.push('Date de synchronisation invalide.');
  if (!['full', 'incremental'].includes(raw.sync?.mode)) errors.push('Mode de synchronisation inconnu.');
  if (typeof raw.sync?.complete !== 'boolean') errors.push('État de pagination invalide.');
  return errors;
}

// Conversion vers le moteur chronologique existant : entrées « content » datées par publication.
export function toDatedEntries(catalog) {
  const entries = [];
  for (const video of catalog.videos) {
    const publishedAt = dateFromISO(video.publishedAt);
    if (!publishedAt) continue; // déjà refusé par validateCatalog : garde défensive
    entries.push(makeDatedEntry({
      id: `youtube:${video.videoId}`,
      subjectId: catalog.identityId,
      kind: 'content',
      title: video.title,
      publishedAt,
      discoveredAt: video.discoveredAt,
      provenance: video.provenance,
    }));
  }
  return entries;
}

// Chronologie ascendante (plus ancienne publication → plus récente), vidée des entrées sans date.
// Réutilise chronologicalOrder de src/dates.js : aucun deuxième moteur de chronologie.
export function orderedChronology(catalog) {
  const entries = toDatedEntries(catalog);
  const { dated, undated } = chronologicalOrder(entries, 'publication');
  const byId = new Map(catalog.videos.map(video => [`youtube:${video.videoId}`, video]));
  const rows = dated.map(entry => ({ entry, video: byId.get(entry.id) })).filter(row => row.video);
  return { rows, undated };
}

export function emptyCatalog(identityId, capturedAt) {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    identityId,
    channels: [],
    videos: [],
    sync: { capturedAt, mode: 'full', complete: true },
  };
}
