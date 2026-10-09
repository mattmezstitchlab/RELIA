// Prototype « plan de table », posé sur le moteur de RELIA.
// Trois règles de fabrication :
//  1. le moteur (model.js, solver.js, proof.js) compte, il ne rédige pas — tout le texte de
//     l’écran vient de words.js, et un test vérifie qu’aucun mot de métier ne passe ;
//  2. un seul geste : toucher une personne, la poser sur une table. Les menus ne sont que des
//     raccourcis de ce geste, jamais le chemin obligatoire ;
//  3. le plan se lit sans WebGL, s’imprime, et reste utilisable au pouce sur un téléphone.
import './seating.css';
import { iconFor, typeIconName } from '../icons.js';
import { RELATIONS, createSeatingGraph, planToJSON, usable } from './model.js';
import { solvePlan } from './solver.js';
import { OVERLAYS, dropTargetAt, filterEdges, layoutPlan2D } from './plan2d.js';
import { canSitAt, groupOf } from './moves.js';
import { diffPlans, findChain } from './proof.js';
import {
  JARGON, contradictionPlain, evidencePlain, firstName, graphEdgeLabel, headline, limitPlain,
  movePlain, plural, questionPlain, relationPlain, seatWhy, sidePlain, tablePlain, tableShort,
} from './words.js';
import { DEMO_GUESTS, DEMO_META, DEMO_RELATIONS, DEMO_SOURCES } from './fixtures.js';

const $ = id => document.getElementById(id);
const STORE_THEME = 'seating-theme';
const STORE_PLAN = 'seating-saved-plan-v1';
const OVERLAY_PLAIN = { all: 'Tout', apart: 'Qui doit être séparé', binding: 'Ce qui est écrit', none: 'Les tables seules' };

const state = {
  graph: null,
  plan: null,
  pins: new Map(),
  overrides: [],
  dismissed: new Set(),
  moves: [],
  selected: null,
  lift: null,
  overlay: 'all',
  scene: null,
  sceneOn: false,
  onlyBlocking: false,
  webgl: true,
  layout: null,
  drag: null,
};

