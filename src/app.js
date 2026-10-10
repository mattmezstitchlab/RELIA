import './styles.css';
import { NetworkView } from './graph.js';
import { LIMITS, PROPERTIES, emptyGraph, eligible, entityFromRaw, expandEntity, findRemotePath, getEntities, getWikipediaSummary, inPeriod, safeURL, searchEntitiesPage } from './data.js';
import { fetchCommonsVideos, youtubeIdsFromClaims, youtubeItems } from './videos.js';
import { pickRevelation } from './savoir.js';
import { getBnfEnrichment } from './bnf.js';
import { buildTimeline } from './timeline.js';
import { compareSnapshots, createSnapshot, exportRegistry, validateSnapshot } from './discovery.js';
import { iconFor, typeIconName } from './icons.js';
import { SoundEngine, VoiceNarrator } from './narration.js';
import { canAddSecond, relationReady, resolveMode } from './mode.js';
import { clampHeight, nextSnap, settleSnap, snapTargets } from './sheet.js';
import { voiceLabel } from './voice.js';
import { isLocalId } from './identity.js';
import { matchLocalIdentities, verificationLabel } from './local-search.js';
import { catalogFor, chronologyRows } from './catalog.js';
import { isStale } from './provenance.js';
import { datesOf } from './dates.js';

const $ = id => document.getElementById(id);
const DESKTOP = window.matchMedia('(min-width: 900px)');
const typeLabels = { person: 'Personne', work: 'Œuvre', place: 'Lieu', institution: 'Institution', event: 'Événement', unknown: 'Type non déterminé' };
const evidenceLabels = { referenced: 'Source disponible', unverified: 'Sans source', deprecated: 'Information ancienne' };
const claimStatusLabels = {
  assertion: 'Source disponible',
  hypothesis: 'Sans source',
  deprecated: 'Information ancienne',
};
const discoveryLabels = {
  NEW_ENTITY: 'Nouvel élément', NEW_RELATION: 'Nouveau lien', NEW_PATH: 'Nouveau parcours',
  NEW_EVIDENCE: 'Nouvelle source', IDENTITY_RECONCILED: 'Identité reconnue',
  HYPOTHESIS: 'Hypothèse · exclue des chemins', CONTRADICTION: 'Donnée contradictoire',
  INCOMPARABLE: 'Incomparable',
};
const VIEW_IDS = {
  home: 'view-home', results: 'view-results', identity: 'view-identity', local: 'view-local', relation: 'view-relation', story: 'view-story',
  source: 'view-source', media: 'view-media', time: 'view-time', list: 'view-list', settings: 'view-settings',
  help: 'view-help', advanced: 'view-advanced',
};
const SUB_TITLES = { list: 'Liste accessible', settings: 'Réglages', help: 'Aide et limites', advanced: 'Analyse avancée', time: 'Période', source: 'Source', media: 'Image' };

function restoreDiscovery() {
  try {
    const stored = JSON.parse(localStorage.getItem('relia-discovery-v1') || '{}');
    return {
      before: validateSnapshot(stored.before) ? stored.before : null,
      after: validateSnapshot(stored.after) ? stored.after : null,
      comparison: null,
    };
  } catch { return { before: null, after: null, comparison: null }; }
}

const state = {
  graph: emptyGraph(),
  a: null,
  b: null,
  secondOpen: false,
  period: { from: null, to: null, undated: true },
  path: null,
  relation: { status: 'idle', result: null, progress: '' },
  controller: null,
  version: 0,
  retry: null,
  discoverySearch: null,
  discovery: restoreDiscovery(),
  timelineStep: null,
  timelineEntity: null,
};
const nav = { stack: [] };
const results = { open: false, slot: 'a', term: '', phase: 'idle', items: [], message: '' };
const story = { active: false, playing: false, timer: null, index: 0, steps: [], title: '' };
const ui = {
  identityTab: 'liens', sourceEdge: null, media: null, detailController: null, loadingId: null, speakingId: null,
  rootKey: null, selectedId: undefined, viewKey: null, wasSub: false,
};
let searchTimer = null;
let searchWork = null;
let biographyController = null, biographyVersion = 0;
let sheetSnap = 'half';
let sheetTargets = { peek: 150, half: 420, full: 720 };

