// La voix du produit. Un seul module écrit ce que l’utilisateur lit : le moteur (model.js,
// solver.js, proof.js) renvoie des structures et des chiffres, et ne rédige pas. C’est ce qui
// permet de tenir une règle simple, vérifiée par un test : aucune phrase de l’écran ne doit
// contenir un mot de métier.
//
// Règles d’écriture : une idée par ligne, douze mots maximum, un verbe plutôt qu’un nom
// (« ils sont fâchés », pas « un conflit déclaré »), on dit pourquoi et quoi faire quand on
// refuse quelque chose. Prénoms seulement : à 70 ans comme à 10, on lit plus vite « Nadia ».

import { RELATIONS, SIDES, usable } from './model.js';

// Les mots interdits à l’écran. Le test les cherche dans tout le texte rendu.
export const JARGON = /\b(contrainte[s]?|contraint|contraindre|arête[s]?|nœud[s]?|noeud[s]?|graphe[s]?|solveur|schéma|induit[e]?|déduit[e]?|declar[eé]|bloquant[s]?|source[s]?|preuve[s]?|prestation[s]?|fiable[s]?|validé[e]?|cohérence|capacité[s]?|dépassement[s]?|itération[s]?|export|constellation|épingl[ée]s?|fixation|arbitrage[s]?|satisfait|contradiction[s]?|usable|binding|overlay|onglet[s]?|JSON|CSV)\b/i;

// Un mot courant toléré, parce qu’on ne le remplace pas mieux : à garder courts aussi.
export const ALLOWED = new Set(['table', 'personne', 'people', 'plan']);

export function firstName(label) {
  const clean = String(label || '').replace(/\s*\(.*?\)\s*/g, '').trim();
  return clean.split(/\s+/)[0] || '?';
}

export function twoNames(graph, a, b) {
  return `${firstName(graph.nodes.get(a)?.label || a)} et ${firstName(graph.nodes.get(b)?.label || b)}`;
}

const SIDE_PLAIN = {
  mariee: 'la famille de la mariée',
  marie: 'la famille du marié',
  commun: 'connu des deux',
  prestataire: 'il ou elle travaille ici',
  inconnu: 'on ne sait pas encore de quel côté',
};

export function sidePlain(side) {
  return SIDE_PLAIN[side] || SIDE_PLAIN.inconnu;
}

// Le métier dit « effet together / apart / avoid ». Ici on dit ce que ça veut dire à table.
const RELATION_PLAIN = {
  couple: 'ils sont en couple',
  foyer: 'ils viennent et repartent ensemble',
  famille: 'ils sont de la famille',
  affinite: 'ils s’entendent bien',
  tension: 'ils ne s’aiment pas beaucoup',
  conflit: 'ils sont fâchés',
  rupture: 'ils se sont quittés',
  ondit: 'on l’a entendu dire',
};

export function relationPlain(kind) {
  return RELATION_PLAIN[kind] || RELATIONS[kind]?.label || 'un lien à vérifier';
}

const EVIDENCE_PLAIN = {
  referenced: 'Quelqu’un nous l’a dit.',
  unverified: 'Personne ne l’a confirmé.',
  deprecated: 'C’était écrit avant, c’est barré depuis.',
};

export function evidencePlain(evidence) {
  return EVIDENCE_PLAIN[evidence] || EVIDENCE_PLAIN.unverified;
}

// « Table A » ne veut rien dire pour quelqu’un qui n’a pas la liste sous les yeux : on compte.
export function tablePlain(table, plan) {
  if (table.prestataires) return 'La table qui travaille';
  const index = plan.tables.filter(item => !item.prestataires).findIndex(item => item.id === table.id);
  return `Table ${index + 1}`;
}

export function tableShort(table, plan) {
  return table.prestataires ? 'le travail' : `table ${plan.tables.filter(item => !item.prestataires).findIndex(item => item.id === table.id) + 1}`;
}