/* ==================== PETITS OUTILS DOM ==================== */
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
function button(label, callback, className = 'pill', iconName = null) {
  const node = el('button', className);
  node.type = 'button';
  if (iconName) node.append(iconNode(iconName));
  node.append(text('span', label));
  node.addEventListener('click', callback);
  return node;
}
function badge(label, tone = null, iconName = null) {
  const node = el('span', `badge${tone ? ` ${tone}` : ''}`);
  if (iconName) node.append(iconNode(iconName, 'ico'));
  node.append(text('span', label));
  return node;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
let statusTimer = null;
function say(message, hold = false) {
  const box = $('status');
  $('status-text').textContent = message;
  box.hidden = false;
  box.classList.toggle('hold', hold);
  clearTimeout(statusTimer);
  if (!hold) statusTimer = setTimeout(() => { box.hidden = true; }, 4200);
}
function nameOf(id) {
  return firstName(state.graph?.nodes.get(id)?.label || id);
}
function tableById(id) {
  return state.plan.tables.find(table => table.id === id) || null;
}
function tableLabel(id) {
  const table = tableById(id);
  return table ? tablePlain(table, state.plan) : 'nulle part';
}
function scrollToNode(node, block = 'center') {
  if (node && typeof node.scrollIntoView === 'function') {
    try { node.scrollIntoView({ block }); } catch { /* pas de défilement ici : ce n’est pas grave */ }
  }
}
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/* ==================== CALCUL ==================== */
function compute() {
  const relations = [...DEMO_RELATIONS, ...state.overrides];
  state.graph = createSeatingGraph({
    guests: DEMO_GUESTS.map(guest => (state.pins.get(guest.id) ? { ...guest, table: state.pins.get(guest.id) } : guest)),
    relations,
    sources: DEMO_SOURCES,
    meta: DEMO_META,
  });
  state.plan = solvePlan(state.graph, { pins: state.pins, targetSize: DEMO_META.event.targetSize || 8 });
  state.plan.declaredMoves = state.moves;
  state.plan.dismissed = [...state.dismissed];
  // Une personne épinglée n’est plus « calculée » : elle est gardée. Le mot du moteur reste
  // dans le fichier, l’écran ne dit que ce que l’utilisateur a fait.
  state.pinned = state.pins;
  render();
  if (state.sceneOn) drawScene();
}

/* ==================== EN HAUT DE PAGE ==================== */
function renderHero() {
  const { plan, graph } = state;
  $('hero-eyebrow').textContent = `${graph.nodes.size} personnes · ${plan.guestTables} ${plural(plan.guestTables, 'table', 'tables')} de ${plan.capacity} chaises`;
  const open = plan.questions.filter(question => !state.dismissed.has(question.edgeId)).length + plan.contradictions.length;
  const stats = $('stats');
  stats.replaceChildren();
  for (const item of headline({ induced: plan.propagated.length, held: plan.proven.apartSatisfied, total: plan.proven.apartTotal, open })) {
    const node = el('span', 'stat-item');
    node.append(text('b', String(item.value)), text('span', item.label));
    stats.append(node);
  }
  $('plan-hint').textContent = plan.complete
    ? 'Tout le monde a une chaise et personne n’est forcé de s’asseoir avec quelqu’un qu’il évite.'
    : 'Il manque des tables pour tout tenir. Voir « Questions à poser ».';
}

/* ==================== LE PLAN, QUI SE TOUCHE ==================== */
function planMetrics() {
  const width = window.innerWidth || 900;
  if (width < 700) return { columns: 1, tableGap: 348, rowGap: 292, sidePad: 26, topPad: 20, seatRadius: 122, discRadius: 26, tableRadius: 64 };
  if (width < 1100) return { columns: 2, tableGap: 320, sidePad: 64, topPad: 60, seatRadius: 116, discRadius: 21, tableRadius: 62 };
  return { columns: null, tableGap: 268, sidePad: 112, topPad: 86, seatRadius: 110, discRadius: 17, tableRadius: 62 };
}

function renderPlan2D() {
  const layout = layoutPlan2D(state.plan, state.graph, planMetrics());
  state.layout = layout;
  const host = $('plan-svg');
  host.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  host.replaceChildren();

  const title = svgNode('title');
  title.id = 'plan-svg-title';
  title.textContent = `Plan de la salle : ${layout.tables.length} tables, ${layout.nodes.length} personnes.`;
  const desc = svgNode('desc');
  desc.id = 'plan-svg-desc';
  desc.textContent = 'Chaque pastille est une personne, posée autour de sa table. Les traits entre les pastilles '
    + 'rappellent qui doit être avec qui et qui doit rester loin. La liste des tables, en dessous, donne la même '
    + 'information en toutes lettres.';
  host.append(title, desc);

  const tables = svgNode('g');
  for (const table of layout.tables) {
    const over = table.guests > table.capacity;
    const disc = svgNode('circle', { class: `table-disc${over ? ' overflow' : ''}`, cx: table.x, cy: table.y, r: table.radius, 'data-table': table.id });
    const name = svgNode('text', { class: 'room-title', x: table.x, y: table.y - 5, 'text-anchor': 'middle' });
    name.textContent = table.prestataires ? 'le travail' : String(table.label).replace(/^Table /, '');
    const seats = svgNode('text', { class: 'room-sub', x: table.x, y: table.y + 14, 'text-anchor': 'middle' });
    seats.textContent = `${table.guests}/${table.capacity}${over ? ' · trop' : ''}`;
    tables.append(disc, name, seats);
  }
  host.append(tables);

  const shown = filterEdges(layout.edges, state.overlay);
  const lines = svgNode('g');
  for (const edge of shown) {
    const path = svgNode('path', { class: `edge ${edge.tone}`, d: edge.path });
    const tip = svgNode('title');
    tip.textContent = graphEdgeLabel(edge, state.graph);
    path.append(tip);
    lines.append(path);
  }
  host.append(lines);

  const nodes = svgNode('g');
  for (const node of layout.nodes) {
    const dimmed = (state.lift && !state.lift.group.includes(node.guestId)) || (state.highlight && !state.highlight.has(node.guestId));
    const seat = svgNode('g', {
      class: `seat2d type-${node.side}${state.lift?.group.includes(node.guestId) ? ' lifting' : ''}`,
      'aria-hidden': 'true',
      'aria-current': state.selected === node.guestId ? 'true' : 'false',
      opacity: dimmed ? '0.3' : '1',
    });
    seat.dataset.guest = node.guestId;
    // La pastille fait 26 unités ; la cible de doigt, 34. Un doigt ne vise pas le centre exact.
    seat.append(svgNode('circle', { class: 'hit', cx: node.x, cy: node.y, r: node.radius + 9 }));
    seat.append(svgNode('circle', { cx: node.x, cy: node.y, r: node.radius }));
    const initial = svgNode('text', { class: 'initial', x: node.x, y: node.y + 3.4, 'text-anchor': 'middle' });
    initial.textContent = node.short.charAt(0);
    const label = svgNode('text', { class: 'seat-tag', x: node.labelX, y: node.labelY + 3.6, 'text-anchor': node.anchor });
    label.textContent = node.short;
    seat.append(initial, label);
    seat.addEventListener('pointerdown', event => beginDrag(event, seat, node));
    nodes.append(seat);
  }
  host.append(nodes);

  const apart = shown.filter(edge => edge.tone === 'apart').length;
  const loose = shown.filter(edge => edge.tone === 'hypothesis').length;
  $('plan-svg-caption').textContent = `${layout.nodes.length} pastilles · ${apart} trait${apart > 1 ? 's' : ''} rouge${apart > 1 ? 's' : ''} pour « il faut séparer »`
    + (loose ? ` · ${loose} en pointillés : on l’a entendu dire, ce n’est pas assez` : '');

  const legend = $('overlay-legend');
  legend.replaceChildren();
  for (const [tone, label] of [['together', 'ils ne se quittent pas'], ['prefer', 'ils s’entendent bien'], ['tension', 'ils ne s’aiment pas beaucoup'], ['apart', 'il faut les séparer'], ['hypothesis', 'à vérifier, sans effet']]) {
    const item = el('span', 'edge-legend');
    item.append(svgSample(tone), text('span', label));
    legend.append(item);
  }
}

function svgSample(tone) {
  const root = svgNode('svg', { viewBox: '0 0 26 8', class: 'edge-sample', 'aria-hidden': 'true' });
  root.append(svgNode('path', { class: `edge ${tone}`, d: 'M 1 4 Q 13 1 25 4' }));
  return root;
}

// Le geste : on attrape une pastille, elle suit le doigt, on la lâche sur une table. Si le doigt
// n’a pas bougé, c’était un toucher : on ouvre la fiche.
function beginDrag(event, seat, node) {
  if (event.button !== undefined && event.button !== 0) return;
  const host = $('plan-svg');
  const rect = host.getBoundingClientRect();
  const scale = rect.width / (state.layout?.width || rect.width) || 1;
  state.drag = { guestId: node.guestId, group: groupOf(state.graph, node.guestId).ids, seat, node, x0: event.clientX, y0: event.clientY, scale, moved: false };
  try { seat.setPointerCapture?.(event.pointerId); } catch { /* souris sans capture : ça marche quand même */ }
  host.classList.add('grabbable');
  seat.addEventListener('pointermove', onDragMove);
  seat.addEventListener('pointerup', onDragEnd);
  seat.addEventListener('pointercancel', onDragEnd);
  event.preventDefault?.();
}
function onDragMove(event) {
  const drag = state.drag;
  if (!drag) return;
  const dx = event.clientX - drag.x0, dy = event.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 9) return;
  if (!drag.moved) {
    drag.moved = true;
    // Pas de re-rendu ici : le groupe que le pointeur suit doit rester le même nœud du début
    // à la fin, sinon la capture du geste se perd en route.
    state.lift = { guestId: drag.guestId, group: drag.group };
    $('plan-svg').classList.add('dragging');
    renderDock();
    markLift();
  }
  drag.seat.setAttribute('transform', `translate(${(dx / drag.scale).toFixed(1)} ${(dy / drag.scale).toFixed(1)})`);
  const point = planPoint(event);
  const target = dropTargetAt(state.layout, point.x, point.y, 120);
  highlightTable(target);
}
function onDragEnd(event) {
  const drag = state.drag;
  if (!drag) return;
  drag.seat.removeEventListener('pointermove', onDragMove);
  drag.seat.removeEventListener('pointerup', onDragEnd);
  drag.seat.removeEventListener('pointercancel', onDragEnd);
  $('plan-svg').classList.remove('dragging');
  highlightTable(null);
  const wasMoved = drag.moved;
  const guestId = drag.guestId;
  drag.seat.removeAttribute('transform');
  state.drag = null;
  if (!wasMoved) {
    dropDock(null);
    select(guestId);
    return;
  }
  const point = planPoint(event);
  const target = dropTargetAt(state.layout, point.x, point.y, 120);
  if (target) { dropAt(guestId, target); return; }
  const dockChip = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('[data-drop-table]');
  if (dockChip) { dropAt(guestId, dockChip.dataset.dropTable); return; }
  dropDock(null);
  say('Remis à sa place. Rien n’a bougé.');
}
function planPoint(event) {
  const host = $('plan-svg');
  const rect = host.getBoundingClientRect();
  const ctm = host.getScreenCTM?.();
  if (ctm && ctm.inverse && typeof window.DOMPoint === 'function') {
    const local = new window.DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }
  const scale = rect.width / state.layout.width || 1;
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
}
function highlightTable(tableId) {
  for (const disc of document.querySelectorAll('#plan-svg .table-disc')) {
    disc.classList.toggle('target', disc.dataset.table === tableId);
  }
}

