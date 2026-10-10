// Séquenceur de lecture du mode Raconter, pas moteur chronologique. L’application lui
// fournit UNE séquence déjà ordonnée par dates.js. Transport et horloge sont injectables.
import { readingSeconds } from './model.js';

export const PHASES = Object.freeze(['narration', 'video', 'transition']);
export const PHASE_LABELS = Object.freeze({ narration: 'Le récit', video: 'L’archive', transition: 'La passerelle', finished: 'Séquence terminée' });

const defaultClock = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
};

export class DocumentaryPlayback {
  constructor({ clock = defaultClock, narrator = null, video = null, onChange = () => {}, onNext = () => {} } = {}) {
    this.clock = clock;
    this.narrator = narrator;
    this.video = video;
    this.onChange = onChange;
    this.onNext = onNext;
    this.step = null;
    this.phase = 'narration';
    this.mode = 'mock';
    this.voiceEnabled = false; // Aucun son automatique à l’ouverture du prototype.
    this.playing = false;
    this.generation = 0;
    this.timers = new Set();
    this.elapsedMs = 0;
    this.durationMs = 0;
    this.startedAt = null;
    this.liveProgress = 0;
    this.error = '';
    this.notice = '';
    this.disposed = false;
  }
  snapshot() {
    const elapsed = this.elapsedMs + (this.startedAt === null ? 0 : this.clock.now() - this.startedAt);
    const live = this.phase === 'video' && this.mode === 'youtube';
    return {
      phase: this.phase, mode: this.mode, playing: this.playing, voiceEnabled: this.voiceEnabled,
      progress: Math.min(1, Math.max(0, live ? this.liveProgress : this.durationMs ? elapsed / this.durationMs : 0)),
      error: this.error, notice: this.notice, videoId: this.step?.videoId ?? null,
    };
  }
  emit() { if (!this.disposed) this.onChange(this.snapshot()); }
  later(callback, delay, generation = this.generation) {
    const id = this.clock.setTimeout(() => {
      this.timers.delete(id);
      if (generation === this.generation && !this.disposed) callback();
    }, Math.max(0, delay));
    this.timers.add(id);
  }
  cancel() {
    this.generation += 1;
    for (const timer of this.timers) this.clock.clearTimeout(timer);
    this.timers.clear();
    if (this.startedAt !== null) this.elapsedMs += this.clock.now() - this.startedAt;
    this.startedAt = null;
    this.narrator?.stop();
    this.video?.pause();
  }
  durationFor(phase) {
    if (phase === 'video') return this.step.excerpt.durationSeconds * 1000;
    return readingSeconds(phase === 'narration' ? this.step.narration.text : this.step.narration.transition) * 1000;
  }
  setStep(step, { playing = false } = {}) {
    if (this.disposed) return;
    this.cancel();
    this.video?.unload();
    this.step = step;
    this.phase = 'narration';
    this.playing = false;
    this.error = '';
    this.notice = '';
    this.elapsedMs = 0;
    this.liveProgress = 0;
    this.durationMs = this.durationFor(this.phase);
    this.emit();
    if (playing) this.play();
  }
  setMode(mode) {
    if (!['mock', 'youtube'].includes(mode)) throw new RangeError('Mode de lecture inconnu.');
    this.pause();
    this.video?.unload();
    this.mode = mode;
    this.elapsedMs = 0;
    this.liveProgress = 0;
    this.error = '';
    this.notice = '';
    this.emit();
  }
  setVoiceEnabled(value) {
    this.pause();
    this.voiceEnabled = Boolean(value);
    this.elapsedMs = 0;
    this.emit();
  }
  seekPhase(phase) {
    if (!this.step || !PHASES.includes(phase)) return;
    const resume = this.playing;
    this.cancel();
    this.phase = phase;
    this.playing = false;
    this.durationMs = this.durationFor(phase);
    this.elapsedMs = 0;
    this.liveProgress = 0;
    this.error = '';
    this.notice = '';
    this.emit();
    if (resume) this.play();
  }
  tick(generation) {
    this.later(() => {
      if (!this.playing) return;
      this.emit();
      this.tick(generation);
    }, 300, generation);
  }
  play() {
    if (this.disposed || !this.step || this.playing) return false;
    if (!this.step.narration.playable) {
      this.error = 'Cette séquence doit être relue dans l’éditeur avant une lecture automatique. Le texte reste consultable.';
      this.emit();
      return false;
    }
    if (this.phase === 'finished') this.seekPhase('narration');
    this.cancel();
    this.playing = true;
    this.error = '';
    this.notice = '';
    const generation = this.generation;
    const valid = () => generation === this.generation && this.playing && !this.disposed;
    this.startedAt = this.clock.now();
    this.emit();
    if (this.phase === 'video' && this.mode === 'youtube') {
      // JAMAIS de minuterie qui ferait avancer une vidéo réelle bloquée ou en buffering.
      this.startedAt = null;
      if (!this.step.video.embeddable) {
        this.fail('Intégration non autorisée. Ouvrez le lien YouTube, passez la séquence ou revenez à la maquette.');
        return false;
      }
      try {
        const result = this.video?.play(this.step, {
          onProgress: seconds => {
            if (!valid() || !Number.isFinite(seconds)) return;
            this.liveProgress = (seconds - this.step.excerpt.startSeconds) / this.step.excerpt.durationSeconds;
            this.emit();
            if (seconds >= this.step.excerpt.endSeconds) this.advance();
          },
          onEnded: () => { if (valid()) this.advance(); },
          onError: message => { if (valid()) this.fail(message); },
          onState: playing => {
            if (generation !== this.generation || this.disposed || this.phase !== 'video') return;
            this.playing = Boolean(playing);
            this.emit();
          },
          onStatus: message => {
            if (generation === this.generation && !this.disposed) { this.notice = message; this.emit(); }
          },
        });
        if (!this.video) this.fail('Lecteur YouTube indisponible : revenez à la maquette.');
        if (result?.catch) result.catch(() => { if (valid()) this.fail('YouTube est indisponible. Passez la séquence ou revenez à la maquette.'); });
      } catch { this.fail('YouTube est indisponible. Passez la séquence ou revenez à la maquette.'); }
      return true;
    }
    if (this.phase !== 'video' && this.voiceEnabled && this.narrator) {
      // Une reprise vocale relit le passage, elle ne prétend pas reprendre un mot exact.
      this.elapsedMs = 0;
      const value = this.phase === 'narration' ? this.step.narration.text : this.step.narration.transition;
      const spoken = this.narrator.speak(value, {
        onEnd: () => { if (valid()) this.advance(); },
        onError: () => { if (valid()) this.fail('La voix locale a été interrompue. Désactivez la voix pour continuer en lecture textuelle.'); },
      });
      if (spoken) { this.tick(generation); return true; }
      this.notice = 'Aucune voix française locale disponible : lecture textuelle, sans service distant.';
    }
    this.tick(generation);
    this.later(() => { if (valid()) this.advance(); }, Math.max(0, this.durationMs - this.elapsedMs), generation);
    return true;
  }
  advance() {
    if (!this.playing) return;
    const index = PHASES.indexOf(this.phase);
    this.cancel(); // Coupe le média AVANT de commencer la narration suivante.
    if (index >= PHASES.length - 1) {
      this.phase = 'finished';
      this.elapsedMs = this.durationMs;
      this.emit();
      const generation = this.generation;
      this.onNext(this.step);
      if (generation === this.generation) { this.playing = false; this.emit(); }
      return;
    }
    this.phase = PHASES[index + 1];
    this.elapsedMs = 0;
    this.liveProgress = 0;
    this.durationMs = this.durationFor(this.phase);
    this.playing = false;
    this.play();
  }
  pause() {
    this.cancel();
    this.playing = false;
    this.emit();
  }
  fail(message) {
    this.pause();
    this.error = message || 'Lecture indisponible. La navigation textuelle reste accessible.';
    this.emit();
  }
  dispose() {
    this.cancel();
    this.video?.unload();
    this.playing = false;
    this.disposed = true;
  }
}
