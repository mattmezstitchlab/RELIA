// Brouillons uniquement sur cet appareil. Aucun POST, aucun secret, aucune modification du
// catalogue. Les imports sont validés avant toute mutation ou écriture de stockage.
import { isVideoId } from '../youtube/client.js';
import { emptyDraft, MAX_DRAFT_BYTES, parseDraft, validateDraft } from './model.js';

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export class DocumentaryDraftStore {
  constructor({ catalog, seed, storage = defaultStorage(), now = () => new Date().toISOString() }) {
    this.context = { catalog, seed };
    this.storage = storage;
    this.now = now;
    this.key = `relia-documentary-v1:${catalog.identityId}`;
    this.warning = '';
    this.draft = emptyDraft(catalog.identityId, now());
    try {
      const raw = storage?.getItem(this.key);
      if (raw) this.draft = parseDraft(raw, this.context);
    } catch {
      // Ne pas détruire silencieusement un ancien brouillon invalide ou incompatible.
      this.warning = 'Brouillon local non chargé (invalide, incompatible ou stockage indisponible). La version éditoriale est affichée ; aucune donnée du catalogue n’a changé.';
    }
  }
  read() { return structuredClone(this.draft); }
  persist(next) {
    const errors = validateDraft(next, this.context);
    if (errors.length) throw new Error(errors.join('\n'));
    const json = JSON.stringify(next);
    if (new TextEncoder().encode(json).length > MAX_DRAFT_BYTES) throw new Error('Brouillon trop volumineux : limite de 1 Mo.');
    let persisted = false;
    try {
      if (this.storage) { this.storage.setItem(this.key, json); persisted = true; }
    } catch { /* Toujours conserver la correction validée en mémoire. */ }
    this.draft = structuredClone(next);
    this.warning = persisted ? '' : 'Correction conservée pour cette session seulement. Exportez le brouillon JSON : le stockage de cet appareil est indisponible.';
    return { persisted, draft: this.read(), warning: this.warning };
  }
  saveRecord(videoId, record, addedSources = []) {
    if (!isVideoId(videoId)) throw new Error('Identifiant vidéo de correction invalide.');
    const next = this.read();
    next.records[videoId] = structuredClone(record);
    next.sources.push(...structuredClone(addedSources));
    next.updatedAt = this.now();
    return this.persist(next);
  }
  importText(raw) {
    const next = parseDraft(raw, this.context);
    next.updatedAt = this.now();
    return this.persist(next);
  }
  resetVideo(videoId) {
    if (!isVideoId(videoId)) throw new Error('Identifiant vidéo de correction invalide.');
    const next = this.read();
    delete next.records[videoId];
    const used = new Set(Object.values(next.records).flatMap(record => [
      ...record.narration.sourceIds,
      ...Object.values(record.claims).flatMap(claim => claim.sourceIds),
    ]));
    next.sources = next.sources.filter(source => used.has(source.id));
    next.updatedAt = this.now();
    return this.persist(next);
  }
  exportText() { return JSON.stringify(this.draft, null, 2); }
}

export function exportNarration(documentary) {
  const lines = [
    '# RELIA — Raconter une vie en musique',
    '',
    `${documentary.from}–${documentary.to} · ${documentary.steps.length} séquences sélectionnées sur ${documentary.catalogCount} archives.`,
    '',
    'Script éditorial séparé de toute génération audio. Les liens de montage ne sont pas des faits biographiques. Aucune parole protégée reproduite.',
  ];
  for (const chapter of documentary.chapters) {
    lines.push('', `## ${chapter.from}–${chapter.to} · ${chapter.title}`, '', chapter.note);
    if (!chapter.steps.length) lines.push('', 'Aucune séquence sélectionnée dans ce chapitre.');
    for (const step of chapter.steps) {
      lines.push('', `### Séquence ${step.index + 1} · ${step.video.title}`, '',
        `Source vidéo : ${step.video.link}`, '',
        `Statut : ${step.narration.playable ? 'relue dans le périmètre documenté' : 'À RELIRE — non jouée automatiquement'}.`, '',
        step.narration.text || '(Script à écrire)', '', '**Transition originale**', '', step.narration.transition || '(Aucune transition)');
      if (step.narration.reviewReasons.length) lines.push('', ...step.narration.reviewReasons.map(reason => `- ${reason}`));
      const ids = new Set(step.narration.sourceIds);
      for (const source of documentary.sources.filter(source => ids.has(source.id))) {
        lines.push('', `- ${source.label} : ${source.url || 'souvenir personnel privé'} · consultation ${source.checkedAt}${source.refreshBy ? ` · rafraîchissement avant ${source.refreshBy}` : ''}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