/* ==================== LE BAC DE TABLES ==================== */
// Tant qu’une personne est « en l’air », on affiche les tables où la poser : cibles de pouce,
// avec le nombre de chaises, et la raison écrite en rouge si ce n’est pas possible.
function lift(guestId) {
  state.lift = { guestId, group: groupOf(state.graph, guestId).ids };
  renderPlan2D();
  renderDock();
  // Le bac vient d’apparaître : c’est là que se trouve la réponse, au clavier comme au doigt.
  $('dropdock-row').firstElementChild?.focus?.();
}
// Éclairage du porteur sans redessin : mêmes nœuds, seulement de la lumière dessus. Indispensable
// pendant une glissade, où renderPlan2D détacherait le nœud que le pointeur suit.
function markLift() {
  for (const node of document.querySelectorAll('#plan-svg .seat2d')) {
    const inside = Boolean(state.lift?.group.includes(node.dataset.guest));
    node.classList.toggle('lifting', inside);
    node.setAttribute('opacity', state.lift && !inside ? '0.3' : '1');
  }
}
function dropDock(keepReason) {
  const hadFocus = $('dropdock').contains(document.activeElement);
  state.lift = null;
  $('dropdock').hidden = true;
  if (!keepReason) $('dropdock-reason').hidden = true;
  renderPlan2D();
  // Ne pas rendre le focus à un bouton qui n’existe plus : on le repose sur la personne.
  if (hadFocus) document.querySelector(`#tables .seat`)?.focus?.();
}
function renderDock() {
  const dock = $('dropdock');
  if (!state.lift) { dock.hidden = true; return; }
  const { guestId, group } = state.lift;
  dock.hidden = false;
  $('dropdock-title').textContent = group.length > 1
    ? `${nameOf(guestId)} ne vient pas seul(e) : ${group.map(nameOf).join(', ')} bougent avec.`
    : `Où je mets ${nameOf(guestId)} ?`;
  const row = $('dropdock-row');
  row.replaceChildren();
  for (const table of state.plan.tables) {
    const answer = canSitAt(state.graph, state.plan, guestId, table.id);
    const chip = el('button', `dock-chip${answer.ok ? '' : ' no'}`);
    chip.type = 'button';
    chip.dataset.dropTable = table.id;
    chip.append(text('span', tablePlain(table, state.plan), 'dock-name'));
    chip.append(text('span', answer.ok ? `${table.guests.length}/${table.capacity}` : answer.code === 'over' ? `${answer.need} pour ${answer.capacity} chaises` : 'impossible', 'dock-sub'));
    chip.addEventListener('click', () => dropAt(guestId, table.id));
    row.append(chip);
  }
  row.append(button('Annuler', () => dropDock(null), 'dock-chip ghost'));
}

