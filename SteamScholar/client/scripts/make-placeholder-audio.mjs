/**
 * Writes synthesized placeholder sounds to public/audio/ so the build works before real
 * Pixabay/freesound files are dropped in. Run: npm run audio:placeholders -w client
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 22050;
const outDir = new URL('../public/audio/', import.meta.url);
mkdirSync(outDir, { recursive: true });

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(new URL(`${name}.wav`, outDir), Buffer.concat([header, data]));
}

const seconds = (s) => new Float32Array(Math.round(s * RATE));
const noise = () => Math.random() * 2 - 1;

/** Simple resonant band-pass (biquad) over a buffer, in place. */
function bandpass(buf, freq, q) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

function normalize(buf, peak = 0.8) {
  const max = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return buf.map((v) => (v / max) * peak);
}

// Brass steam whistle: a detuned three-note chord with a breathy edge.
{
  const buf = seconds(1.15);
  const freqs = [415.3, 493.88, 622.25];
  for (let i = 0; i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.07) * (t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.3) : 1);
    let s = 0;
    for (const f of freqs) {
      const bend = t < 0.08 ? 0.97 + (t / 0.08) * 0.03 : 1;
      const ph = 2 * Math.PI * f * bend * t;
      s += Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph);
    }
    buf[i] = env * (s / 4 + noise() * 0.05);
  }
  writeWav('whistle', normalize(buf, 0.7));
}

// Chug loop: four exhaust beats per second, first one accented; loops seamlessly.
{
  const buf = seconds(1.0);
  const beat = buf.length / 4;
  for (let i = 0; i < buf.length; i++) {
    const k = Math.floor(i / beat);
    const t = (i - k * beat) / RATE;
    const env = Math.exp(-t * 22) * (k === 0 ? 1 : 0.7);
    buf[i] = noise() * env;
  }
  bandpass(buf, 210, 1.4);
  writeWav('chug-loop', normalize(buf, 0.8));
}

// UI click: a short, dry tick.
{
  const buf = seconds(0.05);
  for (let i = 0; i < buf.length; i++) {
    const t = i / RATE;
    buf[i] = Math.exp(-t * 160) * (Math.sin(2 * Math.PI * 1800 * t) * 0.7 + noise() * 0.3);
  }
  writeWav('ui-click', normalize(buf, 0.5));
}

// Correct chime: soft bell partials.
{
  const buf = seconds(0.9);
  for (let i = 0; i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 5);
    buf[i] = env * (Math.sin(2 * Math.PI * 1046.5 * t) + 0.5 * Math.sin(2 * Math.PI * 1568 * t) + 0.25 * Math.sin(2 * Math.PI * 2093 * t));
  }
  writeWav('correct-chime', normalize(buf, 0.45));
}

// Sputter: three irregular low coughs.
{
  const buf = seconds(0.7);
  const starts = [0, 0.17, 0.41];
  const strengths = [1, 0.6, 0.8];
  for (let i = 0; i < buf.length; i++) {
    const t = i / RATE;
    let s = 0;
    starts.forEach((st, j) => {
      if (t >= st) s += noise() * Math.exp(-(t - st) * 18) * strengths[j];
    });
    buf[i] = s;
  }
  bandpass(buf, 150, 1.1);
  writeWav('sputter', normalize(buf, 0.75));
}

console.log('Placeholder audio written to public/audio/');
