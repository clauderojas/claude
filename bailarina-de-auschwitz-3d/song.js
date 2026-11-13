// LA BANDA SONORA: todo sintetizado a partir de score.js -> out/music.wav
const path = require('path');
const { SR, Bus, reverb, pingpong } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { T, BEAT, DURATION, m, ev, clock } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const keys = bus(), arp = bus(), pad = bus(), str = bus(), low = bus(), perc = bus(), fx = bus();
const verb = bus(), dly = bus();
const inBreath = (t) => t >= ev.breath && t < ev.libre;

// ---------- caja de música (intro) ----------
for (const n of sc.musicbox) { const x = I.musicBox(n.midi); keys.addMono(x, n.t, 0.2); verb.addMono(x, n.t, 0.25); dly.addMono(x, n.t, 0.1); }

// ---------- piano eléctrico suave: la melodía ----------
for (const n of sc.piano) { const x = I.epiano(n.midi, n.dur * 1.4, { index: 0.8, decay: 1.2 }); keys.addMono(x, n.t, 0.32, 0.1); verb.addMono(x, n.t, 0.2); }

// ---------- arpegio de corcheas (desde el compás 4) ----------
clock.eachStep(4, 38, 8, (t, b, s) => {
  if (inBreath(t) || t >= ev.breath - BEAT && t < ev.libre) return;
  const c = sc.chordAt(t); if (!c) return;
  const order = [0, 1, 2, 1, 0, 2, 1, 2];
  const midi = c.notes[order[s] % c.notes.length] + (b >= 28 ? 12 : 0);
  const x = I.pluck(midi, { decay: 0.6, cutoff: 1800 });
  const vel = (b >= 28 && b < 36 ? 0.16 : 0.11) * (s % 2 ? 0.75 : 1);
  arp.addMono(x, t, vel, s % 2 ? 0.35 : -0.35); verb.addMono(x, t, 0.06);
});

// ---------- colchón de cuerdas (pads) ----------
for (const c of sc.chords) {
  let t1 = c.t1;
  if (c.t0 < ev.breath && c.t1 > ev.breath) t1 = ev.breath;
  if (c.t0 >= ev.end + sc.clock.BAR) continue;
  const g = c.t0 < T(4) ? 0.05 : c.t0 >= T(28) && c.t0 < T(36) ? 0.1 : 0.08;
  for (const n of c.notes) { const { L, R } = I.padNote(n, t1 - c.t0, { cutoff: 1300, attack: 0.8, release: 1.6 }); pad.addStereo(L, R, c.t0, g); }
  // bajo largo, cuerdas graves
  if (c.t0 >= T(4)) { const b = I.strings(c.bass + 12, (t1 - c.t0) * 0.98, { attack: 0.4, release: 0.8, bright: 0.3 }); low.addStereo(b.L, b.R, c.t0, 0.22); }
}

// ---------- cuerdas que cantan (liberación, lecciones, final) ----------
for (const n of sc.strings) { const s = I.strings(n.midi, n.dur * 1.05, { attack: 0.12, release: 0.6, bright: 0.6 }); str.addStereo(s.L, s.R, n.t, 0.2); verb.addStereo(s.L, s.R, n.t, 0.12); }

// ---------- el tren: un clac por cada traviesa ----------
for (const c of sc.clack) { perc.addMono(I.rim(c.acc ? 900 : 700, Math.round(c.t * 10)), c.t, c.acc ? 0.28 : 0.16, c.acc ? -0.2 : 0.2); if (c.acc) perc.addMono(I.thud(70, 0.05), c.t, 0.25); }
fx.addMono(I.noiseSweep(3, 600, 2500, { q: 1.2, pink: true }), T(7), 0.12); // vapor

// ---------- cortes de escena: timbal + campana suave ----------
for (const c of sc.cuts) {
  if (c.id === 'lessons') continue;
  const deep = c.id === 'libre' || c.id === 'final';
  perc.addMono(I.timpani(deep ? m('A1') : m('E2'), { decay: deep ? 2.5 : 1.4 }), c.t, deep ? 0.7 : 0.45);
  verb.addMono(I.timpani(m('E2')), c.t, 0.15);
  fx.addMono(I.paperFwip(0.7, Math.round(c.t * 3)), c.t - 0.05, 0.15);
}
fx.addMono(I.subBoom(2.5), ev.libre, 0.45); // la luz entra
fx.addMono(I.noiseSweep(BEAT * 3, 200, 6000, { q: 0.9, shape: (x) => x * x, pink: true }), ev.breath - BEAT * 3, 0.28); // aliento antes

// ---------- cada lección aterriza con una campana ----------
for (const l of sc.LESSONS) {
  const b = I.bell(m('E6') + [0, 3, 5, 7, 12][l.i] * 0, 2.2, 2.4, 3.5);
  fx.addMono(b, l.t, 0.18, (l.i % 2 ? 0.3 : -0.3)); verb.addMono(b, l.t, 0.12);
  perc.addMono(I.thud(90, 0.06), l.t, 0.35);
}
// la flor se abre: caja de música brillante
for (let i = 0; i < 6; i++) { const x = I.musicBox(m(['C6', 'E6', 'G6', 'D6', 'E6', 'G6'][i])); fx.addMono(x, ev.bloom + i * BEAT / 2, 0.16); verb.addMono(x, ev.bloom + i * BEAT / 2, 0.15); }
{ const x = I.musicBox(m('C6'), { decay: 4 }); fx.addMono(x, ev.end, 0.2); verb.addMono(x, ev.end, 0.3); }

// ---------- mezcla ----------
const stems = {
  keys, arp, pad, str, low, perc, fx,
  verb: reverb(verb, { room: 0.9, damp: 0.35 }),
  dly: pingpong(dly, BEAT * 0.75, 0.35, 3000),
};
const GAIN = { keys: 1.0, arp: 0.9, pad: 2.2, str: 1.6, low: 1.0, perc: 0.8, fx: 0.9, verb: 1, dly: 1 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 25);
MIX.gate(mix, ev.breath, ev.libre - 0.02);
MIX.fadeOut(mix, DURATION - 2.5, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.7'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : -14 });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS` : ''})`);