function dropAt(guestId, tableId, { force = false } = {}) {
  const answer = canSitAt(state.graph, state.plan, guestId, tableId, { force });
  if (answer.ok) {
    applyMove(guestId, answer.group.ids, tableId);
    return;
  }
  if (answer.code === 'already') { dropDock(null); say(`${nameOf(guestId)} est déjà à cette table.`); return; }
  const line = movePlain({ ...answer, code: answer.code }, state.graph);
  const reason = $('dropdock-reason');
  reason.hidden = false;
  reason.replaceChildren();
  if (line) {
    reason.append(text('span', line.title, 'refuse-title'), text('span', line.why, 'refuse-why'));
    const go = button('Faire quand même', () => dropAt(guestId, tableId, { force: true }), 'pill small');
    reason.append(go);
  } else if (answer.code === 'nowhere') {
    reason.append(text('span', 'Cette table ne fait plus partie du plan.'));
  }
  $('dropdock').classList.remove('shake');
  void $('dropdock').offsetWidth;
  $('dropdock').classList.add('shake');
}

function applyMove(guestId, group, tableId) {
  const from = state.plan.tables.find(table => table.guests.includes(guestId))?.id;
  for (const id of group) state.pins.set(id, tableId);
  state.moves = [...state.moves.filter(item => !group.includes(item.guestId)), { guestId, to: tableId, from, at: new Date().toISOString(), note: 'déplacé à la main' }];
  dropDock(null);
  compute();
  const withWhom = group.filter(id => id !== guestId).map(nameOf);
  say(`${group.map(nameOf).join(' et ')} passe${withWhom.length ? 'nt' : ''} à ${tableLabel(tableId)}.`
    + (withWhom.length ? ' Ils ne se quittent pas, je les ai gardés ensemble.' : ' J’ai rangé les autres autour.'), false);
}

function unpin(guestId) {
  state.pins.delete(guestId);
  say(`Je ne garde plus ${nameOf(guestId)} à cette place : ça peut bouger au prochain rangement.`);
  compute();
}

/* ==================== CE QU’IL FAUT SAVOIR ==================== */
function renderFindings() {
  const { plan, graph } = state;
  const host = $('findings-list');
  host.replaceChildren();
  const items = [];
  for (const item of plan.propagated) {
    items.push({
      tone: 'apart', icon: 'alert',
      title: `${item.labelA.split(' ')[0]} et ${item.labelB.split(' ')[0]} doivent rester loin l’un de l’autre`,
      meta: `Ce n’était pas écrit noir sur blanc : c’est ${item.via.map(nameOf).join(' et ') || 'quelqu’un d’autre'} qui les sépare. Tables ${tableShort(tableById(item.tableA), plan)} et ${tableShort(tableById(item.tableB), plan)}.`,
      focus: [item.guestA, item.guestB],
    });
  }
  for (const contradiction of plan.contradictions) {
    const line = contradictionPlain(contradiction, graph);
    items.push({ tone: 'stop', icon: 'close', title: line.title, meta: `${line.why} ${line.ask}`, focus: contradiction.pairIds || null });
  }
  for (const bridge of plan.insights.bridges.slice(0, 2)) {
    items.push({ tone: 'info', icon: 'link', title: `${bridge.label.split(' ')[0]} tient plusieurs groupes ensemble`, meta: `Si elle ou il part, ${bridge.fragments || 'des'} petits groupes ne se parlent plus.`, focus: [bridge.guestId] });
  }
  for (const item of plan.insights.isolated.slice(0, 2)) {
    items.push({ tone: 'ask', icon: 'person', title: `${item.label.split(' ')[0]} ne connaît personne d’écrit`, meta: `${tableLabel(item.table) || 'Une table'} lui a été donnée au hasard des liens. Dites-lui bonjour au début.`, focus: [item.guestId] });
  }
  if (!items.length) {
    host.append(text('p', 'Rien de surprenant ici : tout ce qui a compté vient d’une ligne écrite quelque part.', 'body-text'));
    $('findings').hidden = true;
    return;
  }
  $('findings').hidden = false;
  for (const item of items) {
    const row = el('div', `finding ${item.tone}`);
    row.append(iconNode(item.icon));
    const main = el('div', 'row-main');
    main.append(text('p', item.title, 'finding-title'));
    main.append(text('p', item.meta, 'row-meta'));
    row.append(main);
    if (item.focus) row.append(button('Voir', () => focusPeople(item.focus), 'pill small ghost', 'target'));
    host.append(row);
  }
}

// « Voir » : on éteint tout le reste du plan pour ne garder que les personnes dont on parle.
function focusPeople(ids) {
  const path = { nodes: ids, edges: [] };
  if (ids.length === 2) {
    const chain = findChain(state.graph, ids[0], ids[1], { maxDepth: 4 });
    if (chain.path) { path.edges = chain.path.edges; path.nodes = chain.path.nodes; }
  }
  state.highlight = new Set(path.nodes);
  state.scene?.highlightPath?.(path);
  renderPlan2D();
  select(ids[0]);
  scrollToNode($('plan-svg'));
}

