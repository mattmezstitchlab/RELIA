import { DEFAULT_RATE_KEY, NARRATION_PITCH, NARRATION_RATES, pickNarratorVoice, rankFrenchVoices, rateFor, speechChunks, voiceKey } from './voice.js';

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

function readStorage(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value === null || value === undefined ? fallback : value;
  } catch { return fallback; }
}

function writeStorage(storage, key, value) {
  try { storage?.setItem(key, String(value)); } catch { /* stockage indisponible : préférence non conservée */ }
}

/* ==================== EFFETS SONORES (WebAudio) ==================== */
export class SoundEngine {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.ctx = null;
    this.enabled = readStorage(storage, 'relia-sound', 'true') !== 'false';
  }
  init() {
    if (!this.ctx && typeof AudioContext !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  playChime(pitch = 520) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.5, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } catch { /* audio indisponible */ }
  }
  playTick() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch { /* audio indisponible */ }
  }
  playSuccess() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [440, 554, 659, 880].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.001, now + idx * 0.07);
        gain.gain.linearRampToValueAtTime(0.05, now + idx * 0.07 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.65);
      });
    } catch { /* audio indisponible */ }
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    writeStorage(this.storage, 'relia-sound', this.enabled);
    return this.enabled;
  }
  toggle() { return this.setEnabled(!this.enabled); }
}

/* ==================== NARRATION VOCALE (speechSynthesis) ==================== */
export class VoiceNarrator {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.enabled = readStorage(storage, 'relia-voice', 'true') !== 'false';
    const storedRate = readStorage(storage, 'relia-voice-rate', DEFAULT_RATE_KEY);
    this.rateKey = NARRATION_RATES[storedRate] ? storedRate : DEFAULT_RATE_KEY;
    this.voiceKey = readStorage(storage, 'relia-voice-name', '');
    this.speaking = false;
    this.generation = 0;
    this.listeners = new Set();
    if (hasSpeech() && typeof speechSynthesis.addEventListener === 'function') {
      speechSynthesis.addEventListener('voiceschanged', () => this.listeners.forEach(listener => listener()));
    }
  }
  get supported() { return hasSpeech(); }
  get rate() { return rateFor(this.rateKey); }
  onVoicesChanged(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  voices() { return hasSpeech() ? speechSynthesis.getVoices() : []; }
  ranked() { return rankFrenchVoices(this.voices()); }
  selectedVoice() { return pickNarratorVoice(this.voices(), this.voiceKey); }
  selectedKey() {
    const voice = this.selectedVoice();
    return voice ? voiceKey(voice) : '';
  }
  setVoice(key) {
    this.voiceKey = key || '';
    writeStorage(this.storage, 'relia-voice-name', this.voiceKey);
  }
  setRate(key) {
    if (!NARRATION_RATES[key]) return;
    this.rateKey = key;
    writeStorage(this.storage, 'relia-voice-rate', key);
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stop();
    writeStorage(this.storage, 'relia-voice', this.enabled);
    return this.enabled;
  }
  toggle() { return this.setEnabled(!this.enabled); }
  // Lit le texte par morceaux successifs. onEnd n’est appelé qu’à la fin du dernier morceau,
  // ou immédiatement si la narration est coupée ou indisponible.
  speak(value, { onEnd = () => {} } = {}) {
    const chunks = speechChunks(value);
    if (!this.enabled || !hasSpeech() || !chunks.length) {
      onEnd();
      return false;
    }
    this.stop();
    const generation = this.generation;
    const voice = this.selectedVoice();
    let index = 0;
    const finish = () => {
      if (generation !== this.generation) return;
      this.speaking = false;
      document.body?.classList.remove('narrator-speaking');
      onEnd();
    };
    const next = () => {
      if (generation !== this.generation) return;
      if (index >= chunks.length) { finish(); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      index += 1;
      utterance.lang = voice?.lang || 'fr-FR';
      if (voice) utterance.voice = voice;
      utterance.rate = this.rate;
      utterance.pitch = NARRATION_PITCH;
      utterance.onstart = () => {
        if (generation !== this.generation) return;
        this.speaking = true;
        document.body?.classList.add('narrator-speaking');
      };
      utterance.onend = next;
      utterance.onerror = () => { if (generation === this.generation) next(); };
      this.speaking = true;
      try {
        speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    };
    next();
    return true;
  }
  stop() {
    this.generation += 1;
    if (hasSpeech()) {
      try { speechSynthesis.cancel(); } catch { /* moteur indisponible */ }
    }
    this.speaking = false;
    document.body?.classList.remove('narrator-speaking');
  }
}