// Ce que le moteur a posé à côté de cette personne, dit simplement. Il lit la structure de la
// raison (kind, autre personne, même table ou non) et non plus la phrase du moteur.
export function seatWhy(seat, graph) {
  const lines = [];
  for (const reason of seat.reasons || []) {
    if (!reason.kind) { lines.push(reason.text); continue; }
    const other = firstName(graph.nodes.get(reason.otherId)?.label || reason.otherId);
    if (reason.kind === 'together' && reason.sameTable) lines.push(`${other} est ici : ${relationPlain(reason.relation)}.`);
    if (reason.kind === 'together' && !reason.sameTable) lines.push(`On n’a pas pu mettre ${other} ici : il fallait d’abord éloigner quelqu’un d’autre.`);
    if (reason.kind === 'prefer' && reason.sameTable) lines.push(`${other} est ici : ${relationPlain(reason.relation)}.`);
    if (reason.kind === 'apart') lines.push(`${other} n’est pas à cette table : ${relationPlain(reason.relation)}.`);
    if (reason.kind === 'avoid' && reason.sameTable) lines.push(`${other} est à la même table. Ça peut tenir, mais on y regarde.`);
    if (reason.kind === 'alone') lines.push('On n’a rien écrit avec personne. Dites-lui bonjour au début.');
  }
  return lines;
}

// Les lignes qui méritent une question, et seulement celles-là.
export function questionPlain(question, graph) {
  const what = question.kind ? relationPlain(question.kind) : 'un lien à vérifier';
  const who = question.pairIds ? twoNames(graph, question.pairIds[0], question.pairIds[1]) : question.pair;
  return {
    title: `${who} : ${what}`,
    why: evidencePlain(question.evidence) + ' Ce n’est pas assez pour séparer deux personnes sans leur avis.',
    ask: `Demandez à ${firstName(graph.nodes.get(question.from)?.label || 'vous')} et à ${firstName(graph.nodes.get(question.to)?.label || 'vous')}.`,
  };
}

export function contradictionPlain(contradiction, graph) {
  const who = contradiction.pairIds ? twoNames(graph, contradiction.pairIds[0], contradiction.pairIds[1]) : contradiction.pair;
  return {
    title: `${who} : on ne peut pas tout tenir`,
    why: 'L’un ne veut pas être à la même table que l’autre, et ils ne se quittent pas non plus.',
    ask: 'Il faut choisir une des deux. Le plan ne décide pas à votre place.',
  };
}

// Ce que l’outil ne sait pas faire — dit sans jargon, et sans faire semblant.
export function limitPlain(code, data = {}) {
  const lines = {
    over: () => `${data.count} table(s) ont plus de personnes que de chaises (${data.capacity}). Le lieu décide du nombre de chaises : il faut soit ajouter une table, soit enlever quelqu’un.`,
    apart: () => `${data.count} fois, il aurait fallu éloigner deux personnes et il n’y a pas assez de tables. Ajoutez une table, ou décidez qui cède.`,
    alone: () => `${data.count} personne(s) ne sont marquées avec personne. Le plan les place quand même, il ne devine pas à qui les présenter.`,
    work: () => `${data.count} personne(s) qui travaillent ici sont à part. C’est une habitude, pas une règle qu’elles ont dite.`,
    own: () => 'Ce plan ne connaît que ce qui est écrit ici. Un lien qui n’est pas dans la liste n’est pas nié : il est juste inconnu.',
  };
  return lines[code] ? lines[code]() : null;
}

// Le texte d’un dépôt impossible ou accepté — le seul endroit qui parle d’un refus.
export function movePlain(result, graph) {
  if (result.ok) return null;
  if (result.blocked?.length) {
    const worst = result.blocked[0];
    const a = firstName(graph.nodes.get(worst.guestId)?.label || worst.guestId);
    const b = firstName(graph.nodes.get(worst.otherId)?.label || worst.otherId);
    return { title: `${a} et ${b} ne veulent pas être à la même table`, why: `${relationPlain(worst.relation)}. Vous pouvez quand même le faire : ce sera marqué comme une question.` };
  }
  if (result.over) return { title: `Pas assez de chaises : ${result.need} personnes pour ${result.capacity} chaises`, why: 'Soit on ajoute une table, soit on sépare le groupe.' };
  return null;
}

// Compteurs de l’accroche : trois nombres que quelqu’un qui ne connaît pas le produit comprend.
export function headline({ induced = 0, held = 0, total = 0, open = 0 }) {
  return [
    { value: induced, label: plural(induced, 'surprise que la liste ne disait pas') },
    { value: `${held}/${total}`, label: plural(total, 'personne à éviter, toutes éloignées', 'personnes à éviter, toutes éloignées') },
    { value: open, label: plural(open, 'question à poser') },
  ];
}

export function plural(count, one, many = null) {
  if (count === 1) return one;
  if (many) return many;
  return `${one}s`;
}

export function graphEdgeLabel(edge, graph) {
  const line = `${twoNames(graph, edge.from, edge.to)} — ${relationPlain(edge.kind)}`;
  return usable(edge) ? line : `${line} (à vérifier)`;
}