/* ==================== LA LISTE DES TABLES ==================== */
function renderTables() {
  const { plan } = state;
  const host = $('tables');
  host.replaceChildren();
  for (const table of plan.tables) {
    const over = table.guests.length > plan.capacity;
    const card = el('div', `table-card${over ? ' overflow' : ''}`);
    card.dataset.table = table.id;
    const head = el('div', 'table-head');
    head.append(text('h3', tablePlain(table, plan)));
    head.append(badge(`${table.guests.length} sur ${plan.capacity}`, over ? 'warn' : null));
    head.append(el('span', 'bar-spacer'));
    for (const side of Object.keys(table.sides)) head.append(el('span', `side-dot type-${side}`));
    if (over) head.append(text('span', 'Il manque des chaises.', 'fine-print table-note'));
    card.append(head);

    for (const seat of table.seats) {
      const row = el('button', `seat type-${seat.side}`);
      row.type = 'button';
      row.setAttribute('aria-expanded', String(state.selected === seat.guestId));
      const name = el('span', 'seat-name');
      name.append(text('span', firstName(seat.label), 'seat-label'));
      if (seat.role) name.append(text('span', seat.role, 'seat-role'));
      row.append(name);
      if (seat.pinned || state.pins.has(seat.guestId)) name.append(el('span', 'pin-dot'));
      if (seat.reasons.some(reason => reason.tone !== 'ok')) name.append(el('span', 'flag'));
      row.addEventListener('click', () => select(seat.guestId));
      card.append(row);
    }
    card.append(button('Qui s’assoit ici&nbsp;?', () => focusTable(table), 'seat-more'));
    host.append(card);
  }
  $('count-sep').textContent = String([...state.graph.edges.values()].filter(edge => usable(edge) && RELATIONS[edge.kind].effect === 'apart').length);
  $('count-q').textContent = String(plan.questions.filter(question => !state.dismissed.has(question.edgeId)).length + plan.contradictions.length);
  $('count-limits').textContent = String(plan.issues.length);
}

/* ==================== SÉPARATIONS, QUESTIONS, LIMITES ==================== */
function renderConstraints() {
  const { plan, graph } = state;
  const host = $('constraints');
  host.replaceChildren();
  const apart = [...graph.edges.values()].filter(edge => usable(edge) && RELATIONS[edge.kind].effect === 'apart');
  if (!apart.length) {
    host.append(text('p', 'Personne n’a demandé d’être éloigné de quelqu’un.', 'body-text'));
    return;
  }
  for (const edge of apart) {
    const row = el('div', 'row');
    row.append(iconNode(edge.kind === 'rupture' ? 'close' : 'alert'));
    const main = el('div', 'row-main');
    const title = el('div', 'row-title');
    title.append(text('span', `${nameOf(edge.from)} et ${nameOf(edge.to)}`));
    title.append(badge(relationPlain(edge.kind), 'warn'));
    main.append(title);
    main.append(text('p', evidencePlain(edge.evidence) + (edge.note ? ` « ${edge.note} »` : ''), 'row-meta'));
    const chain = findChain(graph, edge.from, edge.to, { maxDepth: 3 });
    if (chain.path && chain.path.nodes.length > 2) {
      main.append(text('p', `Ils ne se connaissent peut-être pas. C’est ${chain.path.nodes.slice(1, -1).map(nameOf).join(' et ')} qui les sépare.`, 'fine-print'));
    }
    const apart_ok = tableOf(edge.from) !== tableOf(edge.to);
    main.append(text('p', apart_ok
      ? `L’un à ${tableShort(tableById(tableOf(edge.from)), plan)}, l’autre à ${tableShort(tableById(tableOf(edge.to)), plan)} : c’est tenu.`
      : 'Ils sont à la même table : avec si peu de tables, ça ne tient pas.', 'fine-print'));
    main.append(button('Montrer en volume', () => {
      if (!state.sceneOn) void toggleScene(true);
      state.scene?.highlightPath(chain.path);
      state.scene?.focus(edge.from);
    }, 'pill small ghost', 'compass'));
    row.append(main);
    host.append(row);
  }
}
const tableOf = id => state.plan.tables.find(table => table.guests.includes(id))?.id;

function renderQuestions() {
  const { plan, graph } = state;
  const host = $('questions');
  host.replaceChildren();
  const open = plan.questions.filter(question => !state.dismissed.has(question.edgeId));
  const closed = plan.questions.filter(question => state.dismissed.has(question.edgeId));
  if (!open.length) {
    host.append(text('p', closed.length ? `${closed.length} question(s) déjà réglée(s) ici.` : 'Aucune question en attente.', 'body-text'));
    return;
  }
  for (const question of open) {
    const edge = graph.edges.get(question.edgeId);
    const line = questionPlain(question, graph);
    const row = el('div', 'row');
    row.append(iconNode('lightbulb'));
    const main = el('div', 'row-main');
    const title = el('div', 'row-title');
    title.append(text('span', line.title));
    main.append(title);
    main.append(text('p', line.why, 'row-meta'));
    main.append(text('p', line.ask, 'fine-print'));
    if (question.note) main.append(text('p', `« ${question.note} »`, 'fine-print'));
    const actions = el('div', 'table-foot');
    actions.append(button(edge && RELATIONS[edge.kind].effect === 'apart' ? 'Oui, les séparer' : 'Oui, c’est vrai', () => settle(question, edge, 'apply'), 'pill small', 'check'));
    actions.append(button('Non, oublier ça', () => settle(question, edge, 'dismiss'), 'pill small ghost', 'close'));
    main.append(actions);
    row.append(main);
    host.append(row);
  }
  if (closed.length) host.append(text('p', `${closed.length} ligne(s) mise(s) de côté sur cet appareil.`, 'fine-print'));
}

