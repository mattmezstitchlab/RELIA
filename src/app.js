import './styles.css';
import { COLORS, NetworkView } from './graph.js';
import { LIMITS, PROPERTIES, bestLabel, demoGraph, emptyGraph, eligible, entityFromRaw, expandEntity, findRemotePath, getEntities, getWikipediaSummary, inPeriod, safeURL, searchEntities, shortestPath } from './data.js';
import { getBnfEnrichment } from './bnf.js';
import { buildTimeline } from './timeline.js';
import { compareSnapshots, createSnapshot, exportRegistry, validateSnapshot } from './discovery.js';

const $ = id => document.getElementById(id);
const typeLabels = { person: 'Personne', work: 'Œuvre', place: 'Lieu', institution: 'Institution', event: 'Événement', unknown: 'Type non déterminé' };
const evidenceLabels = { referenced: 'Documenté — référence Wikidata', unverified: 'Assertion non vérifiée · sans référence exploitable', deprecated: 'Assertion obsolète · exclue des chemins', fictional: 'Démonstration fictive · aucune preuve réelle' };
const claimStatusLabels = {
  assertion: 'Assertion référencée — provenance conservée, véracité non vérifiée',
  hypothesis: 'Hypothèse — assertion sans référence exploitable, exclue des chemins',
  deprecated: 'Assertion obsolète — exclue des chemins',
};
const discoveryLabels = {
  NEW_ENTITY: 'Nouvelle entité', NEW_RELATION: 'Nouvelle relation documentée', NEW_PATH: 'Nouveau chemin',
  NEW_EVIDENCE: 'Nouvelle preuve', IDENTITY_RECONCILED: 'Identité réconciliée',
  HYPOTHESIS: 'Hypothèse · exclue des chemins', CONTRADICTION: 'Donnée contradictoire',
  INCOMPARABLE: 'Incomparable',
};
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
  dataset: 'welcome', graph: demoGraph(), mode: 'explore', period: { from: null, to: null, undated: true },
  selected: null, pair: { from: null, to: null }, controller: null, version: 0, retry: null, path: null,
  discoverySearch: null, discovery: restoreDiscovery(), timelineStep: null, timelineEntity: null,
};
let biographyController = null, biographyVersion = 0;
function cancelBiography() { biographyController?.abort(); biographyController = null; biographyVersion++; }
document.body.classList.add('landing');
function text(tag, value, className) {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
}
function button(label, callback, className = 'subtle') {
  const element = text('button', label, className); element.type = 'button'; element.addEventListener('click', callback); return element;
}
function link(label, url) {
  const href = safeURL(url);
  if (!href) return text('span', label);
  const element = text('a', label); element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; return element;
}
function status(message, retry = null) {
  $('status').hidden = !message; $('status-text').textContent = message || '';
  state.retry = retry; $('retry').hidden = !retry;
}
$('retry').addEventListener('click', () => state.retry?.());
function abortWork() {
  state.controller?.abort(); state.controller = null; state.version++;
  $('find-path').disabled = false; $('cancel-path').hidden = true;
}
function beginWork() {
  abortWork(); state.controller = new AbortController();
  return { signal: state.controller.signal, version: state.version };
}
function current(work) { return !work.signal.aborted && work.version === state.version; }
const view = new NetworkView($('graph'), {
  onSelect: id => selectNode(id), onEdge: edge => showEdge(edge),
  onHover: (record, x, y) => {
    $('tooltip').hidden = !record;
    if (record) {
      $('tooltip').textContent = `${record.label}${record.fictional ? ' · Démonstration fictive' : record.property ? ` · ${evidenceLabels[record.evidence]}` : ''}`;
      $('tooltip').style.left = `${Math.min(x + 15, innerWidth - 270)}px`;
      $('tooltip').style.top = `${Math.min(y + 15, innerHeight - 80)}px`;
    }
  },
  onUnavailable: () => {
    status('Le rendu 3D est indisponible. Toutes les entités et relations restent accessibles dans la liste.');
    $('accessible-panel').hidden = false;
    queueMicrotask(renderAccessible);
  },
});

