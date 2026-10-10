import { formatDate, dateFromISO, parseDate } from '../dates.js';
import { isStale } from '../provenance.js';
import { CLAIM_FIELDS, CONFIDENCE_LABELS, SOURCE_KINDS, STATUS_LABELS } from './model.js';
import { DocumentaryPlayback, PHASES, PHASE_LABELS } from './playback.js';
import { DocumentaryYouTubePlayer } from './youtube-player.js';
import { action, externalLink, icon, node, timecode } from './dom.js';

export class DocumentaryView {
  constructor(root, {
    documentary, voice, onJump, onEdit, onChronology, onSnapshot, onNext,
    onExportScript, onExportDraft, onImportDraft, storageWarning = '',
    createVideo = container => new DocumentaryYouTubePlayer(container),
    controls = [],
  }) {
    this.root = root;
    this.documentary = documentary;
    this.voice = voice;
    this.onJump = onJump;
    this.step = null;
    this.mount({ onEdit, onChronology, onExportScript, onExportDraft, onImportDraft, storageWarning });
    // Les boutons PLAY / précédent / passer restent ceux du mode Raconter existant.
    this.controlHomes = controls.map(element => ({ element, parent: element.parentNode, next: element.nextSibling }));
    this.controlsSlot.append(...controls);
    (controls.find(element => element.id === 'story-foot') || this.controlsSlot).append(this.chapterShortcut);
    this.video = createVideo(this.videoHost);
    this.playback = new DocumentaryPlayback({
      narrator: {
        speak: (value, callbacks) => voice.speak(value, { ...callbacks, localOnly: true }),
        stop: () => voice.stop(),
      },
      video: this.video,
      onNext,
      onChange: snapshot => { this.renderTransport(snapshot); onSnapshot(snapshot); },
    });
    this.unsubscribe = voice.onVoicesChanged(() => {
      this.renderVoiceHelp();
      onSnapshot(this.playback.snapshot());
    });
    this.renderVoiceHelp();
    this.renderNavigation();
  }
  mount({ onEdit, onChronology, onExportScript, onExportDraft, onImportDraft, storageWarning }) {
    const doc = this.documentary;
    this.root.replaceChildren();
    const hero = node('header', 'doc-hero');
    hero.append(node('p', 'doc-eyebrow', 'MATT MEZ SAX / DOCUMENTAIRE INTERACTIF'));
    const title = node('h2', 'doc-film-title', 'Une vie, ');
    title.append(node('em', '', 'en musique.'));
    const numbers = node('p', 'doc-numbers', `${doc.from}—${doc.to} · ${doc.steps.length} séquences · ${doc.catalogCount} archives accessibles`);
    hero.append(title, numbers, node('p', 'doc-intro', 'Des traces, des chansons, des liens. Un récit à parcourir, à écouter et à corriger — jamais une biographie inventée.'));
    const tools = node('div', 'doc-tools');
    const archives = action('Chronologie complète', onChronology, 'pill small', 'clock');
    archives.id = 'doc-chronology';
    const exportScript = action('Exporter le script', onExportScript, 'pill small', 'doc');
    exportScript.id = 'doc-export-script';
    tools.append(archives, exportScript);
    hero.append(tools);
    this.root.append(hero);
    if (storageWarning || doc.warnings.length) {
      const warning = node('div', 'doc-warning');
      warning.setAttribute('role', 'status');
      if (storageWarning) warning.append(node('p', '', storageWarning));
      for (const message of doc.warnings) warning.append(node('p', '', message));
      this.root.append(warning);
    }
    const layout = node('div', 'doc-layout');
    this.navigation = node('nav', 'doc-chapters');
    this.navigation.setAttribute('aria-label', 'Chapitres du documentaire, par publication');
    const content = node('article', 'doc-sequence');
    const meta = node('div', 'doc-sequence-meta');
    this.sequenceMeta = meta;
    this.chapterLabel = node('p', 'doc-eyebrow');
    this.sequenceCounter = node('span', 'doc-sequence-count');
    meta.append(this.chapterLabel, this.sequenceCounter);
    this.sequenceTitle = node('h3', 'doc-sequence-title');
    this.sequenceTitle.id = 'doc-sequence-title';
    this.sequenceTitle.tabIndex = -1;
    this.publication = node('p', 'doc-publication');
    this.eventDate = node('p', 'doc-event-date');
    content.append(meta, this.sequenceTitle, this.publication, this.eventDate);
    this.chapterShortcut = action('Chapitres', () => {
      this.pause();
      this.navigation.scrollIntoView({ block: 'start', behavior: 'auto' });
      const target = this.navigation.querySelector('button[aria-current]') || this.navigation.querySelector('button:not([disabled])');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }, 'pill small doc-chapter-shortcut');
    this.chapterShortcut.id = 'doc-show-chapters';
    this.controlsSlot = node('div', 'doc-controls-slot');
    content.append(this.controlsSlot);

    this.screen = node('div', 'doc-screen');
    this.mockVisual = node('div', 'doc-mock-visual');
    const record = node('div', 'doc-record');
    record.setAttribute('aria-hidden', 'true');
    record.append(node('div', 'doc-record-label', 'RELIA\nARCHIVES'));
    this.screenTag = node('span', 'doc-screen-tag', 'MAQUETTE · AUCUN FLUX VIDÉO');
    this.screenYear = node('span', 'doc-screen-year');
    this.screenCaption = node('p', 'doc-screen-caption');
    this.mockVisual.append(record, this.screenTag, this.screenYear, this.screenCaption);
    this.videoHost = node('div', 'doc-video-host');
    this.videoHost.hidden = true;
    this.screen.append(this.mockVisual, this.videoHost);
    content.append(this.screen);

    const connection = node('div', 'doc-connection');
    this.youtubeButton = action('Autoriser YouTube pour cette séance', () => {
      this.video.setConsent(true);
      this.playback.setMode('youtube');
    }, 'pill small', 'video');
    this.youtubeButton.id = 'doc-enable-youtube';
    this.mockButton = action('Revenir à la maquette', () => {
      this.playback.setMode('mock');
      this.video.setConsent(false);
    }, 'pill small');
    this.mockButton.id = 'doc-use-mock';
    this.mockButton.hidden = true;
    this.externalVideo = node('span');
    this.externalVideo.addEventListener('click', () => this.pause());
    connection.append(this.youtubeButton, this.mockButton, this.externalVideo);
    content.append(connection, node('p', 'doc-privacy', 'Par défaut : texte et maquette, sans connexion à YouTube ni synthèse payante. Autoriser YouTube charge son lecteur et transmet des données techniques au fournisseur. Le consentement n’est pas conservé.'));

    this.phaseGroup = node('div', 'doc-phases');
    this.phaseGroup.setAttribute('role', 'group');
    this.phaseGroup.setAttribute('aria-label', 'Moments de la séquence');
    this.phaseButtons = new Map();
    for (const [index, phase] of PHASES.entries()) {
      const choose = action(`${index + 1}. ${PHASE_LABELS[phase]}`, () => this.playback.seekPhase(phase), 'doc-phase');
      choose.dataset.phase = phase;
      choose.setAttribute('aria-pressed', 'false');
      this.phaseButtons.set(phase, choose);
      this.phaseGroup.append(choose);
    }
    this.phaseProgress = node('div', 'doc-phase-progress');
    this.phaseProgress.setAttribute('role', 'progressbar');
    this.phaseProgress.setAttribute('aria-label', 'Avancement du moment courant');
    this.phaseProgress.setAttribute('aria-valuemin', '0');
    this.phaseProgress.setAttribute('aria-valuemax', '100');
    this.phaseProgressFill = node('span');
    this.phaseProgress.append(this.phaseProgressFill);
    this.playbackStatus = node('p', 'doc-playback-status');
    this.playbackStatus.setAttribute('role', 'status');
    this.playbackError = node('p', 'doc-warning');
    this.playbackError.setAttribute('role', 'alert');
    this.playbackError.hidden = true;
    content.append(this.phaseGroup, this.phaseProgress, this.playbackStatus, this.playbackError);

    this.scriptWarning = node('div', 'doc-warning');
    this.scriptWarning.id = 'doc-script-warning';
    this.scriptWarning.hidden = true;
    this.narrationBlock = node('section', 'doc-script-block');
    this.narrationBlock.append(node('h4', 'doc-text-label', 'LE RÉCIT · SCRIPT ÉDITORIAL'));
    this.narrationText = node('p', 'doc-narration-text');
    this.narrationText.id = 'doc-narration-text';
    this.narrationBlock.append(this.narrationText);
    this.transitionBlock = node('section', 'doc-script-block doc-transition');
    this.transitionBlock.append(node('h4', 'doc-text-label', 'LA PASSERELLE · TEXTE ORIGINAL'));
    this.transitionText = node('p', 'doc-transition-text');
    this.transitionText.id = 'doc-transition-text';
    this.transitionBlock.append(this.transitionText);
    content.append(this.scriptWarning, this.narrationBlock, this.transitionBlock);

    const editorial = node('div', 'doc-editorial-note');
    editorial.append(icon('shield'), node('p', '', 'Les rapprochements sont des choix de montage. Les thèmes musicaux ne prouvent jamais un événement de la vie de l’artiste.'));
    content.append(editorial);
    const edit = action('Confirmer / corriger cette séquence', () => { this.pause(); onEdit(this.step.videoId); }, 'btn tonal', 'edit');
    edit.id = 'doc-edit-sequence';
    content.append(edit);
    this.facts = node('details', 'doc-disclosure');
    this.facts.append(node('summary', '', 'Informations, faits et hypothèses'));
    this.factBody = node('div', 'doc-fact-body');
    this.facts.append(this.factBody);
    this.sources = node('details', 'doc-disclosure');
    this.sources.id = 'doc-sources';
    this.sourcesSummary = node('summary');
    this.sourcesBody = node('ol', 'doc-source-list');
    this.sources.append(this.sourcesSummary, this.sourcesBody);
    for (const disclosure of [this.facts, this.sources]) disclosure.addEventListener('toggle', () => { if (disclosure.open) this.pause(); });
    this.sources.addEventListener('click', event => { if (event.target.closest('a')) this.pause(); });
    content.append(this.facts, this.sources);
    this.voiceHelp = node('p', 'doc-privacy');
    content.append(this.voiceHelp);
    // Livraison textuelle d’abord : le passage à lire précède le cadre de lecture.
    for (const element of [this.phaseGroup, this.phaseProgress, this.playbackStatus, this.playbackError, this.scriptWarning, this.narrationBlock]) content.insertBefore(element, this.screen);
    layout.append(this.navigation, content);
    this.root.append(layout);
    const drafts = node('details', 'doc-disclosure doc-draft-tools');
    drafts.append(node('summary', '', 'Votre atelier local · brouillons et souvenirs privés'));
    drafts.append(node('p', 'fine-print', 'Les corrections restent dans ce navigateur. L’export JSON peut contenir vos souvenirs privés : conservez-le dans un espace de confiance. Aucune synchronisation distante du brouillon.'));
    const draftTools = node('div', 'doc-tools');
    const exportDraft = action('Exporter mon brouillon JSON', onExportDraft, 'pill small', 'doc');
    exportDraft.id = 'doc-export-draft';
    const importLabel = node('label', 'doc-file-label', 'Importer un brouillon JSON (remplace le brouillon local)');
    const importInput = node('input');
    importInput.id = 'doc-import-draft';
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) { this.pause(); onImportDraft(file); }
      importInput.value = '';
    });
    importLabel.append(importInput);
    draftTools.append(exportDraft, importLabel);
    drafts.append(draftTools);
    this.root.append(drafts);
  }
  renderNavigation() {
    this.navigation.replaceChildren(node('h3', 'doc-nav-heading', 'LE FIL DU RÉCIT'));
    const list = node('ol', 'doc-chapter-list');
    for (const [index, chapter] of this.documentary.chapters.entries()) {
      const item = node('li', 'doc-chapter');
      const choose = action('', () => this.onJump(chapter.steps[0].index), 'doc-chapter-button');
      choose.replaceChildren(node('span', 'doc-chapter-number', String(index + 1).padStart(2, '0')));
      const body = node('span', 'doc-chapter-info');
      body.append(node('span', 'doc-chapter-years', chapter.from === chapter.to ? String(chapter.from) : `${chapter.from}—${chapter.to}`), node('strong', '', chapter.title), node('small', '', `${chapter.steps.length} séquence${chapter.steps.length > 1 ? 's' : ''} / ${chapter.archiveCount} archives`));
      choose.append(body);
      choose.disabled = !chapter.steps.length;
      choose.dataset.chapter = chapter.id;
      if (this.step?.chapterId === chapter.id) choose.setAttribute('aria-current', 'step');
      item.append(choose);
      if (this.step?.chapterId === chapter.id) {
        const sequences = node('ol', 'doc-sequence-links');
        for (const step of chapter.steps) {
          const next = action(step.video.title, () => this.onJump(step.index), 'doc-sequence-link');
          next.title = step.video.title;
          next.dataset.videoId = step.videoId;
          if (step.videoId === this.step.videoId) next.setAttribute('aria-current', 'step');
          const row = node('li');
          row.append(next);
          sequences.append(row);
        }
        item.append(sequences);
      }
      list.append(item);
    }
    this.navigation.append(list);
    if (this.step) {
      const chapter = this.documentary.chapters.find(item => item.id === this.step.chapterId);
      this.navigation.append(node('p', 'doc-chapter-note', chapter.note));
      if (chapter.missingYears.length) this.navigation.append(node('p', 'doc-gap-note', `Aucune publication recensée : ${chapter.missingYears.join(', ')}. Une lacune du catalogue, pas une absence d’activité.`));
      this.navigation.append(node('p', 'doc-chapter-note', `Choix de sélection : ${this.step.record.selectionReason}`));
    }
  }
  setStep(step, { playing = false } = {}) {
    const changedStep = this.step && this.step.videoId !== step.videoId;
    this.step = step;
    const chapter = this.documentary.chapters.find(item => item.id === step.chapterId);
    this.chapterLabel.textContent = `${chapter.from}—${chapter.to} / ${chapter.title}`;
    this.sequenceCounter.textContent = `${step.index + 1} / ${this.documentary.steps.length}`;
    this.sequenceTitle.textContent = step.video.title;
    this.publication.textContent = `Publié le ${formatDate(step.entry.publishedAt)} · ${step.video.durationDisplay || 'durée inconnue'}`;
    this.eventDate.textContent = step.claims.eventDate.status === 'confirmed'
      ? `Événement documenté : ${formatDate(step.eventEntry.eventDate)} (distinct de la publication)`
      : 'Date réelle de l’événement : non documentée';
    this.screenYear.textContent = String(step.entry.publishedAt.year);
    this.screenCaption.textContent = `Extrait de montage prévu · ${timecode(step.excerpt.startSeconds)}—${timecode(step.excerpt.endSeconds)}${step.excerpt.adjusted ? ' · bornes adaptées à la durée connue' : ''}`;
    this.narrationText.textContent = step.narration.text || 'Aucun texte de narration. Ouvrez l’éditeur pour écrire et relire cette séquence.';
    this.transitionText.textContent = step.narration.transition || 'Aucune transition écrite pour cette séquence.';
    this.scriptWarning.hidden = step.narration.playable;
    this.scriptWarning.replaceChildren(...step.narration.reviewReasons.map(reason => node('p', '', reason)));
    this.externalVideo.replaceChildren(externalLink('Ouvrir sur YouTube ↗', step.video.link));
    this.youtubeButton.disabled = !step.video.embeddable;
    this.youtubeButton.title = step.video.embeddable ? 'Consentement explicite, valable uniquement pendant cette séance.' : 'Intégration non autorisée pour cette vidéo.';
    this.renderNavigation();
    this.renderSourcesAndFacts();
    this.playback.setStep(step, { playing });
    if (changedStep) this.sequenceMeta.scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  renderSourcesAndFacts() {
    const step = this.step;
    const used = new Set([`catalog:${step.videoId}`, ...step.narration.sourceIds, ...Object.values(step.claims).flatMap(claim => claim.sourceIds)]);
    const sources = this.documentary.sources.filter(source => used.has(source.id));
    const numbers = new Map(sources.map((source, index) => [source.id, index + 1]));
    this.sourcesSummary.textContent = `Sources exploitées · ${sources.length}`;
    this.sourcesBody.replaceChildren();
    for (const [index, source] of sources.entries()) {
      const item = node('li', 'doc-source');
      item.id = `doc-source-${index + 1}`;
      item.tabIndex = -1;
      item.append(externalLink(source.label, source.url), node('p', 'fine-print', `${SOURCE_KINDS[source.kind]} · ${source.access === 'user_declared' ? 'consultation déclarée localement' : source.access === 'api' ? 'capture API' : 'notice consultée'} le ${formatDate(dateFromISO(source.checkedAt))}${source.refreshBy ? ` · à rafraîchir avant le ${formatDate(dateFromISO(source.refreshBy))}` : ''}`), node('p', '', source.note), node('p', 'fine-print', source.rights));
      if (isStale(source)) item.append(node('p', 'doc-warning', 'Source périmée : la confirmation et la lecture automatique sont suspendues.'));
      this.sourcesBody.append(item);
    }
    this.factBody.replaceChildren();
    const list = node('dl', 'doc-facts');
    const add = (label, claim, display = '') => {
      const row = node('div', 'doc-fact');
      row.dataset.status = claim.status;
      const value = display || (claim.status === 'unknown' ? 'Non documenté' : claim.value);
      row.append(node('dt', '', label));
      const details = node('dd');
      details.append(node('strong', '', value), node('small', '', `${STATUS_LABELS[claim.status]} · confiance ${CONFIDENCE_LABELS[claim.confidence].toLowerCase()}`));
      if (claim.note) details.append(node('small', '', claim.note));
      if (claim.reviewedBy) details.append(node('small', '', `Relecture : ${claim.reviewedBy} (déclarée, non authentifiée)`));
      const references = node('div', 'doc-fact-refs');
      for (const id of claim.sourceIds) {
        const number = numbers.get(id);
        if (number) references.append(action(`Source ${number}`, () => this.showSource(number), 'doc-source-ref'));
        else references.append(node('small', 'doc-warning', 'Source indisponible'));
      }
      details.append(references);
      row.append(details);
      list.append(row);
    };
    add('Titre de la vidéo · pas nécessairement une chanson', step.title);
    add('Date de publication · axe du film', step.publication, formatDate(step.entry.publishedAt));
    for (const [key, label] of Object.entries(CLAIM_FIELDS)) {
      const claim = step.claims[key];
      const display = key === 'classification' && claim.value ? (claim.value === 'cover' ? 'Reprise déclarée' : 'Composition originale') : key === 'eventDate' && claim.value ? formatDate(parseDate(claim.value)) : '';
      add(label, claim, display);
    }
    this.factBody.append(list);
    for (const warning of step.warnings) this.factBody.append(node('p', 'doc-warning', warning));
    if (step.themeTags.length) this.factBody.append(node('p', 'doc-theme-tags', `Thèmes du morceau : ${step.themeTags.join(' · ')}. Leur lien avec cette période est éditorial.`));
  }
  showSource(number) {
    this.pause();
    this.sources.open = true;
    const target = number ? this.root.querySelector(`#doc-source-${number}`) : this.sources.querySelector('summary');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  renderTransport(snapshot) {
    const { phase, mode, playing, progress, error, notice } = snapshot;
    this.root.dataset.phase = phase;
    this.root.dataset.playing = String(playing);
    this.screen.dataset.mode = mode;
    const videoVisible = mode === 'youtube' && phase === 'video';
    this.videoHost.hidden = !videoVisible;
    this.mockVisual.hidden = videoVisible;
    this.youtubeButton.hidden = mode === 'youtube';
    this.mockButton.hidden = mode !== 'youtube';
    this.screenTag.textContent = mode === 'mock' ? 'MAQUETTE · AUCUN FLUX VIDÉO' : 'YOUTUBE AUTORISÉ · ARCHIVE À LA DEMANDE';
    for (const [key, choose] of this.phaseButtons) choose.setAttribute('aria-pressed', String(key === phase));
    const percent = Math.round(progress * 100);
    this.phaseProgressFill.style.width = `${percent}%`;
    this.phaseProgress.setAttribute('aria-valuenow', String(percent));
    this.phaseProgress.setAttribute('aria-valuetext', `${PHASE_LABELS[phase]} · ${percent} %${mode === 'mock' ? ' (maquette)' : ''}`);
    this.narrationBlock.classList.toggle('is-current', phase === 'narration');
    this.transitionBlock.classList.toggle('is-current', phase === 'transition');
    const status = notice || `${PHASE_LABELS[phase]} · ${playing ? 'lecture' : 'en pause'}${mode === 'mock' ? ' · maquette, durée de lecture estimée' : ''}`;
    if (this.playbackStatus.textContent !== status) this.playbackStatus.textContent = status;
    this.playbackError.hidden = !error;
    this.playbackError.textContent = error;
  }
  renderVoiceHelp() {
    const local = this.voice.localFrenchVoices();
    this.voiceHelp.textContent = local.length
      ? 'Voix optionnelle : française, installée sur cet appareil, gratuite et sans envoi du script à un service distant par RELIA. La qualité dépend du navigateur. À la reprise, le passage vocal est relu. Aucune imitation d’une personne réelle.'
      : 'Aucune voix française locale détectée. Le récit textuel et la maquette restent complets. Aucune voix distante ni génération payante ne sera utilisée automatiquement.';
  }
  toggleVoice() {
    const next = !this.playback.voiceEnabled;
    if (next && !this.voice.localFrenchVoices().length) return;
    if (next) this.voice.setEnabled(true);
    this.playback.setVoiceEnabled(next);
  }
  play() { return this.playback.play(); }
  pause() { this.playback.pause(); }
  dispose() {
    this.unsubscribe?.();
    this.playback.dispose();
    this.chapterShortcut.remove();
    for (const { element, parent, next } of this.controlHomes) {
      if (next?.parentNode === parent) parent.insertBefore(element, next);
      else parent.append(element);
    }
    this.root.replaceChildren();
  }
}
