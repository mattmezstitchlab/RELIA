import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentaryPlayback } from './playback.js';

class Clock {
  time = 0; sequence = 0; jobs = new Map();
  now = () => this.time;
  setTimeout = (callback, ms) => { const id = ++this.sequence; this.jobs.set(id, { callback, at: this.time + ms }); return id; };
  clearTimeout = id => this.jobs.delete(id);
  advance(ms) {
    const target = this.time + ms;
    for (let guard = 0; guard < 10000; guard++) {
      const next = [...this.jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) { this.time = target; return; }
      this.time = next[1].at; this.jobs.delete(next[0]); next[1].callback();
    }
    throw new Error('Boucle de timers dans le test');
  }
}
const step = (id = 'XgKcenvjMdI') => ({
  videoId: id, video: { title: 'Archive de test', embeddable: true },
  narration: { text: 'Une trace musicale.', transition: 'Une passerelle originale.', playable: true },
  excerpt: { startSeconds: 10, endSeconds: 15, durationSeconds: 5 },
});
function voice() {
  return { calls: [], stops: 0, available: true,
    speak(text, callbacks) { if (!this.available) return false; this.calls.push({ text, ...callbacks }); return true; },
    stop() { this.stops++; },
  };
}
function harness({ narrator, video: suppliedVideo, onNext } = {}) {
  const clock = new Clock(); const changes = []; let next = 0;
  const video = suppliedVideo || {
    calls: [], pauses: 0, unloads: 0,
    play(item, callbacks) { this.calls.push({ item, ...callbacks }); return Promise.resolve(); },
    pause() { this.pauses++; }, unload() { this.unloads++; },
  };
  const controller = new DocumentaryPlayback({ clock, narrator, video, onChange: state => changes.push(state), onNext: item => { next++; onNext?.(item, controller); } });
  return { controller, clock, changes, video, get next() { return next; } };
}

// Transport, voix et horloge simulés : aucun appel réseau ni service vocal dans ces tests.
test('ouvrir le récit ne démarre ni timer, ni vidéo, ni voix', () => {
  const narrator = voice(); const h = harness({ narrator });
  h.controller.setStep(step()); h.clock.advance(100000);
  assert.equal(h.controller.playing, false);
  assert.equal(h.controller.mode, 'mock');
  assert.equal(h.controller.voiceEnabled, false);
  assert.equal(h.controller.phase, 'narration');
  assert.equal(h.clock.jobs.size, 0);
  assert.equal(h.video.calls.length, 0);
  assert.equal(narrator.calls.length, 0);
  assert.equal(h.next, 0);
});

test('la maquette suit texte → extrait simulé → transition, puis une seule séquence suivante', () => {
  const h = harness(); h.controller.setStep(step(), { playing: true });
  h.clock.advance(3000); assert.equal(h.controller.phase, 'video');
  h.clock.advance(5000); assert.equal(h.controller.phase, 'transition');
  h.clock.advance(3000); assert.equal(h.next, 1);
  h.clock.advance(100000); assert.equal(h.next, 1);
  assert.equal(h.video.calls.length, 0);
  assert.equal(h.controller.playing, false);
  assert.equal(h.controller.phase, 'finished');
});

test('la pause reprend le minutage textuel sans consommer la durée à l’arrêt', () => {
  const h = harness(); h.controller.setStep(step(), { playing: true });
  h.clock.advance(1200); h.controller.pause();
  assert.equal(h.controller.snapshot().progress, 0.4);
  h.clock.advance(100000); assert.equal(h.controller.phase, 'narration');
  h.controller.play(); h.clock.advance(1800);
  assert.equal(h.controller.phase, 'video');
  assert.equal(h.next, 0);
});

test('le saut de phase annule les anciens timers et reste pausé si le récit l’était', () => {
  const h = harness(); h.controller.setStep(step());
  h.controller.seekPhase('video'); h.clock.advance(100000);
  assert.equal(h.controller.playing, false); assert.equal(h.next, 0);
  h.controller.play(); h.clock.advance(1000); h.controller.seekPhase('transition');
  h.clock.advance(3000); assert.equal(h.next, 1); assert.equal(h.clock.jobs.size, 0);
});

