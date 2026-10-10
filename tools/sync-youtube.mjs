#!/usr/bin/env node
// Synchronisation RELIA ↔ YouTube — s’exécute hors navigateur, dans un environnement autorisé
// à joindre googleapis.com. Le navigateur n’exécute jamais ce fichier et ne voit jamais la clé.
//
// Clé : uniquement via la variable d’environnement YOUTUBE_API_KEY (secret CI, variable privée…).
// Elle n’est jamais écrite dans le dépôt, dans les journaux ni dans le fichier catalogue produit.
//
// Exemples :
//   YOUTUBE_API_KEY=… node tools/sync-youtube.mjs --check --channel https://www.youtube.com/@handle
//   YOUTUBE_API_KEY=… node tools/sync-youtube.mjs --channel https://www.youtube.com/channel/UC… --identity relia:person:matt-mez-sax
//   YOUTUBE_API_KEY=… node tools/sync-youtube.mjs                       # resynchronise les chaînes déjà rattachées
//   YOUTUBE_API_KEY=… node tools/sync-youtube.mjs --since 2026-01-01    # incrémental : ajouts/mises à jour seulement
//   node tools/sync-youtube.mjs --dry-run --channel …                   # aucun fichier écrit
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelRefFromURL, createYouTubeClient, listUploads, YouTubeApiError } from '../src/youtube/client.js';
import {
  catalogEntryFromVideo, isSyncableVideo, mergeCatalog, validateCatalog,
} from '../src/youtube/catalog.js';
import { isLocalId } from '../src/identity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_IDENTITY = 'relia:person:matt-mez-sax';

function fail(message, code = 2) {
  console.error(`\n✗ ${message}`);
  process.exit(code);
}

