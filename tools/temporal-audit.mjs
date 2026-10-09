// Épreuve chiffrée de l’idée « timeline + graphe » (voir AUDIT_TIMELINE.md).
// Exécutable : node tools/temporal-audit.mjs — zéro dépendance, n’entre dans aucun bundle.
// Il branche un déroulé synthétique sur le jeu de démonstration réel du prototype
// (mêmes 32 personnes, mêmes 40 relations, même plan résolu) et compte ce que
// l’axe temporel découvre — ou non — par rapport au plan de table seul.
import { createSeatingGraph, usable, isBlocking, RELATIONS } from '../src/seating/model.js';
import { articulationPoints } from '../src/seating/proof.js';
import { solvePlan } from '../src/seating/solver.js';
import { DEMO_GUESTS, DEMO_RELATIONS, DEMO_SOURCES, DEMO_META } from '../src/seating/fixtures.js';

// Piège n°1 d’une journée de mariage : elle dépasse minuit. Une minute de jour (0–1439)
// trie « 00:30 » avant « 15:30 » et fausse toute comparaison d’intervalles. On compte donc
// en minutes depuis midi : la journée tient dans un axe monotone, sans modulo.
// Piège n°1 : une journée de mariage dépasse minuit. « 00:30 » trié avant « 15:30 » casse
// toute comparaison d’intervalles. On compte donc en minutes depuis une heure de coupure
// choisie là où il ne se passe rien (06:00) : l’axe tient une journée civile complète,
// monotone, et l’heure affichée se retrouve par modulo.
const CUT = 6 * 60;
function min0(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
const min = t => (((min0(t) - CUT) % 1440) + 1440) % 1440;
const hhmm = v => { const w = (v + CUT) % 1440; return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`; };

// ---- déroulé synthétique : un moment = un lieu + des zones + des présences requises
const SLOTS = [
  { id: 'mise', label: 'Mise en place', from: '13:00', to: '15:00', place: 'salle', zones: { salle: ['emma'] } },
  { id: 'mairie', label: 'Passage à la mairie', from: '14:30', to: '15:15', place: 'mairie',
    zones: { mairie: ['camille', 'nathan', 'lucie', 'sarah', 'marc', 'sophie', 'alain', 'aicha'] } },
  { id: 'ceremonie', label: 'Cérémonie laïque', from: '15:30', to: '16:15', place: 'parc',
    zones: { assemblee: 'guests' } },
  { id: 'cocktail', label: 'Vin d’honneur et photos', from: '16:15', to: '18:30', place: 'terrasse',
    zones: { terrasse: 'guests', bar: ['yanick', 'thierry', 'malik', 'annesophie'] } },
  { id: 'entree', label: 'Entrée en salle', from: '18:45', to: '19:15', place: 'salle', zones: { salle: 'guests' } },
  { id: 'discours1', label: 'Discours des témoins', from: '19:15', to: '19:45', place: 'salle', zones: { salle: 'guests' } },
  { id: 'repas', label: 'Repas', from: '19:45', to: '21:00', place: 'salle', zones: { salle: 'guests' } },
  { id: 'ouverture', label: 'Ouverture du bal', from: '21:00', to: '21:20', place: 'piste', zones: { piste: 'guests' } },
  { id: 'soiree', label: 'Soirée', from: '21:20', to: '00:30', place: 'piste',
    zones: { piste: 'guests', fumoir: ['yanick', 'thierry', 'malik'] } },
  { id: 'piece', label: 'Pièce montée', from: '23:30', to: '23:50', place: 'salle', zones: { salle: 'guests' } },
];
for (const slot of SLOTS) { slot.from = min(slot.from); slot.to = min(slot.to); }

// ---- qui est là, de quand à quand (le RSVP ne donne que ça, et c’est tout)
const ALL = ['15:30', '00:30'];
const PRESENCE = {
  emma: ['13:00', '01:00'], matthieu: ['16:00', '22:30'],
  fleuriste: ['12:30', '16:30'], traiteur: ['11:00', '23:30'],
  photo: ['14:00', '23:00'], dj: ['21:00', '02:00'], salle: ['12:00', '02:00'],
  raymonde: ['15:30', '19:40'], leo: ['15:30', '20:30'], elodie: ['15:30', '00:30'],
  yanick: ['16:30', '21:00'], thierry: ['16:30', '21:00'], fanny: ['15:30', '23:00'],
};
const windowOf = id => { const w = PRESENCE[id] || ALL; return [min(w[0]), min(w[1])]; };
const here = (id, at) => { const [a, b] = windowOf(id); return at >= a && at <= b; };

// ---- qui fait quoi à quelle heure (le déroulé, tel qu’un planneur le saisit)
const DUTIES = [
  { id: 'lucie', slot: 'mairie', task: 'porter les alliances', minutes: 45 },
  { id: 'sarah', slot: 'mairie', task: 'signer comme témoin', minutes: 45 },
  { id: 'jeanne', slot: 'ceremonie', task: 'lire le texte', minutes: 20 },
  { id: 'ghislaine', slot: 'ceremonie', task: 'lire le texte (2e passage)', minutes: 20 },
  { id: 'elodie', slot: 'discours1', task: 'discours', minutes: 8 },
  { id: 'karim', slot: 'discours1', task: 'discours', minutes: 8 },
  { id: 'matthieu', slot: 'cocktail', task: 'set saxophone', minutes: 90 },
  { id: 'matthieu', slot: 'ouverture', task: 'accompagnement ouverture', minutes: 20 },
  { id: 'emma', slot: 'piece', task: 'coordonner pièce montée', minutes: 20 },
  { id: 'raymonde', slot: 'ouverture', task: 'recevoir le bouquet', minutes: 20 },
  { id: 'emma', slot: 'soiree', task: 'coordination soirée', minutes: 190 },
];
const PROVIDERS = [
  { id: 'fleuriste', label: 'Fleuriste', docs: [{ label: 'devis', status: 'signé' }, { label: 'plan de pose', status: 'non fourni' }] },
  { id: 'traiteur', label: 'Traiteur', docs: [{ label: 'contrat', status: 'signé' }, { label: 'liste allergènes', status: 'en attente' }] },
  { id: 'photo', label: 'Photographe', docs: [{ label: 'devis', status: 'signé' }, { label: 'droit à l’image', status: 'non fourni' }] },
  { id: 'dj', label: 'DJ', docs: [{ label: 'contrat', status: 'en attente' }, { label: 'assurance RC', status: 'non fourni' }] },
  { id: 'salle', label: 'Salle', docs: [{ label: 'bail', status: 'signé' }, { label: 'état des lieux', status: 'non fourni' }] },
];
const MUSICIANS = ['matthieu', 'dj']; // déclaré ici : plus bas, la couverture musicale et les points de rupture en dépendent

// ---- la playlist en graphe : un morceau relie trois personnes, jamais une
const TRACKS = [
  { title: 'Suspicious Minds', by: 'Elvis', at: '21:20', dedicatedTo: 'bruno', askedBy: 'karine' },
  { title: 'Je te laisse une note', by: 'Souchon', at: '21:35', dedicatedTo: 'nadia', askedBy: 'cedric' },
  { title: 'I Will Survive', by: 'Gaye', at: '22:10', askedBy: 'nadia', avoidWith: 'bruno' },
  { title: 'Ces idées-là', by: 'Lavoine', at: '22:40', askedBy: 'elodie' },
  { title: 'Dernier métro', by: 'Gainsbourg', at: '23:15', askedBy: 'thierry' },
  { title: 'On va s’aimer', by: 'Grand Corps Malade', at: '23:50', dedicatedTo: 'raymonde', askedBy: 'elodie' },
];

const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
const plan = solvePlan(graph, { targetSize: DEMO_META.event.targetSize ?? 8, iterations: 900 });
const name = id => graph.nodes.get(id)?.label || id;

// Le plan de table a-t-il tenu ? Puis : le déroulé le rouvre-t-il ?
const apartPairs = [];
for (const edge of graph.edges.values()) {
  if (!usable(edge) || !isBlocking(edge) || RELATIONS[edge.kind].effect !== 'apart') continue;
  apartPairs.push([edge.from, edge.to, `déclarée (${edge.kind})`]);
}
for (const item of plan.propagated) apartPairs.push([item.guestA, item.guestB, 'induite par la chaîne']);

const tableOf = id => plan.tables.find(t => t.guests.includes(id))?.id;
const broken = [];
const openZones = [];
for (const [a, b, how] of apartPairs) {
  for (const slot of SLOTS) {
    for (const [zone, members] of Object.entries(slot.zones)) {
      const isOpen = members === 'guests';
      const list = isOpen ? [...graph.nodes.keys()] : members;
      if (list.includes(a) && list.includes(b) && here(a, slot.to) && here(b, slot.to)) {
        if (isOpen) openZones.push(`${slot.id}/${zone}`);
        broken.push({ pair: `${name(a)} / ${name(b)}`, how, zone, moment: `${slot.label} à ${hhmm(slot.from)}, zone ${zone}`, tables: `table ${tableOf(a)} / table ${tableOf(b)}` });
      }
    }
  }
}

const pairsAll = new Set(broken.filter(item => item.zone === 'salle').map(item => item.pair));
const pairsNamed = new Set(broken.filter(item => item.zone !== 'salle').map(item => item.pair));
const findings = {
  separationRouverteParLeTemps: broken.length,
  pairesTouchees: new Set(broken.map(item => item.pair)).size,
  pairesToucheesEnZoneNommee: pairsNamed.size,
  enZoneOuverte: openZones.length, enZoneDeclaree: broken.length - openZones.length,
  exemples: broken.filter(item => item.pair.includes('Nadia')).slice(0, 3).map(item => `${item.pair} (${item.how}) — ${item.moment} — ${item.tables}`),
  detail: broken.slice(0, 8).map(item => `${item.pair} (${item.how}) — ${item.moment} — ${item.tables}`),
};
console.log('ZONES:', JSON.stringify(broken.map(item => item.zone).reduce((acc, z) => ({ ...acc, [z]: (acc[z] || 0) + 1 }), {})));

// 1. devoir hors fenêtre de présence
const absent = DUTIES.filter(d => !here(d.id, SLOTS.find(s => s.id === d.slot).from)).map(d => `${name(d.id)} : ${d.task} à ${hhmm(SLOTS.find(s => s.id === d.slot).from)}`);
// 1bis. la journée comme graphe biparti (acteur ↔ moment) : où ça casse si un acteur tombe
// Format exigé par proof.js : Map(id -> [{ id, edge }]). Le code n’est pas adapté : il est
// réutilisé tel quel, ce qui est la vraie preuve que l’abstraction tient hors du plan de table.
const bipartite = new Map();
const link = (a, b) => {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!bipartite.has(x)) bipartite.set(x, []);
    if (!bipartite.get(x).some(item => item.id === y)) bipartite.get(x).push({ id: y, edge: { kind: 'slot' } });
  }
};
for (const slot of SLOTS) {
  for (const d of DUTIES.filter(d => d.slot === slot.id)) link(d.id, `slot:${slot.id}`);
  for (const p of PROVIDERS) if (here(p.id, Math.round((slot.from + slot.to) / 2))) link(p.id, `slot:${slot.id}`);
}
const ids = [...bipartite.keys()];
const rawCut = articulationPoints(bipartite, ids);
const cut = rawCut.filter(id => !id.startsWith('slot:')).map(id => `${name(id) || id} : sa seule absence décroche ${bipartite.get(id).filter(n => n.id.startsWith('slot:')).length} moment(s) du déroulé`);
const cutSlots = SLOTS.filter(slot => bipartite.get(`slot:${slot.id}`)?.length === 1)
  .map(slot => `${slot.label} (${hhmm(slot.from)}→${hhmm(slot.to)}) tenu par une seule personne : ${name(bipartite.get(`slot:${slot.id}`)[0].id) || bipartite.get(`slot:${slot.id}`)[0].id}`);
const alone = [];
for (const slot of SLOTS) {
  const needed = slot.id === 'soiree' || slot.id === 'ouverture' ? ['musique'] : [];
  if (!needed.length) continue;
  const musicians = MUSICIANS.filter(id => here(id, slot.from) || here(id, slot.to));
  const solid = musicians.filter(id => !(PROVIDERS.find(p => p.id === id)?.docs || []).some(d => d.status !== 'signé'));
  let last = slot.from;
  for (const id of solid) { const [a, b] = windowOf(id); if (b > slot.from && a < slot.to) last = Math.max(last, Math.min(b, slot.to)); }
  const gap = slot.to - last;
  if (musicians.length && solid.length < musicians.length) alone.push(`${slot.label} : ${musicians.length} musicien(s) annoncé(s), ${solid.length} sous contrat signé → trou réel de ${gap} min si le non-signé tombe`);
}

// 2. chevauchement de devoirs pour une même personne
const overload = [];
for (const d of DUTIES) for (const other of DUTIES) {
  if (other === d || other.id !== d.id) continue;
  const a = SLOTS.find(s => s.id === d.slot), b = SLOTS.find(s => s.id === other.slot);
  if (a.from < b.to && b.from < a.to && DUTIES.indexOf(d) < DUTIES.indexOf(other)) overload.push(`${name(d.id)} : « ${d.task} » à ${hhmm(a.from)} et « ${other.task} » à ${hhmm(b.from)} se chevauchent`);
}
// 3. couverture musicale : qui joue vraiment à chaque moment, et le trou restant
const music = [];
for (const slot of SLOTS.filter(s => s.id === 'ouverture' || s.id === 'soiree' || s.id === 'cocktail')) {
  let last = slot.from;
  for (const id of MUSICIANS) {
    const [a, b] = windowOf(id);
    if (b > slot.from && a < slot.to) last = Math.max(last, Math.min(b, slot.to));
  }
  const gap = slot.to - last;
  music.push({ slot: slot.label, couverture: hhmm(slot.from) + '→' + hhmm(last), trou: gap > 0 ? `${(gap / 60).toFixed(2)} h sans musicien annoncé` : 'aucun trou' });
}
// 4. docs en attente au moment où le prestataire est requis
const docs = [];
for (const p of PROVIDERS) {
  const needed = SLOTS.filter(s => here(p.id, s.from)).map(s => s.from);
  const firstNeeded = needed.length ? Math.min(...needed) : windowOf(p.id)[0];
  for (const doc of p.docs) {
    if (doc.status === 'signé') continue;
    docs.push(`${p.label} · ${doc.label} (${doc.status}) — premier moment couvert : ${hhmm(firstNeeded)}`);
  }
}
const providerGaps = PROVIDERS.map(p => {
  const [a, b] = windowOf(p.id);
  const covered = SLOTS.filter(s => s.from >= a && s.to <= b).reduce((sum, s) => sum + (s.to - s.from), 0);
  const needed = SLOTS.filter(s => s.to > a && s.from < b);
  return { label: p.label, fenetre: `${hhmm(a)}→${hhmm(b)}`, momentsTouches: needed.length, minutesCouvertes: covered };
});
// 5. enfant / dépendant parti sans son accompagnateur
const dependants = [['leo', 'elodie'], ['raymonde', 'sophie']];
const orphan = dependants.filter(([kid, guard]) => PRESENCE[kid] && windowOf(kid)[1] !== windowOf(guard)[1])
  .map(([kid, guard]) => `${name(kid)} part à ${hhmm(windowOf(kid)[1])}, ${name(guard)} reste jusqu’à ${hhmm(windowOf(guard)[1])}`);
// 6. personne sans un seul moment libre
const busy = [...new Set(DUTIES.map(d => d.id))].map(id => {
  const total = DUTIES.filter(d => d.id === id).reduce((sum, d) => sum + d.minutes, 0);
  const [a, b] = windowOf(id);
  const span = b - a;
  return { who: name(id), minutes: total, presence: span, part: Math.round(total / span * 100) };
}).filter(item => item.part >= 15).sort((x, y) => y.part - x.part)
  .map(item => `${item.who} : ${item.minutes} min de tâches sur ${Math.round(item.presence / 60)} h de présence (${item.part} %)`);
// 7. exposition par la playlist : un morceau met deux personnes écartées face à face
const exposed = [];
for (const track of TRACKS) {
  const at = min(track.at);
  const parties = [track.dedicatedTo, track.askedBy, track.avoidWith].filter(Boolean);
  for (const [a, b] of apartPairs) {
    if (parties.includes(a) && (parties.includes(b) || here(b, at)) && here(a, at) && here(b, at)) {
      exposed.push(`« ${track.title} » à ${track.at} : ${name(a)} et ${name(b)} sont là l’un et l’autre (${a === track.dedicatedTo || b === track.dedicatedTo ? 'dédicace' : 'demandeur'})`);
    }
  }
}
// 8. ce que le temps ne peut pas porter : les relations sans date
const dated = [...graph.edges.values()].filter(edge => edge.at).length;

// 9. ce que ça coûte à saisir, en champs
const castCount = graph.nodes.size;
const inputCost = {
  presences: castCount * 2,
  slots: SLOTS.length * 3,
  duties: DUTIES.length * 3,
  providersDocs: PROVIDERS.reduce((sum, p) => sum + p.docs.length * 2, 0),
  tracks: TRACKS.length * 3,
};
inputCost.total = Object.values(inputCost).reduce((a, b) => a + b, 0);

// 10. ce que le moteur de rendu encaisse : physique O(n²) et budget d’étiquettes
const physics = n => {
  const pts = Array.from({ length: n }, (_, i) => ({ x: Math.cos(i) * (40 + i), y: Math.sin(i) * (40 + i) }));
  const t0 = process.hrtime.bigint();
  for (let frame = 0; frame < 400; frame++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const len = Math.max(12, Math.hypot(dx, dy)), f = 50 / (len * len * len);
      pts[i].x += dx * f; pts[i].y += dy * f; pts[j].x -= dx * f; pts[j].y -= dy * f;
    }
  }
  return Number(process.hrtime.bigint() - t0) / 1e6;
};
const labelCap = (w, h, zoom = 1) => Math.max(6, Math.min(32, Math.floor(w * h / 24000 * zoom)));

const nodesFull = castCount + SLOTS.length + PROVIDERS.length + TRACKS.length;
console.log(`RUPTURES: ${broken.length} co-présences qui défont une séparation, dont ${openZones.length} en zone ouverte (tout le monde y est) et ${broken.length - openZones.length} en zone déclarée ; ${new Set(openZones).size} moments concernés`);
console.log(`EXEMPLES: ${broken.filter(item => item.pair.includes('Nadia')).slice(0, 3).map(item => `${item.pair} [${item.how}] ${item.moment} ${item.tables}`).join(' // ')}`);
console.log(JSON.stringify({
  plan: { tables: plan.tables.length, cost: plan.cost, apart: `${plan.proven.apartSatisfied}/${plan.proven.apartTotal}`, induced: plan.proven.induced, complete: plan.complete },
  apartPairs: apartPairs.length,
  findings: {
    separationRouverteParLeTemps: findings.separationRouverteParLeTemps,
    pairesTouchees: findings.pairesTouchees, pairesToucheesEnZoneNommee: findings.pairesToucheesEnZoneNommee,
    devoirHorsPresence: absent,
    chevauchements: overload,
    trous: music.map(m => `${m.slot} — ${m.trou}`),
    docsHorsSignature: docs, fenetresPrestataires: providerGaps,
    pointsArticulationTemporels: cut, momentsFragiles: cutSlots, momentsMonoSource: alone,
    dependantsOrphelins: orphan,
    sansMomentLibre: busy,
    playlistExposante: exposed,
  },
  relationsAvecDate: `${dated}/${graph.edges.size}`,
  inputCost,
  render: {
    nodesCastSeul: castCount, nodesAvecSlotsDocsTracks: nodesFull,
    physique400frames: { n40: `${physics(40).toFixed(0)} ms`, n90: `${physics(90).toFixed(0)} ms`, n160: `${physics(160).toFixed(0)} ms` },
    etiquettes: { desktop1440x900: labelCap(1440, 900), mobile390x844: labelCap(390, 844) },
  },
}, null, 2));
