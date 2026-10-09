// Vue 2D du plan de salle, en coordonnées pures et déterministes : aucune dépendance, aucun
// WebGL, et donc aucun risque de carte vide. Ce module ne dessine rien et n’invente rien : il
// pose les personnes autour des tables telles que le solveur les a réparties, puis relie ce qui
// est déclaré. Un lien non exploitable reste visible mais tracé en pointillés, pour qu’on ne le
// confonde jamais avec une contrainte.

import { RELATIONS, usable } from './model.js';

const TAU = Math.PI * 2;
const SEAT_RADIUS = 104;
const TABLE_RADIUS = 62;

function cellGrid(count) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { columns, rows };
}

function shortName(label, limit = 11) {
  const first = String(label || '').split(/\s+/)[0] || '?';
  return first.length > limit ? `${first.slice(0, limit)}·` : first;
}

// Courbe de Bézier quadratic entre deux sièges, légèrement gonflée pour que les liens longs
// ne traversent pas tout le plan et que deux liens voisins ne se recouvrent pas.
function curve(from, to, bow) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / distance, y: dx / distance };
  const middle = { x: (from.x + to.x) / 2 + normal.x * bow, y: (from.y + to.y) / 2 + normal.y * bow };
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${middle.x.toFixed(1)} ${middle.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

export function layoutPlan2D(plan, graph, { tableGap = 244, sidePad = 120, topPad = 92, rowGap = null, columns: forcedColumns = null, seatRadius = SEAT_RADIUS, discRadius = 13, tableRadius = TABLE_RADIUS } = {}) {
  const tables = plan.tables;
  const grid = forcedColumns ? { columns: Math.min(tables.length, forcedColumns), rows: Math.ceil(tables.length / Math.min(tables.length, forcedColumns)) } : cellGrid(tables.length);
  const { columns, rows } = grid;
  const width = columns * tableGap + sidePad * 2;
  const rowStep = Math.max(rowGap || tableGap, seatRadius * 2 + 34);
  const height = rows * rowStep + topPad + 96;

  const seats = new Map();
  const tableNodes = tables.map((table, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const center = { x: sidePad + tableGap * (column + 0.5), y: topPad + rowStep * (row + 0.5) };
    const count = Math.max(1, table.guests.length);
    table.guests.forEach((guestId, seatIndex) => {
      const angle = -Math.PI / 2 + (seatIndex / count) * TAU;
      seats.set(guestId, {
        guestId,
        x: center.x + Math.cos(angle) * seatRadius,
        y: center.y + Math.sin(angle) * seatRadius,
        angle,
        quadrant: Math.cos(angle),
        tableId: table.id,
      });
    });
    return { id: table.id, label: table.label, x: center.x, y: center.y, radius: tableRadius, guests: table.guests.length, capacity: plan.capacity, prestataires: Boolean(table.prestataires) };
  });

  const edges = [];
  for (const edge of graph.edges.values()) {
    const from = seats.get(edge.from), to = seats.get(edge.to);
    if (!from || !to) continue;
    const binding = usable(edge);
    const effect = RELATIONS[edge.kind]?.effect || 'ask';
    const sameTable = from.tableId === to.tableId;
    const bow = (sameTable ? 26 : Math.min(78, Math.hypot(to.x - from.x, to.y - from.y) * 0.12)) * (binding ? 1 : -1);
    edges.push({
      id: edge.id,
      kind: edge.kind,
      effect,
      // Une arête compte si elle a pu contraindre le solveur : source exploitable, et soit une
      // séparation, soit un regroupement indissociable. Une tension pèse, elle ne sépare pas.
      binding: binding && (effect === 'apart' || (effect === 'together' && RELATIONS[edge.kind].bind === 'hard')),
      usable: binding,
      from: { x: from.x, y: from.y, id: edge.from },
      to: { x: to.x, y: to.y, id: edge.to },
      path: curve(from, to, bow),
      tone: !binding ? 'hypothesis' : effect === 'apart' ? 'apart' : effect === 'avoid' ? 'tension' : effect === 'prefer' ? 'prefer' : 'together',
    });
  }

  const nodes = [...seats.values()].map(seat => {
    const guest = graph.nodes.get(seat.guestId);
    const labelOffset = 22;
    return {
      guestId: seat.guestId,
      label: guest.label,
      short: shortName(guest.label),
      side: guest.side,
      role: guest.role || null,
      tableId: seat.tableId,
      x: seat.x,
      y: seat.y,
      radius: discRadius,
      labelX: seat.x + Math.cos(seat.quadrant >= 0 ? 0 : Math.PI) * labelOffset,
      labelY: seat.y + Math.sin(seat.angle) * 13,
      anchor: seat.quadrant >= 0 ? 'start' : 'end',
    };
  });

  return { width, height, tables: tableNodes, nodes, edges };
}

// Cible de dépôt : la table la plus proche du point relâché, tolérance comprise. Fonction pure
// et volontairement bête — un doigt qui lâche une pastille doit trouver la table même si le pouce
// la cache à moitié, et ne doit jamais deviner une table lointaine.
export function dropTargetAt(layout, x, y, slack = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const table of layout.tables) {
    const distance = Math.hypot(x - table.x, y - table.y);
    if (distance < bestDistance) { best = table; bestDistance = distance; }
  }
  if (!best) return null;
  const reach = (best.radius || 62) + (slack || 0);
  return bestDistance <= reach ? best.id : null;
}

// Point de l’espace du plan sous un point d’écran : la seule façon de draguer correctement quand
// le SVG est mis à l’échelle par le navigateur.
export function toPlanPoint(layout, rect, clientX, clientY) {
  if (!rect || !rect.width) return { x: 0, y: 0 };
  const scale = Math.min(rect.width / layout.width, rect.height / layout.height) || 1;
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

// Filtres de lecture : les liens sont bavards sur un plan de 30 personnes, et le choix de ce
// qu’on masque doit rester une décision explicite, pas un réglage caché.
export const OVERLAYS = Object.freeze({
  all: { label: 'Toutes les attaches', test: () => true },
  // Le ton, pas l’effet : un bruit de séparation non confirmé n’est pas une séparation, il reste
  // sous « Toutes les attaches », en pointillés.
  apart: { label: 'Séparations seules', test: edge => edge.tone === 'apart' },
  binding: { label: 'Ce qui compte', test: edge => edge.usable && edge.effect !== 'ask' },
  none: { label: 'Aucun lien', test: () => false },
});

export function filterEdges(edges, overlay = 'all') {
  const test = OVERLAYS[overlay]?.test || OVERLAYS.all.test;
  return edges.filter(test);
}