/* ==================== OUTILS DOM ==================== */
function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function text(tag, value, className = '') {
  const node = el(tag, className);
  node.textContent = value;
  return node;
}
function iconNode(name, className = 'ico') {
  const node = el('span', className);
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = iconFor(name);
  return node;
}
function setIcon(node, name) {
  if (node) node.innerHTML = iconFor(name);
}
function hydrateIcons() {
  for (const node of document.querySelectorAll('[data-icon]')) setIcon(node, node.dataset.icon);
}
function button(label, callback, className = 'pill') {
  const node = el('button', className);
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', callback);
  return node;
}
function iconButton(label, iconName, callback, className = 'pill') {
  const node = el('button', className);
  node.type = 'button';
  if (iconName) node.append(iconNode(iconName));
  node.append(text('span', label));
  node.addEventListener('click', callback);
  return node;
}
function link(label, url, className = 'text-link') {
  const href = safeURL(url);
  if (!href) return text('span', label, className);
  const anchor = el('a', className);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.append(text('span', label), iconNode('external', 'ico ico-inline'));
  return anchor;
}
function badge(iconName, label, tone = '') {
  const node = el('span', `badge ${tone}`.trim());
  node.append(iconNode(iconName), text('span', label));
  return node;
}
function chipInfo(iconName, label) {
  const node = el('span', 'chip-info');
  if (iconName) node.append(iconNode(iconName));
  node.append(text('span', label));
  return node;
}
function sectionHead(title, count = '') {
  const head = el('div', 'section-head');
  head.append(text('h3', title, 'section-title'));
  if (count !== '') head.append(text('span', count, 'count'));
  return head;
}
function emptyCard(message, actions = []) {
  const card = el('section', 'card empty');
  card.append(text('p', message, 'body-text'));
  for (const action of actions) card.append(action);
  return card;
}
function fallbackFor(type) {
  const wrap = el('span', 'avatar-fallback');
  wrap.append(iconNode(typeIconName(type)));
  return wrap;
}
function avatarNode(entity, size = 'md') {
  const type = entity?.type || 'unknown';
  const node = el('span', `avatar ${size} type-${type}`);
  node.setAttribute('aria-hidden', 'true');
  const source = size === 'xl' || size === 'lg' ? (entity?.image || entity?.avatarImage) : (entity?.avatarImage || entity?.image);
  if (source) {
    const img = el('img');
    img.src = source;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); node.append(fallbackFor(type)); });
    node.append(img);
  } else {
    node.append(fallbackFor(type));
  }
  return node;
}
function lifeDates(entity) {
  if (!entity.born && !entity.died) return '';
  return `${entity.born?.display || '?'} — ${entity.died?.display || (entity.born ? 'présent' : '')}`;
}
function fileUrl(entity) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent((entity.imageTitle || '').replaceAll(' ', '_'))}`;
}
function periodLabel() {
  const { from, to, undated } = state.period;
  const span = from === null && to === null ? 'Toute la période' : `De ${from ?? 'le début'} à ${to ?? 'aujourd’hui'}`;
  return undated ? span : `${span} · dates inconnues exclues`;
}
function visibleEdges() {
  return [...state.graph.edges.values()].filter(edge => inPeriod(edge, state.period));
}
function isLoaded(entity) {
  return state.graph.expanded.has(entity.id);
}
function identityEntity() {
  const top = nav.stack.at(-1);
  if (top?.name === 'identity') return state.graph.nodes.get(top.id) ?? null;
  return state.a ?? null;
}
function edgeDates(edge) {
  const dates = [];
  for (const [property, label] of [['P580', 'début'], ['P582', 'fin'], ['P585', 'date']]) {
    for (const value of edge.dates?.[property] || []) dates.push(`${label} : ${value.display}`);
  }
  return dates.join(' · ') || 'Date de relation inconnue';
}
function evidenceBadge(edge) {
  if (edge.evidence === 'referenced') return badge('shield', 'Source', 'ok');
  return badge('alert', 'Sans source', 'warn');
}
let statusTimer = null;
function status(message, retry = null) {
  clearTimeout(statusTimer);
  $('status').hidden = !message;
  $('status-text').textContent = message || '';
  state.retry = retry;
  $('retry').hidden = !retry;
  if (message && !retry) statusTimer = setTimeout(() => { $('status').hidden = true; }, 6000);
}
$('retry').addEventListener('click', () => state.retry?.());

/* ==================== TRAVAIL EN COURS ==================== */
function abortWork() {
  state.controller?.abort();
  state.controller = null;
  state.version++;
}
function beginWork() {
  abortWork();
  state.controller = new AbortController();
  return { signal: state.controller.signal, version: state.version };
}
function current(work) {
  return !work.signal.aborted && work.version === state.version;
}
function cancelBiography() {
  biographyController?.abort();
  biographyController = null;
  biographyVersion++;
}

/* ==================== CONSTELLATION ==================== */
const view = new NetworkView($('graph'), {
  onSelect: id => openNode(id),
  onPlay: id => playVideosFor(id),
  onEdge: edge => showEdge(edge),
  onHover: (record, x, y) => {
    $('tooltip').hidden = !record;
    if (record) {
      $('tooltip').textContent = `${record.label}`;
      $('tooltip').style.left = `${Math.min(x + 15, innerWidth - 270)}px`;
      $('tooltip').style.top = `${Math.min(y + 15, innerHeight - 80)}px`;
    }
  },
  onUnavailable: () => {
    status('L’affichage 3D n’est pas disponible. La liste accessible montre les mêmes informations.');
    queueMicrotask(() => openSubview('list', SUB_TITLES.list));
  },
});

function syncScene() {
  const roots = [state.a?.id, state.b?.id].filter(Boolean);
  const rootKey = roots.join('|');
  if (rootKey !== ui.rootKey) {
    ui.rootKey = rootKey;
    view.setRoots(roots);
  }
  const selected = identityEntity()?.id ?? null;
  if (selected !== ui.selectedId) {
    ui.selectedId = selected;
    view.setSelected(selected);
  }
}
function renderLegend() {
  $('legend').hidden = !state.graph.nodes.size;
}
function renderGraph() {
  syncScene();
  view.setData(state.graph, visibleEdges());
  refreshVideoBadges();
  schedulePrefetch();
  renderLegend();
}

/* ==================== RECHERCHE UNIQUE (barre en haut de la feuille) ==================== */
const slots = {
  a: { input: $('input-a'), field: $('field-a'), clear: $('clear-a'), chip: $('chip-a') },
  b: { input: $('input-b'), field: $('field-b'), clear: $('clear-b'), chip: $('chip-b') },
};

function closeResults({ clearInputs = false } = {}) {
  clearTimeout(searchTimer);
  searchWork?.controller.abort();
  searchWork = null;
  results.open = false;
  results.phase = 'idle';
  results.items = [];
  results.message = '';
  if (clearInputs) for (const slot of ['a', 'b']) slots[slot].input.value = '';
  render();
}

function onSlotInput(slot) {
  const refs = slots[slot];
  refs.clear.hidden = !refs.input.value;
  clearTimeout(searchTimer);
  const term = refs.input.value.trim();
  if (term.length < 2) {
    if (results.open) closeResults();
    return;
  }
  ensureSheetOpen();
  searchTimer = setTimeout(() => runSearch(slot), 320);
}

async function enrichResults(found, signal) {
  if (!found.length) return [];
  const plain = found.map(item => ({ id: item.id, label: item.label, description: item.description || '', type: 'unknown', fictional: false }));
  try {
    const raw = await getEntities(found.map(item => item.id), { signal });
    return found.map((item, index) => {
      const source = raw[item.id];
      if (!source || source.missing !== undefined) return plain[index];
      const entity = entityFromRaw(source);
      return { ...entity, description: entity.description || (item.description !== 'Description indisponible' ? item.description : '') };
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return plain;
  }
}

async function runSearch(slot, { more = false } = {}) {
  const term = more ? results.term : slots[slot].input.value.trim();
  if (term.length < 2) { closeResults(); return; }
  if (more && (results.phase !== 'done' || !results.next || results.loadingMore)) return;
  const target = more ? results.slot : slot;
  clearTimeout(searchTimer);
  searchWork?.controller.abort();
  const controller = new AbortController();
  const { signal } = controller;
  searchWork = { controller, signal };
  if (more) {
    results.loadingMore = true;
  } else {
    Object.assign(results, { open: true, slot, term, phase: 'loading', items: [], next: null, language: 'fr', loadingMore: false, message: 'Recherche en cours…' });
  }
  render();
  try {
    const page = await searchEntitiesPage(term, { signal, limit: 20, continue: more ? results.next : undefined, language: more ? results.language : undefined });
    if (signal.aborted || searchWork?.signal !== signal) return;
    const enriched = await enrichResults(page.items, signal);
    // Les fiches locales RELIA sont proposées en tête, sur correspondance stricte du nom (slot A seulement :
    // les relations documentées restent fondées sur des identités Wikidata).
    const localHits = target === 'a' && !more ? matchLocalIdentities(term) : [];
    const remote = target === 'b' ? enriched.filter(entity => entity.type === 'person') : enriched;
    const fresh = [...localHits, ...remote]
      .filter(entity => !more || !results.items.some(item => item.id === entity.id))
      .filter((entity, index, list) => list.findIndex(other => other.id === entity.id) === index);
    Object.assign(results, {
      phase: 'done', items: more ? [...results.items, ...fresh] : fresh, next: page.next, language: page.language, loadingMore: false, message: '',
    });
  } catch (error) {
    if (signal.aborted || searchWork?.signal !== signal) return;
    if (more) Object.assign(results, { loadingMore: false });
    else Object.assign(results, { phase: 'error', items: [], next: null, message: error.message || 'Recherche indisponible.' });
  }
  searchWork = null;
  render();
}

function resultRow(entity, slot) {
  const row = el('button', 'result-row');
  row.type = 'button';
  row.setAttribute('role', 'option');
  row.append(avatarNode(entity, 'md'));
  const main = el('span', 'row-main');
  main.append(text('span', entity.label, 'row-title'));
  const kind = el('span', `row-kind type-${entity.type || 'unknown'}`);
  kind.append(iconNode(typeIconName(entity.type)), text('span', entity.local ? 'Fiche locale RELIA' : (typeLabels[entity.type] || typeLabels.unknown)));
  main.append(kind);
  if (entity.description) main.append(text('span', entity.description, 'row-sub'));
  row.append(main, iconNode('chevron', 'ico row-go'));
  row.addEventListener('click', () => pickResult(slot, entity));
  return row;
}

function renderResults() {
  const list = $('results-list'), empty = $('results-empty'), hint = $('results-hint');
  list.replaceChildren();
  empty.hidden = true;
  empty.textContent = '';
  hint.textContent = '';
  const { phase, items, message, slot, next, loadingMore } = results;
  if (phase === 'loading') {
    hint.textContent = message;
    list.append(text('p', 'Recherche en cours…', 'search-message'));
    return;
  }
  if (phase === 'error') {
    empty.hidden = false;
    empty.append(text('span', message), button('Réessayer', () => runSearch(slot), 'text-button'));
    return;
  }
  if (!items.length) {
    empty.hidden = false;
    empty.textContent = slot === 'b'
      ? 'Aucune personne trouvée pour ce nom. Essayez une autre orthographe.'
      : 'Aucun résultat pour ce nom. Essayez une autre orthographe, ou le nom complet.';
    $('search-live').textContent = empty.textContent;
    return;
  }
  hint.textContent = slot === 'b'
    ? 'Seules les personnes sont proposées. Touchez la bonne.'
    : 'Touchez la personne que vous cherchez.';
  for (const entity of items) list.append(resultRow(entity, slot));
  if (next) {
    const more = button(loadingMore ? 'Chargement…' : 'Voir plus de résultats', () => runSearch(slot, { more: true }), 'pill wide more-results');
    more.disabled = loadingMore;
    list.append(more);
  }
  $('search-live').textContent = `${items.length} résultat${items.length > 1 ? 's' : ''}${next ? ' affichés' : ''}. Touchez la personne que vous cherchez.`;
}

function chipNode(slot, entity) {
  const wrap = el('div', 'chip');
  wrap.append(avatarNode(entity, 'sm'));
  const main = el('div', 'chip-main');
  const role = slot === 'b' ? 'Personne B' : state.b ? 'Personne A' : 'Personne';
  main.append(text('span', entity.label, 'chip-name'), text('span', role, 'chip-role'));
  const remove = el('button', 'chip-remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', slot === 'a' ? `Retirer ${entity.label} et recommencer` : `Retirer ${entity.label} de la recherche de lien`);
  remove.append(iconNode('close'));
  remove.addEventListener('click', () => (slot === 'a' ? removeFirst() : removeSecond()));
  wrap.append(main, remove);
  return wrap;
}

function setSlot(slot, entity) {
  const refs = slots[slot];
  refs.field.hidden = Boolean(entity);
  refs.chip.hidden = !entity;
  refs.chip.replaceChildren();
  if (entity) refs.chip.append(chipNode(slot, entity));
  refs.clear.hidden = !refs.input.value || Boolean(entity);
}

function renderSlots() {
  setSlot('a', state.a);
  setSlot('b', state.b);
  const canAdd = Boolean(state.a) && canAddSecond(state.a) && isLoaded(state.a) && !state.b;
  $('add-second').hidden = !canAdd || state.secondOpen;
  $('slot-b').hidden = !(state.b || state.secondOpen);
  $('pair-link').hidden = !state.b;
}

async function pickResult(slot, entity) {
  closeResults({ clearInputs: true });
  if (slot === 'a') await chooseFirst(entity);
  else chooseSecond(entity);
}

async function chooseFirst(entity) {
  // Une identité locale s’ouvre sans aucune expansion Wikidata : elle n’est jamais liée automatiquement.
  if (isLocalId(entity.id)) {
    openLocalIdentity(entity);
    return;
  }
  await selectRealIdentity(entity.id, entity);
}

function chooseSecond(entity) {
  if (!state.a || !canAddSecond(state.a)) return;
  if (entity.id === state.a.id) {
    status('Choisissez une autre personne : un lien suppose deux identités distinctes.');
    render();
    return;
  }
  invalidatePath();
  if (!state.graph.nodes.has(entity.id) && state.graph.nodes.size < LIMITS.nodes) state.graph.nodes.set(entity.id, entity);
  state.b = state.graph.nodes.get(entity.id) ?? entity;
  state.secondOpen = false;
  resetNav();
  renderGraph();
  ensureSheetOpen();
  render();
  status(`${state.b.label} est ajoutée. Cherchez maintenant le lien entre les deux.`);
}

function clearRelationState() {
  clearTimelineStep({ render: false });
  state.path = null;
  state.discoverySearch = null;
  state.relation = { status: 'idle', result: null, progress: '' };
  view.highlightPath(null);
}
function invalidatePath() {
  abortWork();
  clearRelationState();
}

function removeFirst() {
  invalidatePath();
  state.a = null;
  state.b = null;
  state.secondOpen = false;
  resetNav();
  renderGraph();
  status('Recherche réinitialisée. Recherchez une nouvelle personne.');
  render();
}

function removeSecond() {
  invalidatePath();
  state.b = null;
  state.secondOpen = false;
  resetNav();
  renderGraph();
  status('Deuxième personne retirée. Le réseau de la première reste visible.');
  render();
}

function cancelSecond() {
  slots.b.input.value = '';
  state.secondOpen = false;
  closeResults();
}

function addSecond() {
  state.secondOpen = true;
  render();
  slots.b.input.focus();
}

function searchFromExample(name) {
  slots.a.input.value = name;
  runSearch('a');
}

/* ==================== SÉLECTION ==================== */
async function selectRealIdentity(id, seed = null) {
  const work = beginWork();
  if (state.a?.id !== id) {
    clearRelationState();
    state.b = null;
    state.secondOpen = false;
  }
  resetNav();
  if (!state.graph.nodes.has(id)) {
    state.graph.nodes.set(id, seed ? { ...seed } : { id, label: id, description: '', type: 'unknown', fictional: false });
  }
  state.a = state.graph.nodes.get(id);
  ui.loadingId = id;
  view.focus(id);
  renderGraph();
  ensureSheetOpen();
  render();
  status('Chargement des liens…');
  try {
    await expandEntity(state.graph, id, { signal: work.signal });
    if (!current(work)) return;
    ui.loadingId = null;
    state.a = state.graph.nodes.get(id) ?? state.a;
    renderGraph();
    view.focus(id);
    render();
    status(`${state.graph.nodes.size} éléments · ${state.graph.edges.size} liens${state.graph.partial ? ' · certaines informations manquent' : ''}${state.graph.capped ? ' · limite du graphe atteinte' : ''}`,
      state.graph.partial ? () => selectRealIdentity(id, seed) : null);
  } catch (error) {
    if (current(work)) {
      ui.loadingId = null;
      status(error.message, () => selectRealIdentity(id, seed));
      render();
    }
  } finally {
    if (current(work)) state.controller = null;
  }
}

async function ensureExpanded(id) {
  if (state.graph.expanded.has(id) || !state.graph.nodes.has(id)) return;
  ui.detailController?.abort();
  const controller = new AbortController();
  ui.detailController = controller;
  ui.loadingId = id;
  render();
  try {
    await expandEntity(state.graph, id, { signal: controller.signal });
    if (controller.signal.aborted) return;
    ui.loadingId = null;
    renderGraph();
    render();
  } catch (error) {
    if (controller.signal.aborted) return;
    ui.loadingId = null;
    status(error.message, () => ensureExpanded(id));
    render();
  } finally {
    if (ui.detailController === controller) ui.detailController = null;
  }
}

function openNode(id) {
  if (!state.graph.nodes.has(id)) return;
  sound.playChime(540);
  if (resolveMode(state) === 'relation') {
    openDetail(id);
    return;
  }
  selectRealIdentity(id);
}

function openDetail(id) {
  const entity = state.graph.nodes.get(id);
  if (!entity) return;
  stopStory({ render: false });
  ui.detailController?.abort();
  ui.detailController = null;
  ui.loadingId = null;
  nav.stack = [{ name: 'identity', id, title: entity.label }];
  view.focus(id);
  ensureSheetOpen();
  ensureExpanded(id);
  render();
}

/* ==================== NAVIGATION (une seule vue à la fois) ==================== */
function resetNav() {
  stopStory({ render: false });
  ui.detailController?.abort();
  ui.detailController = null;
  ui.loadingId = null;
  ui.speakingId = null;
  nav.stack = [];
}
function pushView(name, title = '') {
  nav.stack.push({ name, title });
  ensureSheetOpen();
  render();
}
function popView() {
  const top = nav.stack.at(-1);
  if (!top) return;
  if (top.name === 'story') stopStory({ render: false });
  else nav.stack.pop();
  render();
}
function openSubview(name, title = SUB_TITLES[name] || '') {
  if (nav.stack.at(-1)?.name === name) {
    popView();
    return;
  }
  pushView(name, title);
}
function showEdge(edge) {
  ui.sourceEdge = edge;
  if (nav.stack.at(-1)?.name === 'source') render();
  else pushView('source', SUB_TITLES.source);
  status(evidenceLabels[edge.evidence]);
}
function openMedia(entity) {
  ui.media = {
    src: entity.image,
    alt: `Portrait de ${entity.label}`,
    title: `Portrait · ${entity.label}`,
    caption: 'Archive photographique ou iconographique issue de Wikimedia Commons',
    link: fileUrl(entity),
  };
  pushView('media', SUB_TITLES.media);
}
function openTimeView() {
  $('year-from').value = state.period.from ?? '';
  $('year-to').value = state.period.to ?? '';
  $('include-undated').checked = state.period.undated;
  $('time-status').textContent = `${visibleEdges().length} relation${visibleEdges().length > 1 ? 's' : ''} visible${visibleEdges().length > 1 ? 's' : ''} avec la période actuelle.`;
  pushView('time', SUB_TITLES.time);
}

/* ==================== RENDU ==================== */
function render() {
  const top = nav.stack.at(-1) ?? null;
  const mode = resolveMode(state);
  const active = results.open ? 'results' : top ? top.name : mode;
  const sub = !results.open && Boolean(top);
  for (const [name, id] of Object.entries(VIEW_IDS)) $(id).hidden = name !== active;
  $('search-block').hidden = sub;
  $('subhead').hidden = !sub;
  $('sheet-title').textContent = sub ? (top.title || '') : '';
  renderSlots();
  renderSoundButton();
  syncScene();
  $('input-a').setAttribute('aria-expanded', String(results.open && results.slot === 'a'));
  $('input-b').setAttribute('aria-expanded', String(results.open && results.slot === 'b'));
  switch (active) {
    case 'home': renderHome(); break;
    case 'results': renderResults(); break;
    case 'identity': renderIdentity(); break;
    case 'local': renderLocal(); break;
    case 'relation': renderRelation(); break;
    case 'source': renderSource(); break;
    case 'media': renderMedia(); break;
    case 'list': renderAccessible(); break;
    case 'settings': renderSettings(); break;
    case 'advanced': renderDiscovery(); break;
    default: break;
  }
  renderLegend();
  const viewKey = `${active}:${nav.stack.length}:${top?.id ?? ''}:${results.open ? results.slot : ''}`;
  if (viewKey !== ui.viewKey) {
    ui.viewKey = viewKey;
    if (!results.open) $('sheet-scroll').scrollTop = 0;
  }
  if (sub && !ui.wasSub) $('sheet-title').focus({ preventScroll: true });
  if (!sub && ui.wasSub) $('sheet-scroll').focus({ preventScroll: true });
  ui.wasSub = sub;
}

const EXAMPLE_NAMES = ['Matt Mez Sax', 'Marie Curie', 'Victor Hugo', 'Ada Lovelace', 'Claude Monet'];
function renderHome() {
  const examples = $('examples');
  examples.replaceChildren();
  for (const name of EXAMPLE_NAMES) examples.append(button(name, () => searchFromExample(name), 'example-chip'));
}

/* ---- Fiche locale RELIA : identité déclarée, chaînes officielles, chronologie vidéo ---- */
const localView = { identity: null };

function openLocalIdentity(identity) {
  stopStory({ render: false });
  ui.detailController?.abort();
  ui.detailController = null;
  ui.loadingId = null;
  localView.identity = identity;
  nav.stack = [{ name: 'local', id: identity.id, title: identity.label }];
  ensureSheetOpen();
  render();
}

function localDateShort(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { dateStyle: 'long' });
}

function localHero(identity) {
  const card = el('section', 'identity-card');
  card.style.setProperty('--t', 'var(--t-person)');
  const body = el('div', 'identity-text');
  body.append(text('p', 'Fiche locale RELIA', 'kicker'));
  body.append(text('h2', identity.label, 'identity-name'));
  const chips = el('div', 'chip-row');
  chips.append(chipInfo('shield', verificationLabel(identity)));
  body.append(chips);
  if (identity.description) body.append(text('p', identity.description, 'identity-desc'));
  card.append(avatarNode(identity, 'xl'), body);
  return card;
}

function channelsSection(identity) {
  const wrap = el('section', 'local-section');
  const channels = catalogFor(identity.id)?.channels ?? [];
  wrap.append(sectionHead('Chaînes YouTube officielles', channels.length ? String(channels.length) : ''));
  if (!channels.length) {
    wrap.append(text('p', 'Aucune chaîne rattachée pour l’instant. Le rattachement est explicite : déclaré par le propriétaire, puis résolu et vérifié par l’API — jamais par simple correspondance de nom.', 'muted-text'));
    return wrap;
  }
  const list = el('ul', 'local-channels');
  for (const channel of channels) {
    const item = el('li', 'channel-card');
    const main = el('div', 'channel-main');
    main.append(text('h4', channel.title, 'channel-title'));
    main.append(text('p', `Rattachement déclaré par le propriétaire${channel.declaredAt ? ` · enregistré le ${localDateShort(channel.declaredAt)}` : ''}`, 'fine-print'));
    item.append(main, link('Ouvrir la chaîne', channel.url, 'text-link'));
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function localVideoRow(row) {
  const { entry, video } = row;
  const item = el('li', 'local-video');
  const frame = el('div', 'rail-frame');
  if (video.embeddable) {
    const open = el('button', 'rail-thumb');
    open.type = 'button';
    open.setAttribute('aria-label', `Lire la vidéo : ${video.title}`);
    if (video.thumbnail) {
      const img = el('img', 'rail-poster');
      img.src = video.thumbnail;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      open.append(img);
    }
    open.append(iconNode('play', 'ico rail-play'));
    open.addEventListener('click', () => playVideo(frame, {
      kind: 'youtube',
      title: video.title,
      poster: video.thumbnail,
      // Intégration autorisée uniquement : lecteur youtube-nocookie, aucun téléchargement ni réhébergement.
      embed: `https://www.youtube-nocookie.com/embed/${video.videoId}?rel=0`,
    }));
    frame.append(open);
  } else if (video.thumbnail) {
    const poster = el('img', 'rail-poster');
    poster.src = video.thumbnail;
    poster.alt = '';
    poster.loading = 'lazy';
    poster.decoding = 'async';
    poster.referrerPolicy = 'no-referrer';
    frame.append(poster, chipInfo('info', 'Lecture sur YouTube uniquement'));
    frame.classList.add('no-embed');
  }
  item.append(frame);

  const main = el('div', 'local-video-main');
  main.append(text('h4', video.title, 'local-video-title'));
  const publication = datesOf(entry).find(line => line.role === 'publication');
  const chips = el('div', 'chip-row');
  if (publication) chips.append(chipInfo('calendar', `${publication.label} ${publication.display}`));
  if (video.durationDisplay) chips.append(chipInfo('clock', video.durationDisplay));
  if (video.channelTitle) chips.append(chipInfo('video', video.channelTitle));
  if (!video.embeddable) chips.append(chipInfo('info', 'Lecture sur YouTube uniquement'));
  if (isStale(video.provenance[0])) chips.append(chipInfo('alert', 'Métadonnées à revérifier'));
  main.append(chips);
  const provenance = video.provenance[0];
  if (provenance) {
    main.append(text('p', `Source : YouTube Data API · capturé le ${localDateShort(provenance.capturedAt)}${provenance.refreshBy ? ` · à revérifier avant le ${localDateShort(provenance.refreshBy)}` : ''}`, 'fine-print'));
  }
  main.append(link('Ouvrir sur YouTube', video.link, 'text-link'));
  item.append(main);
  return item;
}

