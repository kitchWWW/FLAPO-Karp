/* ============================================================
   Karp 2025 — Audio Renderers
   Keep this file separate so sonification methods can be
   swapped without touching the player logic.
   ============================================================ */

// ─────────────────────────────────────────────────────────────
// CHARACTER → ON/OFF SONIFICATION MAP
//
// true  = ON  (note plays this slot)
// false = OFF (silence this slot)
//
// Alphabet: alternating by alphabetical position
//   A(1)=ON, B(2)=OFF, C(3)=ON, D(4)=OFF, …
//
// Edit freely — this is the primary parameter to experiment with.
// ─────────────────────────────────────────────────────────────
const CHAR_MAP = {
  // ── Alphabet ──────────────────────────────────────────────
  'A': true,  'B': false, 'C': true,  'D': false, 'E': true,  'F': false,
  'G': true,  'H': false, 'I': true,  'J': false, 'K': true,  'L': false,
  'M': true,  'N': false, 'O': true,  'P': false, 'Q': true,  'R': false,
  'S': true,  'T': false, 'U': true,  'V': false, 'W': true,  'X': false,
  'Y': true,  'Z': false,
  // ── Digits ────────────────────────────────────────────────
  '0': true,  '1': false, '2': true,  '3': false, '4': true,
  '5': false, '6': true,  '7': false, '8': true,  '9': false,
  // ── Space ─────────────────────────────────────────────────
  ' ':  false,
  // ── Common punctuation ────────────────────────────────────
  '.':  true,   ',': false,
  '!':  true,   '?': false,
  '-':  true,   '_': false,
  "'":  false,  '"': true,
  ':':  false,  ';': true,
  '/':  false, '\\': true,
  '&':  true,   '@': false,
  '#':  true,   '%': false,
  '(':  true,   ')': false,
  '[':  true,   ']': false,
  '{':  true,   '}': false,
  '+':  true,   '=': false,
  '<':  true,   '>': false,
  '^':  true,   '~': false,
  '`':  false,  '|': true,
  '*':  true,   '$': false,
};


// ─────────────────────────────────────────────────────────────
// BASE RENDERER
// All renderers implement the same playNote() interface.
// ─────────────────────────────────────────────────────────────
class AudioRenderer {
  /**
   * @param {AudioContext} audioCtx
   */
  constructor(audioCtx) {
    this.audioCtx   = audioCtx;
    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(audioCtx.destination);
  }

  /**
   * Schedule one note slot.
   *
   * @param {boolean} isOn       — true = note, false = silence
   * @param {number}  startTime  — AudioContext time (seconds) to begin
   * @param {number}  noteDur    — total slot length (seconds)
   * @param {number}  pitch      — frequency in Hz  (100–2000)
   * @param {number}  decayTime  — release duration (seconds, 0.04–0.5)
   * @param {string}  char       — source character (used by file renderer)
   */
  playNote(isOn, startTime, noteDur, pitch, decayTime, char) {
    // override in subclasses
  }

  setVolume(v) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }
}


// ─────────────────────────────────────────────────────────────
// TONE RENDERER
// Sine-wave oscillator with Attack / Hold / Release envelope.
//   attack  = 30 ms (fixed)
//   hold    = 30 ms (fixed)
//   release = decayTime (variable, slider-controlled)
// ─────────────────────────────────────────────────────────────
class ToneRenderer extends AudioRenderer {
  playNote(isOn, startTime, noteDur, pitch, decayTime, char) {
    if (!isOn) return;

    const ctx     = this.audioCtx;
    const attack  = 0.030;
    const hold    = 0.030;
    const release = Math.min(decayTime, noteDur - attack - hold - 0.010);
    if (release <= 0) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type           = 'sine';
    osc.frequency.value = pitch;

    osc.connect(env);
    env.connect(this.masterGain);

    // Envelope
    env.gain.setValueAtTime(      0.0001,  startTime);
    env.gain.linearRampToValueAtTime(0.7, startTime + attack);
    env.gain.setValueAtTime(         0.7,  startTime + attack + hold);
    env.gain.exponentialRampToValueAtTime(
      0.0001, startTime + attack + hold + release
    );

    osc.start(startTime);
    osc.stop( startTime + attack + hold + release + 0.005);
  }
}


