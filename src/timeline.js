// Documentary timeline: only relationship qualifiers P580 (start), P582 (end) and P585 (point in time)
// date a relationship. Birth/death (P569/P570) stay biographical; publication (P577) never dates a relationship.
export const RELATION_DATE_PROPERTIES = Object.freeze(['P580', 'P582', 'P585']);

function sortKey(date) {
  const match = /^[+-]?\d+-(\d{2})-(\d{2})T/.exec(date?.raw || '');
  const month = match && (date.precision ?? 0) >= 10 ? Number(match[1]) : 0;
  const day = match && (date.precision ?? 0) >= 11 ? Number(match[2]) : 0;
  return date.year * 10000 + month * 100 + day;
}
function usable(date) { return date && Number.isFinite(date.year); }

export function relationDates(edge) {
  const [start] = (edge.dates?.P580 || []).filter(usable);
  const [end] = (edge.dates?.P582 || []).filter(usable);
  const points = (edge.dates?.P585 || []).filter(usable);
  if (!start && !end && !points.length) return null;
  const anchor = start || points[0] || end;
  const parts = [];
  if (start || end) parts.push(start && end ? `${start.display} → ${end.display}` : start ? `depuis ${start.display}` : `jusqu’à ${end.display}`);
  if (points.length) parts.push(points.map(point => point.display).join(', '));
  return { start: start || null, end: end || null, points, anchor, key: sortKey(anchor), display: parts.join(' · ') };
}

export function buildTimeline(entityId, edges, nodes) {
  const dated = [], undated = [];
  for (const edge of edges) {
    if (edge.from !== entityId && edge.to !== entityId) continue;
    const otherId = edge.from === entityId ? edge.to : edge.from;
    const other = nodes?.get?.(otherId) || null;
    const when = relationDates(edge);
    const step = { id: edge.id, edge, otherId, other, when };
    if (when) dated.push(step); else undated.push(step);
  }
  dated.sort((a, b) => a.when.key - b.when.key || String(a.other?.label || a.otherId).localeCompare(String(b.other?.label || b.otherId), 'fr'));
  const entity = nodes?.get?.(entityId) || null;
  return { dated, undated, biography: { born: entity?.born || null, died: entity?.died || null } };
}