function chronologySection(identity) {
  const wrap = el('section', 'local-section');
  const rows = chronologyRows(catalogFor(identity.id));
  wrap.append(sectionHead('Chronologie des vidéos', rows.length ? String(rows.length) : ''));
  wrap.append(text('p', rows.length
    ? 'De la plus ancienne publication accessible à la plus récente. La date affichée est celle de la publication de la vidéo, jamais la date de l’événement filmé.'
    : 'Aucune vidéo synchronisée pour l’instant. La synchronisation s’exécute hors navigateur, avec YOUTUBE_API_KEY dans un environnement autorisé (voir docs/SYNC_YOUTUBE.md) — jamais depuis cette page.', 'muted-text'));
  if (!rows.length) return wrap;
  const list = el('ol', 'local-videos');
  for (const row of rows) list.append(localVideoRow(row));
  wrap.append(list);
  return wrap;
}

function renderLocal() {
  const body = $('local-body');
  body.replaceChildren();
  const identity = localView.identity;
  if (!identity) return;
  body.append(
    localHero(identity),
    channelsSection(identity),
    chronologySection(identity),
    text('p', 'Chronologie alimentée uniquement par des traces numériques vérifiables (provenance datée, rafraîchie au plus tard tous les 30 jours).', 'fine-print'),
  );
}

/* ---- Identité : une personne explorée ---- */
function renderIdentity() {
  const entity = identityEntity();
  const hero = $('identity-hero'), actions = $('identity-actions');
  hero.replaceChildren();
  actions.replaceChildren();
  $('period-label').textContent = periodLabel();
  syncIdentityTabs();
  if (!entity) {
    hero.append(text('p', 'Choisissez une personne pour explorer son réseau.', 'muted-text'));
    cancelBiography();
    $('identity-panel').replaceChildren();
    $('identity-savoir').replaceChildren();
    $('video-rail').hidden = true;
    return;
  }
  hero.append(identityHero(entity));
  for (const node of identityActions(entity)) actions.append(node);
  renderSavoir(entity);
  renderVideoRail(entity);
  renderIdentityPanel();
}

/* ---- Le saviez-vous : une relation documentée, avec sa référence ---- */
function savoirNode(node) {
  const chip = el('div', `savoir-node type-${node.type || 'unknown'}`);
  chip.append(iconNode(typeIconName(node.type), 'ico'), text('span', node.label, 'savoir-name'));
  return chip;
}

function renderSavoir(entity) {
  const box = $('identity-savoir');
  box.replaceChildren();
  if (!isLoaded(entity)) return;
  const found = pickRevelation(entity.id, [...state.graph.edges.values()], state.graph.nodes);
  if (!found) return;
  const subject = found.focusFirst ? entity : found.other;
  const object = found.focusFirst ? found.other : entity;
  const card = el('section', 'savoir-card');
  card.setAttribute('aria-label', 'Le saviez-vous');
  const head = el('div', 'savoir-head');
  head.append(iconNode('lightbulb', 'ico'), text('span', 'Le saviez-vous', 'savoir-kicker'));
  const chain = el('div', 'savoir-chain');
  const relationPill = text('span', found.relation, 'savoir-relation');
  chain.append(savoirNode(subject), relationPill, savoirNode(object));
  const foot = el('div', 'savoir-foot');
  foot.append(text('span', 'Information issue de Wikidata.', 'fine-print'));
  foot.append(link('Voir la source', found.source.url, 'text-link'));
  card.append(head, chain, foot);
  box.append(card);
}

/* ---- Vidéos liées : carrousel en bas de la feuille ---- */
const videoCache = new Map();
let videoWork = null;
let activeVideoStop = null;

function renderVideoRail(entity) {
  const rail = $('video-rail');
  if (!entity) { rail.hidden = true; return; }
  const cached = videoCache.get(entity.id);
  if (!cached) {
    rail.hidden = true;
    rail.replaceChildren();
    rail.dataset.for = '';
    loadVideos(entity);
    return;
  }
  // Redessiné seulement quand la personne change : un lecteur déjà lancé n’est pas effacé par un rafraîchissement.
  if (rail.dataset.for !== entity.id) {
    drawVideoRail(rail, cached);
    rail.dataset.for = entity.id;
  }
  if (cached.length && ui.pendingPlay === entity.id) {
    ui.pendingPlay = null;
    requestAnimationFrame(() => playFirstVideo());
  }
}

async function loadVideos(entity) {
  if (videoCache.has(entity.id) || videoWork?.id === entity.id) return;
  const controller = new AbortController();
  videoWork = { id: entity.id, controller };
  const declared = youtubeItems(youtubeIdsFromClaims(entity.raw?.claims), entity.label);
  let items = declared;
  try {
    items = [...declared, ...await fetchCommonsVideos(entity.label, { signal: controller.signal })];
  } catch (error) {
    if (controller.signal.aborted) return;
    // Échec silencieux : seules les vidéos déclarées dans Wikidata restent proposées.
  }
  if (videoWork?.controller !== controller) return;
  videoWork = null;
  videoCache.set(entity.id, items);
  refreshVideoBadges();
  refreshVideoPill(entity);
  if (identityEntity()?.id === entity.id) renderVideoRail(entity);
}