test('un script non relu n’est pas contourné par PLAY ni par le saut de phase', () => {
  const h = harness(); const item = step(); item.narration.playable = false;
  h.controller.setStep(item); assert.equal(h.controller.play(), false);
  assert.match(h.controller.snapshot().error, /relue/);
  h.controller.seekPhase('video'); assert.equal(h.controller.play(), false);
  h.clock.advance(100000); assert.equal(h.next, 0); assert.equal(h.video.calls.length, 0);
});

test('activer le mode YouTube ou la voix ne lance pas le récit : il faut PLAY', () => {
  const narrator = voice(); const h = harness({ narrator }); h.controller.setStep(step());
  h.controller.setMode('youtube'); h.controller.setVoiceEnabled(true);
  h.clock.advance(100000);
  assert.equal(h.controller.playing, false); assert.equal(narrator.calls.length, 0); assert.equal(h.video.calls.length, 0);
  assert.throws(() => h.controller.setMode('autoplay'), /Mode/);
});

test('la voix explicitement activée avance à sa fin réelle, pas à une durée estimée', () => {
  const narrator = voice(); const h = harness({ narrator }); h.controller.setStep(step());
  h.controller.setVoiceEnabled(true); h.controller.play();
  assert.equal(narrator.calls.length, 1);
  h.clock.advance(100000); assert.equal(h.controller.phase, 'narration');
  narrator.calls[0].onEnd(); assert.equal(h.controller.phase, 'video');
  assert.equal(h.video.calls.length, 0, 'toujours en maquette sans consentement YouTube');
});

test('une voix indisponible utilise la lecture textuelle et jamais une avance immédiate', () => {
  const narrator = voice(); narrator.available = false; const h = harness({ narrator });
  h.controller.setStep(step()); h.controller.setVoiceEnabled(true); h.controller.play();
  assert.equal(h.controller.phase, 'narration'); assert.match(h.controller.notice, /sans service distant/);
  h.clock.advance(2999); assert.equal(h.controller.phase, 'narration');
  h.clock.advance(1); assert.equal(h.controller.phase, 'video');
});

test('une erreur de voix laisse le récit en pause sans enchaînement silencieux', () => {
  const narrator = voice(); const h = harness({ narrator }); h.controller.setStep(step());
  h.controller.setVoiceEnabled(true); h.controller.play(); narrator.calls[0].onError('synthesis-failed');
  h.clock.advance(100000);
  assert.equal(h.controller.playing, false); assert.equal(h.controller.phase, 'narration'); assert.equal(h.next, 0);
  assert.match(h.controller.error, /voix locale a été interrompue/);
});

test('une fin de narration tardive après changement de séquence est ignorée', () => {
  const narrator = voice(); const h = harness({ narrator }); h.controller.setStep(step());
  h.controller.setVoiceEnabled(true); h.controller.play(); const stale = narrator.calls[0].onEnd;
  h.controller.setStep(step('YT9M8JSJqwY')); stale(); h.clock.advance(10000);
  assert.equal(h.controller.step.videoId, 'YT9M8JSJqwY'); assert.equal(h.controller.phase, 'narration');
  assert.equal(h.controller.playing, false); assert.equal(h.video.calls.length, 0); assert.equal(h.next, 0);
});

test('la vidéo réelle progresse seulement à partir du lecteur, jamais d’un timer approximatif', () => {
  const h = harness(); h.controller.setStep(step()); h.controller.setMode('youtube'); h.controller.seekPhase('video'); h.controller.play();
  const playback = h.video.calls[0]; assert.equal(playback.item.videoId, 'XgKcenvjMdI');
  h.clock.advance(120000); assert.equal(h.controller.phase, 'video'); assert.equal(h.next, 0);
  playback.onProgress(12.5); assert.equal(h.controller.snapshot().progress, 0.5);
  playback.onProgress(NaN); assert.equal(h.controller.snapshot().progress, 0.5);
  playback.onProgress(15); assert.equal(h.controller.phase, 'transition');
  assert.ok(h.video.pauses > 0);
});