function settle(question, edge, action) {
  if (action === 'dismiss') {
    state.dismissed.add(question.edgeId);
    say('Mise de côté. Ça ne changera rien au plan.');
    compute();
    return;
  }
  if (!edge) { say('La ligne a disparu de la liste : rien à confirmer.'); return; }
  const kind = RELATIONS[edge.kind].effect === 'apart' ? 'conflit' : edge.kind === 'famille' ? 'famille' : 'affinite';
  state.overrides = [...state.overrides.filter(item => item.id !== `set:${edge.id}`), {
    id: `set:${edge.id}`,
    from: edge.from, to: edge.to, kind,
    declaredBy: 's-mariee',
    note: `Vous avez dit oui pour « ${RELATIONS[edge.kind].label} » (${question.declaredBy}).`,
    references: [{ sourceId: 's-mariee', documents: [`oui-du-${new Date().toISOString().slice(0, 10)}#${edge.id}`], urls: [] }],
  }];
  state.dismissed.add(edge.id);
  say('Noté comme une demande des mariés : je la respecte désormais.');
  compute();
}

/* ==================== LA FICHE ==================== */
function select(id) {
  state.selected = id;
  if (!id) state.highlight = null;
  $('detail').hidden = !id;
  renderPlan2D();
  renderDetail();
  state.scene?.setSelected?.(id);
  if (id) state.scene?.focus?.(id);
  if (id) scrollToNode($('detail'), 'nearest');
}

function renderDetail() {
  const host = $('detail');
  host.replaceChildren();
  const guest = state.selected ? state.graph.nodes.get(state.selected) : null;
  if (!guest) { host.hidden = true; return; }
  host.hidden = false;
  const seat = state.plan.tables.flatMap(table => table.seats).find(item => item.guestId === guest.id);
  const card = el('div', 'fiche');
  const head = el('div', 'sheet-head');
  head.append(iconNode(typeIconName('person'), 'seat-ico'));
  const titles = el('div');
  titles.append(text('h3', nameOf(guest.id)));
  titles.append(text('p', `${sidePlain(guest.side)}${guest.role ? ` · ${guest.role}` : ''}`, 'row-meta'));
  head.append(titles);
  head.append(button('Fermer', () => select(null), 'round-button sheet-close', 'close'));
  card.append(head);

  const current = tableById(tableOf(guest.id));
  card.append(text('p', `Assis à ${current ? tablePlain(current, state.plan).toLowerCase() : 'une table à trouver'}.`, 'sheet-now'));

  const actions = el('div', 'sheet-actions');
  actions.append(button('Changer de table', () => { select(null); lift(guest.id); scrollToNode($('plan-svg')); }, 'pill big', 'arrowRight'));
  if (state.pins.has(guest.id)) actions.append(button('Ne plus la garder ici', () => { unpin(guest.id); select(guest.id); }, 'pill ghost'));
  card.append(actions);

  const why = seatWhy(seat || { reasons: [] }, state.graph);
  if (why.length) {
    const list = el('ul', 'list-plain why');
    list.append(text('p', 'Pourquoi cette place :', 'why-title'));
    for (const line of why) list.append(text('li', line, 'why-line'));
    card.append(list);
  }
  if (guest.notes) card.append(text('p', guest.notes, 'fine-print'));
  if (guest.diet) {
    const note = el('div', guest.diet.sensitive ? 'note-card ask' : 'note-card');
    note.append(iconNode(guest.diet.sensitive ? 'shield' : 'info'));
    note.append(text('p', guest.diet.sensitive
      ? `C’est personnel (${guest.diet.note}). Ce n’est donné à personne sans votre accord.`
      : `À dire en cuisine : ${guest.diet.note}.`, 'fine-print'));
    card.append(note);
  }

  const relations = el('ul', 'list-plain');
  for (const edge of state.graph.edges.values()) {
    if (edge.from !== guest.id && edge.to !== guest.id) continue;
    const other = edge.from === guest.id ? edge.to : edge.from;
    const line = el('li', 'rel-line');
    line.append(text('span', `${nameOf(other)} : ${relationPlain(edge.kind)}`));
    const note = text('span', usable(edge) ? '' : evidencePlain(edge.evidence), 'rel-why');
    line.append(note);
    line.append(button('Voir', () => select(other), 'pill small ghost'));
    relations.append(line);
  }
  if (relations.children.length) {
    card.append(text('p', 'Ce qu’on sait d’elle et lui :', 'why-title'));
    card.append(relations);
  }
  host.append(card);
}

/* ==================== LIMITES, EN FRANÇAIS ==================== */
function renderLimits() {
  const host = $('limits');
  host.replaceChildren();
  const seen = new Set();
  for (const issue of state.plan.issues) {
    const line = limitPlain(issue.code, issue);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    host.append(text('li', `· ${line}`));
  }
  for (const error of state.graph.errors) host.append(text('li', `· ${error}`));
  if (state.plan.dismissed.length) host.append(text('li', `· ${state.plan.dismissed.length} ligne(s) mise(s) de côté par vous.`));
  host.append(text('li', '· Je ne connais pas les vraies tables rondes, ni la taille des chaises, ni les portes de sortie.'));
  host.append(text('li', '· Je range des personnes entre elles. Je ne range pas la salle.'));
}

