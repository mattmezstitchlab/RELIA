import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JARGON } from './words.js';

// Le test qui empêche la page de redevenir technique : on lit les chaînes affichées à l’écran
// (celles du gabarit HTML et celles du rendu), pas le code. Un mot de métier qui repasse ici
// casse la promesse « lisible par tous », donc il casse le build de tests.
const here = fileURLToPath(new URL('.', import.meta.url));
const appSource = readFileSync(`${here}app.js`, 'utf8');
const pageSource = readFileSync(`${here}../../seating.html`, 'utf8');

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Toutes les petites phrases que le gabarit écrit directement, sans calcul.
function htmlSentences(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?]) |\s{2,}|\n+/)
    .map(line => line.replace(/^[·\s]+/, '').trim())
    .filter(line => line.length > 3);
}

// Les libellés posés par le rendu : text(...) et button(...), en littéraux simples.
function uiStrings(source) {
  const clean = withoutComments(source);
  const found = [];
  const pattern = /(?:text|button)\(\s*'[a-z0-9]+'\s*,\s*(?:`([^`$]*)`|'([^']*)')/g;
  for (const match of clean.matchAll(pattern)) found.push((match[1] || match[2] || '').trim());
  const sayPattern = /say\(\s*(?:`([^`$]*)`|'([^']*)')/g;
  for (const match of clean.matchAll(sayPattern)) found.push((match[1] || match[2] || '').trim());
  const labelPattern = /<span>([^<>{}]+)<\/span>/g;
  for (const match of clean.matchAll(labelPattern)) found.push(match[1].trim());
  return [...new Set(found.filter(line => line.length > 3 && /[a-zà-ÿ]{3}/.test(line)))];
}

test('le gabarit ne contient aucun mot de métier', () => {
  const offenders = htmlSentences(pageSource).filter(line => JARGON.test(line));
  assert.deepEqual(offenders, [], `mots de métier dans la page : ${offenders.join(' | ')}`);
});

test('les libellés du rendu ne contiennent aucun mot de métier', () => {
  const offenders = uiStrings(appSource).filter(line => JARGON.test(line));
  assert.deepEqual(offenders, [], `mots de métier dans les libellés : ${offenders.join(' | ')}`);
});

test('une phrase de l’interface fait au plus dix-huit mots', () => {
  const lines = [...htmlSentences(pageSource), ...uiStrings(appSource)]
    .flatMap(line => line.replace(/[«»]/g, '').split(/(?<=[.!?])\s/))
    .map(line => line.trim().replace(/^[·\u2022\s]+/, '').replace(/\s+/g, ' '))
    .filter(line => line.split(' ').length > 18 && /[a-zà-ÿ]{4}/.test(line));
  assert.deepEqual(lines, [], `phrases à rallonge : ${lines.map(line => `${line.split(' ').length} mots`).join(' | ')}`);
});

test('les gros boutons sont écrits en deux mots ou moins', () => {
  const buttons = [...pageSource.matchAll(/<button[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map(match => match[1].trim());
  assert.ok(buttons.length >= 5, 'le gabarit doit avoir des boutons nommés');
  for (const label of buttons) {
    if (label.startsWith('.')) continue;
    assert.ok(label.split(/\s+/).length <= 5, `bouton trop long à lire du coin de l’œil : « ${label} »`);
    assert.ok(!JARGON.test(label), `bouton technique : « ${label} »`);
  }
});

test('le plan de la salle vient avant les explications', () => {
  const graphIndex = pageSource.indexOf('id="graph-section"');
  const findingsIndex = pageSource.indexOf('id="findings"');
  assert.ok(graphIndex > 0 && findingsIndex > graphIndex, 'le graphe doit être la première chose vue');
  assert.ok(pageSource.indexOf('<svg id="plan-svg"') < findingsIndex, 'le SVG doit précéder le texte');
});