const { values: args } = parseArgs({
  options: {
    channel: { type: 'string' },
    identity: { type: 'string' },
    out: { type: 'string' },
    'max-pages': { type: 'string', default: '40' },
    since: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`Synchronisation YouTube → catalogue RELIA.

Options :
  --channel <URL|ID>   Chaîne officielle déclarée par le propriétaire (URL /channel/…, /@handle,
                       /user/… ou identifiant UC…). Obligatoire au premier lancement ; ensuite,
                       sans cette option, toutes les chaînes déjà rattachées sont resynchronisées.
  --identity <id>      Identité locale RELIA (défaut : ${DEFAULT_IDENTITY}).
  --out <chemin>       Fichier catalogue (défaut : src/data/youtube/<slug>.json).
  --max-pages <n>      Garde de quota : pages playlistItems maximum par chaîne (défaut 40).
  --since <AAAA-MM-JJ> Mode incrémental : vidéos publiées après cette date (aucune suppression).
  --check              Vérifie seulement que cet environnement rejoint l’API YouTube (1 unité de quota).
  --dry-run            Calcule tout mais n’écrit aucun fichier.
  --help               Affiche cette aide.

Clé : variable d’environnement YOUTUBE_API_KEY, jamais passée en ligne de commande.`);
  process.exit(0);
}

// 1. Clé : environnement uniquement. Elle n’est ni affichée, ni journalisée, ni écrite.
const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
if (!apiKey) {
  fail('YOUTUBE_API_KEY absente. Définissez-la dans l’environnement du processus (jamais dans le dépôt ni en ligne de commande).');
}

// 2. Identité locale et fichier catalogue.
const identityId = args.identity || DEFAULT_IDENTITY;
if (!isLocalId(identityId)) fail(`Identité locale invalide : ${identityId}`);
const slug = identityId.split(':')[2];
const defaultOut = resolve(ROOT, 'src/data/youtube', `${slug}.json`);
const outPath = args.out ? resolve(process.cwd(), args.out) : defaultOut;
const allowedDir = resolve(ROOT, 'src/data/youtube');
if (!outPath.startsWith(allowedDir)) fail(`Le fichier catalogue doit rester dans src/data/youtube/ : ${outPath}`);

let existing = null;
if (existsSync(outPath)) {
  try {
    existing = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch {
    fail(`${outPath} n’est pas un JSON valide. Corrigez ou supprimez ce fichier.`);
  }
  const errors = validateCatalog(existing);
  if (errors.length) fail(`${outPath} est invalide : ${errors.join(' ')}`);
  if (existing.identityId !== identityId) fail(`${outPath} appartient à ${existing.identityId}, pas à ${identityId}.`);
}

// 3. Chaînes à synchroniser : celle déclarée en option, ou toutes les chaînes déjà rattachées.
const requestedRefs = [];
if (args.channel) {
  const ref = channelRefFromURL(args.channel);
  if (!ref) {
    fail('Référence de chaîne non reconnue. Utilisez une URL officielle (/channel/UC…, /@handle, /user/…), un identifiant UC… — jamais un simple nom.');
  }
  const bound = existing?.channels?.find(channel => channel.channelId === ref.value);
  requestedRefs.push({ ref, declared: bound ? { declaredAt: bound.declaredAt } : null });
} else if (existing?.channels?.length) {
  for (const channel of existing.channels) requestedRefs.push({ ref: { kind: 'id', value: channel.channelId }, declared: { declaredAt: channel.declaredAt } });
} else {
  fail('Aucune chaîne à synchroniser : fournissez --channel <URL officielle> (rattachement déclaré par le propriétaire).');
}

const maxPages = Math.max(1, Number.parseInt(args['max-pages'], 10) || 40);
const mode = args.since ? 'incremental' : 'full';
if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) fail('Format de --since invalide : attendu AAAA-MM-JJ.');
if (args.since && Number.isNaN(Date.parse(`${args.since}T00:00:00Z`))) fail(`Date --since invalide : ${args.since}`);
const capturedAt = new Date().toISOString();

// 4. Vérification de portée réseau : une seule requête, puis arrêt.
const client = createYouTubeClient({ apiKey });
if (args.check) {
  try {
    const channel = await client.channel(requestedRefs[0].ref);
    if (!channel) fail('Chaîne introuvable via l’API : vérifiez la référence déclarée (aucune correspondance approximative n’est tentée).', 3);
    console.log(`\n✓ API YouTube joignable depuis cet environnement (${client.quotaUnitsUsed()} unité(s) de quota).`);
    console.log(`  Chaîne : ${channel.title} · ${channel.channelId}`);
    console.log('  Prochaine étape : lancer la synchronisation complète sans --check.');
    process.exit(0);
  } catch (error) {
    fail(`API YouTube injoignable ou refusée depuis cet environnement : ${error.message} Exécutez la synchronisation depuis un environnement autorisé (poste local, CI privée).`, 3);
  }
}

console.log(`\nSynchronisation RELIA · ${identityId}${args.since ? ` · incrémental depuis ${args.since}` : ' · complet'}\n`);
let catalog = existing || null;
let totalAdded = 0, totalUpdated = 0, totalRemoved = 0;

for (const { ref, declared } of requestedRefs) {
  // 5. channels.list : résolution explicite. Aucune correspondance par nom, jamais.
  const channel = await client.channel(ref).catch(error => {
    fail(`Résolution de la chaîne impossible : ${error.message}`, 3);
  });
  if (!channel) fail(`Chaîne introuvable pour la référence déclarée (${ref.kind} : ${ref.value}). Aucune correspondance approximative n’est tentée.`, 3);
  if (!channel.uploadsPlaylistId) fail(`La chaîne ${channel.title} (${channel.channelId}) n’expose pas de playlist « uploads ».`, 3);
  console.log(`Chaîne : ${channel.title} · ${channel.channelId}`);

  // 6. playlistItems.list paginé, puis videos.list par lots de 50 (vérification des métadonnées).
  const listing = await listUploads(client, {
    playlistId: channel.uploadsPlaylistId,
    maxPages,
    publishedAfter: args.since ? `${args.since}T00:00:00Z` : null,
    onPage: ({ pages, collected }) => {
      process.stdout.write(`  page ${pages} · ${collected} vidéo(s) collectée(s)\r`);
    },
  });
  process.stdout.write('\n');
  if (listing.pages >= maxPages && !listing.complete) {
    console.log(`  ⚠ garde de quota atteinte (${maxPages} pages) : liste incomplète → aucune suppression, fichier marqué incomplet.`);
  }
  const rawVideos = await client.videos(listing.videoIds);
  const syncable = rawVideos.filter(isSyncableVideo);
  const skipped = rawVideos.length - syncable.length;
  if (skipped) console.log(`  ${skipped} vidéo(s) ignorée(s) : privée(s), supprimée(s) ou non traitée(s).`);

  const entries = [];
  for (const raw of syncable) {
    try {
      const entry = catalogEntryFromVideo(raw, { capturedAt });
      if (entry) entries.push(entry);
    } catch (error) {
      console.log(`  ⚠ vidéo ignorée : ${error.message}`);
    }
  }

  // 7. Fusion incrémentale + conservation/conformité (30 jours, suppression des vidéos disparues).
  const result = mergeCatalog(catalog, {
    identityId,
    channel: { channelId: channel.channelId, title: channel.title, url: args.channel || declared?.url || null, thumbnail: channel.thumbnail },
    entries,
    capturedAt,
    mode,
    complete: listing.complete,
  });
  catalog = result.catalog;
  totalAdded += result.added;
  totalUpdated += result.updated;
  totalRemoved += result.removed;
  console.log(`  ${entries.length} vidéo(s) publique(s) · +${result.added} ajoutée(s) · ${result.updated} inchangée(s) · −${result.removed} retirée(s)\n`);
}

catalog.sync.capturedAt = capturedAt;
catalog.sync.mode = mode;

// 8. Écriture (métadonnées publiques uniquement — la clé ne quitte jamais ce processus).
if (args['dry-run']) {
  console.log('Dry-run : aucun fichier écrit.');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Catalogue écrit : ${outPath}`);
}

console.log(`\nTotal : +${totalAdded} ajoutée(s) · ${totalUpdated} inchangée(s) · −${totalRemoved} retirée(s) · ${catalog.videos.length} vidéo(s) au catalogue.`);
console.log(`Quota consommé : ${client.quotaUnitsUsed()} unité(s) (estimation : 1 par appel channels/playlistItems/videos).`);
console.log(`Prochaine synchronisation conseillée avant le ${new Date(Date.parse(capturedAt) + 30 * 86400000).toISOString().slice(0, 10)} (conservation des métadonnées).`);