/* ==================== LE RESTE DE LA PAGE ==================== */
function renderFilters() {
  const host = $('overlay-picker');
  host.replaceChildren();
  for (const [key, overlay] of Object.entries(OVERLAYS)) {
    const item = el('button');
    item.type = 'button';
    item.textContent = OVERLAY_PLAIN[key] || overlay.label;
    item.setAttribute('aria-pressed', String(state.overlay === key));
    item.addEventListener('click', () => { state.overlay = key; renderFilters(); renderPlan2D(); });
    host.append(item);
  }
}

function webglCapable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}
const SCENE_COLORS = {
  light: { mariee: '#AF52DE', marie: '#32ADE6', commun: '#30B0A0', prestataire: '#5E5CE6', inconnu: '#8E8E93' },
  dark: { mariee: '#D6A6FF', marie: '#7FD3FF', commun: '#6EE7C8', prestataire: '#9AA0FF', inconnu: '#A1A1A6' },
};
async function toggleScene(force = null) {
  state.sceneOn = force === null ? !state.sceneOn : force;
  $('scene-card').hidden = !state.sceneOn;
  $('btn-scene').setAttribute('aria-pressed', String(state.sceneOn));
  $('btn-scene').classList.toggle('on', state.sceneOn);
  if (!state.sceneOn) return;
  const legend = $('legend');
  legend.replaceChildren();
  for (const [key, side] of Object.entries({ mariee: 'La famille de la mariée', marie: 'La famille du marié', commun: 'Connus des deux', prestataire: 'Ceux qui travaillent' })) {
    const item = el('span', `legend-item type-${key}`);
    item.append(iconNode(typeIconName('person'), 'ico'));
    item.append(text('span', side, 'legend-text'));
    legend.append(item);
  }
  if (!state.scene && state.webgl) {
    let view = null;
    try {
      const { NetworkView } = await import('../graph.js');
      view = new NetworkView($('graph'), {
        onSelect: id => select(id),
        onEdge: data => { if (data) say(graphEdgeLabel(data, state.graph)); },
        onPlay: () => {},
        onHover: () => {},
        onUnavailable: () => {
          state.webgl = false;
          showSceneFallback('La vue en volume ne marche pas sur cet appareil. Le plan et la liste des tables disent exactement la même chose.');
        },
      });
      view.themeColors = () => (document.body.dataset.theme === 'dark' ? SCENE_COLORS.dark : SCENE_COLORS.light);
    } catch (error) {
      state.webgl = false;
      showSceneFallback(`La vue en volume n’a pas pu démarrer ici (${error?.message || 'le dessin 3D est coupé'}). Le plan et la liste gardent tout.`);
      return;
    }
    state.scene = view;
  }
  drawScene();
}
function showSceneFallback(message) {
  const host = $('graph');
  if (host.querySelector('.scene-empty')) return;
  const box = el('p', 'scene-empty');
  box.append(text('span', message));
  host.append(box);
  $('scene-caption').textContent = 'Pas de 3D sur cet appareil : rien n’est perdu, tout est écrit en dessous.';
}
function drawScene() {
  if (!state.sceneOn || !state.scene?.available) return;
  const edges = [...state.graph.edges.values()].filter(edge => usable(edge) && (!state.onlyBlocking || RELATIONS[edge.kind].effect === 'apart'));
  state.scene.setData(state.graph, edges);
  state.scene.highlightPath(state.selected ? { nodes: [state.selected], edges: [] } : null);
  const blocking = edges.filter(edge => RELATIONS[edge.kind].effect === 'apart').length;
  $('scene-caption').textContent = `${state.graph.nodes.size} personnes, ${edges.length} traits, dont ${blocking} pour séparer. `
    + 'Les groupes se forment tout seuls d’après ce qui est écrit : ce n’est pas une supposition du calcul.';
}
function focusTable(table) {
  if (state.sceneOn) {
    const members = new Set(table.guests);
    const edges = [...state.graph.edges.values()].filter(edge => usable(edge) && members.has(edge.from) && members.has(edge.to));
    state.scene?.highlightPath({ nodes: table.guests, edges });
    state.scene?.reset();
  }
  state.highlight = new Set(table.guests);
  renderPlan2D();
  document.querySelectorAll('.table-card').forEach(node => node.classList.remove('strong'));
  document.querySelector(`[data-table="${table.id}"]`)?.classList.add('strong');
  say(`${tablePlain(table, state.plan)} : ${table.guests.map(nameOf).join(', ')}.`);
}

