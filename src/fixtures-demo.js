// Fixture de test uniquement : ce graphe fictif n’est jamais chargé par l’application.
import { emptyGraph } from './data.js';

export function demoGraph() {
  const graph = emptyGraph();
  const records = [
    ['D1', 'Lila Vesper', 'person', 'Autrice imaginaire · Démonstration fictive'],
    ['D2', 'Noé Sillage', 'person', 'Compositeur imaginaire · Démonstration fictive'],
    ['D3', 'Les heures bleues', 'work', 'Roman imaginaire · Démonstration fictive'],
    ['D4', 'Le bruit des étoiles', 'work', 'Film imaginaire · Démonstration fictive'],
    ['D5', 'Maison des marées', 'institution', 'Éditeur imaginaire · Démonstration fictive'],
    ['D6', 'Port d’Ambrelune', 'place', 'Ville imaginaire · Démonstration fictive'],
    ['D7', 'Festival des lueurs', 'event', 'Festival imaginaire · Démonstration fictive'],
    ['D8', 'Alma Brume', 'person', 'Cinéaste imaginaire · Démonstration fictive'],
    ['D9', 'Atelier du passage', 'institution', 'Collectif imaginaire · Démonstration fictive'],
    ['D10', 'Jardin des échos', 'place', 'Lieu imaginaire · Démonstration fictive'],
    ['D11', 'Éclats de nuit', 'work', 'Album imaginaire · Démonstration fictive'],
    ['D12', 'Milo Aube', 'person', 'Artiste imaginaire · Démonstration fictive'],
    ['D13', 'Rencontres du silence', 'event', 'Événement imaginaire · Démonstration fictive'],
    ['D14', 'Institut des horizons', 'institution', 'Institut imaginaire · Démonstration fictive'],
    ['D15', 'La traversée', 'work', 'Œuvre imaginaire · Démonstration fictive'],
    ['D16', 'Île de Sélune', 'place', 'Lieu imaginaire · Démonstration fictive'],
  ];
  records.forEach(([id, label, type, description]) => graph.nodes.set(id, { id, label, type, description, fictional: true }));
  const links = [
    ['D1', 'D3', 'écrit', 2018], ['D3', 'D5', 'publié par', 2018], ['D5', 'D6', 'installé à', null],
    ['D1', 'D4', 'scénario', 2021], ['D2', 'D4', 'musique', 2021], ['D8', 'D4', 'réalisation', 2021],
    ['D4', 'D7', 'présenté à', 2022], ['D7', 'D6', 'se déroule à', 2022], ['D2', 'D11', 'compose', 2020],
    ['D12', 'D11', 'interprète', 2020], ['D8', 'D9', 'membre de', 2016], ['D9', 'D10', 'installé à', 2016],
    ['D1', 'D13', 'participe à', 2023], ['D13', 'D10', 'se déroule à', 2023], ['D12', 'D14', 'formation', 2014],
    ['D14', 'D6', 'installé à', null], ['D8', 'D15', 'crée', 2024], ['D15', 'D16', 'présenté à', 2024],
    ['D2', 'D13', 'participe à', 2023], ['D12', 'D7', 'participe à', 2022],
  ];
  links.forEach(([from, to, label, year], index) => graph.edges.set(`demo-${index}`, {
    id: `demo-${index}`, from, to, label, fictional: true, evidence: 'fictional', rank: 'normal',
    references: [], dates: { P585: year ? [{ year, display: String(year) }] : [] },
  }));
  return graph;
}
