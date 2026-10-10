import { formatDate, dateFromISO } from '../dates.js';
import {
  CLAIM_FIELDS, CONFIDENCE_LABELS, SOURCE_KINDS, THEME_TAGS, catalogFingerprint,
  prepareRecordForSave, recordFor, sourcesFor, unknownClaim,
} from './model.js';
import { action, externalLink, field, node } from './dom.js';

function input(id, value = '', { type = 'text', maxLength = 500, multiline = false } = {}) {
  const control = node(multiline ? 'textarea' : 'input', 'doc-input');
  control.id = id;
  if (!multiline) control.type = type;
  control.value = value;
  control.maxLength = maxLength;
  if (multiline) control.rows = 3;
  return control;
}
function select(id, options, value) {
  const control = node('select', 'doc-input');
  control.id = id;
  for (const [key, label] of options) {
    const option = node('option', '', label);
    option.value = key;
    option.selected = key === value;
    control.append(option);
  }
  return control;
}
function checkbox(id, label, checked = false) {
  const wrap = node('label', 'doc-check');
  const control = input(id, '', { type: 'checkbox' });
  control.className = '';
  control.checked = checked;
  wrap.append(control, node('span', '', label));
  return { wrap, control };
}

// Chaque confirmation est déclarée par un humain, avec un lien et une justification.
// Les titres/publications restent en lecture seule, et les souvenirs ne sont pas ajoutés au script.
export class DocumentaryEditor {
  constructor(root, { catalog, seed, store, videoId, onSaved, onCancel }) {
    this.root = root;
    this.catalog = catalog;
    this.seed = seed;
    this.store = store;
    this.video = catalog.videos.find(video => video.videoId === videoId);
    if (!this.video) throw new Error('La vidéo n’est plus présente dans le catalogue.');
    this.previous = recordFor(this.video, seed, store.read());
    this.controls = new Map();
    this.dirty = false;
    this.onSaved = onSaved;
    this.mount(onCancel);
  }
  mount(onCancel) {
    const record = this.previous;
    this.root.replaceChildren();
    const head = node('header', 'doc-editor-header');
    head.append(node('p', 'doc-eyebrow', 'ATELIER ÉDITORIAL / BROUILLON LOCAL'), node('h2', 'doc-editor-title', 'Préciser, sans inventer.'), node('p', 'body-text', 'Une chanson n’est pas un souvenir. Un titre n’est pas une date d’événement. Confirmez ce que les sources permettent de vérifier ; gardez le reste comme hypothèse.'));
    const readOnly = node('div', 'doc-readonly');
    readOnly.append(node('h3', '', this.video.title), node('p', '', `Publié le ${formatDate(dateFromISO(this.video.publishedAt))} · ${this.video.durationDisplay} · métadonnées en lecture seule`), externalLink('Source vidéo sur YouTube ↗', this.video.link));
    head.append(readOnly, node('p', 'doc-privacy', 'Cet atelier ne modifie jamais le catalogue YouTube réel. Le brouillon reste sur cet appareil ; un export peut contenir des souvenirs privés. Une relecture locale n’est ni authentifiée ni vérifiée automatiquement par RELIA.'));
    this.root.append(head);
    this.form = node('form', 'doc-editor-form');
    this.form.id = 'doc-editor-form';
    this.error = node('div', 'doc-warning');
    this.error.id = 'doc-editor-errors';
    this.error.setAttribute('role', 'alert');
    this.error.tabIndex = -1;
    this.error.hidden = true;
    this.form.append(this.error);

    const montage = node('fieldset', 'doc-fieldset');
    montage.append(node('legend', '', 'Le montage'));
    this.selected = checkbox('doc-edit-selected', 'Retenir cette vidéo dans le documentaire (le tri reste celui des publications)', record.selected);
    this.reason = input('doc-edit-selection-reason', record.selectionReason, { maxLength: 600, multiline: true });
    montage.append(this.selected.wrap, field('Pourquoi retenir cette séquence ?', this.reason, 'Un choix éditorial justifié, pas un classement automatique de popularité.'));
    const excerpts = node('div', 'doc-fields-pair');
    this.start = input('doc-edit-excerpt-start', String(record.excerpt.startSeconds), { type: 'number' });
    this.start.min = '0'; this.start.max = String(Math.max(0, (this.video.durationSeconds || 86401) - 1)); this.start.step = '1';
    this.duration = input('doc-edit-excerpt-duration', String(record.excerpt.durationSeconds), { type: 'number' });
    this.duration.min = '5'; this.duration.max = '120'; this.duration.step = '1';
    excerpts.append(field('Début d’extrait (secondes)', this.start), field('Durée de montage (secondes)', this.duration, '5 à 120 secondes, bornée à la durée de la vidéo. Aucun fichier extrait.'));
    montage.append(excerpts);
    this.form.append(montage);

    const script = node('fieldset', 'doc-fieldset');
    script.append(node('legend', '', 'Le récit et sa passerelle'));
    this.scriptText = input('doc-edit-script', record.narration.text, { maxLength: 2500, multiline: true });
    this.scriptText.rows = 6;
    this.transition = input('doc-edit-transition', record.narration.transition, { maxLength: 1000, multiline: true });
    this.scriptReviewed = checkbox('doc-edit-script-reviewed', 'J’ai relu cette version du script et ses transitions : aucun souvenir non corroboré ni hypothèse n’y est présenté comme un fait.');
    script.append(field('Texte de voix off (français)', this.scriptText, 'Texte original, chaleureux. Pas de paroles protégées intégrales. L’audio reste séparé du script.'), field('Transition narrative originale', this.transition, 'Un lien de montage n’est pas une explication biographique.'), this.scriptReviewed.wrap, node('p', 'fine-print', 'Une modification du texte crée un brouillon non joué automatiquement jusqu’à relecture explicite. RELIA ne vérifie pas la sémantique du texte libre. Modifier un fait cité suspend aussi le script s’il n’a pas été adapté et relu.'));
    this.form.append(script);

    const allSources = sourcesFor(this.catalog, this.seed, this.store.read());
    const relevantSourceIds = new Set([`catalog:${this.video.videoId}`, ...record.narration.sourceIds, ...Object.values(record.claims).flatMap(claim => claim.sourceIds)]);
    const availableSources = allSources.filter(source => source.kind !== 'catalog' || relevantSourceIds.has(source.id));
    for (const id of relevantSourceIds) if (!allSources.some(source => source.id === id)) availableSources.push({ id, kind: 'catalog', label: `Vidéo indisponible · ${id.slice(8)} (retirer seulement après adaptation du texte)` });
    this.scriptSources = node('select', 'doc-input doc-source-select');
    this.scriptSources.id = 'doc-edit-script-sources';
    this.scriptSources.multiple = true;
    this.scriptSources.size = 4;
    for (const item of availableSources) {
      const option = node('option', '', `${SOURCE_KINDS[item.kind]} · ${item.label}`);
      option.value = item.id; option.selected = record.narration.sourceIds.includes(item.id);
      this.scriptSources.append(option);
    }
    script.insertBefore(field('Sources du récit et de ses transitions', this.scriptSources, 'Conserver les références des vidéos voisines lorsqu’elles sont citées. Retirer une référence exige une nouvelle relecture du script ; aucun contenu distant n’est collecté.'), this.scriptReviewed.wrap);
    if (record.reviewFingerprint !== catalogFingerprint(this.video)) head.append(node('p', 'doc-warning', 'Le titre ou la publication a changé depuis la relecture. Les anciennes confirmations sont suspendues : relisez les sources et le script, ou gardez les informations comme hypothèses.'));
    for (const [key, label] of Object.entries(CLAIM_FIELDS)) this.form.append(this.claimEditor(key, label, record.claims[key], availableSources));

    const themes = node('fieldset', 'doc-fieldset');
    themes.append(node('legend', '', 'Thèmes du morceau (pas de la biographie)'));
    this.tags = new Map();
    const tags = node('div', 'doc-tags-editor');
    for (const tag of THEME_TAGS) {
      const entry = checkbox(`doc-edit-tag-${THEME_TAGS.indexOf(tag)}`, tag, record.themeTags.includes(tag));
      this.tags.set(tag, entry.control);
      tags.append(entry.wrap);
    }
    themes.append(tags, node('p', 'fine-print', 'Les étiquettes ne sont conservées que si le résumé du sens est confirmé par une source musicale autorisée.'));
    this.form.append(themes);

    const review = node('fieldset', 'doc-fieldset');
    review.append(node('legend', '', 'Votre relecture'));
    this.reviewer = input('doc-edit-reviewer', '', { maxLength: 100 });
    this.consulted = checkbox('doc-edit-consulted', 'J’ai consulté les sources citées pour les informations que je confirme. Une confirmation reste une relecture déclarée, pas une certification automatique par RELIA.');
    review.append(field('Nom de relecture (déclaration non authentifiée)', this.reviewer, 'Requis pour toute nouvelle confirmation, nouvelle source ou relecture de script.'), this.consulted.wrap);
    this.form.append(review);

    const tools = node('div', 'doc-editor-actions');
    const save = node('button', 'btn primary', 'Enregistrer le brouillon local');
    save.id = 'doc-editor-save'; save.type = 'submit';
    tools.append(save, action('Annuler', onCancel, 'pill small'), action('Retirer mes corrections de cette vidéo', () => {
      if (!window.confirm('Retirer seulement vos corrections locales de cette vidéo ? La version éditoriale sera restaurée ; le catalogue ne changera pas.')) return;
      try {
        const result = this.store.resetVideo(this.video.videoId);
        this.dirty = false;
        this.onSaved(result);
      } catch (error) { this.showError(error.message); }
    }, 'pill small'));
    this.form.append(tools);
    this.form.addEventListener('input', () => { this.dirty = true; });
    this.form.addEventListener('change', () => { this.dirty = true; });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.save(); });
    this.root.append(this.form);
  }
  claimEditor(key, label, claim, availableSources) {
    const details = node('details', 'doc-disclosure doc-claim-editor');
    details.dataset.claim = key;
    details.append(node('summary', '', `${label} · ${claim.status === 'unknown' ? 'non documenté' : claim.status === 'hypothesis' ? 'à confirmer' : 'confirmé par relecture'}`));
    const group = node('div', 'doc-claim-fields');
    const value = key === 'classification'
      ? select(`doc-edit-${key}-value`, [['', 'Inconnue'], ['cover', 'Reprise'], ['original', 'Composition originale']], claim.value || '')
      : input(`doc-edit-${key}-value`, claim.value || '', { maxLength: key === 'theme' ? 400 : key === 'memory' ? 1200 : 500, multiline: ['theme', 'memory', 'writers'].includes(key) });
    const hint = key === 'eventDate' ? 'AAAA, AAAA-MM ou AAAA-MM-JJ ; préfixe ~ seulement si la source indique une approximation. Un document d’événement est obligatoire pour confirmer.'
      : key === 'memory' ? 'Souvenir personnel : garder comme hypothèse non corroborée. Un document de l’événement est requis pour confirmer. Jamais ajouté automatiquement au script.'
        : key === 'theme' ? 'Résumé du sens, pas copie des paroles ; uniquement d’après un créateur ou éditeur musical autorisé.'
          : key === 'originalArtist' ? 'Ne pas confondre interprète d’une reprise et artiste de l’œuvre originale.'
            : key === 'writers' ? 'Ne pas attribuer automatiquement l’œuvre à son interprète ou à l’arrangeur d’une partition.' : 'Aucune identification automatique depuis le titre de la vidéo.';
    group.append(field(label, value, hint));
    const status = select(`doc-edit-${key}-status`, [['unknown', 'Non documenté'], ['hypothesis', 'Hypothèse · à confirmer'], ['confirmed', 'Confirmé après relecture des sources']], claim.status);
    const confidence = select(`doc-edit-${key}-confidence`, Object.entries(CONFIDENCE_LABELS), claim.confidence);
    const pair = node('div', 'doc-fields-pair');
    pair.append(field('Statut de l’information', status), field('Degré de confiance', confidence));
    group.append(pair);
    value.addEventListener('input', () => {
      if (value.value.trim() && status.value === 'unknown') { status.value = 'hypothesis'; confidence.value = 'low'; }
    });
    value.addEventListener('change', () => {
      if (value.value.trim() && status.value === 'unknown') { status.value = 'hypothesis'; confidence.value = 'low'; }
    });
    status.addEventListener('change', () => {
      if (status.value === 'hypothesis' && ['unknown', 'high'].includes(confidence.value)) confidence.value = 'low';
      if (status.value === 'confirmed' && ['unknown', 'low'].includes(confidence.value)) confidence.value = 'medium';
      if (status.value === 'unknown') confidence.value = 'unknown';
    });
    const source = node('select', 'doc-input doc-source-select');
    source.id = `doc-edit-${key}-sources`; source.multiple = true; source.size = Math.min(4, Math.max(2, availableSources.length));
    for (const item of availableSources) {
      const option = node('option', '', `${SOURCE_KINDS[item.kind]} · ${item.label}`);
      option.value = item.id; option.selected = claim.sourceIds.includes(item.id);
      source.append(option);
    }
    group.append(field('Sources citées pour cette information', source, 'Plusieurs références possibles (Ctrl/Cmd). Un lien seul ne confirme rien : il faut aussi une justification et une relecture.'));
    const note = input(`doc-edit-${key}-note`, claim.note, { maxLength: 600, multiline: true });
    group.append(field('Ce que la source permet de vérifier', note, 'Mention précise, contexte ou page ; pas de paroles longues. Requis pour confirmer.'));
    const addSource = node('details', 'doc-new-source');
    addSource.append(node('summary', '', 'Ajouter une source pour cette information'));
    const defaultKind = ['eventDate'].includes(key) ? 'document' : key === 'memory' ? 'personal_memory' : 'licensed_music';
    const sourceKind = select(`doc-edit-${key}-source-kind`, Object.entries(SOURCE_KINDS).filter(([kind]) => kind !== 'catalog'), defaultKind);
    const sourceLabel = input(`doc-edit-${key}-source-label`, '', { maxLength: 250 });
    const sourceUrl = input(`doc-edit-${key}-source-url`, '', { type: 'url', maxLength: 1500 });
    const sourceNote = input(`doc-edit-${key}-source-note`, '', { maxLength: 600, multiline: true });
    addSource.append(field('Type de source ajoutée', sourceKind, 'Déclarer un type ne vérifie pas l’autorité du site. Éditeur / artiste officiel pour les crédits et le sens ; document d’événement pour la date.'), field('Nom de la source', sourceLabel), field('Lien HTTPS (vide pour un souvenir privé)', sourceUrl), field('Élément vérifié dans cette source', sourceNote, 'Il faut attester de sa consultation dans « Votre relecture ». Aucun contenu distant n’est collecté automatiquement.'));
    group.append(addSource);
    details.append(group);
    this.controls.set(key, { value, status, confidence, source, note, sourceKind, sourceLabel, sourceUrl, sourceNote });
    return details;
  }
  save() {
    this.error.hidden = true;
    try {
      const record = structuredClone(this.previous);
      const now = new Date().toISOString();
      const addedSources = [];
      record.selected = this.selected.control.checked;
      record.selectionReason = this.reason.value.trim();
      record.excerpt = { startSeconds: Number(this.start.value), durationSeconds: Number(this.duration.value) };
      record.narration.text = this.scriptText.value.trim();
      record.narration.transition = this.transition.value.trim();
      record.narration.sourceIds = [...this.scriptSources.selectedOptions].map(option => option.value);
      record.themeTags = [...this.tags.entries()].filter(([, control]) => control.checked).map(([tag]) => tag);
      for (const [key, controls] of this.controls) {
        const value = controls.value.value.trim();
        const status = controls.status.value;
        const wantsSource = [controls.sourceLabel, controls.sourceUrl, controls.sourceNote].some(control => control.value.trim());
        if (status === 'unknown' && !value) {
          if (wantsSource) throw new Error(`${CLAIM_FIELDS[key]} : renseigner une valeur avant d’y associer une nouvelle source.`);
          record.claims[key] = unknownClaim();
          continue;
        }
        const sourceIds = [...controls.source.selectedOptions].map(option => option.value);
        if (wantsSource) {
          if (!this.consulted.control.checked || !this.reviewer.value.trim()) throw new Error('Une nouvelle source demande un nom de relecture et une attestation de consultation.');
          const id = `local:${this.video.videoId}:${key}:${Date.now()}:${addedSources.length}`;
          addedSources.push({
            id, kind: controls.sourceKind.value, label: controls.sourceLabel.value.trim(),
            url: controls.sourceKind.value === 'personal_memory' ? null : controls.sourceUrl.value.trim(),
            checkedAt: now, access: 'user_declared', note: controls.sourceNote.value.trim(),
            rights: 'Source ajoutée localement. Aucun droit de reproduction de paroles, de partition ou de média présumé.',
          });
          sourceIds.push(id);
        }
        record.claims[key] = {
          ...record.claims[key], value: value || null, status,
          confidence: controls.confidence.value, sourceIds,
          note: controls.note.value.trim(),
        };
      }
      const prepared = prepareRecordForSave(record, this.previous, this.video, {
        reviewer: this.reviewer.value.trim(), consulted: this.consulted.control.checked,
        scriptReviewed: this.scriptReviewed.control.checked, catalog: this.catalog, now,
      });
      // Empreinte non substituable à une relecture : son utilité est de suspendre une version
      // dès qu’un titre / une publication change, jamais d’en certifier le contenu.
      if (prepared.reviewFingerprint !== catalogFingerprint(this.video)) throw new Error('Les métadonnées ont changé : rouvrir cette vidéo.');
      const result = this.store.saveRecord(this.video.videoId, prepared, addedSources);
      this.dirty = false;
      this.onSaved(result);
    } catch (error) { this.showError(error.message); }
  }
  showError(message) {
    this.error.hidden = false;
    this.error.textContent = message;
    this.error.focus();
    this.error.scrollIntoView({ block: 'nearest' });
  }
  canClose() {
    if (!this.dirty) return true;
    if (!window.confirm('Quitter l’atelier sans enregistrer les modifications de ce formulaire ?')) return false;
    this.dirty = false;
    return true;
  }
}