class IdentitySearch {
  constructor(id, onPick, { peopleOnly = false, onEdit = () => {} } = {}) {
    this.root = $(id); this.onPick = onPick; this.peopleOnly = peopleOnly; this.onEdit = onEdit;
    const field = text('div', '', 'search-box');
    field.append(text('span', '⌕', 'search-icon'));
    this.input = document.createElement('input');
    this.input.type = 'search'; this.input.placeholder = 'Rechercher une personne, un lieu, une œuvre…'; this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', peopleOnly ? 'Rechercher et sélectionner une personne' : this.input.placeholder);
    this.input.setAttribute('aria-expanded', 'false'); this.input.setAttribute('aria-controls', `${id}-results`);
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-autocomplete', 'list');
    this.results = text('div', '', 'search-results'); this.results.id = `${id}-results`; this.results.setAttribute('role', 'listbox');
    this.results.setAttribute('aria-label', 'Identités correspondantes');
    this.live = text('span', '', 'sr-only'); this.live.setAttribute('role', 'status'); this.live.setAttribute('aria-live', 'polite');
    field.append(this.input, text('span', '↵', 'search-key')); this.root.append(field, this.results, this.live);
    this.input.addEventListener('input', () => {
      this.onEdit(); clearTimeout(this.timer); this.controller?.abort();
      this.results.replaceChildren(); this.input.setAttribute('aria-expanded', 'false');
      this.timer = setTimeout(() => this.run(), 300);
    });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.clearResults();
      if (event.key === 'Enter') {
        event.preventDefault(); this.run();
      }
      if (event.key === 'ArrowDown') { event.preventDefault(); this.results.querySelector('button')?.focus(); }
    });
    this.results.addEventListener('keydown', event => {
      const choices = [...this.results.querySelectorAll('button')], index = choices.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); choices[Math.min(index + 1, choices.length - 1)]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); if (index <= 0) this.input.focus(); else choices[index - 1]?.focus(); }
      if (event.key === 'Escape') { this.clearResults(); this.input.focus(); }
    });
  }
  clearResults() { clearTimeout(this.timer); this.controller?.abort(); this.results.replaceChildren(); this.input.setAttribute('aria-expanded', 'false'); }
  reset() { this.clearResults(); this.input.value = ''; }
  message(value) {
    this.results.replaceChildren(text('p', value, 'search-message')); this.live.textContent = value; this.input.setAttribute('aria-expanded', 'true');
  }
  async run() {
    const term = this.input.value.trim();
    this.clearResults();
    if (term.length < 2) return;
    this.controller = new AbortController();
    const signal = this.controller.signal, dataset = state.dataset;
    this.message(dataset === 'demo' ? 'Recherche dans la démonstration fictive…' : 'Recherche des identités dans Wikidata…');
    try {
      const results = dataset === 'demo' ? [...state.graph.nodes.values()].filter(e => (!this.peopleOnly || e.type === 'person') && e.label.toLocaleLowerCase('fr').includes(term.toLocaleLowerCase('fr'))) : await searchEntities(term, { signal });
      if (signal.aborted || dataset !== state.dataset) return;
      if (!results.length) { this.message('Aucune identité trouvée pour cette recherche. Essayez une autre orthographe.'); return; }
      this.results.replaceChildren();
      this.live.textContent = `${results.length} identités. Sélectionnez explicitement un résultat.`;
      this.results.append(text('p', dataset === 'demo' ? 'Démonstration fictive · choisissez une personne imaginaire.' : 'Choisissez l’identité exacte ; un nom seul ne suffit pas.', 'search-message'));
      for (const entity of results) {
        const pick = button('', async () => {
          try {
            pick.disabled = true;
            let selected = entity;
            if (this.peopleOnly && dataset !== 'demo') {
              const raw = await getEntities([entity.id], { signal });
              if (!raw[entity.id] || raw[entity.id].missing !== undefined) throw new Error('Identité indisponible.');
              selected = entityFromRaw(raw[entity.id]);
              if (selected.type !== 'person') { this.message('Cette identité n’est pas une personne (instance humaine Q5). Choisissez une personne.'); return; }
            }
            if (signal.aborted || dataset !== state.dataset) return;
            this.input.value = selected.label; this.clearResults(); this.onPick(selected);
          } catch (error) { if (!signal.aborted) this.message(`${error.message} Relancez la recherche pour réessayer.`); }
          finally { pick.disabled = false; }
        }, 'result-button');
        pick.setAttribute('role', 'option');
        const row = text('span', '', 'result-label'); row.append(text('span', entity.label), text('span', entity.fictional ? 'FICTIF' : entity.id, 'qid'));
        pick.append(row, text('span', entity.description, 'result-description')); this.results.append(pick);
      }
    } catch (error) {
      if (signal.aborted) return;
      this.message(error.message); this.results.append(button('Réessayer', () => this.run()));
    }
  }
  search(value) { this.input.value = value; this.input.focus(); this.run(); }
}
const mainSearch = new IdentitySearch('main-search', selected => {
  chooseDataset('real'); openMode('explore'); workspaceSearch.input.value = selected.label; selectReal(selected.id);
});
const workspaceSearch = new IdentitySearch('workspace-search', selected => state.dataset === 'demo' ? selectNode(selected.id) : selectReal(selected.id));
const pairSearches = {};
for (const side of ['from', 'to']) {
  pairSearches[side] = new IdentitySearch(`${side}-search`, selected => {
    state.pair[side] = selected; view.setSelected(selected.id); invalidatePath(); renderPair();
  }, { peopleOnly: true, onEdit: () => { state.pair[side] = null; invalidatePath(); renderPair(); } });
}
function invalidatePath() {
  if (state.controller) abortWork();
  clearTimelineStep();
  state.path = null; state.discoverySearch = null; view.highlightPath(null); $('path-result').replaceChildren();
}
function renderPair() {
  $('connection-identities').textContent = `${state.pair.from ? `${state.pair.from.label} (${state.pair.from.id})` : 'Départ non sélectionné'} → ${state.pair.to ? `${state.pair.to.label} (${state.pair.to.id})` : 'Arrivée non sélectionnée'}${state.dataset === 'demo' ? ' · Démonstration fictive' : ''}`;
  view.setRoots([state.pair.from?.id, state.pair.to?.id].filter(Boolean));
  const key = $('network-key');
  key.replaceChildren();
  if (state.pair.from && state.pair.to) {
    for (const [side, entity] of [['A', state.pair.from], ['B', state.pair.to]]) {
      const item = text('span', '', `network-key-item network-key-${side.toLowerCase()}`);
      item.append(text('b', side), text('span', entity.label));
      key.append(item);
    }
    key.hidden = false;
  } else key.hidden = true;
}
function chooseDataset(dataset) {
  abortWork(); cancelBiography(); clearTimelineStep({ render: false }); state.dataset = dataset; state.graph = dataset === 'demo' ? demoGraph() : emptyGraph();
  state.selected = null; state.path = null; state.discoverySearch = null; state.pair = { from: null, to: null };
  view.setSelected(null);
  state.period = { from: null, to: null, undated: true };
  $('year-from').value = ''; $('year-to').value = ''; $('include-undated').checked = true;
  $('time-status').textContent = ''; $('path-result').replaceChildren(); $('selected-identity').replaceChildren();
  $('entity-panel').hidden = true; $('source-list').replaceChildren(); $('hero').hidden = true;
  document.body.classList.remove('landing');
  for (const search of [mainSearch, workspaceSearch, ...Object.values(pairSearches)]) search.reset();
  $('dataset-label').textContent = dataset === 'demo' ? 'Démonstration fictive' : 'Sources réelles · Wikidata';
  $('explore-intro').textContent = dataset === 'demo' ? 'Démonstration fictive : recherchez un personnage, une œuvre ou un lieu imaginaire.' : 'Choisissez une identité Wikidata pour commencer.';
  $('dataset-switch').textContent = dataset === 'demo' ? 'Explorer les données réelles ↗' : 'Voir la démo fictive ↗';
  view.highlightPath(null); view.reset(); renderGraph(); renderPair();
  status(dataset === 'demo' ? 'Démonstration fictive : toutes les identités, relations et dates sont imaginaires.' : 'Recherchez un nom, puis sélectionnez son identité exacte. Les sources restent visibles.');
  if (dataset === 'demo') { state.pair.from = state.graph.nodes.get('D1'); state.pair.to = state.graph.nodes.get('D2'); pairSearches.from.input.value = state.pair.from.label; pairSearches.to.input.value = state.pair.to.label; renderPair(); }
}
function openMode(mode) {
  if (state.dataset === 'welcome') chooseDataset('real');
  state.mode = mode; $('workspace').hidden = false;
  for (const [name, id] of [['explore', 'explore-section'], ['connect', 'connect-section'], ['time', 'time-section'], ['sources', 'sources-section'], ['discovery', 'discovery-section']]) $(id).hidden = mode !== name;
  for (const element of document.querySelectorAll('[data-mode]')) { element.classList.toggle('active', element.dataset.mode === mode); element.setAttribute('aria-pressed', element.dataset.mode === mode ? 'true' : 'false'); }
  $('workspace-title').textContent = { explore: 'EXPLORER', connect: 'RELIER', time: 'TEMPS', sources: 'SOURCES', discovery: 'RELIA DISCOVERY' }[mode];
  if (mode === 'sources') renderSources();
  if (mode === 'discovery') renderDiscovery();
  if (innerWidth <= 700) $('entity-panel').hidden = true;
}
function visibleEdges() { return [...state.graph.edges.values()].filter(edge => inPeriod(edge, state.period)); }
function renderGraph() {
  view.setData(state.graph, visibleEdges()); renderAccessible();
  renderTimelineRail();
  if (state.mode === 'sources') renderSources();
}
async function selectReal(id) {
  if (state.dataset !== 'real') return;
  const work = beginWork(); state.selected = id;
  view.setSelected(id);
  if (state.graph.nodes.has(id)) renderEntity(id);
  status('Consultation des relations et de leurs références…');
  try {
    await expandEntity(state.graph, id, { signal: work.signal });
    if (!current(work)) return;
    renderGraph(); renderEntity(id); view.focus(id);
    const entity = state.graph.nodes.get(id);
    $('selected-identity').replaceChildren(text('p', `${entity.label} · ${id}`, 'fine-print'), link('Ouvrir l’identité Wikidata ↗', `https://www.wikidata.org/wiki/${id}`));
    status(`${state.graph.nodes.size} entités · ${state.graph.edges.size} assertions documentées${state.graph.partial ? ' · Certaines sources ou étiquettes sont indisponibles : réseau partiel.' : ''}${state.graph.capped ? ' · Limite du graphe atteinte.' : ''}`, state.graph.partial ? () => selectReal([...state.graph.partialExpanded, ...state.graph.partialLabels][0] || id) : null);
  } catch (error) {
    if (current(work)) status(error.message, () => selectReal(id));
  } finally { if (current(work)) state.controller = null; }
}
function selectNode(id) {
  if (state.dataset === 'welcome') { chooseDataset('demo'); openMode('explore'); }
  if (state.dataset === 'demo') { state.selected = id; view.setSelected(id); renderEntity(id); view.focus(id); }
  else selectReal(id);
}
function edgeDates(edge) {
  const dates = [];
  for (const [property, label] of [['P580', 'début'], ['P582', 'fin'], ['P585', 'date']]) {
    for (const value of edge.dates?.[property] || []) dates.push(`${label} : ${value.display}`);
  }
  return dates.join(' · ') || 'Date de relation inconnue';
}
function sourceCard(edge) {
  const card = text('article', '', 'source-card');
  const source = state.graph.nodes.get(edge.from), target = state.graph.nodes.get(edge.to);
  card.append(text('strong', `${source?.label || edge.from} → ${target?.label || edge.to}`), text('div', `${edge.label}${edge.property ? ` (${edge.property})` : ''}`), text('div', `Classification : ${edge.classification || 'démonstration fictive'}`), text('span', claimStatusLabels[edge.claimStatus] || evidenceLabels[edge.evidence], 'evidence-badge'), text('div', edgeDates(edge)));
  if (['P19', 'P20', 'P131'].includes(edge.property)) card.append(text('p', 'Relation géographique visible pour le contexte, exclue des chemins professionnels et culturels.', 'fine-print'));
  if (edge.fictional) {
    card.append(text('p', 'Démonstration fictive : aucune source, aucun identifiant Wikidata, aucune preuve réelle.')); return card;
  }
  card.append(link('Propriété Wikidata ↗', `https://www.wikidata.org/wiki/Property:${edge.property}`));
  card.append(text('div', `Identifiant d’assertion : ${edge.id}`), text('div', `Rang : ${edge.rank === 'preferred' ? 'préféré' : edge.rank === 'deprecated' ? 'obsolète' : 'normal'}`), text('div', `Consulté par RELIA : ${new Date(edge.retrievedAt).toLocaleString('fr-FR')}`));
  card.append(link('Consulter l’assertion et ses références ↗', `https://www.wikidata.org/wiki/${edge.from}#${edge.property}`));
  if (!edge.references.length) card.append(text('p', 'Aucune référence. Assertion non vérifiée, exclue des chemins.', 'warning'));
  for (const [index, reference] of edge.references.entries()) {
    const block = text('div');
    block.append(text('h3', `Référence ${index + 1}`), text('div', `Empreinte : ${reference.hash || 'non fournie'}`));
    reference.urls.forEach(url => block.append(link(url, url)));
    reference.documents.forEach(id => block.append(link(`Document cité · ${id} ↗`, `https://www.wikidata.org/wiki/${id}`)));
    if (!reference.usable) block.append(text('p', 'Référence sans URL ni document cité exploitable. Ne suffit pas pour un chemin.', 'warning'));
    for (const date of reference.published) block.append(text('div', `Publication de la source : ${date.display}`));
    for (const date of reference.retrieved) block.append(text('div', `Consultation déclarée dans Wikidata : ${date.display}`));
    if (!reference.published.length) block.append(text('div', 'Date de publication de la source : non renseignée'));
    const details = document.createElement('details'); details.append(text('summary', 'Provenance complète de la référence'), text('pre', JSON.stringify(reference.provenance, null, 2)));
    block.append(details); card.append(block);
  }
  if (Object.keys(edge.qualifiers || {}).length) {
    const details = document.createElement('details'); details.append(text('summary', 'Qualificatifs originaux'), text('pre', JSON.stringify(edge.qualifiers, null, 2))); card.append(details);
  }
  return card;
}
function renderSources(edge = null) {
  const container = $('source-list'); container.replaceChildren();
  const edges = edge ? [edge] : visibleEdges();
  if (!edge && state.dataset === 'real' && edges.length) {
    const referenced = edges.filter(item => item.evidence === 'referenced').length;
    container.append(text('p', `${referenced} assertions référencées · ${edges.length - referenced} sans référence exploitable ou obsolètes. Ces dernières sont exclues des chemins.`, 'fine-print'));
  }
  if (state.dataset === 'real') container.append(text('p', 'Les références documentent la provenance, pas la véracité. RELIA ne réalise aucun contrôle automatisé des faits dans les sources externes.', 'fine-print'));
  if (!edges.length) container.append(text('p', 'Aucune relation dans la période sélectionnée. Explorez une identité pour consulter ses sources.', 'muted'));
  for (const item of edges) container.append(sourceCard(item));
}
function showEdge(edge) { openMode('sources'); renderSources(edge); status(edge.fictional ? 'Démonstration fictive : aucun document réel.' : evidenceLabels[edge.evidence]); }
async function loadBiography(entity, container) {
  if (!entity.wikiTitle || entity.fictional) return;
  biographyController = new AbortController();
  const signal = biographyController.signal, version = biographyVersion;
  const heading = `${entity.type === 'person' ? 'Extrait biographique' : 'Présentation encyclopédique'} · Wikipédia (${entity.wikiLang})`;
  const box = text('section');
  box.append(text('h3', heading), text('p', 'Chargement depuis le sitelink exact de cette identité…', 'fine-print'));
  container.append(box);
  try {
    const summary = await getWikipediaSummary(entity, { signal });
    if (signal.aborted || version !== biographyVersion || state.dataset !== 'real' || state.selected !== entity.id) return;
    box.replaceChildren(text('h3', heading));
    if (!summary) { box.append(text('p', 'Aucun extrait disponible pour le sitelink exact. La description Wikidata est conservée.', 'fine-print')); return; }
    box.append(text('p', summary.text, 'entity-description'), link(`${summary.title} · Source Wikipédia (${summary.language}) ↗`, summary.url),
      text('p', `Identité liée par le sitelink Wikidata, sans recherche par nom. Consulté : ${new Date(summary.retrievedAt).toLocaleString('fr-FR')}. Texte encyclopédique non contrôlé automatiquement par RELIA.`, 'fine-print'));
  } catch {
    if (!signal.aborted && version === biographyVersion) {
      box.replaceChildren(text('h3', heading), text('p', 'Extrait indisponible. La description Wikidata est conservée ; aucune autre identité n’est recherchée.', 'fine-print'));
    }
  }
}
function renderBnfEnrichment(box, entity) {
  box.replaceChildren(text('h3', 'Notice d’autorité · BnF'));
  if (entity.bnfStatus === 'loading') {
    box.append(text('p', 'Vérification d’un lien documentaire explicite avec data.bnf.fr…', 'fine-print'));
  } else if (entity.bnfStatus === 'unavailable') {
    box.append(text('p', 'Le service SPARQL BnF est indisponible. Les informations Wikidata restent inchangées ; aucun rapprochement par nom n’est tenté.', 'fine-print'),
      button('Réessayer la consultation BnF', () => { entity.bnfStatus = null; loadBnfDetails(entity); }));
  } else if (!entity.bnfEnrichment) {
    box.append(text('p', 'Aucune notice liée par owl:sameAs n’a été retournée pour cette identité Wikidata. Cela ne prouve pas l’absence d’une notice BnF ; aucune recherche par nom n’est effectuée.', 'fine-print'));
  } else {
    const record = entity.bnfEnrichment;
    box.append(link('Consulter la notice BnF ↗', record.recordUrl));
    const labels = Object.entries(record.labels).flatMap(([language, values]) => values.map(value => `${value} (${language})`));
    if (labels.length) box.append(text('p', `Libellés de la notice : ${labels.join(' · ')}`, 'fine-print'));
    box.append(text('p', `Alignement explicite owl:sameAs avec ${entity.id} · ${record.attribution} · récupéré le ${new Date(record.retrievedAt).toLocaleString('fr-FR')}. Enrichissement d’identité uniquement, exclu des chemins.`, 'fine-print'));
    box.append(link(`${record.license} · conditions de réutilisation BnF ↗`, record.licenseUrl));
  }
}
function loadBnfDetails(entity, container = $('entity-content')) {
  if (entity.type !== 'person' || entity.fictional) return;
  let box = container.querySelector('.bnf-enrichment');
  if (!box) { box = text('section', '', 'bnf-enrichment'); container.append(box); }
  if (entity.bnfStatus === 'loading') { renderBnfEnrichment(box, entity); return; }
  if (entity.bnfEnrichment || entity.bnfStatus === 'not-found') { renderBnfEnrichment(box, entity); return; }
  entity.bnfStatus = 'loading';
  renderBnfEnrichment(box, entity);
  const signal = state.controller?.signal;
  getBnfEnrichment(entity.id, { signal }).then(result => {
    entity.bnfEnrichment = result;
    entity.bnfStatus = result ? 'linked' : 'not-found';
    if (state.dataset === 'real' && state.selected === entity.id) {
      const currentBox = $('entity-content').querySelector('.bnf-enrichment');
      if (currentBox) renderBnfEnrichment(currentBox, entity);
    }
  }).catch(error => {
    if (signal?.aborted) { entity.bnfStatus = null; return; }
    entity.bnfStatus = 'unavailable';
    if (state.dataset === 'real' && state.selected === entity.id) {
      const currentBox = $('entity-content').querySelector('.bnf-enrichment');
      if (currentBox) renderBnfEnrichment(currentBox, entity);
    }
  });
}
function renderEntity(id, { keepScroll = false } = {}) {
  const entity = state.graph.nodes.get(id); if (!entity) return;
  cancelBiography();
  if (state.timelineStep && (state.timelineEntity !== id || !visibleEdges().some(edge => edge.id === state.timelineStep))) clearTimelineStep({ render: false });
  const panel = $('entity-panel'), scroll = keepScroll ? panel.scrollTop : 0;
  const container = $('entity-content'); container.replaceChildren(); panel.hidden = false;
  container.append(text('p', `${typeLabels[entity.type] || 'Entité'} · ${entity.fictional ? 'Démonstration fictive' : entity.id}`, 'entity-tag'));
  container.append(text('h2', entity.label));
  const presentation = documentSection('◈', 'Présentation', '', true);
  if (entity.typeBasis === 'relationship') presentation.body.append(text('p', 'Catégorie d’affichage suggérée par les propriétés culturelles ou une relation ; elle ne constitue pas une classification certaine.', 'fine-print'));
  presentation.body.append(text('p', entity.description || 'Description non disponible dans les sources consultées.', 'entity-description'));
  const info = text('div', '', 'entity-info');
  if (entity.born) info.append(text('span', `Naissance : ${entity.born.display}`, 'chip'));
  if (entity.died) info.append(text('span', `Décès : ${entity.died.display}`, 'chip'));
  for (const occupation of entity.occupationLabels || []) info.append(text('span', occupation, 'chip'));
  if (info.childNodes.length) presentation.body.append(info);
  if (entity.wikiTitle && !entity.fictional) {
    const biography = document.createElement('details'); biography.className = 'document-subsection';
    biography.append(text('summary', 'Présentation détaillée · Wikipédia'));
    const biographyContent = text('div', '', 'document-subsection-content'); biography.append(biographyContent);
    presentation.body.append(biography); loadBiography(entity, biographyContent);
  }
  container.append(presentation.element);

  const chronology = documentSection('◷', 'Chronologie', `${buildTimeline(id, [...state.graph.edges.values()], state.graph.nodes).dated.length} repères`);
  renderTimelineDetails(chronology.body, entity);
  container.append(chronology.element);

  const edges = visibleEdges().filter(e => e.from === id || e.to === id);
  const neighbor = edge => state.graph.nodes.get(edge.from === id ? edge.to : edge.from);
  const relations = documentSection('⌁', 'Relations', `${edges.length}`);
  if (!edges.length) relations.body.append(text('p', 'Aucune relation culturelle disponible dans le graphe et la période consultés.', 'fine-print'));
  for (const edge of edges) {
    const other = neighbor(edge); if (!other) continue;
    const row = text('article', '', 'document-relation');
    const identity = text('strong', other.label);
    const reason = text('p', `Pourquoi ce lien : ${edge.label} · ${edge.classification || 'relation consultée'} · ${edge.fictional ? 'démonstration fictive' : edge.evidence === 'referenced' ? 'référence déclarée dans Wikidata' : 'référence exploitable indisponible'}.`, 'document-relation-reason');
    row.append(identity, reason,
      button('Explorer dans la constellation ↗', () => selectNode(other.id), 'document-link'),
      button('Consulter la source ↗', () => showEdge(edge), 'document-link'));
    relations.body.append(row);
  }
  container.append(relations.element);

  const media = documentSection('▣', 'Médias', entity.image ? '1' : '');
  if (entity.image) {
    const image = document.createElement('img'); image.src = entity.image; image.alt = `Portrait ou illustration de ${entity.label} (Wikimedia Commons)`;
    image.referrerPolicy = 'no-referrer'; image.loading = 'lazy'; image.className = 'portrait'; image.addEventListener('error', () => image.remove()); media.body.append(image);
    const file = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent((entity.imageTitle || '').replaceAll(' ', '_'))}`;
    media.body.append(link('Crédit, auteur et licence de l’image · Wikimedia Commons ↗', file));
  }
  if (!entity.image) media.body.append(text('p', 'Aucun média lié par l’identité consultée.', 'fine-print'));
  container.append(media.element);

  const sources = documentSection('↗', 'Sources', `${edges.length}`);
  if (!entity.fictional) {
    sources.body.append(text('p', 'Les références documentent la provenance des assertions, pas leur véracité. RELIA ne vérifie pas automatiquement les faits dans les documents externes.', 'fine-print'));
    sources.body.append(link('Identité et historique Wikidata ↗', `https://www.wikidata.org/wiki/${id}`));
    if (entity.wiki) sources.body.append(link(`Article Wikipédia (${entity.wikiLang}) · sitelink exact ↗`, entity.wiki));
  }
  if (entity.bnfIdentifier) sources.body.append(text('p', `Identifiant d’autorité BnF porté par Wikidata (P268) : ${entity.bnfIdentifier}`, 'fine-print'));
  loadBnfDetails(entity, sources.body);
  for (const edge of edges) {
    const other = neighbor(edge);
    sources.body.append(button(`${edge.label} · ${other?.label || edge.to} · ${entity.fictional ? 'Démonstration fictive' : edge.property} ↗`, () => showEdge(edge), 'document-link'));
  }
  container.append(sources.element);
  panel.scrollTop = scroll;
  renderTimelineRail(entity);
}
function documentSection(icon, title, count = '', open = false) {
  const element = document.createElement('details'); element.className = 'document-section'; element.open = open;
  const summary = text('summary', '', 'document-section-summary');
  summary.append(text('span', icon, 'document-section-icon'), text('span', title));
  if (count) summary.append(text('span', count, 'document-section-count'));
  const body = text('div', '', 'document-section-body');
  element.append(summary, body);
  return { element, body };
}
function timelineStepButton(step, entity, selectable, compact = false) {
  const edge = step.edge, other = step.other;
  const active = state.timelineStep === edge.id;
  const row = button('', () => (active ? clearTimelineStep({ announce: true }) : selectTimelineStep(edge, entity)), `timeline-step${compact ? ' timeline-rail-step' : ''}${active ? ' active' : ''}`);
  row.dataset.edge = edge.id;
  row.setAttribute('aria-pressed', active ? 'true' : 'false');
  row.disabled = !selectable;
  if (compact) {
    const year = text('span', String(step.when.anchor.year).replace('-', '−'), 'timeline-rail-year');
    const title = text('span', edge.label, 'timeline-rail-title');
    const neighbor = text('span', other?.label || step.otherId, 'timeline-rail-neighbor');
    row.setAttribute('aria-label', `${step.when.display} · ${edge.label} : ${other?.label || step.otherId}${selectable ? '' : ' · masqué par le filtre de période'}`);
    row.title = `${step.when.display} · ${edge.label} : ${other?.label || step.otherId}`;
    row.append(year, title, neighbor);
    return row;
  }
  const dot = text('i', '', 'entity-color'); dot.style.background = COLORS[other?.type] || COLORS.unknown; dot.style.color = COLORS[other?.type] || COLORS.unknown;
  const body = text('span', '', 'timeline-step-body');
  if (step.when) body.append(text('b', step.when.display, 'timeline-date'));
  body.append(text('span', `${edge.label} · ${other?.label || step.otherId}`, 'timeline-label'));
  body.append(text('small', `${edge.fictional ? 'Démonstration fictive' : edge.evidence === 'referenced' ? 'Référence déclarée' : 'Référence exploitable indisponible'}${selectable ? '' : ' · masqué par le filtre de période'}`));
  row.append(dot, body);
  return row;
}
function renderTimelineRail(entity = state.graph.nodes.get(state.selected)) {
  const rail = $('timeline-rail'), list = $('timeline-steps');
  list.replaceChildren();
  const dated = entity ? buildTimeline(entity.id, [...state.graph.edges.values()], state.graph.nodes).dated : [];
  if (!entity || !dated.length) {
    rail.hidden = true; document.body.classList.remove('timeline-active'); return;
  }
  const visible = new Set(visibleEdges().map(edge => edge.id));
  const hiddenCount = dated.filter(step => !visible.has(step.id)).length;
  rail.hidden = false; document.body.classList.add('timeline-active');
  $('timeline-entity').textContent = entity.label;
  $('timeline-count').textContent = `${dated.length} repère${dated.length === 1 ? '' : 's'}`;
  $('timeline-rail-note').textContent = hiddenCount ? `${hiddenCount} étape${hiddenCount === 1 ? '' : 's'} masquée${hiddenCount === 1 ? '' : 's'} par le filtre de période.` : 'Sélectionnez un repère pour le retrouver dans la constellation.';
  for (const step of dated) {
    const item = document.createElement('li');
    item.append(timelineStepButton(step, entity, visible.has(step.id), true));
    list.append(item);
  }
}
function renderTimelineDetails(container, entity) {
  const visible = new Set(visibleEdges().map(edge => edge.id));
  const all = buildTimeline(entity.id, [...state.graph.edges.values()], state.graph.nodes);
  container.append(text('p', `${all.dated.length} repère${all.dated.length === 1 ? '' : 's'} daté${all.dated.length === 1 ? '' : 's'} de relation. Sur desktop, la frise reste à portée de main ; sur petit écran, elle défile horizontalement. Seules les dates de relation sont utilisées (P580, P582, P585), jamais les dates de publication.`, 'fine-print'));
  if (state.timelineStep) container.append(button('Réinitialiser la sélection', () => clearTimelineStep({ announce: true }), 'timeline-reset'));
  const undatedDetails = document.createElement('details'); undatedDetails.className = 'timeline-group';
  undatedDetails.open = all.undated.some(step => step.id === state.timelineStep);
  undatedDetails.append(text('summary', `Dates inconnues · ${all.undated.length}`));
  if (!all.undated.length) undatedDetails.append(text('p', 'Aucune relation sans date exploitable dans le graphe consulté.', 'fine-print'));
  else {
    const undatedList = document.createElement('ul'); undatedList.className = 'timeline-list';
    for (const step of all.undated) {
      const item = document.createElement('li');
      item.append(timelineStepButton(step, entity, visible.has(step.id)));
      undatedList.append(item);
    }
    undatedDetails.append(text('p', 'Ces relations restent consultables ; aucune date n’est déduite.', 'fine-print'), undatedList);
  }
  container.append(undatedDetails);
}
function selectTimelineStep(edge, entity) {
  state.timelineStep = edge.id; state.timelineEntity = entity.id;
  view.highlightStep(edge);
  const other = edge.from === entity.id ? edge.to : edge.from;
  view.focus(other);
  renderEntity(entity.id, { keepScroll: true }); focusTimelineStep(edge.id);
  const otherLabel = state.graph.nodes.get(other)?.label || other;
  status(`Étape sélectionnée : ${edge.label} · ${otherLabel} · ${edgeDates(edge)}. La constellation met en évidence cette relation.`);
}
function focusTimelineStep(edgeId) {
  [...document.querySelectorAll('#timeline-steps [data-edge], #entity-content .timeline-step')].find(element => element.dataset.edge === edgeId)?.focus({ preventScroll: true });
}
function clearTimelineStep({ render = true, announce = false } = {}) {
  if (!state.timelineStep) return;
  const entityId = state.timelineEntity, edgeId = state.timelineStep;
  state.timelineStep = null; state.timelineEntity = null;
  view.highlightStep(null);
  if (render && entityId && state.selected === entityId && !$('entity-panel').hidden) {
    renderEntity(entityId, { keepScroll: true });
    if (announce) { view.focus(entityId); focusTimelineStep(edgeId); status('Sélection chronologique réinitialisée · exploration générale rétablie.'); }
  }
}
function renderAccessible() {
  const container = $('accessible-list'); container.replaceChildren();
  container.append(text('p', state.dataset === 'real' ? 'Graphe réel consulté · Wikidata. Les références documentent la provenance, pas la véracité. Aucun contrôle automatisé des faits dans les sources externes.' : 'Démonstration fictive : toutes les entités et relations ci-dessous sont imaginaires.', 'muted'));
  if (!state.graph.nodes.size) container.append(text('p', 'Recherchez et sélectionnez une identité pour charger le réseau.', 'muted'));
  for (const entity of state.graph.nodes.values()) container.append(button(`${entity.label} · ${typeLabels[entity.type]}${entity.typeBasis === 'relationship' ? ' (catégorie suggérée)' : ''}${entity.fictional ? ' · Fictif' : ` · ${entity.id}`}`, () => { $('accessible-panel').hidden = true; selectNode(entity.id); }, 'neighbor-button'));
  container.append(text('h3', 'Relations dans la période sélectionnée'));
  for (const edge of visibleEdges()) {
    container.append(button(`${state.graph.nodes.get(edge.from)?.label} → ${edge.label} → ${state.graph.nodes.get(edge.to)?.label} · ${edge.classification || 'démonstration fictive'} · ${claimStatusLabels[edge.claimStatus] || evidenceLabels[edge.evidence]} · ${edgeDates(edge)}`, () => { $('accessible-panel').hidden = true; showEdge(edge); }, 'accessible-edge'));
  }
}
function renderPath(path, result = {}) {
  clearTimelineStep();
  const container = $('path-result'); container.replaceChildren(); state.path = path; view.highlightPath(path);
  if (!path) {
    const incomplete = result.incomplete || result.bounded;
    container.append(text('p', incomplete
      ? 'La recherche est incomplète : aucun chemin documenté n’a été trouvé parmi les connexions consultées.'
      : state.dataset === 'demo'
        ? 'Dans la démonstration fictive, aucun chemin ne relie ces deux personnages.'
        : 'Nous avons exploré les connexions disponibles, mais aucun chemin documenté ne relie encore ces deux personnes dans les données consultées.', 'path-summary'));
    if (state.dataset !== 'demo') container.append(text('p', 'Cela ne prouve pas l’absence d’une relation réelle.', 'path-caveat'));
    if (result.incomplete || result.bounded) container.append(button('Relancer la recherche', searchPath));
    const eligibleEdges = [...state.graph.edges.values()].filter(edge => eligible(edge) && inPeriod(edge, state.period)).length;
    const scope = text('details', '', 'scope-details');
    scope.append(text('summary', 'Que couvre cette recherche ?'));
    scope.append(text('p', `${state.graph.nodes.size} personnes et autres entités · ${state.graph.edges.size} relations consultées, dont ${eligibleEdges} utilisables pour les chemins.`, 'fine-print'));
    if (result.expansions !== undefined) scope.append(text('p', `${result.expansions} explorations · ${result.queries} requêtes · jusqu’à ${result.depth || LIMITS.depth} niveaux par personne.`, 'fine-print'));
    scope.append(text('p', `Plafonds de cette recherche : ${LIMITS.nodes} entités, ${LIMITS.edges} relations, ${LIMITS.expansions} explorations et ${LIMITS.queries} requêtes.`, 'fine-print'));
    if (result.incomplete || state.graph.partial) scope.append(text('p', 'Certaines sources ou données sont indisponibles : une partie du réseau peut manquer.', 'fine-print'));
    if (result.bounded || state.graph.capped) scope.append(text('p', 'Une limite de taille ou de recherche a été atteinte ; d’autres connexions n’ont pas pu être vérifiées.', 'fine-print'));
    container.append(scope);
  } else {
    container.append(text('h3', state.dataset === 'demo' ? 'Chemin fictif · Démonstration fictive' : 'Chemin avec références · graphe consulté'));
    container.append(text('p', `${path.edges.length} lien${path.edges.length > 1 ? 's' : ''} · ${Math.max(0, path.nodes.length - 2)} intermédiaire${path.nodes.length > 3 ? 's' : ''}${state.dataset !== 'demo' ? ' · Références de provenance, sans contrôle automatisé des faits externes' : ''}`, 'fine-print'));
    path.nodes.forEach((id, index) => {
      const entity = state.graph.nodes.get(id), edge = path.edges[index];
      const row = text('div', `${index + 1}. ${entity?.label || id}`, 'path-step');
      if (edge) {
        const next = state.graph.nodes.get(path.nodes[index + 1]);
        const relation = path.directions?.[index] === 'reverse'
          ? `${entity?.label || id} ← ${edge.label} ← ${next?.label || path.nodes[index + 1]}`
          : `${entity?.label || id} → ${edge.label} → ${next?.label || path.nodes[index + 1]}`;
        row.append(text('small', `${relation}${edge.property ? ` · ${edge.property}` : ''}${edge.classification ? ` · ${edge.classification}` : ''} · ${edgeDates(edge)}`), button(edge.fictional ? 'Relation fictive ↗' : `${edge.references.length} référence(s) · Consulter ↗`, () => showEdge(edge)));
      }
      container.append(row);
    });
    if (result.incomplete) container.append(text('p', 'Ce chemin existe dans le graphe consulté, mais l’exploration est partielle : il peut exister d’autres chemins plus courts.', 'fine-print'));
  }
  if (result.expansions !== undefined) container.append(text('p', `${result.expansions} explorations · ${result.queries} requêtes · ${LIMITS.depth} niveaux d’exploration par côté${result.bounded ? ' · Limite d’exploration atteinte.' : ''}`, 'fine-print'));
}
async function searchPath() {
  const { from, to } = state.pair;
  if (!from || !to) { status('Sélectionnez explicitement deux identités de personnes dans les résultats de recherche.'); return; }
  if (state.dataset === 'demo') {
    renderPath(shortestPath(state.graph, from.id, to.id, state.period, true)); status('Démonstration fictive : ce chemin n’est pas une relation réelle.'); return;
  }
  const work = beginWork(), graph = state.graph;
  $('find-path').disabled = true; $('cancel-path').hidden = false; $('path-result').replaceChildren();
  status('Recherche bornée dans les relations avec références…');
  try {
    for (const entity of [from, to]) {
      if (!graph.nodes.has(entity.id) && graph.nodes.size < LIMITS.nodes) graph.nodes.set(entity.id, entity);
    }
    const result = await findRemotePath(graph, from.id, to.id, state.period, { signal: work.signal, onProgress: progress => {
      if (!current(work)) return;
      renderGraph(); status(`Consultation des sources · ${progress.expansions}/${LIMITS.expansions} explorations · ${progress.queries}/${LIMITS.queries} requêtes`);
    } });
    if (!current(work)) return;
    state.discoverySearch = {
      incomplete: result.incomplete, bounded: result.bounded, expansions: result.expansions,
      queries: result.queries, depth: LIMITS.depth, roots: [from.id, to.id],
    };
    renderGraph(); renderPath(result.path, result);
    status(result.path ? 'Chemin référencé trouvé dans le graphe consulté. Consultez chaque assertion et ses références.' :
      result.incomplete || result.bounded ? 'Recherche incomplète ou arrivée à sa limite : aucun chemin trouvé dans les données consultées.' :
        'Aucun chemin documenté trouvé dans les données consultées.',
    result.incomplete || result.bounded ? searchPath : null);
  } catch (error) { if (current(work)) status(error.message, searchPath); }
  finally { if (current(work)) { state.controller = null; $('find-path').disabled = false; $('cancel-path').hidden = true; } }
}
function applyTime(reset = false) {
  const from = reset || $('year-from').value === '' ? null : Number($('year-from').value);
  const to = reset || $('year-to').value === '' ? null : Number($('year-to').value);
  if ([from, to].some(year => year !== null && (!Number.isInteger(year) || year < -5000 || year > 2100)) || from !== null && to !== null && from > to) {
    $('time-status').textContent = 'Indiquez des années valides, de −5000 à 2100, dans l’ordre chronologique.'; return;
  }
  if (reset) { $('year-from').value = ''; $('year-to').value = ''; $('include-undated').checked = true; }
  invalidatePath();
  state.period = { from, to, undated: $('include-undated').checked };
  renderGraph(); if (state.selected) renderEntity(state.selected);
  if (innerWidth <= 700) $('entity-panel').hidden = true;
  const unknown = visibleEdges().filter(edge => edgeDates(edge) === 'Date de relation inconnue').length;
  $('time-status').textContent = `${visibleEdges().length} relations visibles · ${unknown} sans date connue. Tout chemin précédent est effacé : relancez la recherche dans cette période.`;
  status(`Période : ${from ?? 'sans début'} → ${to ?? 'sans fin'} · Dates inconnues ${state.period.undated ? 'incluses' : 'exclues'}.`);
}
function persistDiscovery() {
  try {
    localStorage.setItem('relia-discovery-v1', JSON.stringify({
      before: state.discovery.before, after: state.discovery.after,
    }));
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
  if (state.dataset !== 'real') {
    $('discovery-status').textContent = 'La démonstration fictive ne peut pas produire de snapshots réels.';
    return;
  }
  const { from, to } = state.pair;
  if (!from || !to || !state.graph.nodes.size) {
    $('discovery-status').textContent = 'Sélectionnez deux identités exactes dans « Relier », puis explorez leur réseau avant de créer un snapshot.';
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
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderDiscovery() {
  const before = state.discovery.before, after = state.discovery.after;
  $('export-before').disabled = !before; $('export-after').disabled = !after;
  const container = $('discovery-register'); container.replaceChildren();
  for (const [label, snapshot] of [['État A · Référence', before], ['État B · Enrichissement', after]]) {
    if (!snapshot) continue;
    const summary = text('section', '', 'discovery-entry');
    summary.append(text('strong', `${label}${snapshot.origin === 'simulated' ? ' · SIMULÉ' : ' · réel déclaré'}`),
      text('p', `${snapshot.snapshotId} · ${snapshot.identities.join(' → ')}`),
      text('p', `Sources : ${snapshot.sources.join(', ')} · ${snapshot.nodes.length} entités · ${snapshot.edges.length} assertions · Récupéré : ${snapshot.retrievedAt}`),
      text('p', `Collecte ${snapshot.collection.complete ? 'terminée dans le périmètre déclaré' : 'incomplète'} · ${snapshot.collection.expanded.length} identités explorées${snapshot.collection.errors.length ? ` · Erreurs : ${snapshot.collection.errors.join('; ')}` : ''}`));
    if (snapshot.collection.limitations.length) summary.append(text('p', `Limites : ${snapshot.collection.limitations.join(' · ')}`));
    container.append(summary);
  }
  const comparison = state.discovery.comparison;
  if (!comparison) return;
  const title = comparison.status === 'incomparable' ? 'Comparaison impossible' :
    comparison.status === 'incomplete' ? 'Comparaison partielle · nouveautés à interpréter avec prudence' : 'Comparaison déterministe dans le périmètre capturé';
  container.append(text('h3', title), text('p', `${comparison.entries.length} entrée(s) · ${before.snapshotId} → ${after.snapshotId}`, 'fine-print'));
  if (!comparison.entries.length) container.append(text('p', 'Aucune différence admissible détectée. Ce résultat ne prouve pas l’absence d’autres relations.', 'muted'));
  for (const entry of comparison.entries) {
    const card = text('article', '', 'discovery-entry');
    card.append(text('strong', `${discoveryLabels[entry.type] || entry.type} · ${entry.id}`),
      text('p', entry.explanation),
      text('p', `Entités exactes : ${entry.entities.join(' → ') || 'non précisées'}${entry.sources.length ? ` · Sources attribuées : ${entry.sources.join(', ')}` : ' · Adaptateur de provenance non attribué à cette assertion'}`));
    const relation = entry.details.relation;
    const assertions = entry.details.relations || (relation ? [relation.before, relation.after].filter(Boolean) : entry.path?.edges || []);
    for (const edge of assertions) {
      const from = state.graph.nodes.get(edge.from)?.label || edge.from;
      const to = state.graph.nodes.get(edge.to)?.label || edge.to;
      card.append(text('p', `${from} → ${edge.label || edge.property || 'relation'} (${edge.property || 'propriété inconnue'}) → ${to} · assertion ${edge.id}`));
    }
    for (const reference of entry.references) {
      reference.urls?.forEach(url => card.append(link(url, url)));
      reference.documents?.forEach(id => card.append(link(`Document cité · ${id} ↗`, `https://www.wikidata.org/wiki/${id}`)));
    }
    for (const identifier of entry.details.identifiers || []) {
      card.append(text('p', `Identifiant externe réconcilié : ${identifier.namespace}:${identifier.value}${identifier.sourceId ? ` · Source : ${identifier.sourceId}` : ''}`));
      if (identifier.url) card.append(link('Consulter l’identifiant externe ↗', identifier.url));
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
document.querySelectorAll('[data-mode]').forEach(element => element.addEventListener('click', () => openMode(element.dataset.mode)));
document.querySelectorAll('[data-example]').forEach(element => element.addEventListener('click', () => mainSearch.search(element.dataset.example)));
$('start-real').addEventListener('click', () => { chooseDataset('real'); openMode('explore'); workspaceSearch.input.focus(); });
$('start-demo').addEventListener('click', () => { chooseDataset('demo'); openMode('explore'); });
$('dataset-switch').addEventListener('click', () => { chooseDataset(state.dataset === 'real' ? 'demo' : 'real'); openMode(state.mode); });
$('find-path').addEventListener('click', searchPath);
$('cancel-path').addEventListener('click', () => { abortWork(); status('Recherche annulée. Les sources déjà consultées restent dans le graphe.'); renderGraph(); });
$('apply-time').addEventListener('click', () => applyTime());
$('clear-time').addEventListener('click', () => applyTime(true));
$('capture-before').addEventListener('click', () => captureDiscoverySnapshot('before'));
$('capture-after').addEventListener('click', () => captureDiscoverySnapshot('after'));
$('import-before').addEventListener('change', event => { importDiscoverySnapshot('before', event.target.files[0]); event.target.value = ''; });
$('import-after').addEventListener('change', event => { importDiscoverySnapshot('after', event.target.files[0]); event.target.value = ''; });
$('export-before').addEventListener('click', () => downloadDiscoverySnapshot('before'));
$('export-after').addEventListener('click', () => downloadDiscoverySnapshot('after'));
$('export-discovery').addEventListener('click', downloadDiscoveryRegistry);
$('theme-toggle').addEventListener('click', () => {
  const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = theme;
  const dark = theme === 'dark';
  $('theme-toggle').setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre');
  $('theme-toggle').title = dark ? 'Activer le mode clair' : 'Activer le mode sombre';
  $('theme-toggle').textContent = dark ? '☀' : '◐';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0b0b14' : '#f7f8fc';
  view.setTheme();
  try { localStorage.setItem('relia-theme', theme); } catch {}
});
$('workspace-collapse').addEventListener('click', () => { $('workspace').hidden = true; });
$('close-panel').addEventListener('click', () => { $('entity-panel').hidden = true; cancelBiography(); });
$('help-button').addEventListener('click', () => { $('help').hidden = !$('help').hidden; if (!$('help').hidden) $('close-help').focus(); });
$('close-help').addEventListener('click', () => { $('help').hidden = true; $('help-button').focus(); });
$('show-accessible').addEventListener('click', () => { renderAccessible(); $('accessible-panel').hidden = !$('accessible-panel').hidden; if (!$('accessible-panel').hidden) $('close-accessible').focus(); });
$('close-accessible').addEventListener('click', () => { $('accessible-panel').hidden = true; $('show-accessible').focus(); });
$('reset-camera').addEventListener('click', () => { view.reset(); status('Vue réinitialisée.'); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    for (const id of ['help', 'entity-panel', 'accessible-panel']) $(id).hidden = true;
    cancelBiography();
  }
});
window.addEventListener('pagehide', event => {
  abortWork(); cancelBiography();
  for (const search of [mainSearch, workspaceSearch, ...Object.values(pairSearches)]) search.clearResults();
  if (!event.persisted) view.dispose();
});
compareDiscovery();
try {
  const theme = localStorage.getItem('relia-theme');
  if (theme === 'dark') $('theme-toggle').click();
} catch {}
renderGraph();
renderDiscovery();