// Lecture : le bouton près du portrait et celui des étiquettes ouvrent la même liste de vidéos.
function playFirstVideo() {
  const rail = $('video-rail');
  if (rail.hidden) return;
  if (ui.railCollapsed) {
    ui.railCollapsed = false;
    rail.classList.remove('is-collapsed');
    rail.querySelector('.rail-head')?.setAttribute('aria-expanded', 'true');
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  rail.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  rail.querySelector('.rail-thumb')?.click();
}

function videoPill(count) {
  const pill = button(count > 1 ? `Voir les ${count} vidéos` : 'Voir la vidéo', playFirstVideo, 'pill primary video-pill');
  pill.prepend(iconNode('play', 'ico'));
  return pill;
}

function refreshVideoPill(entity) {
  document.querySelector('#identity-hero .video-pill')?.remove();
  const items = videoCache.get(entity.id) || [];
  const body = document.querySelector('#identity-hero .identity-text');
  if (items.length && body && identityEntity()?.id === entity.id) body.append(videoPill(items.length));
}

function playVideosFor(id) {
  if (state.a?.id === id) { playFirstVideo(); return; }
  ui.pendingPlay = id;
  openNode(id);
}

const prefetchState = { timer: null, token: 0 };
function videoIds() {
  return new Set([...videoCache].filter(([, items]) => items.length).map(([id]) => id));
}
function refreshVideoBadges() {
  view.setVideoIds(videoIds());
}
function schedulePrefetch() {
  clearTimeout(prefetchState.timer);
  prefetchState.timer = setTimeout(prefetchVideos, 800);
}
// Vérifie, pour les personnes voisines (8 au plus), si des vidéos existent : le bouton lecture apparaît sur leur étiquette.
async function prefetchVideos() {
  const token = ++prefetchState.token;
  const focusId = state.a?.id;
  const people = [...state.graph.nodes.values()]
    .filter(entity => entity.type === 'person' && entity.id !== focusId && entity.label && entity.label !== entity.id && !videoCache.has(entity.id))
    .slice(0, 8);
  for (const entity of people) {
    if (token !== prefetchState.token) return;
    let items = youtubeItems(youtubeIdsFromClaims(entity.raw?.claims), entity.label);
    try {
      items = [...items, ...await fetchCommonsVideos(entity.label)];
    } catch { /* sans vidéo : l’étiquette reste sans bouton */ }
    if (token !== prefetchState.token) return;
    videoCache.set(entity.id, items);
    refreshVideoBadges();
  }
}

function drawVideoRail(rail, items) {
  rail.replaceChildren();
  if (!items.length) { rail.hidden = true; return; }
  rail.hidden = false;
  rail.classList.toggle('is-collapsed', Boolean(ui.railCollapsed));
  const head = el('button', 'rail-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(!ui.railCollapsed));
  head.append(iconNode('video', 'ico'), text('span', `Vidéos liées · ${items.length}`, 'rail-title'), iconNode('chevronDown', 'ico rail-chevron'));
  head.addEventListener('click', () => {
    ui.railCollapsed = !ui.railCollapsed;
    rail.classList.toggle('is-collapsed', ui.railCollapsed);
    head.setAttribute('aria-expanded', String(!ui.railCollapsed));
  });
  const track = el('ul', 'rail-track');
  track.setAttribute('aria-label', 'Vidéos liées à ce nom');
  for (const item of items) track.append(videoCard(item));
  rail.append(head, track);
}

function videoCard(item) {
  const li = el('li', 'rail-card');
  const frame = el('div', 'rail-frame');
  const open = el('button', 'rail-thumb');
  open.type = 'button';
  open.setAttribute('aria-label', `Lire la vidéo : ${item.title}`);
  if (item.poster) {
    const img = el('img', 'rail-poster');
    img.src = item.poster;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    open.append(img);
  }
  open.append(iconNode('play', 'ico rail-play'));
  open.addEventListener('click', () => playVideo(frame, item));
  frame.append(open);
  const caption = el('div', 'rail-caption');
  caption.append(text('span', item.title, 'rail-name'), link('Source', item.source, 'rail-source'));
  li.append(frame, caption);
  return li;
}

function playVideo(frame, item) {
  activeVideoStop?.();
  const original = [...frame.childNodes];
  let player;
  if (item.kind === 'youtube') {
    player = el('iframe');
    player.src = item.embed;
    player.title = item.title;
    player.allow = 'accelerometer; encrypted-media; picture-in-picture';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
  } else {
    player = el('video');
    player.controls = true;
    player.playsInline = true;
    player.preload = 'metadata';
    if (item.poster) player.poster = item.poster;
    const source = el('source');
    source.src = item.src;
    source.type = item.mime || 'video/webm';
    player.append(source);
  }
  frame.replaceChildren(player);
  activeVideoStop = () => {
    if (player.tagName === 'VIDEO') player.pause();
    frame.replaceChildren(...original);
    activeVideoStop = null;
  };
  if (player.tagName === 'VIDEO') player.play().catch(() => { /* lecture refusée par le navigateur : les commandes restent disponibles */ });
}

function identityHero(entity) {
  const card = el('section', 'identity-card');
  card.style.setProperty('--t', `var(--t-${entity.type || 'unknown'})`);
  const body = el('div', 'identity-text');
  body.append(text('p', typeLabels[entity.type] || typeLabels.unknown, 'kicker'));
  body.append(text('h2', entity.label, 'identity-name'));
  const chips = el('div', 'chip-row');
  const dates = lifeDates(entity);
  if (dates) chips.append(chipInfo('calendar', dates));
  if (entity.typeBasis === 'relationship') chips.append(chipInfo('info', 'Catégorie suggérée'));
  if (chips.childNodes.length) body.append(chips);
  if (entity.description) body.append(text('p', entity.description, 'identity-desc'));
  const videoCount = (videoCache.get(entity.id) || []).length;
  if (videoCount) body.append(videoPill(videoCount));
  card.append(avatarNode(entity, 'xl'), body);
  return card;
}

function identityActions(entity) {
  const loaded = isLoaded(entity);
  const speaking = ui.speakingId === entity.id;
  const play = iconButton('Raconter', 'play', () => launchEntityStory(entity), 'pill primary');
  play.disabled = !loaded;
  play.title = 'Lancer le récit chronologique de cette identité';
  const speak = iconButton(speaking ? 'Arrêter' : 'Écouter', speaking ? 'pause' : 'speaker', () => speakIdentity(entity), 'pill');
  speak.setAttribute('aria-pressed', String(speaking));
  const center = iconButton('Centrer', 'target', () => view.focus(entity.id), 'pill');
  return [play, speak, center];
}

function speakIdentity(entity) {
  if (ui.speakingId === entity.id) {
    voice.stop();
    ui.speakingId = null;
    renderIdentity();
    return;
  }
  if (!voice.supported) {
    status('La narration vocale n’est pas disponible sur ce navigateur.');
    return;
  }
  if (!voice.enabled) {
    voice.setEnabled(true);
    renderSoundButton();
  }
  sound.playChime(600);
  const spoken = [entity.label, entity.description, entity.born ? `Naissance en ${entity.born.display}` : '', entity.died ? `Décès en ${entity.died.display}` : '']
    .filter(Boolean).join('. ');
  ui.speakingId = entity.id;
  renderIdentity();
  voice.speak(spoken, {
    onEnd: () => {
      if (ui.speakingId !== entity.id) return;
      ui.speakingId = null;
      if (identityEntity()?.id === entity.id) renderIdentity();
    },
  });
}

function syncIdentityTabs() {
  const tabs = [...document.querySelectorAll('#identity-tabs [role="tab"]')];
  for (const tab of tabs) {
    const active = tab.dataset.tab === ui.identityTab;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}

function renderIdentityPanel() {
  cancelBiography();
  const panel = $('identity-panel');
  panel.replaceChildren();
  const entity = identityEntity();
  if (!entity) return;
  const tabIds = { liens: 'tab-liens', chrono: 'tab-chrono', about: 'tab-about' };
  panel.setAttribute('aria-labelledby', tabIds[ui.identityTab] || 'tab-liens');
  if (!isLoaded(entity)) {
    panel.append(loadingCard(entity));
    return;
  }
  if (ui.identityTab === 'chrono') renderChronology(panel, entity);
  else if (ui.identityTab === 'about') renderAbout(panel, entity);
  else renderLinks(panel, entity);
}

function loadingCard(entity) {
  const card = el('section', 'card empty');
  if (ui.loadingId === entity.id) {
    card.append(iconNode('spinner', 'ico spin'), text('p', 'Chargement des liens…', 'body-text'));
  } else {
    card.append(text('p', 'Les liens ne sont pas encore chargés.', 'body-text'));
    card.append(iconButton('Voir les liens', 'reset', () => ensureExpanded(entity.id), 'pill primary'));
  }
  return card;
}

function renderLinks(panel, entity) {
  const edges = visibleEdges().filter(edge => edge.from === entity.id || edge.to === entity.id);
  const filtered = state.period.from !== null || state.period.to !== null;
  panel.append(sectionHead('Liens', String(edges.length)));
  if (!edges.length) {
    panel.append(emptyCard(
      filtered ? 'Aucun lien dans la période choisie.' : 'Aucun lien consulté pour cette identité.',
      filtered ? [iconButton('Modifier la période', 'clock', openTimeView, 'pill')] : [],
    ));
    return;
  }
  const list = el('div', 'stack');
  for (const edge of edges) {
    const otherId = edge.from === entity.id ? edge.to : edge.from;
    const other = state.graph.nodes.get(otherId);
    const row = el('article', 'relation-row');
    const main = el('div', 'row-main');
    main.append(
      text('span', other?.label || otherId, 'row-title'),
      text('span', `${typeLabels[other?.type] || typeLabels.unknown} · ${edge.label}${edge.classification ? ` · ${edge.classification}` : ''}`, 'row-sub'),
      text('span', edgeDates(edge), 'row-meta'),
      evidenceBadge(edge),
    );
    const actions = el('div', 'row-actions');
    actions.append(
      iconButton('Explorer', 'graph', () => openNode(otherId), 'pill small'),
      iconButton('Source', 'doc', () => showEdge(edge), 'pill small'),
    );
    row.append(avatarNode(other || { type: 'unknown' }, 'md'), main, actions);
    list.append(row);
  }
  panel.append(list);
}

function timelineItem(step, entity, selectable, { undated = false } = {}) {
  const edge = step.edge, other = step.other;
  const active = state.timelineStep === edge.id;
  const item = el('li', `timeline-item${active ? ' is-active' : ''}`);
  const year = text('span', undated || !step.when ? '—' : String(step.when.anchor.year).replace('-', '−'), 'timeline-year');
  const body = el('button', 'timeline-button');
  body.type = 'button';
  body.disabled = !selectable;
  body.setAttribute('aria-pressed', String(active));
  body.append(
    text('span', `${edge.label} · ${other?.label || step.otherId}`, 'timeline-title'),
    text('span', `${step.when?.display || 'Date inconnue'}${selectable ? '' : ' · masqué par la période'}`, 'timeline-date'),
  );
  body.addEventListener('click', () => (active ? clearTimelineStep({ announce: true }) : selectTimelineStep(edge, entity)));
  item.append(year, body);
  return item;
}

function renderChronology(panel, entity) {
  const all = buildTimeline(entity.id, [...state.graph.edges.values()], state.graph.nodes);
  const visible = new Set(visibleEdges().map(edge => edge.id));
  panel.append(sectionHead('Repères dans le temps', String(all.dated.length)));
  panel.append(text('p', 'Les dates viennent des liens. Une date absente n’est pas devinée.', 'fine-print'));
  if (state.timelineStep) panel.append(button('Effacer le repère sélectionné', () => clearTimelineStep({ announce: true }), 'text-button'));
  if (!all.dated.length) {
    panel.append(emptyCard('Aucune relation datée pour cette identité.'));
  } else {
    const list = el('ol', 'timeline');
    for (const step of all.dated) list.append(timelineItem(step, entity, visible.has(step.id)));
    panel.append(list);
  }
  if (all.undated.length) {
    const details = el('details', 'disclosure');
    details.open = all.undated.some(step => step.id === state.timelineStep);
    details.append(text('summary', `Sans date connue · ${all.undated.length}`));
    details.append(text('p', 'Ces liens restent visibles. Aucune date n’est devinée.', 'fine-print'));
    const list = el('ul', 'timeline plain');
    for (const step of all.undated) list.append(timelineItem(step, entity, visible.has(step.id), { undated: true }));
    details.append(list);
    panel.append(details);
  }
}

function selectTimelineStep(edge, entity) {
  state.timelineStep = edge.id;
  state.timelineEntity = entity.id;
  view.highlightStep(edge);
  const other = edge.from === entity.id ? edge.to : edge.from;
  view.focus(other);
  renderIdentityPanel();
  status(`Repère sélectionné : ${edge.label} · ${state.graph.nodes.get(other)?.label || other} · ${edgeDates(edge)}`);
}

function clearTimelineStep({ render: shouldRender = true, announce = false } = {}) {
  if (!state.timelineStep) return;
  state.timelineStep = null;
  state.timelineEntity = null;
  if (!story.active) view.highlightStep(null);
  if (shouldRender && nav.stack.at(-1)?.name !== 'story') renderIdentityPanel();
  if (announce) status('Sélection effacée.');
}

function renderAbout(panel, entity) {
  panel.append(sectionHead('Présentation'));
  panel.append(text('p', entity.description || 'Pas de description disponible.', 'entity-description'));
  const facts = el('div', 'chip-row');
  if (entity.born) facts.append(chipInfo('calendar', `Naissance : ${entity.born.display}`));
  if (entity.died) facts.append(chipInfo('calendar', `Décès : ${entity.died.display}`));
  for (const occupation of entity.occupationLabels || []) facts.append(chipInfo(null, occupation));
  if (facts.childNodes.length) panel.append(facts);
  if (entity.wikiTitle && !entity.fictional) {
    const biography = el('section', 'card');
    panel.append(biography);
    loadBiography(entity, biography);
  }
  if (entity.image) panel.append(mediaCard(entity));
  if (entity.type === 'person' && !entity.fictional) {
    const bnf = el('section', 'card');
    panel.append(bnf);
    loadBnfDetails(entity, bnf);
  }
  const related = visibleEdges()
    .filter(edge => edge.from === entity.id || edge.to === entity.id)
    .map(edge => state.graph.nodes.get(edge.from === entity.id ? edge.to : edge.from))
    .filter(node => node && node.image && node.id !== entity.id);
  if (related.length) {
    panel.append(sectionHead('Liens avec un portrait', String(Math.min(related.length, 4))));
    const list = el('div', 'list-group');
    for (const node of related.slice(0, 4)) {
      const row = el('button', 'list-row');
      row.type = 'button';
      const main = el('span', 'row-main');
      main.append(text('span', node.label, 'row-title'), text('span', typeLabels[node.type] || typeLabels.unknown, 'row-sub'));
      row.append(avatarNode(node, 'md'), main, iconNode('chevron', 'ico row-go'));
      row.addEventListener('click', () => openNode(node.id));
      list.append(row);
    }
    panel.append(list);
  }
  panel.append(sourcesCard(entity));
  panel.append(text('p', 'À terme, RELIA accueillera correspondances, manuscrits numérisés, captations sonores et archives audiovisuelles. Les médias affichés proviennent aujourd’hui de fonds libres indexés.', 'fine-print'));
}

function sourcesCard(entity) {
  const card = el('section', 'card');
  card.append(text('h3', 'Sources', 'card-title'));
  card.append(text('p', 'Ces liens indiquent où l’information a été trouvée. Ils ne prouvent pas, à eux seuls, qu’elle est vraie.', 'fine-print'));
  card.append(link('Voir la page Wikidata', `https://www.wikidata.org/wiki/${entity.id}`));
  if (entity.wiki) card.append(link('Lire l’article sur Wikipédia', entity.wiki));
  const edges = visibleEdges().filter(edge => edge.from === entity.id || edge.to === entity.id);
  if (edges.length) {
    card.append(text('p', 'Sources des liens visibles', 'group-title'));
    for (const edge of edges) {
      const other = state.graph.nodes.get(edge.from === entity.id ? edge.to : edge.from);
      card.append(iconButton(`${other?.label || edge.to} · ${edge.property}`, 'doc', () => showEdge(edge), 'pill small'));
    }
  }
  return card;
}

function mediaCard(entity) {
  const card = el('article', 'media-card');
  const frame = el('button', 'media-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Agrandir le portrait de ${entity.label}`);
  const img = el('img');
  img.src = entity.image;
  img.alt = `Portrait de ${entity.label}`;
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => card.remove());
  frame.append(img);
  frame.addEventListener('click', () => openMedia(entity));
  const meta = el('div', 'media-meta');
  meta.append(text('strong', `Portrait · ${entity.label}`), link('Notice, auteur et licence · Wikimedia Commons', fileUrl(entity)));
  card.append(frame, meta);
  return card;
}

async function loadBiography(entity, container) {
  if (!entity.wikiTitle || entity.fictional) return;
  biographyController = new AbortController();
  const signal = biographyController.signal, version = biographyVersion;
  const heading = `${entity.type === 'person' ? 'Extrait biographique' : 'Présentation encyclopédique'} · Wikipédia (${entity.wikiLang})`;
  const box = el('section', 'stack');
  box.append(text('h3', heading, 'card-title'), text('p', 'Chargement de la présentation…', 'fine-print'));
  container.append(box);
  try {
    const summary = await getWikipediaSummary(entity, { signal });
    if (signal.aborted || version !== biographyVersion) return;
    box.replaceChildren(text('h3', heading, 'card-title'));
    if (!summary) {
      box.append(text('p', 'Pas de présentation disponible pour le moment.', 'fine-print'));
      return;
    }
    box.append(
      text('p', summary.text, 'body-text'),
      link(`${summary.title} · Source Wikipédia (${summary.language})`, summary.url),
      text('p', 'Texte issu de Wikipédia.', 'fine-print'),
    );
  } catch {
    if (!signal.aborted && version === biographyVersion) {
      box.replaceChildren(text('h3', heading, 'card-title'), text('p', 'Présentation indisponible pour le moment.', 'fine-print'));
    }
  }
}

function renderBnfEnrichment(box, entity) {
  box.replaceChildren(text('h3', 'Bibliothèque nationale (BnF)', 'card-title'));
  if (entity.bnfStatus === 'loading') {
    box.append(text('p', 'Recherche en cours…', 'fine-print'));
  } else if (entity.bnfStatus === 'unavailable') {
    box.append(text('p', 'Service indisponible pour le moment.', 'fine-print'), button('Réessayer', () => { entity.bnfStatus = null; loadBnfDetails(entity, box.parentElement); }, 'pill small'));
  } else if (!entity.bnfEnrichment) {
    box.append(text('p', 'Aucune notice trouvée pour cette personne.', 'fine-print'));
  } else {
    const record = entity.bnfEnrichment;
    box.append(link('Voir la notice à la BnF', record.recordUrl));
    box.append(link('Conditions de réutilisation', record.licenseUrl));
  }
}

function loadBnfDetails(entity, container) {
  if (entity.type !== 'person' || entity.fictional) return;
  let box = container.querySelector('.bnf-enrichment');
  if (!box) {
    box = el('section', 'bnf-enrichment');
    container.append(box);
  }
  if (entity.bnfStatus === 'loading' || entity.bnfEnrichment || entity.bnfStatus === 'not-found') {
    renderBnfEnrichment(box, entity);
    return;
  }
  entity.bnfStatus = 'loading';
  renderBnfEnrichment(box, entity);
  getBnfEnrichment(entity.id).then(result => {
    entity.bnfEnrichment = result;
    entity.bnfStatus = result ? 'linked' : 'not-found';
    if (box.isConnected) renderBnfEnrichment(box, entity);
  }).catch(() => {
    entity.bnfStatus = 'unavailable';
    if (box.isConnected) renderBnfEnrichment(box, entity);
  });
}

/* ---- Relation : deux personnes ---- */
function renderRelation() {
  const body = $('relation-body');
  body.replaceChildren();
  const { a, b } = state;
  if (!relationReady(a, b)) {
    body.append(text('p', 'Choisissez une seconde personne pour chercher un lien.', 'muted-text'));
    return;
  }
  const rel = state.relation;
  if (rel.status === 'loading') renderRelationLoading(body);
  else if (rel.status === 'done' && rel.result?.path) renderRelationFound(body, rel.result);
  else if (rel.status === 'done') renderRelationNotFound(body, rel.result || {});
  else renderRelationCall(body);
}

function renderRelationCall(body) {
  const card = el('section', 'card callout');
  card.append(text('h3', 'Chercher le lien', 'card-title'));
  card.append(text('p', 'RELIA cherche si les deux personnes sont reliées par des liens avec source.', 'body-text'));
  if (state.period.from !== null || state.period.to !== null) card.append(text('p', `Période appliquée : ${periodLabel()}.`, 'fine-print'));
  card.append(iconButton('Chercher le lien', 'link', searchPath, 'btn primary'));
  const details = el('details', 'disclosure');
  details.append(text('summary', 'Comment RELIA cherche ?'));
  details.append(text('p', 'Chaque lien affiche sa source. La recherche s’arrête après un nombre limité d’étapes.', 'fine-print'));
  card.append(details);
  body.append(card);
}

function renderRelationLoading(body) {
  const card = el('section', 'card callout');
  const head = el('div', 'result-head');
  head.append(iconNode('spinner', 'ico spin'), text('h3', 'Recherche du lien…', 'card-title'));
  const progress = text('p', state.relation.progress || 'Préparation de la recherche…', 'fine-print');
  progress.id = 'relation-progress';
  card.append(head, progress, text('p', 'Recherche en cours. Merci de patienter.', 'fine-print'));
  card.append(iconButton('Annuler la recherche', 'close', cancelSearchPath, 'btn gray'));
  body.append(card);
}

function scopeDetails(result) {
  const details = el('details', 'disclosure');
  details.append(text('summary', 'Ce que la recherche a couvert'));
  const eligibleEdges = [...state.graph.edges.values()].filter(edge => eligible(edge) && inPeriod(edge, state.period)).length;
  if (result.incomplete || state.graph.partial) details.append(text('p', 'Certaines sources ou données sont indisponibles : une partie du réseau peut manquer.', 'fine-print'));
  if (result.bounded || state.graph.capped) details.append(text('p', 'Une limite de taille ou de recherche a été atteinte ; d’autres connexions n’ont pas pu être vérifiées.', 'fine-print'));
  return details;
}

function pathSteps(path) {
  const wrap = el('div', 'path');
  path.nodes.forEach((id, index) => {
    const entity = state.graph.nodes.get(id);
    const node = el('div', 'path-node');
    node.append(avatarNode(entity || { id, type: 'unknown' }, 'sm'), text('span', entity?.label || id, 'path-label'));
    wrap.append(node);
    const edge = path.edges[index];
    if (!edge) return;
    const reverse = path.directions?.[index] === 'reverse';
    const step = el('div', 'path-link');
    step.append(
      text('strong', edge.label),
      text('span', `${edgeDates(edge)}${edge.classification ? ` · ${edge.classification}` : ''}`, 'row-meta'),
      text('span', `${reverse ? 'Lien lu dans le sens inverse' : 'Lien lu dans le sens direct'}${edge.property ? ` · ${edge.property}` : ''}`, 'row-meta'),
    );
    const refs = edge.references?.length || 0;
    step.append(iconButton('Voir la source', 'doc', () => showEdge(edge), 'pill small'));
    wrap.append(step);
  });
  return wrap;
}

function renderRelationFound(body, result) {
  const path = result.path;
  const intermediate = Math.max(0, path.nodes.length - 2);
  const card = el('section', 'card');
  const head = el('div', 'result-head');
  head.append(iconNode('check', 'ico ok'), text('h3', 'Lien trouvé', 'card-title'));
  card.append(
    head,
    text('p', `${path.edges.length} lien${path.edges.length > 1 ? 's' : ''} · ${intermediate} intermédiaire${intermediate > 1 ? 's' : ''}`, 'fine-print'),
    pathSteps(path),
  );
  if (path.edges.length) card.append(iconButton('Raconter ce lien', 'play', () => launchPathStory(path), 'btn primary'));
  card.append(text('p', 'La source indique d’où vient l’information. Elle ne prouve pas, à elle seule, que c’est vrai.', 'caveat'));
  if (result.incomplete) card.append(text('p', 'La recherche est incomplète : il peut exister un lien plus court.', 'warn-note'));
  if (result.incomplete || result.bounded) card.append(iconButton('Relancer la recherche', 'reset', searchPath, 'pill'));
  card.append(scopeDetails(result));
  body.append(card);
}

function renderRelationNotFound(body, result) {
  const incomplete = Boolean(result.incomplete || result.bounded);
  const card = el('section', 'card');
  const head = el('div', 'result-head');
  head.append(iconNode(incomplete ? 'alert' : 'info', `ico ${incomplete ? 'warn' : 'neutral'}`), text('h3', incomplete ? 'Recherche partielle' : 'Aucun lien documenté trouvé', 'card-title'));
  card.append(head);
  if (incomplete) {
    card.append(text('p', 'La recherche bornée s’est arrêtée avant d’avoir tout consulté. Aucun lien n’a été trouvé dans les données déjà consultées.', 'body-text'));
  } else {
    card.append(text('p', 'Aucun lien trouvé pour l’instant.', 'body-text'));
    card.append(text('p', 'Cela ne prouve pas l’absence de relation réelle.', 'caveat'));
  }
  if (incomplete) card.append(iconButton('Relancer la recherche', 'reset', searchPath, 'pill'));
  card.append(scopeDetails(result));
  body.append(card);
}

function cancelSearchPath() {
  abortWork();
  state.relation = { status: 'idle', result: null, progress: '' };
  status('Recherche annulée. Les sources déjà consultées restent dans la constellation.');
  renderGraph();
  render();
}

function setRelationResult(result) {
  state.path = result.path ?? null;
  state.relation = { status: 'done', result, progress: '' };
  view.highlightPath(state.path);
  renderGraph();
  render();
}

async function searchPath() {
  const { a, b } = state;
  if (!relationReady(a, b)) {
    status('Ajoutez une deuxième personne pour chercher un lien.');
    return;
  }
  const work = beginWork();
  const graph = state.graph;
  state.path = null;
  view.highlightPath(null);
  state.relation = { status: 'loading', result: null, progress: 'Préparation de la recherche…' };
  render();
  status('Recherche de liens en cours…');
  try {
    for (const entity of [a, b]) {
      if (!graph.nodes.has(entity.id) && graph.nodes.size < LIMITS.nodes) graph.nodes.set(entity.id, entity);
    }
    const result = await findRemotePath(graph, a.id, b.id, state.period, {
      signal: work.signal,
      onProgress: progress => {
        if (!current(work)) return;
        const line = 'Recherche en cours…';
        state.relation.progress = line;
        const node = $('relation-progress');
        if (node) node.textContent = line;
        status(line);
        renderGraph();
      },
    });
    if (!current(work)) return;
    state.discoverySearch = {
      incomplete: result.incomplete, bounded: result.bounded, expansions: result.expansions,
      queries: result.queries, depth: LIMITS.depth, roots: [a.id, b.id],
    };
    if (result.path) sound.playSuccess();
    setRelationResult(result);
    status(result.path
      ? 'Lien trouvé. Vous pouvez voir chaque étape et sa source.'
      : result.incomplete || result.bounded
        ? 'Recherche incomplète ou arrivée à sa limite : aucun lien trouvé dans les données consultées.'
        : 'Aucun lien trouvé pour l’instant.',
    result.incomplete || result.bounded ? searchPath : null);
  } catch (error) {
    if (current(work)) {
      state.relation = { status: 'idle', result: null, progress: '' };
      status(error.message, searchPath);
      render();
    }
  } finally {
    if (current(work)) state.controller = null;
  }
}

/* ---- Sources, médias, liste ---- */
function renderSource() {
  const body = $('source-body');
  body.replaceChildren();
  if (ui.sourceEdge) body.append(sourceCard(ui.sourceEdge));
}

function sourceCard(edge) {
  const card = el('article', 'source-card');
  const source = state.graph.nodes.get(edge.from), target = state.graph.nodes.get(edge.to);
  card.append(text('strong', `${source?.label || edge.from} · ${target?.label || edge.to}`), text('div', edge.label));
  if (!edge.references.length) card.append(text('p', 'Pas de source pour ce lien.', 'warning'));
  edge.references.forEach((reference, index) => {
    const block = el('div', 'stack');
    block.append(text('h3', edge.references.length > 1 ? `Source ${index + 1}` : 'Source'));
    reference.urls.forEach(url => block.append(link('Ouvrir la source', url)));
    reference.documents.forEach(id => block.append(link('Voir sur Wikidata', `https://www.wikidata.org/wiki/${id}`)));
    if (!reference.usable) block.append(text('p', 'Source incomplète : elle ne suffit pas à elle seule.', 'warning'));
    for (const date of reference.published) block.append(text('div', `Publiée le ${date.display}`));
    card.append(block);
  });
  card.append(link('Voir ce lien sur Wikidata', `https://www.wikidata.org/wiki/${edge.from}#${edge.property}`));
  return card;
}

function renderMedia() {
  const body = $('media-body');
  body.replaceChildren();
  const media = ui.media;
  if (!media) return;
  const figure = el('figure', 'media-figure');
  const img = el('img');
  img.src = media.src;
  img.alt = media.alt || '';
  img.referrerPolicy = 'no-referrer';
  const caption = el('figcaption');
  caption.append(text('strong', media.title), text('span', media.caption, 'fine-print'));
  figure.append(img, caption);
  body.append(figure);
  if (media.link) body.append(link('Notice, auteur et licence · Wikimedia Commons', media.link, 'text-link'));
}

function renderAccessible() {
  const container = $('list-body');
  container.replaceChildren();
  if (!state.graph.nodes.size) {
    container.append(text('p', 'Recherchez une identité pour charger son réseau.', 'muted-text'));
    return;
  }
  container.append(sectionHead('Identités', String(state.graph.nodes.size)));
  const people = el('div', 'list-group');
  for (const entity of state.graph.nodes.values()) {
    const row = el('button', 'list-row');
    row.type = 'button';
    const main = el('span', 'row-main');
    main.append(
      text('span', entity.label, 'row-title'),
      text('span', `${typeLabels[entity.type] || typeLabels.unknown}`, 'row-sub'),
    );
    row.append(avatarNode(entity, 'md'), main, iconNode('chevron', 'ico row-go'));
    row.addEventListener('click', () => openNode(entity.id));
    people.append(row);
  }
  container.append(people);
  const edges = visibleEdges();
  container.append(sectionHead('Liens dans la période', String(edges.length)));
  const list = el('div', 'list-group');
  for (const edge of edges) {
    const row = el('button', 'list-row');
    row.type = 'button';
    const main = el('span', 'row-main');
    main.append(
      text('span', `${state.graph.nodes.get(edge.from)?.label || edge.from} · ${edge.label} · ${state.graph.nodes.get(edge.to)?.label || edge.to}`, 'row-title'),
      text('span', `${edgeDates(edge)}`, 'row-sub'),
    );
    const glyph = el('span', 'key-glyph');
    glyph.append(iconNode('link'));
    row.append(glyph, main, iconNode('chevron', 'ico row-go'));
    row.addEventListener('click', () => showEdge(edge));
    list.append(row);
  }
  container.append(list);
}

/* ---- Réglages ---- */
function settingsGroup(title, rows) {
  const group = el('section', 'settings-group');
  group.append(text('h3', title, 'group-title'));
  const list = el('div', 'settings-list');
  for (const row of rows) list.append(row);
  group.append(list);
  return group;
}
function settingRow(label, control, note = '', { stacked = false } = {}) {
  const row = el('div', stacked ? 'settings-row' : 'settings-row settings-row-inline');
  const info = el('div', 'settings-label');
  info.append(text('span', label));
  if (note) info.append(text('small', note));
  row.append(info, control);
  return row;
}
function switchControl(label, checked, onChange) {
  const node = el('button', 'switch');
  node.type = 'button';
  node.setAttribute('role', 'switch');
  node.setAttribute('aria-checked', String(Boolean(checked)));
  node.setAttribute('aria-label', label);
  node.addEventListener('click', () => {
    const next = node.getAttribute('aria-checked') !== 'true';
    node.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return node;
}
function segmented(options, current, onChange, label = '') {
  const group = el('div', 'segmented wide');
  group.setAttribute('role', 'group');
  if (label) group.setAttribute('aria-label', label);
  for (const [value, name] of options) {
    const node = button(name, () => {
      for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === node));
      onChange(value);
    }, '');
    node.setAttribute('aria-pressed', String(value === current));
    group.append(node);
  }
  return group;
}
function voiceOption(label, key, checked, onPick) {
  const node = el('button', 'voice-option');
  node.type = 'button';
  node.setAttribute('role', 'radio');
  node.setAttribute('aria-checked', String(checked));
  node.dataset.key = key;
  const radio = el('span', 'radio');
  radio.setAttribute('aria-hidden', 'true');
  node.append(radio, text('span', label));
  node.addEventListener('click', () => {
    for (const other of node.parentElement.querySelectorAll('[role="radio"]')) other.setAttribute('aria-checked', String(other === node));
    onPick(key);
  });
  return node;
}
function voiceBlock() {
  const wrap = el('div', 'settings-row');
  const ranked = voice.ranked();
  const selectedKey = voice.voiceKey;
  const chosen = voice.selectedVoice();
  const note = !voice.supported
    ? 'Narration indisponible sur ce navigateur.'
    : chosen
      ? `Voix utilisée : ${voiceLabel(ranked.find(entry => entry.voice === chosen) || { name: chosen.name, lang: chosen.lang })}`
      : 'Aucune voix française détectée : la voix par défaut du navigateur sera utilisée.';
  const label = el('div', 'settings-label');
  label.append(text('span', 'Voix'), text('small', note));
  const group = el('div', 'voice-list');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Voix de narration');
  group.append(voiceOption('Automatique (recommandée)', '', selectedKey === '', key => { voice.setVoice(key); renderSettings(); }));
  for (const entry of ranked) {
    group.append(voiceOption(voiceLabel(entry), entry.key, selectedKey === entry.key, key => { voice.setVoice(key); renderSettings(); }));
  }
  wrap.append(label, group);
  if (!ranked.length && voice.supported) {
    wrap.append(text('p', 'Les voix françaises installées sur l’appareil apparaissent ici lorsque le navigateur les fournit.', 'fine-print'));
  }
  wrap.append(text('p', 'RELIA choisit parmi les voix de cet appareil. Une voix féminine ne peut pas être garantie sur tous les appareils.', 'fine-print'));
  return wrap;
}
function playSample() {
  if (!voice.supported) {
    status('La narration vocale n’est pas disponible sur ce navigateur.');
    return;
  }
  if (!voice.enabled) {
    voice.setEnabled(true);
    renderSoundButton();
  }
  voice.speak('Bonjour. Je lirai les identités et les liens un par un, avec leurs sources.');
}
function renderSettings() {
  const body = $('settings-body');
  body.replaceChildren();
  body.append(settingsGroup('Affichage', [
    settingRow('Thème', segmented([['light', 'Clair'], ['dark', 'Sombre']], document.body.dataset.theme === 'dark' ? 'dark' : 'light', setTheme, 'Thème'), '', { stacked: true }),
    settingRow('Texte plus grand', switchControl('Texte plus grand', document.body.dataset.text === 'large', setTextSize), 'Agrandit les textes de toute l’application.'),
  ]));
  body.append(settingsGroup('Voix et sons', [
    settingRow('Voix et sons', switchControl('Voix et sons', sound.enabled || voice.enabled, value => { sound.setEnabled(value); voice.setEnabled(value); renderSoundButton(); }), 'Effets sonores et lecture à voix haute des récits.'),
    settingRow('Vitesse de lecture', segmented([['calm', 'Posée'], ['normal', 'Normale']], voice.rateKey, key => voice.setRate(key), 'Vitesse de lecture'), 'Posée : plus lente, plus facile à suivre.', { stacked: true }),
    voiceBlock(),
    settingRow('Écouter un extrait', iconButton('Écouter', 'speaker', playSample, 'pill small')),
  ]));
  body.append(settingsGroup('Aide', [
    settingRow('Liste accessible', iconButton('Ouvrir la liste', 'list', () => openSubview('list', SUB_TITLES.list), 'pill small'), 'Les mêmes informations, en texte simple.'),
    settingRow('Aide', iconButton('Lire l’aide', 'help', () => openSubview('help', SUB_TITLES.help), 'pill small'), 'Comment lire RELIA, en quelques phrases.'),
  ]));
  const advanced = el('details', 'advanced-details');
  advanced.append(text('summary', 'Avancé'), settingRow('Comparer des états', iconButton('Ouvrir la comparaison', 'compass', () => openSubview('advanced', SUB_TITLES.advanced), 'pill small'), 'Pour garder des copies d’une recherche et les comparer.'));
  body.append(advanced);
  body.append(text('p', 'Vos réglages restent sur cet appareil.', 'settings-foot'));
}

function setTextSize(on) {
  document.body.dataset.text = on ? 'large' : 'normal';
  try { localStorage.setItem('relia-text', on ? 'large' : 'normal'); } catch { /* préférence non conservée */ }
  renderSettings();
}

function setTheme(theme) {
  const dark = theme === 'dark';
  document.body.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#14151B' : '#F5F6FA';
  view.setTheme();
  try { localStorage.setItem('relia-theme', dark ? 'dark' : 'light'); } catch { /* préférence non conservée */ }
}

function renderSoundButton() {
  const storyVoice = $('story-voice-toggle');
  if (!storyVoice) return;
  storyVoice.replaceChildren(iconNode(voice.enabled ? 'speaker' : 'speakerOff'), text('span', voice.supported ? (voice.enabled ? 'Voix activée' : 'Voix coupée') : 'Voix indisponible'));
  storyVoice.setAttribute('aria-pressed', String(voice.enabled));
  storyVoice.disabled = !voice.supported;
}

/* ==================== RÉCIT ==================== */
function launchEntityStory(entity) {
  if (!entity || !isLoaded(entity)) return;
  const all = buildTimeline(entity.id, [...state.graph.edges.values()], state.graph.nodes);
  const steps = [];
  if (all.dated.length) {
    for (const step of all.dated) {
      steps.push({
        id: step.id,
        year: step.when ? String(step.when.anchor.year).replace('-', '−') : 'Repère',
        dateDisplay: step.when?.display || '',
        title: `${entity.label} & ${step.other?.label || step.otherId}`,
        desc: `${step.edge.label} · ${step.edge.classification || 'relation documentée'}`,
        edge: step.edge,
        otherId: step.otherId,
      });
    }
  } else {
    for (const edge of visibleEdges().filter(item => item.from === entity.id || item.to === entity.id)) {
      const otherId = edge.from === entity.id ? edge.to : edge.from;
      const other = state.graph.nodes.get(otherId);
      steps.push({
        id: edge.id,
        year: 'Lien',
        dateDisplay: edgeDates(edge),
        title: `${entity.label} & ${other?.label || otherId}`,
        desc: `${edge.label} · ${edge.classification || 'relation consultée'}`,
        edge,
        otherId,
      });
    }
  }
  if (!steps.length) {
    status('Aucune relation à raconter pour cette identité dans la période choisie.');
    return;
  }
  startStory(steps, { title: `Récit · ${entity.label}` });
}

function launchPathStory(path) {
  if (!path || !path.edges.length) return;
  const steps = path.edges.map((edge, index) => {
    const fromId = path.nodes[index], toId = path.nodes[index + 1];
    const from = state.graph.nodes.get(fromId), to = state.graph.nodes.get(toId);
    const year = edge.dates?.P585?.[0]?.display || edge.dates?.P580?.[0]?.display || `Étape ${index + 1}`;
    return {
      id: edge.id,
      year: String(year).replace('-', '−'),
      dateDisplay: edgeDates(edge),
      title: `${from?.label || fromId} & ${to?.label || toId}`,
      desc: `${edge.label} · ${edge.classification || 'chemin documenté'}`,
      edge,
      otherId: toId,
    };
  });
  startStory(steps, { title: 'Parcours documenté' });
}

function startStory(steps, { title = 'Récit' } = {}) {
  resetNav();
  story.active = true;
  story.steps = steps;
  story.index = 0;
  story.title = title;
  story.playing = true;
  nav.stack = [{ name: 'story', title: 'Récit' }];
  $('story-kind').textContent = title;
  if (!DESKTOP.matches && sheetSnap !== 'half') setSnap('half');
  setPlayIcon(true);
  goToStoryStep(0);
  render();
}

function goToStoryStep(index) {
  if (!story.active || !story.steps.length) return;
  clearTimeout(story.timer);
  story.timer = null;
  story.index = Math.max(0, Math.min(index, story.steps.length - 1));
  const step = story.steps[story.index];
  $('story-counter').textContent = `Étape ${story.index + 1} sur ${story.steps.length}`;
  $('story-progress-fill').style.width = `${Math.round(((story.index + 1) / story.steps.length) * 100)}%`;
  $('story-year').textContent = step.year;
  $('story-title').textContent = step.title;
  $('story-desc').textContent = step.desc;
  $('story-date').textContent = step.dateDisplay || '';
  $('story-prev').disabled = story.index === 0;
  $('story-next').disabled = story.index === story.steps.length - 1;
  $('story-source').hidden = !step.edge;
  view.highlightStep(step.edge);
  if (step.otherId) view.focus(step.otherId);
  sound.playChime(500 + (story.index % 4) * 45);
  narrate(step);
}

function narrate(step) {
  const index = story.index;
  const spoken = `${step.year}. ${step.title}. ${step.desc}.`;
  const advance = () => {
    if (story.playing && story.index === index) scheduleNextStep(1400, index);
  };
  if (!voice.enabled || !voice.supported) {
    if (story.playing) scheduleNextStep(4200, index);
    return;
  }
  voice.speak(spoken, { onEnd: advance });
}

function scheduleNextStep(delay, index) {
  clearTimeout(story.timer);
  story.timer = setTimeout(() => {
    story.timer = null;
    if (!story.playing || story.index !== index) return;
    if (index < story.steps.length - 1) {
      goToStoryStep(index + 1);
    } else {
      pauseStory();
      status('Fin du récit. Explorez librement la constellation.');
    }
  }, delay);
}

function setPlayIcon(playing) {
  setIcon($('story-play-icon'), playing ? 'pause' : 'play');
  $('story-play-label').textContent = playing ? 'Pause' : 'Lecture';
}

function playStory() {
  if (!story.active) return;
  story.playing = true;
  setPlayIcon(true);
  sound.playTick();
  if (story.index >= story.steps.length - 1) goToStoryStep(0);
  else goToStoryStep(story.index);
}

function pauseStory() {
  story.playing = false;
  clearTimeout(story.timer);
  story.timer = null;
  voice.stop();
  setPlayIcon(false);
}

function stopStory({ render: shouldRender = true } = {}) {
  const wasActive = story.active;
  pauseStory();
  story.active = false;
  story.steps = [];
  const index = nav.stack.findIndex(entry => entry.name === 'story');
  if (index >= 0) nav.stack.length = index;
  if (wasActive) view.highlightStep(null);
  if (shouldRender) render();
}

/* ==================== PÉRIODE ==================== */
function applyTime(reset = false) {
  const from = reset || $('year-from').value === '' ? null : Number($('year-from').value);
  const to = reset || $('year-to').value === '' ? null : Number($('year-to').value);
  if ([from, to].some(year => year !== null && (!Number.isInteger(year) || year < -5000 || year > 2100)) || (from !== null && to !== null && from > to)) {
    $('time-status').textContent = 'Indiquez des années entières, de −5000 à 2100, dans l’ordre chronologique.';
    return;
  }
  if (reset) {
    $('year-from').value = '';
    $('year-to').value = '';
    $('include-undated').checked = true;
  }
  invalidatePath();
  state.period = { from, to, undated: $('include-undated').checked };
  renderGraph();
  const unknown = visibleEdges().filter(edge => edgeDates(edge) === 'Date de relation inconnue').length;
  status(`${periodLabel()} · ${visibleEdges().length} relations visibles · ${unknown} sans date connue. Tout chemin précédent est effacé.`);
  popView();
}

/* ==================== DISCOVERY (expérimental) ==================== */
function persistDiscovery() {
  try {
    localStorage.setItem('relia-discovery-v1', JSON.stringify({ before: state.discovery.before, after: state.discovery.after }));
    return true;
  } catch { return false; }
}
function compareDiscovery() {
  state.discovery.comparison = state.discovery.before && state.discovery.after
    ? compareSnapshots(state.discovery.before, state.discovery.after) : null;
}
function setDiscoverySnapshot(slot, snapshot) {
  state.discovery[slot] = snapshot;
  compareDiscovery();
  const persisted = persistDiscovery();
  renderDiscovery();
  if (!persisted) $('discovery-status').textContent = 'Snapshot conservé pour cette session, mais stockage local indisponible. Téléchargez le JSON pour le garder.';
}
function captureDiscoverySnapshot(slot) {
  const from = state.a, to = state.b;
  if (!from || !to || !state.graph.nodes.size) {
    $('discovery-status').textContent = 'Cherchez deux personnes et leur lien dans la barre de recherche, puis enregistrez l’état.';
    return;
  }
  try {
    const snapshot = createSnapshot({
      graph: state.graph, roots: [from.id, to.id], sources: ['wikidata'], origin: 'real',
      parameters: {
        method: 'RELIA bounded graph capture v1',
        propertyScope: Object.keys(PROPERTIES).sort(),
        period: { ...state.period },
        limits: { nodes: LIMITS.nodes, edges: LIMITS.edges, expansions: LIMITS.expansions, queries: LIMITS.queries, depth: LIMITS.depth },
      },
      paths: state.path ? [state.path] : [],
      search: state.discoverySearch,
      errors: state.graph.partial || state.discoverySearch?.incomplete
        ? ['Source distante ou exploration incomplète; le détail de l’erreur n’est pas conservé par le collecteur actuel.'] : [],
      limitations: ['Instantané du graphe Wikidata conservé en mémoire; ce n’est pas une extraction complète de Wikidata.'],
    });
    setDiscoverySnapshot(slot, snapshot);
    $('discovery-status').textContent = `État ${slot === 'before' ? 'A' : 'B'} enregistré · ${snapshot.snapshotId}. Sources interrogées : ${snapshot.sources.join(', ')}.`;
  } catch (error) {
    $('discovery-status').textContent = `Snapshot non créé : ${error.message}`;
  }
}
function importDiscoverySnapshot(slot, file) {
  if (!file) return;
  if (file.size > 5_000_000) {
    $('discovery-status').textContent = 'Import refusé : la limite de fichier est de 5 Mo.';
    return;
  }
  file.text().then(raw => {
    const snapshot = JSON.parse(raw);
    if (!validateSnapshot(snapshot)) throw new Error('Le fichier ne contient pas un snapshot RELIA Discovery valide ou son empreinte est incorrecte.');
    setDiscoverySnapshot(slot, snapshot);
    $('discovery-status').textContent = `État ${slot === 'before' ? 'A' : 'B'} importé · ${snapshot.snapshotId} · ${snapshot.origin === 'simulated' ? 'SIMULÉ' : 'réel déclaré'}.`;
  }).catch(error => { $('discovery-status').textContent = `Import impossible : ${error.message}`; });
}
function downloadJSON(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderDiscovery() {
  const before = state.discovery.before, after = state.discovery.after;
  $('export-before').disabled = !before;
  $('export-after').disabled = !after;
  const container = $('discovery-register');
  container.replaceChildren();
  for (const [label, snapshot] of [['État A · Référence', before], ['État B · Enrichissement', after]]) {
    if (!snapshot) continue;
    const entry = el('section', 'discovery-entry');
    entry.append(text('strong', `${label}${snapshot.origin === 'simulated' ? ' · SIMULÉ' : ' · réel déclaré'}`),
      text('p', `${snapshot.snapshotId} · ${snapshot.identities.join(' · ')}`),
      text('p', `Sources : ${snapshot.sources.join(', ')} · ${snapshot.nodes.length} éléments · ${snapshot.edges.length} liens · Récupéré : ${snapshot.retrievedAt}`),
      text('p', `Collecte ${snapshot.collection.complete ? 'terminée dans le périmètre déclaré' : 'incomplète'} · ${snapshot.collection.expanded.length} identités explorées${snapshot.collection.errors.length ? ` · Erreurs : ${snapshot.collection.errors.join('; ')}` : ''}`));
    if (snapshot.collection.limitations.length) entry.append(text('p', `Limites : ${snapshot.collection.limitations.join(' · ')}`));
    container.append(entry);
  }
  const comparison = state.discovery.comparison;
  if (!comparison) return;
  const title = comparison.status === 'incomparable' ? 'Comparaison impossible' :
    comparison.status === 'incomplete' ? 'Comparaison partielle · nouveautés à interpréter avec prudence' : 'Comparaison déterministe dans le périmètre capturé';
  container.append(text('h3', title, 'section-title'), text('p', `${comparison.entries.length} entrée(s) · avant : ${before.snapshotId} · après : ${after.snapshotId}`, 'fine-print'));
  if (!comparison.entries.length) container.append(text('p', 'Aucune différence admissible détectée. Ce résultat ne prouve pas l’absence d’autres relations.', 'muted-text'));
  for (const entry of comparison.entries) {
    const card = el('article', 'discovery-entry');
    card.append(text('strong', `${discoveryLabels[entry.type] || entry.type} · ${entry.id}`),
      text('p', entry.explanation),
      text('p', `Personnes exactes : ${entry.entities.join(' · ') || 'non précisées'}${entry.sources.length ? ` · Sources attribuées : ${entry.sources.join(', ')}` : ' · Adaptateur de provenance non attribué à cette assertion'}`));
    const relation = entry.details.relation;
    const assertions = entry.details.relations || (relation ? [relation.before, relation.after].filter(Boolean) : entry.path?.edges || []);
    for (const edge of assertions) {
      const from = state.graph.nodes.get(edge.from)?.label || edge.from;
      const to = state.graph.nodes.get(edge.to)?.label || edge.to;
      card.append(text('p', `${from} · ${edge.label || edge.property || 'relation'} (${edge.property || 'type inconnu'}) · ${to} · assertion ${edge.id}`));
    }
    for (const reference of entry.references) {
      reference.urls?.forEach(url => card.append(link(url, url)));
      reference.documents?.forEach(id => card.append(link(`Document cité · ${id}`, `https://www.wikidata.org/wiki/${id}`)));
    }
    for (const identifier of entry.details.identifiers || []) {
      card.append(text('p', `Identifiant externe réconcilié : ${identifier.namespace}:${identifier.value}${identifier.sourceId ? ` · Source : ${identifier.sourceId}` : ''}`));
      if (identifier.url) card.append(link('Consulter l’identifiant externe', identifier.url));
      for (const evidence of identifier.references || []) evidence.urls?.forEach(url => card.append(link(url, url)));
    }
    if (entry.limitations.length) card.append(text('p', `Limites : ${entry.limitations.join(' · ')}`));
    card.append(text('p', `Vérification humaine : ${entry.verificationStatus}`, 'fine-print'));
    container.append(card);
  }
}
function downloadDiscoverySnapshot(slot) {
  const snapshot = state.discovery[slot];
  if (snapshot) downloadJSON(`relia-discovery-${slot === 'before' ? 'A-reference' : 'B-enrichment'}.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
}
function downloadDiscoveryRegistry() {
  const snapshots = [state.discovery.before, state.discovery.after].filter(Boolean);
  const comparisons = state.discovery.comparison ? [state.discovery.comparison] : [];
  downloadJSON('relia-discovery-registry.json', exportRegistry({ snapshots, comparisons }));
}

/* ==================== FEUILLE (mobile : trois positions ; bureau : colonne) ==================== */
const sheet = $('sheet');
const head = $('sheet-head');
const grabber = $('grabber');

function applySheetHeight(px) {
  document.documentElement.style.setProperty('--sheet-h', `${Math.round(px)}px`);
}
function measureSheet() {
  if (DESKTOP.matches) return;
  const viewport = window.innerHeight;
  sheetTargets = snapTargets(viewport, { peek: head.offsetHeight + 4, topInset: 64 });
  applySheetHeight(sheetTargets[sheetSnap]);
}
function setSnap(name) {
  sheetSnap = name;
  sheet.dataset.snap = name;
  document.body.dataset.sheet = name;
  applySheetHeight(sheetTargets[name]);
  grabber.setAttribute('aria-label', name === 'full' ? 'Réduire le panneau' : 'Agrandir le panneau');
}
function ensureSheetOpen() {
  if (!DESKTOP.matches && sheetSnap === 'peek') setSnap('half');
}

let drag = null;
let suppressGrabClick = false;
head.addEventListener('pointerdown', event => {
  if (DESKTOP.matches || !event.isPrimary || event.button > 0) return;
  if (event.target.closest('input, a, button:not(.grabber), .chip, .search-message, .field')) return;
  suppressGrabClick = false;
  drag = {
    pointerId: event.pointerId, startY: event.clientY, startH: sheet.getBoundingClientRect().height,
    lastH: null, lastT: 0, velocity: 0, moved: false,
  };
});
head.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dy = event.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.abs(dy) < 6) return;
    drag.moved = true;
    sheet.classList.add('is-dragging');
    try { head.setPointerCapture(event.pointerId); } catch { /* capture facultative */ }
  }
  const height = clampHeight(drag.startH - dy, sheetTargets);
  const now = performance.now();
  if (drag.lastH !== null && now > drag.lastT) drag.velocity = (height - drag.lastH) / (now - drag.lastT);
  drag.lastH = height;
  drag.lastT = now;
  applySheetHeight(height);
});
function endDrag(event) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  const finished = drag;
  drag = null;
  if (!finished.moved) return;
  suppressGrabClick = true;
  sheet.classList.remove('is-dragging');
  const stale = performance.now() - finished.lastT > 90;
  setSnap(settleSnap(finished.lastH ?? finished.startH, stale ? 0 : finished.velocity, sheetTargets));
}
head.addEventListener('pointerup', endDrag);
head.addEventListener('pointercancel', endDrag);
grabber.addEventListener('click', () => {
  if (suppressGrabClick) {
    suppressGrabClick = false;
    return;
  }
  setSnap(nextSnap(sheetSnap));
});
grabber.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp') { event.preventDefault(); setSnap(sheetSnap === 'peek' ? 'half' : 'full'); }
  if (event.key === 'ArrowDown') { event.preventDefault(); setSnap(sheetSnap === 'full' ? 'half' : 'peek'); }
});
window.addEventListener('resize', measureSheet);
new ResizeObserver(() => measureSheet()).observe(head);

/* ==================== RACCOURCIS ET BARRE SUPÉRIEURE ==================== */
const sound = new SoundEngine();
const voice = new VoiceNarrator();
voice.onVoicesChanged(() => {
  if (nav.stack.at(-1)?.name === 'settings') renderSettings();
});

function bindSlot(slot) {
  const refs = slots[slot];
  refs.input.addEventListener('input', () => onSlotInput(slot));
  refs.input.addEventListener('focus', () => ensureSheetOpen());
  refs.input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch(slot);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (results.open) closeResults();
    } else if (event.key === 'ArrowDown' && results.open) {
      event.preventDefault();
      $('results-list').querySelector('button')?.focus();
    }
  });
  refs.clear.addEventListener('click', () => {
    refs.input.value = '';
    if (slot === 'b' && !state.b) state.secondOpen = false;
    closeResults();
    refs.input.focus();
  });
}
bindSlot('a');
bindSlot('b');
$('results-list').addEventListener('keydown', event => {
  const choices = [...$('results-list').querySelectorAll('button.result-row')];
  const index = choices.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    choices[Math.min(index + 1, choices.length - 1)]?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (index <= 0) slots[results.slot].input.focus();
    else choices[index - 1]?.focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeResults();
    slots[results.slot].input.focus();
  }
});
$('add-second').addEventListener('click', addSecond);
$('back').addEventListener('click', popView);


for (const tab of document.querySelectorAll('#identity-tabs [role="tab"]')) {
  tab.addEventListener('click', () => {
    ui.identityTab = tab.dataset.tab;
    syncIdentityTabs();
    renderIdentityPanel();
  });
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('#identity-tabs [role="tab"]')];
    const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    next.click();
  });
}

$('period-open').addEventListener('click', openTimeView);
$('apply-time').addEventListener('click', () => applyTime());
$('clear-time').addEventListener('click', () => applyTime(true));

$('btn-settings').addEventListener('click', () => openSubview('settings', SUB_TITLES.settings));
$('btn-reset').addEventListener('click', () => {
  view.reset();
  status('Constellation recentrée.');
});

$('story-prev').addEventListener('click', () => goToStoryStep(story.index - 1));
$('story-next').addEventListener('click', () => goToStoryStep(story.index + 1));
$('story-play').addEventListener('click', () => (story.playing ? pauseStory() : playStory()));
$('story-source').addEventListener('click', () => {
  const edge = story.steps[story.index]?.edge;
  if (!edge) return;
  pauseStory();
  showEdge(edge);
});
$('story-voice-toggle').addEventListener('click', () => {
  voice.setEnabled(!voice.enabled);
  renderSoundButton();
  if (story.active && story.playing) {
    if (voice.enabled) goToStoryStep(story.index);
    else scheduleNextStep(4200, story.index);
  }
});

$('import-before').addEventListener('change', event => { importDiscoverySnapshot('before', event.target.files[0]); event.target.value = ''; });
$('import-after').addEventListener('change', event => { importDiscoverySnapshot('after', event.target.files[0]); event.target.value = ''; });
$('capture-before').addEventListener('click', () => captureDiscoverySnapshot('before'));
$('capture-after').addEventListener('click', () => captureDiscoverySnapshot('after'));
$('export-before').addEventListener('click', () => downloadDiscoverySnapshot('before'));
$('export-after').addEventListener('click', () => downloadDiscoverySnapshot('after'));
$('export-discovery').addEventListener('click', downloadDiscoveryRegistry);

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (results.open) {
    closeResults();
    return;
  }
  if (nav.stack.length) popView();
});

window.addEventListener('pagehide', event => {
  abortWork();
  cancelBiography();
  closeResults();
  if (!event.persisted) view.dispose();
});

/* ==================== DÉMARRAGE ==================== */
hydrateIcons();
try {
  if (localStorage.getItem('relia-theme') === 'dark') setTheme('dark');
} catch { /* thème par défaut */ }
try {
  document.body.dataset.text = localStorage.getItem('relia-text') === 'large' ? 'large' : 'normal';
} catch { /* taille par défaut */ }
compareDiscovery();
measureSheet();
setSnap(sheetSnap);
renderGraph();
render();
renderDiscovery();
renderSoundButton();