/* ==================== FICHIERS ET VERSIONS ==================== */
function exportJSON() {
  download('plan-de-table.json', JSON.stringify({ event: DEMO_META.event, ...planToJSON(state.plan, state.graph) }, null, 2), 'application/json');
  say('Fichier complet téléchargé, avec les raisons et les limites.');
}
function exportCSV() {
  const includeDiet = $('opt-diet').checked;
  const rows = [['Table', 'Nom', 'Famille', 'Rôle', ...(includeDiet ? ['À dire en cuisine'] : [])]];
  for (const table of state.plan.tables) {
    for (const seat of table.seats) {
      rows.push([tablePlain(table, state.plan), seat.label, sidePlain(seat.side), seat.role || '', ...(includeDiet ? [seat.diet?.note || ''] : [])]);
    }
  }
  if (!includeDiet) {
    const count = state.plan.tables.reduce((sum, table) => sum + table.seats.filter(seat => seat.diet).length, 0);
    rows.push(['', `${count} personne(s) ont un régime ou une allergie. La colonne n’est pas dans ce fichier : ne l’ajoutez pas sans l’accord des personnes.`, '', '']);
  }
  download('liste-pour-le-traiteur.csv', `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`, 'text/csv;charset=utf-8');
  say(includeDiet ? 'Liste donnée avec les régimes. Regardez qui peut la lire.' : 'Liste donnée sans rien de personnel.');
}
function saveVersion() {
  const compact = {
    savedAt: new Date().toISOString(),
    tables: state.plan.tables.map(table => ({ id: table.id, guests: table.guests.slice(), seats: table.guests.map(id => ({ guestId: id })) })),
    declaredMoves: state.moves.slice(),
    cost: state.plan.cost,
  };
  try {
    localStorage.setItem(STORE_PLAN, JSON.stringify(compact));
    $('btn-compare').disabled = false;
    say('Gardé sur cet appareil. Vous pourrez comparer plus tard.');
  } catch { say('Impossible de garder ici : l’espace de rangement est bloqué.'); }
}
function compareVersions() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_PLAN) || 'null'); } catch { saved = null; }
  if (!saved) { say('Rien à comparer : aucun plan gardé pour l’instant.'); return; }
  const diff = diffPlans(saved, { tables: state.plan.tables.map(table => ({ id: table.id, seats: table.guests.map(id => ({ guestId: id })) })), declaredMoves: state.moves });
  const host = $('diff');
  host.replaceChildren();
  if (!diff || !diff.moved.length) { host.append(text('p', 'Personne n’a bougé depuis.', 'body-text')); return; }
  host.append(text('p', `Depuis le plan gardé le ${new Date(saved.savedAt).toLocaleString('fr-FR')} :`, 'fine-print'));
  const list = el('ul', 'list-plain');
  for (const moveItem of diff.explained) {
    list.append(text('li', `${nameOf(moveItem.guestId)} : ${tableShort(tableById(moveItem.from), state.plan)} → ${tableShort(tableById(moveItem.to), state.plan)} (${moveItem.note})`));
  }
  for (const moveItem of diff.unexplained) {
    const label = moveItem.added ? `${nameOf(moveItem.guestId)} est venu s’ajouter à ${tableShort(tableById(moveItem.to), state.plan)}`
      : moveItem.removed ? `${nameOf(moveItem.guestId)} a quitté ${tableShort(tableById(moveItem.from), state.plan)}`
        : `${nameOf(moveItem.guestId)} : ${tableShort(tableById(moveItem.from), state.plan)} → ${tableShort(tableById(moveItem.to), state.plan)}`;
    const line = el('li');
    line.append(text('span', label, 'seat-name'), text('p', 'Vous n’avez pas dit pourquoi. À vérifier avec les mariés.', 'fine-print'));
    list.append(line);
  }
  host.append(list);
}

/* ==================== JOUR OU NUIT ==================== */
function setTheme(dark) {
  document.body.dataset.theme = dark ? 'dark' : 'light';
  const holder = $('btn-theme').querySelector('.ico');
  if (holder) holder.innerHTML = iconFor(dark ? 'sun' : 'moon');
  state.scene?.setTheme?.();
  if (state.sceneOn) drawScene();
  try { localStorage.setItem(STORE_THEME, dark ? 'dark' : 'light'); } catch { /* préférence non conservée */ }
}

/* ==================== DÉMARRAGE ==================== */
function start() {
  for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = iconFor(node.dataset.icon);
  try { if (localStorage.getItem(STORE_THEME) === 'dark') setTheme(true); } catch { /* thème par défaut */ }
  try { if (localStorage.getItem(STORE_PLAN)) $('btn-compare').disabled = false; } catch { /* pas de version */ }
  $('btn-theme').addEventListener('click', () => setTheme(document.body.dataset.theme !== 'dark'));
  $('btn-scene').addEventListener('click', () => {
    void toggleScene();
    if (state.sceneOn) scrollToNode($('scene-card'));
  });
  $('btn-reset').addEventListener('click', () => { state.scene?.reset(); state.scene?.highlightPath(null); });
  $('btn-only-blocking').addEventListener('click', () => {
    state.onlyBlocking = !state.onlyBlocking;
    $('btn-only-blocking').setAttribute('aria-pressed', String(state.onlyBlocking));
    $('btn-only-blocking').classList.toggle('on', state.onlyBlocking);
    drawScene();
  });
  $('btn-resolve').addEventListener('click', () => { say('Je range tout une deuxième fois, à partir des mêmes lignes : même résultat.'); compute(); });
  $('btn-json').addEventListener('click', exportJSON);
  $('btn-csv').addEventListener('click', exportCSV);
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-save').addEventListener('click', saveVersion);
  $('btn-compare').addEventListener('click', compareVersions);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !state.lift) return;
    dropDock(null);
    say('Annulé.');
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPlan2D, 180);
  });
  compute();
  if (!webglCapable()) {
    $('btn-scene').disabled = true;
    $('btn-scene').title = 'Le dessin en volume est coupé ici. Le plan et la liste disent la même chose.';
  }
}

function render() {
  renderHero();
  renderFilters();
  renderPlan2D();
  renderFindings();
  renderTables();
  renderConstraints();
  renderQuestions();
  renderLimits();
  renderDetail();
  renderDock();
}

// Filet de sécurité du produit : si une phrase de métier repasse dans le texte rendu, on le voit
// tout de suite dans la console plutôt que dans une bouche. Le test, lui, est dans words.test.js.
const jargonScan = () => {
  const hits = [...new Set((document.body.textContent.match(new RegExp(JARGON.source, 'gi')) || []).map(word => word.toLowerCase()))];
  if (hits.length) console.warn('[plain] mots de métier dans la page :', hits.join(', '));
};
start();
setTimeout(jargonScan, 120);
