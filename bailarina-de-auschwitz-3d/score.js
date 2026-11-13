// LA PARTITURA: la única fuente de verdad para la música Y la imagen.
// Resumen animado de «La bailarina de Auschwitz» (Edith Eger).
// 80 BPM: 1 tiempo = 0,75 s, 1 compás = 3 s. Cada escena empieza en una barra de compás.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock, placeBar, makeChords } = MU;

  const FPS = 30;
  const FORMAT = U.pickFormat('16:9');
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const WIDE = W / H > 1.2;
  const clock = makeClock({ bpm: 80, offset: 0.5 });
  const { T, BEAT } = clock;
  const DURATION = T(39) + 3;

  // ---------- escenas (cada una = un bloque de compases) ----------
  // kind elige el decorado 3D en film.js
  const SCENES = [
    { id: 'intro', kind: 'book', b0: 0, b1: 4 },
    { id: 'kassa', kind: 'stage', b0: 4, b1: 7, part: 'PRIMERA PARTE · LA PRISIÓN', title: 'Kassa, Hungría · 1944',
      lines: ['Edith «Dicu» Eger tiene 16 años.', 'Sueña con el ballet y la gimnasia olímpica,', 'y está enamorada de Eric.'] },
    { id: 'tren', kind: 'train', b0: 7, b1: 10, part: 'LA PRISIÓN', title: 'Rumbo a Auschwitz',
      lines: ['Primavera de 1944: deportada con sus padres', 'y su hermana Magda en un vagón de ganado.'] },
    { id: 'seleccion', kind: 'select', b0: 10, b1: 13, part: 'LA PRISIÓN', title: 'Una sola palabra',
      lines: ['Mengele pregunta: «¿Es tu madre o tu hermana?»', 'Ella responde «madre»… y su madre va a la cámara de gas.', 'Cargará esa culpa durante décadas.'] },
    { id: 'baile', kind: 'dance', b0: 13, b1: 16, part: 'LA PRISIÓN', title: 'Bailar para sobrevivir',
      lines: ['Obligada a bailar para Mengele, cierra los ojos', 'y se imagina en la Ópera de Budapest.', 'Recibe una hogaza de pan… y la comparte.'] },
    { id: 'libre', kind: 'dawn', b0: 16, b1: 19, part: 'LA PRISIÓN', title: '4 de mayo de 1945',
      lines: ['Gunskirchen. Entre cuerpos, un soldado', 'estadounidense ve moverse su mano.', 'Pesa 32 kilos, pero está viva.'] },
    { id: 'huida', kind: 'ship', b0: 19, b1: 22, part: 'SEGUNDA PARTE · LA HUIDA', title: 'Escapar del pasado',
      lines: ['Se casa con Béla y en 1949 emigran a EE. UU.', 'Trabaja en una fábrica, aprende inglés', 'y esconde su historia… incluso a sus hijos.'] },
    { id: 'libertad', kind: 'books', b0: 22, b1: 25, part: 'TERCERA PARTE · LA LIBERTAD', title: 'Elegir otra vida',
      lines: ['Lee a Viktor Frankl y descubre que puede elegir.', 'Estudia Psicología y se doctora en 1978.', 'Ayuda a otros a sanar… mientras sana ella.'] },
    { id: 'curacion', kind: 'gate', b0: 25, b1: 28, part: 'CUARTA PARTE · LA CURACIÓN', title: 'Volver a Auschwitz',
      lines: ['En 1990 regresa al campo con Béla.', 'Allí se perdona a sí misma:', 'aquella niña solo intentaba sobrevivir.'] },
    { id: 'lecciones', kind: 'cards', b0: 28, b1: 36 },
    { id: 'final', kind: 'flower', b0: 36, b1: 39 },
  ].map((s) => ({ ...s, t0: T(s.b0), t1: T(s.b1) }));

  // ---------- ideas clave (tarjetas 3D que aterrizan con una campana) ----------
  const LESSONS = [
    { n: '01', head: 'Víctima ≠ victimismo', body: ['El sufrimiento es inevitable.', 'Quedarse en el papel de víctima es opcional.'] },
    { n: '02', head: 'La prisión está en la mente', body: ['«Nadie puede quitarte lo que pones', 'en tu mente», le dijo su madre.'] },
    { n: '03', head: '¿Por qué ahora?', body: ['La pregunta que abre el cambio:', 'el dolor o la esperanza nos empujan.'] },
    { n: '04', head: 'Siempre hay elección', body: ['No cambias lo que pasó,', 'pero sí cómo respondes hoy.'] },
    { n: '05', head: 'Perdonarse a uno mismo', body: ['Sentir el dolor, soltar la culpa', 'y vivir el presente.'] },
  ].map((l, i) => ({ ...l, i, t: 0 }));
  // 28, 29.5, 31, 32.5, 34  → al compás o a medio compás (tiempo 3)
  LESSONS.forEach((l, i) => { l.t = T(28 + Math.floor(i * 1.5), (i % 2) * 2); });

  // ---------- armonía ----------
  const CH = {
    Am: { notes: ['A3', 'C4', 'E4'], bass: 'A1' },
    F: { notes: ['A3', 'C4', 'F4'], bass: 'F1' },
    C: { notes: ['G3', 'C4', 'E4'], bass: 'C2' },
    G: { notes: ['G3', 'B3', 'D4'], bass: 'G1' },
    Dm: { notes: ['A3', 'D4', 'F4'], bass: 'D2' },
    E: { notes: ['G#3', 'B3', 'E4'], bass: 'E1' },
    Fmaj7: { notes: ['A3', 'C4', 'E4'], bass: 'F1' },
    Cadd9: { notes: ['G3', 'D4', 'E4'], bass: 'C2' },
  };
  const prog = [];
  const cyc = (b0, b1, names) => { for (let b = b0; b < b1; b++) prog.push([b, 0, 4, names[(b - b0) % names.length]]); };
  cyc(0, 13, ['Am', 'F', 'C', 'G']);
  cyc(13, 16, ['Am', 'Dm', 'E']); // el baile: tensión
  cyc(16, 28, ['F', 'C', 'G', 'Am']); // liberación y vida nueva
  cyc(28, 36, ['C', 'G', 'Am', 'F']); // lecciones: luminoso
  prog.push([36, 0, 4, 'Fmaj7'], [37, 0, 4, 'G'], [38, 0, 4, 'Cadd9'], [39, 0, 4, 'Cadd9']);
  const { chords, chordAt } = makeChords(clock, CH, prog);

  // ---------- melodía (rejilla de corcheas: [nota, inicio, duración]) ----------
  const MEL = {
    Am: [['E5', 0, 2], ['C5', 2, 1], ['B4', 3, 1], ['A4', 4, 3], ['E4', 7, 1]],
    F: [['F4', 0, 2], ['A4', 2, 1], ['C5', 3, 1], ['E5', 4, 3], ['D5', 7, 1]],
    C: [['C5', 0, 2], ['E5', 2, 1], ['G5', 3, 1], ['E5', 4, 2], ['D5', 6, 2]],
    G: [['B4', 0, 3], ['G4', 3, 1], ['B4', 4, 2], ['D5', 6, 1], ['C5', 7, 1]],
    Dm: [['D5', 0, 2], ['F5', 2, 1], ['E5', 3, 1], ['D5', 4, 3], ['A4', 7, 1]],
    E: [['E5', 0, 3], ['D5', 3, 1], ['B4', 4, 2], ['G#4', 6, 2]],
    Fmaj7: [['E5', 0, 4], ['C5', 4, 4]],
    Cadd9: [['D5', 0, 2], ['E5', 2, 6]],
  };
  const melodyBars = (b0, b1, shift = 0) => {
    const out = [];
    for (let b = b0; b < b1; b++) { const c = prog.find((p) => p[0] === b); if (c && MEL[c[3]]) out.push(...placeBar(clock, MEL[c[3]], b, shift)); }
    return out;
  };

  const ev = {
    open: T(0),
    breath: T(15, 3), // un silencio de un tiempo antes de la liberación
    libre: T(16),
    lessons: T(28),
    bloom: T(36),
    end: T(38),
  };

  const musicbox = [...melodyBars(0, 4, 12)];
  const piano = [...melodyBars(4, 13), ...melodyBars(13, 15), ...melodyBars(19, 28)].filter((n) => n.t < ev.breath - 0.01 || n.t >= ev.libre);
  const strings = [...melodyBars(16, 19, -12), ...melodyBars(28, 36), ...melodyBars(36, 39)];

  // traqueteo del tren: una traviesa pasa en cada corchea
  const clack = [];
  clock.eachStep(7, 10, 8, (t, b, s) => clack.push({ t, acc: s % 2 === 0 }));

  // cortes de escena (golpe de timbal + destello)
  const cuts = SCENES.filter((s) => s.b0 > 0).map((s) => ({ t: s.t0, id: s.id }));

  const markers = {
    kassa: { t: T(4), sync: 'av' },
    tren: { t: T(7), sync: 'av' },
    baile: { t: T(13), sync: 'av' },
    breath: ev.breath,
    libre: { t: ev.libre, sync: 'av' },
    huida: { t: T(19), sync: 'av' },
    curacion: { t: T(25), sync: 'av' },
    lessons: { t: ev.lessons, sync: 'av' },
    l3: { t: LESSONS[2].t, sync: 'av' },
    bloom: { t: ev.bloom, sync: 'av' },
    end: ev.end,
  };

  const subtitles = [];
  const S = {};
  for (const s of SCENES) S[s.id] = [s.t0, s.id === 'final' ? DURATION : s.t1];

  const SCORE = { FPS, FORMAT, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, S, m, chords, chordAt, SCENES, LESSONS, ev, markers, musicbox, piano, strings, clack, cuts, subtitles };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
