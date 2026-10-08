// « Le saviez-vous » : choisit une relation réelle, documentée, dans les données déjà consultées.
// Aucune invention : chaque révélation renvoie à sa référence (URL ou document Wikidata).
import { PROPERTIES, eligible } from './data.js';

// Relations de création : elles révèlent le plus souvent une œuvre associée à une personne.
const CREATION = new Set(['P50', 'P57', 'P86', 'P161', 'P170', 'P175', 'P800']);

export function revelationScore(edge, other) {
  let score = 0;
  if (CREATION.has(edge.property)) score += 4;
  if (other?.type === 'work') score += 3;
  if (other?.type === 'event' || other?.type === 'institution') score += 1;
  score += Math.min(2, (edge.references || []).filter(reference => reference.usable).length);
  return score;
}

export function revelationSource(edge) {
  for (const reference of edge.references || []) {
    const url = (reference.urls || []).find(Boolean);
    if (url) return { url, label: 'Source citée' };
    const document = (reference.documents || []).find(Boolean);
    if (document) return { url: `https://www.wikidata.org/wiki/${document}`, label: 'Référence Wikidata' };
  }
  return null;
}

// Renvoie la meilleure révélation pour une identité, ou null s’il n’existe aucune relation documentée.
export function pickRevelation(focusId, edges, nodes) {
  let best = null;
  for (const edge of edges) {
    if (edge.from !== focusId && edge.to !== focusId) continue;
    if (!eligible(edge)) continue;
    const otherId = edge.from === focusId ? edge.to : edge.from;
    const other = nodes.get(otherId);
    if (!other?.label || other.label === otherId) continue;
    const source = revelationSource(edge);
    if (!source) continue;
    const score = revelationScore(edge, other);
    if (!best || score > best.score || (score === best.score && edge.id < best.edge.id)) {
      best = { edge, other, score, source, focusFirst: edge.from === focusId, relation: PROPERTIES[edge.property]?.[0] || edge.label || edge.property };
    }
  }
  return best;
}