// ─────────────────────────────────────────────────────────────
// WHITE NOISE RENDERER
// Band-pass filtered white noise, same A/H/R envelope.
// Each instance gets a unique random center frequency so
// players are sonically distinct even on the same pitch.
// ─────────────────────────────────────────────────────────────
class WhiteNoiseRenderer extends AudioRenderer {
  constructor(audioCtx) {
    super(audioCtx);

    // Unique timbral fingerprint per instance
    this.centerFreq = 150 + Math.random() * 1850;

    // Pre-bake a 3-second loopable noise buffer (avoid per-note alloc)
    const len = Math.ceil(audioCtx.sampleRate * 3);
    this._buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d   = this._buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  playNote(isOn, startTime, noteDur, pitch, decayTime, char) {
    if (!isOn) return;

    const ctx     = this.audioCtx;
    const attack  = 0.030;
    const hold    = 0.030;
    const release = Math.min(decayTime, noteDur - attack - hold - 0.010);
    if (release <= 0) return;

    const src = ctx.createBufferSource();
    src.buffer = this._buf;
    src.loop   = true;

    const filter        = ctx.createBiquadFilter();
    filter.type         = 'bandpass';
    filter.frequency.value = this.centerFreq;
    filter.Q.value      = 10;

    const env = ctx.createGain();

    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    env.gain.setValueAtTime(      0.0001,  startTime);
    env.gain.linearRampToValueAtTime(0.8, startTime + attack);
    env.gain.setValueAtTime(         0.8,  startTime + attack + hold);
    env.gain.exponentialRampToValueAtTime(
      0.0001, startTime + attack + hold + release
    );

    src.start(startTime);
    src.stop( startTime + attack + hold + release + 0.005);
  }
}


// ─────────────────────────────────────────────────────────────
// AUDIO FILE RENDERER  (stub — ready for wiring up)
// Map each character to a file URL in this.fileMap, e.g.:
//   this.fileMap = { 'A': 'sounds/a.mp3', 'B': 'sounds/b.mp3', … }
// Files are fetched and decoded once, then cached.
// ─────────────────────────────────────────────────────────────
class AudioFileRenderer extends AudioRenderer {
  constructor(audioCtx) {
    super(audioCtx);
    this._cache  = {};
    this.fileMap = {
      // TODO: populate with actual paths
      // 'A': 'sounds/a.mp3',
    };
  }

  async _load(char) {
    const key = char.toUpperCase();
    if (this._cache[key]) return this._cache[key];
    const url = this.fileMap[key];
    if (!url) return null;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.audioCtx.decodeAudioData(arr);
      this._cache[key] = buf;
      return buf;
    } catch (e) {
      console.warn('AudioFileRenderer: failed to load', url, e);
      return null;
    }
  }

  playNote(isOn, startTime, noteDur, pitch, decayTime, char) {
    if (!isOn) return;
    this._load(char).then(buf => {
      if (!buf) return;
      const src = this.audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this.masterGain);
      src.start(startTime);
      src.stop( startTime + noteDur);
    });
  }
}


// ─────────────────────────────────────────────────────────────
// SONIFICATION PATTERNS
//
// computeIsOn(ch, patternName, prompt, secretWord) → boolean
//   Returns whether a character should produce a note given the
//   active pattern and its context parameters.
// ─────────────────────────────────────────────────────────────
const VOWELS = new Set(['A','E','I','O','U']);

function computeIsOn(ch, patternName, prompt, secretWord) {
  const c = ch.toUpperCase();
  switch (patternName) {
    case 'vowel-gates':
      if (/[A-Z]/.test(c)) return VOWELS.has(c);
      return CHAR_MAP[c] ?? false;
    case 'consonant-gates':
      if (/[A-Z]/.test(c)) return !VOWELS.has(c);
      return CHAR_MAP[c] ?? false;
    case 'shared-gates': {
      if (c === ' ') return false;
      return (prompt || '').toUpperCase().includes(c);
    }
    case 'secret-gates': {
      if (c === ' ') return false;
      return (secretWord || '').toUpperCase().includes(c);
    }
    case 'letter-gates':
    default:
      return CHAR_MAP[c] ?? false;
  }
}


// ─────────────────────────────────────────────────────────────
// FACTORY — call this to get any renderer by name
// ─────────────────────────────────────────────────────────────
function createRenderer(type, audioCtx) {
  switch (type) {
    case 'noise': return new WhiteNoiseRenderer(audioCtx);
    case 'files': return new AudioFileRenderer(audioCtx);
    case 'tone':
    default:      return new ToneRenderer(audioCtx);
  }
}