test('le buffering et une pause native n’avancent pas le récit ; la reprise native reste synchronisée', () => {
  const h = harness(); h.controller.setStep(step()); h.controller.setMode('youtube'); h.controller.seekPhase('video'); h.controller.play();
  const playback = h.video.calls[0]; playback.onStatus('Chargement de la vidéo'); h.clock.advance(100000);
  assert.match(h.controller.notice, /Chargement/); assert.equal(h.next, 0);
  playback.onState(false); playback.onEnded(); h.clock.advance(100000);
  assert.equal(h.controller.playing, false); assert.equal(h.controller.phase, 'video');
  playback.onState(true); playback.onEnded(); assert.equal(h.controller.phase, 'transition');
});

test('les événements et rejets tardifs d’un ancien extrait ne réactivent pas sa lecture', async () => {
  let reject;
  const video = { calls: [], pause() {}, unload() {}, play(item, callbacks) { this.calls.push({ item, ...callbacks }); return new Promise((resolve, no) => { reject = no; }); } };
  const h = harness({ video }); h.controller.setStep(step()); h.controller.setMode('youtube'); h.controller.seekPhase('video'); h.controller.play();
  const old = video.calls[0]; h.controller.setStep(step('YT9M8JSJqwY')); reject(new Error('SDK en échec')); await Promise.resolve();
  old.onEnded(); old.onError('erreur tardive'); old.onState(true); old.onProgress(100);
  assert.equal(h.controller.step.videoId, 'YT9M8JSJqwY'); assert.equal(h.controller.phase, 'narration');
  assert.equal(h.controller.playing, false); assert.equal(h.controller.error, ''); assert.equal(h.next, 0);
});

test('une erreur ou une intégration interdite laisse le récit en pause, sans masquer le texte', () => {
  const h = harness(); const item = step(); h.controller.setStep(item); h.controller.setMode('youtube'); h.controller.seekPhase('video'); h.controller.play();
  h.video.calls[0].onError('Intégration refusée'); h.clock.advance(100000);
  assert.equal(h.controller.playing, false); assert.equal(h.controller.phase, 'video'); assert.equal(h.controller.error, 'Intégration refusée'); assert.equal(h.next, 0);
  h.controller.setMode('mock'); assert.equal(h.controller.error, '');
  item.video.embeddable = false; h.controller.setMode('youtube'); assert.equal(h.controller.play(), false);
  assert.match(h.controller.error, /Intégration non autorisée/);
});

test('un seul média est actif : la vidéo est coupée avant la passerelle vocale', () => {
  const trace = [];
  const narrator = { stop: () => trace.push('voice-stop'), speak: (value, callbacks) => { trace.push('voice-start'); return true; } };
  const video = { pause: () => trace.push('video-stop'), unload() {}, play(item, callbacks) { this.callbacks = callbacks; trace.push('video-start'); } };
  const h = harness({ narrator, video }); h.controller.setStep(step()); h.controller.setMode('youtube'); h.controller.setVoiceEnabled(true); h.controller.seekPhase('video'); h.controller.play();
  trace.length = 0; video.callbacks.onEnded();
  assert.ok(trace.indexOf('video-stop') < trace.indexOf('voice-start'));
  assert.equal(trace.filter(event => event === 'voice-start').length, 1);
  assert.equal(h.controller.phase, 'transition');
});

test('l’application peut enchaîner vers une séquence validée sans doubler le callback suivant', () => {
  const h = harness({ onNext: (item, controller) => controller.setStep(step('YT9M8JSJqwY'), { playing: true }) });
  h.controller.setStep(step(), { playing: true }); h.clock.advance(11000);
  assert.equal(h.next, 1); assert.equal(h.controller.step.videoId, 'YT9M8JSJqwY'); assert.equal(h.controller.playing, true);
  h.clock.advance(1); assert.equal(h.next, 1);
});

test('sortir annule timers, voix et lecteur ; les anciens callbacks ne fonctionnent plus', () => {
  const narrator = voice(); const h = harness({ narrator }); h.controller.setStep(step()); h.controller.setVoiceEnabled(true); h.controller.play();
  const old = narrator.calls[0]; h.controller.dispose(); old.onEnd(); old.onError(); h.clock.advance(100000);
  assert.equal(h.clock.jobs.size, 0); assert.ok(h.video.unloads > 0); assert.ok(narrator.stops > 0);
  assert.equal(h.controller.playing, false); assert.equal(h.controller.disposed, true); assert.equal(h.next, 0);
  assert.equal(h.controller.play(), false);
});
