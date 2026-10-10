import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine, VoiceNarrator } from './narration.js';

const local = { name: 'Amélie locale', voiceURI: 'local-fr', lang: 'fr-FR', localService: true };
const remote = { name: 'Denise Neural Online', voiceURI: 'remote-fr', lang: 'fr-FR', localService: false };
const english = { name: 'English installed', voiceURI: 'local-en', lang: 'en-US', localService: true };
function environment(t, voices = [local, remote, english]) {
  const before = new Map(['window', 'document', 'speechSynthesis', 'SpeechSynthesisUtterance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const spoken = []; const listeners = new Map(); const classes = new Set();
  const synthesis = { getVoices: () => voices, cancel: () => {}, speak: item => spoken.push(item), addEventListener: (event, fn) => listeners.set(event, fn) };
  class Utterance { constructor(text) { this.text = text; } }
  Object.assign(globalThis, { window: { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance }, speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance, document: { body: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } } } });
  t.after(() => { for (const [key, descriptor] of before) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { spoken, synthesis, listeners, classes, voices };
}

test('la narration documentaire ignore une préférence de voix française distante', t => {
  const h = environment(t); const narrator = new VoiceNarrator(null); narrator.setVoice(remote.voiceURI);
  assert.equal(narrator.selectedVoice(), remote, 'préférence du récit général conservée');
  assert.equal(narrator.selectedVoice({ localOnly: true }), local);
  assert.equal(narrator.localFrenchVoices().length, 1);
  assert.equal(narrator.speak('Une première trace en musique.', { localOnly: true }), true);
  assert.equal(h.spoken[0].voice, local); assert.equal(h.spoken[0].lang, 'fr-FR');
});

test('sans voix française locale, aucun service distant et aucun onEnd immédiat', t => {
  const h = environment(t, [remote, english]); const narrator = new VoiceNarrator(null); let ended = 0;
  assert.equal(narrator.speak('Un texte français.', { localOnly: true, onEnd: () => ended++ }), false);
  assert.equal(h.spoken.length, 0); assert.equal(ended, 0); assert.deepEqual(narrator.localFrenchVoices(), []);
});

test('la voix documentaire désactivée retourne false sans provoquer une fin fictive', t => {
  const h = environment(t); const narrator = new VoiceNarrator(null); let ended = 0; narrator.setEnabled(false);
  assert.equal(narrator.speak('Un texte français.', { localOnly: true, onEnd: () => ended++ }), false);
  assert.equal(h.spoken.length, 0); assert.equal(ended, 0);
  narrator.speak('Texte du récit historique.', { onEnd: () => ended++ }); assert.equal(ended, 1, 'comportement historique conservé');
});

test('les morceaux de voix locale sont séquentiels et onEnd attend le dernier', t => {
  const h = environment(t); const narrator = new VoiceNarrator(null); let ended = 0;
  narrator.speak('Une phrase originale pour les archives. '.repeat(15), { localOnly: true, onEnd: () => ended++ });
  assert.equal(h.spoken.length, 1);
  for (let i = 0; i < h.spoken.length && i < 20; i++) { h.spoken[i].onstart(); h.spoken[i].onend(); }
  assert.ok(h.spoken.length > 1); assert.equal(ended, 1); assert.equal(narrator.speaking, false);
  assert.ok(h.spoken.every(item => item.voice.localService === true)); assert.equal(h.classes.has('narrator-speaking'), false);
});

test('une erreur de voix locale signale l’échec au lieu de continuer silencieusement', t => {
  const h = environment(t); const narrator = new VoiceNarrator(null); let ended = 0; let error;
  narrator.speak('Un texte original.', { localOnly: true, onEnd: () => ended++, onError: value => { error = value; } });
  h.spoken[0].onerror({ error: 'synthesis-failed' });
  assert.equal(error, 'synthesis-failed'); assert.equal(ended, 0); assert.equal(narrator.speaking, false);
});

test('une interruption invalide même les callbacks de chunks déjà créés', t => {
  const h = environment(t); const narrator = new VoiceNarrator(null); let ended = 0; let errors = 0;
  narrator.speak('Un texte français.', { localOnly: true, onEnd: () => ended++, onError: () => errors++ });
  const stale = h.spoken[0]; narrator.stop(); stale.onstart(); stale.onend(); stale.onerror({ error: 'canceled' });
  assert.equal(ended, 0); assert.equal(errors, 0); assert.equal(narrator.speaking, false);
  assert.equal(h.classes.has('narrator-speaking'), false);
});

test('une exception du moteur local ne crée pas de callback de fin', t => {
  const h = environment(t); h.synthesis.speak = () => { throw new Error('Moteur absent'); };
  const narrator = new VoiceNarrator(null); let ended = 0; let error;
  narrator.speak('Texte français.', { localOnly: true, onEnd: () => ended++, onError: value => { error = value; } });
  assert.match(error.message, /Moteur absent/); assert.equal(ended, 0); assert.equal(narrator.speaking, false);
});


test('le refus du getter localStorage ne bloque pas le démarrage des moteurs audio', t => {
  environment(t);
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Stockage interdit'); } });
  t.after(() => { if (before) Object.defineProperty(globalThis, 'localStorage', before); else delete globalThis.localStorage; });
  assert.doesNotThrow(() => new SoundEngine());
  assert.doesNotThrow(() => new VoiceNarrator());
  const engine = new SoundEngine(); assert.equal(engine.setEnabled(false), false);
});
