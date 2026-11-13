// LA PELÍCULA: un pequeño motor 3D (proyección en perspectiva, caras sombreadas,
// texturas sobre cuadriláteros) dibujado en canvas. Todo es función pura de t.
(function () {
  const U = globalThis.U, G = globalThis.G, S = globalThis.SCORE, Studio = globalThis.Studio;
  const { BEAT, ev, clock, T } = S;
  const { clamp, lerp, ease } = U;
  const W = G.W, H = G.H, SAFE = G.SAFE;
  const BAR = clock.BAR;
  const SERIF = '"Caladea", "Liberation Serif", "DejaVu Serif", serif';
  const SANS = 'Inter';
  const PAL = { night: '#0B1020', navy: '#1B2747', wire: '#2C3C6B', cream: '#F4EBDD', amber: '#F2B84B', coral: '#EE7655', rose: '#F49C7E', ink: '#0B0E18', grey: '#8A93A8', green: '#5E8C6A' };
  const sm = (x) => ease.inOutQuad(clamp(x));

  // ======================= MOTOR 3D =======================
  const v = (x, y, z) => [x, y, z];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };

  let CAM = null;
  function camera(pos, target, fov = 50, cx = W / 2, cy = H / 2) {
    const f = norm(sub(target, pos));
    const r = norm(cross([0, 1, 0], f));
    const u = cross(f, r);
    CAM = { pos, f, r, u, foc: (H / 2) / Math.tan((fov * Math.PI) / 360), cx, cy };
    return CAM;
  }
  // -> [sx, sy, depth, scale]; depth <= near = invisible
  function P(p) {
    const d = sub(p, CAM.pos);
    const z = dot(d, CAM.f);
    if (z < 0.05) return null;
    const k = CAM.foc / z;
    return [CAM.cx + dot(d, CAM.r) * k, CAM.cy - dot(d, CAM.u) * k, z, k];
  }
  const LIGHT = norm([-0.5, 0.8, -0.6]);
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(hex, k, a = 1) { const [r, g, b] = hexRGB(hex); const f = (c) => Math.round(clamp(c * k, 0, 255)); return `rgba(${f(r)},${f(g)},${f(b)},${a})`; }
  function mix(h1, h2, k) { const a = hexRGB(h1), b = hexRGB(h2); return '#' + a.map((c, i) => Math.round(lerp(c, b[i], k)).toString(16).padStart(2, '0')).join(''); }

  // Una "escena" recoge caras y trazos 3D, los ordena por profundidad y los pinta.
  function Scene() { this.items = []; }
  Scene.prototype.face = function (pts, color, opt = {}) {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const c = pts.reduce((a, p) => add(a, p), [0, 0, 0]).map((x) => x / pts.length);
    if (!opt.twoSided && dot(n, sub(CAM.pos, c)) <= 0) return;
    const pp = pts.map(P); if (pp.some((q) => !q)) return;
    const lit = opt.flat ? 1 : 0.42 + 0.68 * Math.max(0, Math.abs(dot(n, LIGHT)) * (opt.twoSided ? 1 : Math.sign(dot(n, LIGHT)) > 0 ? 1 : 0.35));
    const fog = opt.fog === false ? 0 : fogAt(dot(sub(c, CAM.pos), CAM.f));
    this.items.push({ z: dot(sub(c, CAM.pos), CAM.f) + (opt.bias || 0), draw: (ctx) => {
      ctx.beginPath(); pp.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
      ctx.fillStyle = fogMix(color, lit * (opt.k || 1), fog, opt.alpha ?? 1); ctx.fill();
      if (opt.edge) { ctx.strokeStyle = opt.edge; ctx.lineWidth = opt.edgeW || 1.5; ctx.stroke(); }
    } });
  };
  Scene.prototype.line = function (a, b, color, w = 3, opt = {}) {
    const pa = P(a), pb = P(b); if (!pa || !pb) return;
    const z = (pa[2] + pb[2]) / 2, fog = opt.fog === false ? 0 : fogAt(z);
    this.items.push({ z: z + (opt.bias || 0), draw: (ctx) => {
      ctx.strokeStyle = fogMix(color, opt.k || 1, fog, opt.alpha ?? 1); ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.6, w * (opt.world ? (pa[3] + pb[3]) / 2 : 1));
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    } });
  };
  Scene.prototype.ball = function (c, r, color, opt = {}) {
    const p = P(c); if (!p) return;
    const fog = opt.fog === false ? 0 : fogAt(p[2]);
    this.items.push({ z: p[2] + (opt.bias || 0), draw: (ctx) => {
      const R = r * p[3];
      if (opt.glow) { const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R); g.addColorStop(0, shade(color, 1, opt.alpha ?? 1)); g.addColorStop(1, shade(color, 1, 0)); ctx.fillStyle = g; }
      else if (opt.flat) ctx.fillStyle = fogMix(color, 1, fog, opt.alpha ?? 1);
      else { const g = ctx.createRadialGradient(p[0] - R * 0.35, p[1] - R * 0.4, R * 0.1, p[0], p[1], R); g.addColorStop(0, fogMix(color, 1.25, fog, opt.alpha ?? 1)); g.addColorStop(1, fogMix(color, 0.55, fog, opt.alpha ?? 1)); ctx.fillStyle = g; }
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.5, R), 0, Math.PI * 2); ctx.fill();
    } });
  };
  Scene.prototype.custom = function (z, fn) { this.items.push({ z, draw: fn }); };
  Scene.prototype.render = function (ctx) { this.items.sort((a, b) => b.z - a.z); for (const it of this.items) { ctx.save(); it.draw(ctx); ctx.restore(); } };

  let FOG = { color: '#0B1020', near: 8, far: 40 };
  const fogAt = (z) => clamp((z - FOG.near) / (FOG.far - FOG.near));
  function fogMix(hex, k, f, a) { const c = hexRGB(hex).map((x) => clamp(x * k, 0, 255)); const fc = hexRGB(FOG.color); return `rgba(${c.map((x, i) => Math.round(lerp(x, fc[i], f))).join(',')},${a})`; }

  // caja orientada: centro, tamaño, rotación Y (y X opcional), color o colores por cara
  function box(sc, c, s, ry, color, opt = {}) {
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const tr = (p) => add(rotY(opt.rx ? rotX(opt.rz ? rotZ(p, opt.rz) : p, opt.rx) : opt.rz ? rotZ(p, opt.rz) : p, ry), c);
    const V = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]].map(tr);
    const F = { front: [4, 5, 6, 7], back: [1, 0, 3, 2], right: [5, 1, 2, 6], left: [0, 4, 7, 3], top: [7, 6, 2, 3], bottom: [0, 1, 5, 4] };
    for (const k in F) {
      const col = typeof color === 'string' ? color : color[k] || color.all;
      if (!col) continue;
      sc.face(F[k].map((i) => V[i]), col, opt);
    }
    return V;
  }

  // textura sobre un cuadrilátero 3D (subdividido para que la perspectiva sea correcta)
  function texQuad(ctx, img, q, n = 6, alpha = 1) {
    const pt = (u, w) => add(add(mul(q[0], (1 - u) * (1 - w)), mul(q[1], u * (1 - w))), add(mul(q[2], u * w), mul(q[3], (1 - u) * w)));
    const grid = [];
    for (let j = 0; j <= n; j++) { grid.push([]); for (let i = 0; i <= n; i++) { const p = P(pt(i / n, j / n)); if (!p) return; grid[j].push(p); } }
    const iw = img.width, ih = img.height;
    ctx.save(); ctx.globalAlpha = alpha;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s0 = [i / n * iw, j / n * ih], s1 = [(i + 1) / n * iw, j / n * ih], s2 = [(i + 1) / n * iw, (j + 1) / n * ih], s3 = [i / n * iw, (j + 1) / n * ih];
      const d0 = grid[j][i], d1 = grid[j][i + 1], d2 = grid[j + 1][i + 1], d3 = grid[j + 1][i];
      tri(ctx, img, s0, s1, s3, d0, d1, d3); tri(ctx, img, s1, s2, s3, d1, d2, d3);
    }
    ctx.restore();
  }
  function tri(ctx, img, s0, s1, s2, d0, d1, d2) {
    // agrandamos un poco el triángulo destino para ocultar las costuras
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, g = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.8, p[1] + dy / l * 0.8]; };
    const [e0, e1, e2] = [g(d0), g(d1), g(d2)];
    ctx.save(); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
    const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(den) < 1e-6) { ctx.restore(); return; }
    const a = ((d1[0] - d0[0]) * (y2 - y0) - (d2[0] - d0[0]) * (y1 - y0)) / den;
    const b = ((d1[1] - d0[1]) * (y2 - y0) - (d2[1] - d0[1]) * (y1 - y0)) / den;
    const c = ((d2[0] - d0[0]) * (x1 - x0) - (d1[0] - d0[0]) * (x2 - x0)) / den;
    const d = ((d2[1] - d0[1]) * (x1 - x0) - (d1[1] - d0[1]) * (x2 - x0)) / den;
    const e = d0[0] - a * x0 - c * y0, f = d0[1] - b * x0 - d * y0;
    ctx.transform(a, b, c, d, e, f); ctx.drawImage(img, 0, 0); ctx.restore();
  }

  // ======================= TEXTURAS (se generan una vez) =======================
  const TEX = {};
  function canvasOf(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
  function drawHelixFlower(c, w, h, open = 1) {
    // alambre de espino en doble hélice + flor coral (inspirado en la portada)
    c.lineCap = 'round';
    for (let s = 0; s < 2; s++) {
      c.strokeStyle = PAL.navy; c.lineWidth = w * 0.028;
      c.beginPath();
      for (let i = 0; i <= 60; i++) { const y = h * (1 - i / 60), x = w * (0.2 + 0.1 * Math.sin(i / 60 * Math.PI * 2.5 + s * Math.PI)); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      for (let i = 4; i < 60; i += 9) { const y = h * (1 - i / 60), x = w * (0.2 + 0.1 * Math.sin(i / 60 * Math.PI * 2.5 + s * Math.PI)); c.lineWidth = w * 0.01; c.beginPath(); c.moveTo(x - w * 0.03, y - w * 0.02); c.lineTo(x + w * 0.03, y + w * 0.02); c.moveTo(x - w * 0.03, y + w * 0.02); c.lineTo(x + w * 0.03, y - w * 0.02); c.stroke(); }
    }
    for (let i = 0; i < 5; i++) { const y = h * (0.3 + i * 0.14), x = w * (0.2 + (i % 2 ? 0.13 : -0.12)); c.fillStyle = PAL.navy; c.beginPath(); c.ellipse(x, y, w * 0.07, w * 0.03, i % 2 ? -0.5 : 0.5, 0, Math.PI * 2); c.fill(); }
    const fx = w * 0.24, fy = h * 0.14;
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.42 * open; c.fillStyle = i % 2 ? PAL.coral : PAL.rose; c.beginPath(); c.ellipse(fx + Math.cos(a) * w * 0.06, fy + Math.sin(a) * w * 0.06, w * 0.075, w * 0.03, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = PAL.amber; c.beginPath(); c.arc(fx, fy, w * 0.018, 0, Math.PI * 2); c.fill();
  }
  function buildTextures() {
    TEX.cover = canvasOf(600, 840, (c, w, h) => {
      c.fillStyle = '#EDE8DF'; c.fillRect(0, 0, w, h);
      drawHelixFlower(c, w, h);
      c.textAlign = 'center'; c.fillStyle = '#1A2238';
      c.font = `400 44px ${SERIF}`; c.fillText('LA', w * 0.66, 300);
      c.font = `400 62px ${SERIF}`; c.fillText('BAILARINA', w * 0.68, 375);
      c.font = `400 40px ${SERIF}`; c.fillText('DE AUSCHWITZ', w * 0.64, 425);
      c.fillStyle = '#8A6A3A'; c.font = `italic 400 26px ${SERIF}`; c.fillText('Una inspiradora historia', w * 0.64, 480); c.fillText('de valentía y supervivencia', w * 0.64, 512);
      c.font = `400 40px ${SERIF}`; c.fillText('Edith Eger', w * 0.64, 770);
    });
    TEX.spine = canvasOf(90, 840, (c, w, h) => { c.fillStyle = '#E2DCD0'; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2); c.rotate(Math.PI / 2); c.fillStyle = '#1A2238'; c.textAlign = 'center'; c.font = `400 30px ${SERIF}`; c.fillText('LA BAILARINA DE AUSCHWITZ  ·  EDITH EGER', 0, 10); c.restore(); });
    TEX.pages = canvasOf(90, 840, (c, w, h) => { c.fillStyle = '#F6F1E6'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(120,100,70,0.25)'; for (let x = 2; x < w; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } });
    TEX.frankl = canvasOf(520, 90, (c, w, h) => { c.fillStyle = '#7C2E2A'; c.fillRect(0, 0, w, h); c.fillStyle = '#F4E3C3'; c.textAlign = 'center'; c.font = `700 30px ${SERIF}`; c.fillText('V. FRANKL · EL HOMBRE EN BUSCA DE SENTIDO', w / 2, 56); });
    TEX.diploma = canvasOf(520, 360, (c, w, h) => { c.fillStyle = '#F7F0DE'; c.fillRect(0, 0, w, h); c.strokeStyle = '#B08D4A'; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28); c.fillStyle = '#2A2A2A'; c.textAlign = 'center'; c.font = `700 40px ${SERIF}`; c.fillText('Doctorado en Psicología', w / 2, 140); c.font = `400 34px ${SERIF}`; c.fillText('Edith Eva Eger', w / 2, 200); c.fillStyle = '#B08D4A'; c.font = `700 52px ${SERIF}`; c.fillText('1978', w / 2, 290); });
    TEX.cards = S.LESSONS.map((l) => canvasOf(900, 520, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#FBF5EA'); g.addColorStop(1, '#EFE4D0'); c.fillStyle = g;
      rr(c, 0, 0, w, h, 34); c.fill();
      c.fillStyle = PAL.coral; rr(c, 0, 0, 22, h, 0); c.fill();
      c.fillStyle = PAL.coral; c.font = `800 64px Inter`; c.fillText(l.n, 70, 120);
      c.fillStyle = '#1A2238'; c.font = `700 56px ${SERIF}`; fitText(c, l.head, 70, 220, w - 120, 56, `700 {s}px ${SERIF}`);
      c.fillStyle = '#3B4256'; c.font = `400 36px Inter`; l.body.forEach((b, i) => fitText(c, b, 70, 320 + i * 56, w - 120, 36, '400 {s}px Inter'));
      drawMiniFlower(c, w - 90, 90, 34);
    }));
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function fitText(c, s, x, y, maxW, size, tpl) { let k = size; c.font = tpl.replace('{s}', k); while (c.measureText(s).width > maxW && k > 12) { k -= 2; c.font = tpl.replace('{s}', k); } c.fillText(s, x, y); }
  function drawMiniFlower(c, x, y, r) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.fillStyle = i % 2 ? PAL.coral : PAL.rose; c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.25, a, 0, Math.PI * 2); c.fill(); } c.fillStyle = PAL.amber; c.beginPath(); c.arc(x, y, r * 0.2, 0, Math.PI * 2); c.fill(); }

  // ======================= FONDOS Y PARTÍCULAS =======================
  function sky(ctx, top, bottom, horizon = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, H * horizon); g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function dust(sc, t, seed, n, box3, color = PAL.amber, size = 0.03, drift = 0.15) {
    const R = U.mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const x = lerp(box3[0], box3[1], R()), y0 = lerp(box3[2], box3[3], R()), z = lerp(box3[4], box3[5], R()), ph = R() * 10;
      const y = box3[2] + ((y0 - box3[2] + t * drift * (0.5 + R())) % (box3[3] - box3[2]));
      sc.ball([x + Math.sin(t * 0.7 + ph) * 0.2, y, z], size * (0.6 + R()), color, { glow: true, alpha: 0.5 + 0.4 * Math.sin(t * 2 + ph), fog: false });
    }
  }
  function floorGrid(sc, y, x0, x1, z0, z1, step, color, w = 1.2, alpha = 0.5) {
    for (let x = x0; x <= x1; x += step) sc.line([x, y, z0], [x, y, z1], color, w, { alpha, bias: 50 });
    for (let z = z0; z <= z1; z += step) sc.line([x0, y, z], [x1, y, z], color, w, { alpha, bias: 50 });
  }
  function spotlight(ctx, x, y, r, color = 'rgba(255,226,170,', a = 0.35) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color + a + ')'); g.addColorStop(1, color + '0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }
  function beam(ctx, top, bl, br, a = 0.18) {
    const g = ctx.createLinearGradient(top[0], top[1], (bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2);
    g.addColorStop(0, `rgba(255,232,180,${a})`); g.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(top[0] - 6, top[1]); ctx.lineTo(top[0] + 6, top[1]); ctx.lineTo(br[0], br[1]); ctx.lineTo(bl[0], bl[1]); ctx.fill(); ctx.restore();
  }

  // ======================= LA BAILARINA (figura 3D articulada) =======================
  // pose: mezcla entre posiciones. Coordenadas locales en metros, mirando a +z.
  const POSES = {
    stand: { armL: [[0.3, 1.2, 0.05], [0.35, 0.95, 0.1]], armR: [[-0.3, 1.2, 0.05], [-0.35, 0.95, 0.1]], legW: [[0.1, 0.55, 0.05], [0.1, 0.02, 0.05]], tilt: 0 },
    fifth: { armL: [[0.28, 1.68, 0.05], [0.08, 1.92, 0.06]], armR: [[-0.28, 1.68, 0.05], [-0.08, 1.92, 0.06]], legW: [[0.32, 0.72, 0.12], [0.03, 0.62, 0.05]], tilt: 0 },
    arabesque: { armL: [[0.12, 1.5, 0.35], [0.1, 1.6, 0.7]], armR: [[-0.38, 1.45, -0.15], [-0.62, 1.4, -0.35]], legW: [[0.08, 0.95, -0.4], [0.06, 1.0, -0.9]], tilt: 0.28 },
    second: { armL: [[0.45, 1.42, 0.05], [0.72, 1.38, 0.08]], armR: [[-0.45, 1.42, 0.05], [-0.72, 1.38, 0.08]], legW: [[0.3, 0.55, 0.05], [0.42, 0.04, 0.05]], tilt: 0 },
    bow: { armL: [[0.3, 1.1, 0.25], [0.2, 0.85, 0.35]], armR: [[-0.42, 1.38, 0.0], [-0.7, 1.3, -0.05]], legW: [[0.05, 0.55, -0.15], [0.02, 0.05, -0.3]], tilt: -0.35 },
  };
  function lerpPose(a, b, k) {
    const L = (p, q) => p.map((x, i) => lerp(x, q[i], k));
    return { armL: [L(a.armL[0], b.armL[0]), L(a.armL[1], b.armL[1])], armR: [L(a.armR[0], b.armR[0]), L(a.armR[1], b.armR[1])], legW: [L(a.legW[0], b.legW[0]), L(a.legW[1], b.legW[1])], tilt: lerp(a.tilt, b.tilt, k) };
  }
  function dancer(sc, pos, yaw, pose, opt = {}) {
    const s = opt.scale || 1, skin = opt.skin || '#E8C4A8', dress = opt.dress || PAL.cream, hair = opt.hair || '#3A2418';
    const tf = (p) => { let q = [p[0], p[1] - 1.0, p[2]]; q = rotX(q, pose.tilt); q = [q[0], q[1] + 1.0 + (opt.lift || 0), q[2]]; return add(mul(rotY(q, yaw), s), pos); };
    const tfLeg = (p) => add(mul(rotY([p[0], p[1] + (opt.lift || 0), p[2]], yaw), s), pos);
    const hip = tf([0, 1.0, 0]), neck = tf([0, 1.5, 0]), head = tf([0, 1.7, 0.02]);
    const shL = tf([0.17, 1.46, 0]), shR = tf([-0.17, 1.46, 0]);
    const w = (opt.w || 9) * s, bias = opt.bias || 0;
    // pierna de apoyo (en punta) y pierna que trabaja
    const kneeS = tfLeg([-0.07, 0.52, 0.02]), footS = tfLeg([-0.06, 0.0, 0.02]);
    const kneeW = tfLeg(pose.legW[0]), footW = tfLeg(pose.legW[1]);
    const hipL = tf([-0.08, 1.0, 0]), hipR = tf([0.08, 1.0, 0]);
    const k = { world: true, bias };
    sc.line(hipL, kneeS, skin, 0.09, k); sc.line(kneeS, footS, skin, 0.07, k);
    sc.line(hipR, kneeW, skin, 0.09, k); sc.line(kneeW, footW, skin, 0.07, k);
    // torso
    sc.line(hip, neck, dress, 0.2, k);
    sc.line(neck, head, skin, 0.06, k);
    sc.ball(head, 0.11 * s, skin, { bias: bias - 0.01 });
    sc.ball(add(head, add(mul(rotY([0, 0.06, -0.06], yaw), s), [0, 0, 0])), 0.08 * s, hair, { bias: bias - 0.005 }); // moño
    // brazos
    sc.line(shL, tf(pose.armL[0]), skin, 0.055, k); sc.line(tf(pose.armL[0]), tf(pose.armL[1]), skin, 0.045, k);
    sc.line(shR, tf(pose.armR[0]), skin, 0.055, k); sc.line(tf(pose.armR[0]), tf(pose.armR[1]), skin, 0.045, k);
    // tutú: disco plisado
    const ring = [];
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = 0.36 + 0.04 * Math.sin(i * 3 + (opt.t || 0) * 6); ring.push(tf([Math.cos(a) * r, 0.97 + 0.03 * Math.sin(i * 2), Math.sin(a) * r])); }
    const ctr = tf([0, 1.02, 0]);
    for (let i = 0; i < 18; i++) sc.face([ctr, ring[i], ring[(i + 1) % 18]], i % 2 ? dress : mix(dress, '#C9B8A0', 0.35), { twoSided: true, bias: bias + 0.02, k: 1 });
  }

  // ======================= TEXTO =======================
  function text3d(ctx, s, x, y, { size = 64, color = PAL.cream, depth = 8, side = '#6B4A2E', align = 'left', fam = SERIF, weight = 700, alpha = 1, dir = [0.7, 1] } = {}) {
    ctx.save(); ctx.globalAlpha = alpha;
    for (let i = depth; i > 0; i--) G.text(ctx, s, x + dir[0] * i, y + dir[1] * i, { size, fam, weight, color: i === depth ? 'rgba(0,0,0,0.5)' : side, align, boil: 0 });
    G.text(ctx, s, x, y, { size, fam, weight, color, align, boil: 0 });
    ctx.restore();
  }
  function sceneText(ctx, s, t) {
    if (!s.title) return;
    const a = t - s.t0, out = clamp((s.t1 - t) / 0.45);
    const x = SAFE.x + (S.WIDE ? 40 : 10);
    const yTop = S.WIDE ? H * 0.2 : SAFE.y + 40;
    // panel oscuro para legibilidad
    const g = ctx.createLinearGradient(0, 0, W * 0.62, 0); g.addColorStop(0, 'rgba(6,8,16,0.82)'); g.addColorStop(0.75, 'rgba(6,8,16,0.45)'); g.addColorStop(1, 'rgba(6,8,16,0)');
    ctx.save(); ctx.globalAlpha = clamp(a / 0.4) * out; ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.62, H); ctx.restore();
    const pa = sm((a - 0.15) / 0.5) * out;
    if (pa > 0) {
      G.text(ctx, s.part, x, yTop, { size: 26, fam: SANS, weight: 700, color: PAL.amber, alpha: pa, boil: 0 });
      ctx.save(); ctx.globalAlpha = pa; ctx.fillStyle = PAL.amber; ctx.fillRect(x, yTop + 18, 90 * pa, 4); ctx.restore();
    }
    const ta = ease.outCubic(clamp((a - 0.35) / 0.7)) * out;
    if (ta > 0) text3d(ctx, s.title, x, yTop + 105 + (1 - ta) * 40, { size: S.WIDE ? 74 : 64, alpha: ta, depth: 7 });
    s.lines.forEach((ln, i) => {
      const la = sm((a - BEAT * (2 + i * 1.6)) / 0.5) * out;
      if (la > 0) G.text(ctx, ln, x + (1 - la) * 30, yTop + 190 + i * 54, { size: 36, fam: SANS, weight: 400, color: PAL.cream, alpha: la, boil: 0 });
    });
  }

  // ======================= ESCENAS =======================
  const DRAW = {};

  // ---- 0. el libro gira en el espacio ----
  DRAW.book = (ctx, t, s) => {
    const a = t - s.t0, k = a / (s.t1 - s.t0);
    sky(ctx, '#0A0F1E', '#1C2440');
    FOG = { color: '#141B33', near: 10, far: 40 };
    const push = ease.inCubic(clamp((a - BAR * 3.3) / (BAR * 0.7)));
    const camR = lerp(9, 3.2, push), ang = -0.9 + a * 0.12;
    camera([Math.sin(ang) * camR, 1.2 + Math.sin(a * 0.4) * 0.3, -Math.cos(ang) * camR], [0, 0.2, 0], 45, W * (S.WIDE ? 0.62 : 0.5), H * (S.WIDE ? 0.5 : 0.42));
    const sc = new Scene();
    dust(sc, t, 3, 140, [-10, 10, -4, 6, -10, 10], PAL.amber, 0.06, 0.2);
    floorGrid(sc, -2.6, -12, 12, -12, 12, 1.5, '#2C3C6B', 1, 0.35);
    sc.render(ctx);
    // libro: frente texturizado + lomo + cantos
    const ry = 0.35 + Math.sin(a * 0.6) * 0.35 + ease.inOutQuad(clamp(a / (BAR * 1.5))) * Math.PI * 2;
    const bob = Math.sin(a * 1.4) * 0.12;
    const Wb = 1.5, Hb = 2.1, D = 0.32;
    const tr = (p) => add(rotY(rotX(p, -0.12), ry), [0, bob, 0]);
    const q = (pts) => pts.map(tr);
    const faces = [
      { q: q([[-Wb, Hb, -D], [Wb, Hb, -D], [Wb, -Hb, -D], [-Wb, -Hb, -D]]), img: TEX.cover },
      { q: q([[Wb, Hb, D], [-Wb, Hb, D], [-Wb, -Hb, D], [Wb, -Hb, D]]), col: '#E2DCD0' },
      { q: q([[-Wb, Hb, D], [-Wb, Hb, -D], [-Wb, -Hb, -D], [-Wb, -Hb, D]]), img: TEX.spine },
      { q: q([[Wb, Hb, -D], [Wb, Hb, D], [Wb, -Hb, D], [Wb, -Hb, -D]]), img: TEX.pages },
      { q: q([[-Wb, Hb, D], [Wb, Hb, D], [Wb, Hb, -D], [-Wb, Hb, -D]]), col: '#F3EEE3' },
    ];
    // sombra
    const sh = P([0, -2.6, 0]); if (sh) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], 1.8 * sh[3], 0.35 * sh[3], 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    spotlight(ctx, CAM.cx, CAM.cy, H * 0.6, 'rgba(255,214,150,', 0.18);
    faces.map((f) => { const n = norm(cross(sub(f.q[1], f.q[0]), sub(f.q[2], f.q[0]))); const c = mul(f.q.reduce((a2, p) => add(a2, p), [0, 0, 0]), 0.25); return { ...f, n, vis: dot(n, sub(CAM.pos, c)) > 0, z: dot(sub(c, CAM.pos), CAM.f) }; })
      .filter((f) => f.vis).sort((x, y) => y.z - x.z).forEach((f) => {
        if (f.img) texQuad(ctx, f.img, f.q, 8);
        else { const pp = f.q.map(P); if (pp.some((p) => !p)) return; ctx.beginPath(); pp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.fillStyle = f.col; ctx.fill(); }
        const lit = 0.55 + 0.45 * Math.max(0, dot(f.n, LIGHT)); const pp = f.q.map(P); if (pp.some((p) => !p)) return;
        ctx.beginPath(); pp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.fillStyle = `rgba(0,0,10,${(1 - lit) * 0.8})`; ctx.fill();
      });
    // títulos de la intro
    const x = SAFE.x + 40;
    const a1 = sm((a - 0.4) / 0.8) * (1 - push);
    if (S.WIDE && a1 > 0) {
      G.text(ctx, 'RESUMEN ANIMADO', x, H * 0.3, { size: 28, fam: SANS, weight: 700, color: PAL.amber, alpha: a1, boil: 0 });
      text3d(ctx, 'La bailarina', x, H * 0.3 + 100, { size: 92, alpha: a1, depth: 9 });
      text3d(ctx, 'de Auschwitz', x, H * 0.3 + 200, { size: 92, alpha: sm((a - 0.9) / 0.8) * (1 - push), depth: 9 });
      G.text(ctx, 'Edith Eger · memorias (2017)', x, H * 0.3 + 270, { size: 34, fam: SANS, weight: 400, color: PAL.cream, alpha: sm((a - BAR) / 0.8) * (1 - push), boil: 0 });
      const a3 = sm((a - BAR * 1.8) / 0.8) * (1 - push);
      G.text(ctx, 'La historia, los 4 actos y 5 ideas clave', x, H * 0.3 + 330, { size: 30, fam: SANS, weight: 400, color: PAL.grey, alpha: a3, boil: 0 });
    } else if (!S.WIDE && a1 > 0) {
      text3d(ctx, 'La bailarina de Auschwitz', W / 2, SAFE.y + SAFE.h - 120, { size: 62, alpha: a1, align: 'center' });
      G.text(ctx, 'Edith Eger · resumen animado', W / 2, SAFE.y + SAFE.h - 50, { size: 34, fam: SANS, weight: 400, color: PAL.cream, alpha: a1, align: 'center', boil: 0 });
    }
    if (push > 0) { ctx.fillStyle = `rgba(244,235,221,${push * 0.85})`; ctx.fillRect(0, 0, W, H); }
  };

  // vista común: el decorado 3D se centra a la derecha, el texto ocupa la izquierda
  const CX = () => (S.WIDE ? W * 0.66 : W / 2), CY = () => (S.WIDE ? H * 0.55 : H * 0.62);

  // ---- 1. Kassa: escenario de teatro, la bailarina gira ----
  DRAW.stage = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#140C14', '#2A1520');
    FOG = { color: '#1A0F18', near: 6, far: 22 };
    const ang = 0.5 - a * 0.06;
    camera([Math.sin(ang) * 6.5, 2.2, -Math.cos(ang) * 6.5], [0, 1.0, 0], 42, CX(), CY());
    const sc = new Scene();
    // suelo de tablas
    for (let i = -6; i < 6; i++) sc.face([[i * 0.6, 0, -5], [i * 0.6 + 0.6, 0, -5], [i * 0.6 + 0.6, 0, 5], [i * 0.6, 0, 5]], i % 2 ? '#6B4A33' : '#5E412D', { bias: 100, twoSided: true });
    // telón: pliegues rojos detrás y a los lados
    for (let i = 0; i < 26; i++) {
      const x0 = -6 + i * 0.48, z0 = 3.2 + Math.sin(i * 1.3) * 0.15, z1 = 3.2 + Math.sin((i + 1) * 1.3) * 0.15;
      sc.face([[x0, 0, z0], [x0 + 0.48, 0, z1], [x0 + 0.48, 5, z1], [x0, 5, z0]], i % 2 ? '#8E1F2B' : '#6E1621', { twoSided: true, bias: 50 });
    }
    // candilejas
    for (let i = -5; i < 6; i++) sc.ball([i * 0.55, 0.06, -3.2], 0.06, PAL.amber, { glow: true, fog: false });
    // la bailarina: pirueta (fifth) cada compás, en segunda entre medias
    const bp = clock.beatPos(t), beatIn = ((bp % 4) + 4) % 4;
    const spin = beatIn < 2 ? ease.inOutQuad(beatIn / 2) * Math.PI * 2 : 0;
    const k = beatIn < 2 ? Math.sin(Math.PI * beatIn / 2) : 0;
    const pose = lerpPose(POSES.second, POSES.fifth, clamp(k * 1.4));
    dancer(sc, [0, 0, 0], Math.PI + spin + Math.floor(bp / 4) * 0.4, pose, { lift: 0.05 * k, t, dress: '#F6E7EA' });
    dust(sc, t, 11, 60, [-4, 4, 0, 5, -3, 3], '#FFE3B0', 0.03, 0.1);
    sc.render(ctx);
    const top = P([0, 6, 0]), b1 = P([-1.2, 0, 0]), b2 = P([1.2, 0, 0]);
    if (top && b1 && b2) beam(ctx, [top[0], 0], b1, b2, 0.22);
    const f = P([0, 0.05, 0]); if (f) spotlight(ctx, f[0], f[1], 260, 'rgba(255,226,170,', 0.3);
  };

  // ---- 2. el tren: cada traviesa pasa en una corchea ----
  const TIE = 0.9, SPEED = TIE / (BEAT / 2);
  DRAW.train = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#1A1E26', '#3A3F4A');
    FOG = { color: '#2E333D', near: 4, far: 30 };
    camera([-3.2, 1.4 + Math.sin(a * 0.5) * 0.1, -2], [1.5, 1.2, 12], 55, CX(), CY());
    const sc = new Scene();
    // vía: las traviesas se mueven hacia la cámara (el tren avanza)
    const off = (a * SPEED) % TIE;
    for (let i = -3; i < 40; i++) { const z = i * TIE - off; box(sc, [0, 0.05, z], [2.4, 0.1, 0.25], 0, '#4A3B30', { bias: 30 }); }
    sc.line([-0.72, 0.16, -4], [-0.72, 0.16, 40], '#9AA0A8', 3, { bias: 20 });
    sc.line([0.72, 0.16, -4], [0.72, 0.16, 40], '#9AA0A8', 3, { bias: 20 });
    // vagones (relativos a la cámara: quietos, el mundo pasa) con sacudida en cada clac
    const last = S.clack.filter((c) => c.t <= t).pop();
    const jolt = last ? Math.exp(-(t - last.t) * 18) * (last.acc ? 0.05 : 0.025) : 0;
    for (let w = 0; w < 6; w++) {
      const z = 5 + w * 5.2;
      box(sc, [0, 1.55 + jolt * (w % 2 ? 1 : -1), z], [2.6, 2.4, 4.6], 0, { front: '#5B3A2C', back: '#5B3A2C', left: '#6A4434', right: '#6A4434', top: '#3C2A22' });
      for (let p = 0; p < 5; p++) sc.line([-1.31, 0.5 + 0.0, z - 2.2 + p * 1.1], [-1.31, 2.7, z - 2.2 + p * 1.1], '#3A251C', 2.5);
      sc.face([[-1.32, 2.2, z - 0.5], [-1.32, 2.2, z + 0.5], [-1.32, 2.55, z + 0.5], [-1.32, 2.55, z - 0.5]].reverse(), '#111', { k: 1, bias: -0.1 });
      for (const dz of [-1.6, 1.6]) { const c = P([-1.25, 0.35, z + dz]); if (c) sc.custom(c[2] - 0.2, (cx) => { cx.fillStyle = '#1C1C1C'; cx.beginPath(); cx.arc(c[0], c[1], 0.38 * c[3], 0, Math.PI * 2); cx.fill(); cx.strokeStyle = '#555'; cx.lineWidth = 2; cx.beginPath(); const r = a * SPEED / 0.38; cx.moveTo(c[0], c[1]); cx.lineTo(c[0] + Math.cos(r) * 0.3 * c[3], c[1] + Math.sin(r) * 0.3 * c[3]); cx.stroke(); }); }
    }
    // postes con alambre al otro lado
    for (let i = 0; i < 18; i++) { const z = ((i * 3 - a * SPEED) % 54 + 54) % 54 - 4; sc.line([4.5, 0, z], [4.5, 2.4, z], '#3B3F48', 4); if (i < 17) { sc.line([4.5, 1.6, z], [4.5, 1.6, z + 3], '#555A66', 1.2); sc.line([4.5, 2.1, z], [4.5, 2.1, z + 3], '#555A66', 1.2); } }
    // humo
    const R = U.mulberry32(7);
    for (let i = 0; i < 40; i++) { const life = (a * 0.6 + R()) % 1, z = 28 - life * 6; sc.ball([lerp(-0.3, 1.5, R()) + life * 2, 3 + life * 4, z], 0.5 + life * 1.6, '#C9CCD2', { glow: true, alpha: 0.35 * (1 - life), fog: false }); }
    sc.render(ctx);
  };

  // ---- 3. la selección: madre e hija, una separación ----
  function person(sc, pos, opt = {}) {
    const s = opt.s || 1, col = opt.col || '#6A6F80', alpha = opt.alpha ?? 1;
    const o = { world: true, alpha, fog: true };
    sc.face([add(pos, [-0.28 * s, 0.05, 0]), add(pos, [0.28 * s, 0.05, 0]), add(pos, [0.2 * s, 1.45 * s, 0]), add(pos, [-0.2 * s, 1.45 * s, 0])], col, { twoSided: true, alpha, flat: true });
    sc.ball(add(pos, [0, 1.65 * s, 0]), 0.17 * s, opt.head || mix(col, '#E8C4A8', 0.5), { alpha, flat: true });
    if (opt.armTo) sc.line(add(pos, [0.15 * s * (opt.side || 1), 1.3 * s, 0]), opt.armTo, col, 0.08, o);
  }
  DRAW.select = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#0C0E14', '#22252E');
    FOG = { color: '#1A1C24', near: 3, far: 16 };
    camera([0.4, 1.6, -5.5 + a * 0.12], [0, 1.0, 2], 46, CX(), CY());
    const sc = new Scene();
    floorGrid(sc, 0, -8, 8, -4, 20, 1, '#3A3E4A', 1, 0.4);
    const sep = sm((a - BAR * 1.2) / (BAR * 1.4));
    const mom = [-0.45 - sep * 2.6, 0, 1 + sep * 7], me = [0.45, 0, 1];
    const hold = 1 - clamp(sep * 3);
    person(sc, me, { col: '#7A8296', s: 0.95, armTo: hold > 0.02 ? lerp3(add(me, [-0.2, 1.0, 0]), add(mom, [0.2, 1.0, 0]), 0.5) : undefined, side: -1 });
    person(sc, mom, { col: '#5C6274', s: 1.02, alpha: 1 - sep * 0.6, armTo: hold > 0.02 ? lerp3(add(me, [-0.2, 1.0, 0]), add(mom, [0.2, 1.0, 0]), 0.5) : undefined });
    // multitud lejana
    const R = U.mulberry32(21);
    for (let i = 0; i < 26; i++) person(sc, [lerp(-7, 7, R()), 0, lerp(6, 14, R())], { col: '#3A3E4C', s: 0.9 + R() * 0.2 });
    sc.render(ctx);
    // reflectores que barren
    for (let i = 0; i < 2; i++) { const sw = Math.sin(a * 0.5 + i * 2) * W * 0.25; beam(ctx, [CX() + (i ? 1 : -1) * W * 0.18, -20], [CX() + sw - 120, H], [CX() + sw + 120, H], 0.1); }
    // luz que se lleva a la madre
    const m = P(add(mom, [0, 1, 0])); if (m && sep > 0) spotlight(ctx, m[0], m[1], 320 * m[3] / 80, 'rgba(220,225,255,', 0.35 * sep);
  }
  const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // ---- 4. el baile en el barracón + el pan compartido ----
  DRAW.dance = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#0E0C0A', '#1E1814');
    FOG = { color: '#120F0C', near: 4, far: 18 };
    const ang = Math.PI + 0.12 + a * 0.035;
    camera([Math.sin(ang) * 4.6, 1.9, -Math.cos(ang) * 4.6], [0, 1.1, 0], 50, CX(), CY());
    const sc = new Scene();
    // paredes de madera y literas
    for (let i = 0; i < 12; i++) { const z = -6 + i * 1.2; for (const x of [-3.2, 3.2]) { box(sc, [x, 1.5, z], [0.1, 3, 1.18], 0, i % 2 ? '#3E2E22' : '#36281D'); } }
    for (let i = 0; i < 5; i++) for (const x of [-2.65, 2.65]) { const z = -5 + i * 2; for (const y of [0.5, 1.3, 2.1]) box(sc, [x, y, z], [1.0, 0.08, 1.6], 0, '#5A4331'); sc.line([x - Math.sign(x) * 0.5, 0, z - 0.8], [x - Math.sign(x) * 0.5, 2.3, z - 0.8], '#2A1E15', 4); }
    sc.face([[-3.2, 0, -7], [3.2, 0, -7], [3.2, 0, 8], [-3.2, 0, 8]], '#2A211A', { twoSided: true, bias: 100 });
    // bailarina: arabesque / pirueta alternando por compás
    const bp = clock.beatPos(t), barIn = ((bp % 4) + 4) % 4, barN = Math.floor(bp / 4);
    const breadT = T(15);
    const P1 = barN % 2 ? POSES.arabesque : POSES.fifth, P0 = barN % 2 ? POSES.fifth : POSES.arabesque;
    let pose = lerpPose(P0, P1, sm(barIn / 1.2));
    let yaw = barN % 2 ? Math.PI * 0.5 + barIn * 0.15 : Math.PI + sm(barIn / 2) * Math.PI * 2;
    if (t >= breadT) { pose = lerpPose(pose, POSES.bow, sm((t - breadT) / 0.8)); yaw = Math.PI; }
    dancer(sc, [0, 0, 0], yaw, pose, { t, dress: '#D8CFC2', hair: '#2A1C14' });
    // el pan: aparece, flota, se parte y reparte
    if (t >= breadT) {
      const b = t - breadT, split = sm((b - BEAT * 2) / 1.2);
      const base = [0.0, 1.35 + Math.sin(b * 2) * 0.05, -0.7];
      for (let i = 0; i < 5; i++) {
        const ang2 = i / 5 * Math.PI * 2 + b * 0.6;
        const p = add(base, [Math.cos(ang2) * 1.6 * split, -0.2 * split, Math.sin(ang2) * 1.6 * split]);
        sc.ball(p, lerp(0.22, 0.1, split), '#C78A45', { bias: -0.2 });
        sc.ball(p, 0.5, '#FFD9A0', { glow: true, alpha: 0.35, fog: false, bias: -0.1 });
      }
      // compañeras que reciben el pan
      for (let i = 0; i < 5; i++) { const ang2 = i / 5 * Math.PI * 2 + b * 0.6; if (split > 0.3) person(sc, add([0, 0, -0.7], [Math.cos(ang2) * 2.2, 0, Math.sin(ang2) * 2.2]), { col: '#6A6458', s: 0.8, alpha: clamp((split - 0.3) * 2) }); }
    }
    dust(sc, t, 5, 50, [-3, 3, 0, 4, -4, 4], '#FFE3B0', 0.025, 0.08);
    sc.render(ctx);
    const top = P([0, 6, 0]), b1 = P([-1.1, 0, 0]), b2 = P([1.1, 0, 0]);
    if (top && b1 && b2) beam(ctx, [top[0], 0], b1, b2, 0.25);
  };

  // ---- 5. liberación: amanecer, una mano que se mueve ----
  DRAW.dawn = (ctx, t, s) => {
    const a = t - s.t0;
    const rise = ease.outCubic(clamp(a / (BAR * 2)));
    sky(ctx, mix('#2A1E3A', '#8FB3D9', rise), mix('#6A3B4A', '#F7D59A', rise), 0.75);
    FOG = { color: mix('#6A3B4A', '#F2D6A8', rise), near: 4, far: 40 };
    camera([0, 1.0 + rise * 0.6, -4], [0, 1.3 + rise * 0.5, 10], 52, CX(), CY());
    // sol
    const sun = P([0, lerp(-1, 4, rise), 40]);
    if (sun) { spotlight(ctx, sun[0], sun[1], H * 0.9, 'rgba(255,220,150,', 0.55); ctx.fillStyle = '#FFF2D0'; ctx.beginPath(); ctx.arc(sun[0], sun[1], 70, 0, Math.PI * 2); ctx.fill(); }
    // rayos
    if (sun) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(sun[0], sun[1]); ctx.rotate(a * 0.05); for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = `rgba(255,230,170,${0.06 * rise})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 1.5, -60); ctx.lineTo(W * 1.5, 60); ctx.fill(); } ctx.restore(); }
    const sc = new Scene();
    // campo de hierba (briznas 3D)
    const R = U.mulberry32(31);
    for (let i = 0; i < 520; i++) { const x = lerp(-12, 12, R()), z = lerp(-1, 30, R()), h = 0.2 + R() * 0.5, sw = Math.sin(a * 1.5 + x) * 0.08; sc.line([x, 0, z], [x + sw, h, z], mix('#2F4A2E', '#7FA35E', rise * R()), 2, { bias: 0 }); }
    sc.face([[-30, 0, -2], [30, 0, -2], [30, 0, 60], [-30, 0, 60]], mix('#1E2A1C', '#4F6E3D', rise), { twoSided: true, bias: 200 });
    // pétalos/polen que suben
    dust(sc, t, 41, 70, [-6, 6, 0, 6, 0, 14], '#FFF0C8', 0.05, 0.3);
    sc.render(ctx);
    // la mano: se levanta del suelo y los dedos se mueven
    const hx = CX() + (S.WIDE ? 40 : 0), hy = H + 40 - sm((a - 0.3) / 1.4) * H * 0.42;
    hand(ctx, hx, hy, 1.6 * (H / 1080), a);
    if (a < 0.5) { ctx.fillStyle = `rgba(255,248,228,${(1 - a / 0.5) * 0.9})`; ctx.fillRect(0, 0, W, H); }
  };
  function hand(ctx, x, y, k, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = '#C79C7E'; ctx.strokeStyle = 'rgba(60,30,20,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-55, 260); ctx.lineTo(-48, 40); ctx.quadraticCurveTo(0, 10, 50, 40); ctx.lineTo(56, 260); ctx.fill(); ctx.stroke();
    const fingers = [[-46, 30, 70, -0.45], [-22, 10, 105, -0.12], [4, 4, 115, 0.02], [28, 10, 100, 0.15], [48, 36, 80, 0.32]];
    fingers.forEach(([fx, fy, len, ang], i) => {
      const wig = i === 1 || i === 2 ? Math.sin(a * 7 + i) * 0.12 : Math.sin(a * 3 + i) * 0.04;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang + wig); ctx.beginPath(); ctx.roundRect(-11, -len, 22, len + 10, 11); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    ctx.restore();
  }

  // ---- 6. la huida: barco cruzando el océano ----
  DRAW.ship = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#0D1530', '#3B4C7A', 0.6);
    FOG = { color: '#2C3A63', near: 6, far: 45 };
    camera([-6 + a * 0.15, 2.6, -8], [1, 1, 6], 50, CX(), CY());
    // luna
    const moon = P([12, 9, 40]); if (moon) { spotlight(ctx, moon[0], moon[1], 300, 'rgba(220,230,255,', 0.4); ctx.fillStyle = '#F2F0E6'; ctx.beginPath(); ctx.arc(moon[0], moon[1], 40, 0, Math.PI * 2); ctx.fill(); }
    // estrellas
    const R = U.mulberry32(51); for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * R() * (0.6 + 0.4 * Math.sin(a * 2 + i))})`; ctx.fillRect(R() * W, R() * H * 0.45, 2, 2); }
    const sc = new Scene();
    // malla del océano con olas
    const wave = (x, z) => 0.18 * Math.sin(x * 0.7 + a * 1.6) + 0.12 * Math.sin(z * 0.9 - a * 1.2 + x * 0.3);
    const N = 26;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = -14 + i * 1.3, z0 = -4 + j * 1.6, x1 = x0 + 1.3, z1 = z0 + 1.6;
      sc.face([[x0, wave(x0, z0), z0], [x0, wave(x0, z1), z1], [x1, wave(x1, z1), z1], [x1, wave(x1, z0), z0]], '#1D3A6B', { twoSided: true, bias: 100, edge: 'rgba(140,180,240,0.12)' });
    }
    // barco
    const bx = -3 + a * 0.55, bz = 6, roll = Math.sin(a * 1.6) * 0.04, by = wave(bx, bz) + 0.3;
    const hull = { front: '#2A2A30', back: '#2A2A30', left: '#33333B', right: '#33333B', top: '#7A5A3E', bottom: '#222' };
    box(sc, [bx, by, bz], [6, 0.9, 1.6], 0, hull, { rz: roll });
    box(sc, [bx + 0.6, by + 0.9, bz], [3, 0.9, 1.2], 0, '#E8E2D4', { rz: roll });
    box(sc, [bx + 1.0, by + 1.9, bz], [0.5, 1.2, 0.5], 0, '#B33A2E', { rz: roll });
    for (let i = 0; i < 6; i++) sc.ball([bx - 0.6 + i * 0.5, by + 0.95, bz - 0.61], 0.06, PAL.amber, { glow: false, flat: true, bias: -0.3 });
    // estela
    for (let i = 0; i < 20; i++) sc.ball([bx - 3 - i * 0.6, 0.15, bz + Math.sin(i) * 0.2], 0.3 + i * 0.05, '#CFE0FF', { glow: true, alpha: 0.25 * (1 - i / 20), fog: false });
    sc.render(ctx);
    const l = P([bx + 0.6, by + 1.2, bz]); if (l) spotlight(ctx, l[0], l[1], 180, 'rgba(255,210,140,', 0.25);
  };

  // ---- 7. la libertad: libros que se apilan, Frankl y el doctorado ----
  DRAW.books = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#121A2E', '#2E3B5E');
    FOG = { color: '#1E2742', near: 6, far: 26 };
    const ang = -0.6 + a * 0.12;
    camera([Math.sin(ang) * 6.5, 3.2, -Math.cos(ang) * 6.5], [0, 1.4, 0], 44, CX(), CY());
    const sc = new Scene();
    floorGrid(sc, 0, -8, 8, -8, 8, 1, '#3A4A78', 1, 0.35);
    const cols = ['#7C2E2A', '#2E5A7C', '#C9A24B', '#3E6B4E', '#6A3E7C', '#B4552E', '#2B3A67'];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const land = s.t0 + i * BEAT * 0.75;
      const k = ease.outBounce(clamp((t - land) / 0.6));
      const y = 0.18 + i * 0.36 + (1 - k) * 4;
      if (t < land) continue;
      box(sc, [Math.sin(i * 2.1) * 0.12, y, Math.cos(i * 1.7) * 0.1], [2.2 - i * 0.08, 0.34, 1.5 - i * 0.04], i * 0.35 + Math.sin(i) * 0.2, { front: cols[i], back: cols[i], left: cols[i], right: '#F3EEE3', top: '#F3EEE3', bottom: cols[i] });
    }
    dust(sc, t, 61, 60, [-5, 5, 0, 6, -5, 5], PAL.amber, 0.04, 0.15);
    sc.render(ctx);
    // lomo de Frankl (sobre el libro 0) y diploma flotante
    const fr = [0, 0.18, 0], ry = 0;
    const q = [[-1.1, 0.35, -0.76], [1.1, 0.35, -0.76], [1.1, 0.01, -0.76], [-1.1, 0.01, -0.76]].map((p) => add(rotY(p, ry), fr));
    if (dot(norm(cross(sub(q[1], q[0]), sub(q[2], q[0]))), sub(CAM.pos, q[0])) > 0) texQuad(ctx, TEX.frankl, q, 4);
    const dk = ease.outBack(clamp((t - T(23, 2)) / 0.9));
    if (dk > 0) {
      const c = [2.4, 3.6 + Math.sin(a * 1.2) * 0.1, 0.4], yaw = -0.4 + Math.sin(a * 0.7) * 0.2, sx = 1.3 * dk, sy = 0.9 * dk;
      const dq = [[-sx, sy, 0], [sx, sy, 0], [sx, -sy, 0], [-sx, -sy, 0]].map((p) => add(rotY(p, yaw + Math.PI + (CAM.pos[2] > 0 ? Math.PI : 0)), c));
      const dp = P(c); if (dp) spotlight(ctx, dp[0], dp[1], 300, 'rgba(255,220,150,', 0.3 * dk);
      texQuad(ctx, TEX.diploma, dq, 4);
    }
  };

  // ---- 8. la curación: volver a Auschwitz, el alambre florece ----
  DRAW.gate = (ctx, t, s) => {
    const a = t - s.t0;
    const warm = sm((a - BAR * 1.2) / (BAR * 1.5));
    sky(ctx, mix('#1E222C', '#F3C98B', warm), mix('#3A3E48', '#FBE7C4', warm), 0.7);
    FOG = { color: mix('#30343E', '#F6DDB4', warm), near: 4, far: 34 };
    camera([0, 1.7, -6 + a * 0.9], [0, 1.6, 20], 50, CX(), CY());
    const sc = new Scene();
    sc.face([[-30, 0, -10], [30, 0, -10], [30, 0, 60], [-30, 0, 60]], mix('#3B3A36', '#9C8A68', warm), { twoSided: true, bias: 200 });
    // camino
    sc.face([[-1.2, 0.01, -10], [1.2, 0.01, -10], [1.2, 0.01, 60], [-1.2, 0.01, 60]], mix('#4A4740', '#C8B38A', warm), { twoSided: true, bias: 150 });
    // postes curvos y alambre a ambos lados
    for (let i = 0; i < 16; i++) for (const sx of [-3.5, 3.5]) {
      const z = -4 + i * 3;
      sc.line([sx, 0, z], [sx, 3, z], '#2A2C33', 6);
      sc.line([sx, 3, z], [sx - Math.sign(sx) * 0.5, 3.4, z], '#2A2C33', 5);
      if (i < 15) for (const y of [0.8, 1.6, 2.4, 3.0]) sc.line([sx, y, z], [sx, y, z + 3], '#4A4E5A', 1.4);
      // flores que brotan del alambre, de cerca a lejos
      const bloomAt = T(26) + i * 0.18;
      const fk = ease.outBack(clamp((t - bloomAt) / 0.6));
      if (fk > 0) for (const y of [1.2, 2.0]) { const c = [sx, y + 0.05 * Math.sin(i + y), z + 1.5]; sc.ball(c, 0.16 * fk, i % 2 ? PAL.coral : PAL.rose, { bias: -0.05 }); sc.ball(c, 0.05 * fk, PAL.amber, { flat: true, bias: -0.1 }); }
    }
    // dos figuras caminando de la mano (Edith y Béla)
    const wz = 8 + a * 0.6;
    person(sc, [-0.35, 0, wz], { col: '#5A5F70', s: 0.95 });
    person(sc, [0.35, 0, wz], { col: '#4A4E5C', s: 1.05 });
    sc.line([-0.2, 0.95, wz], [0.2, 0.95, wz], '#5A5F70', 0.08, { world: true });
    dust(sc, t, 71, 60, [-5, 5, 0, 5, 0, 30], '#FFF2D0', 0.05, 0.2);
    sc.render(ctx);
    const sun = P([0, 4, 60]); if (sun) spotlight(ctx, sun[0], sun[1], H * 0.8, 'rgba(255,230,180,', 0.5 * warm);
  };

  // ---- 9. 5 ideas clave: tarjetas 3D ----
  DRAW.cards = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#121A30', '#1F2A4A');
    FOG = { color: '#16203A', near: 10, far: 40 };
    camera([Math.sin(a * 0.15) * 0.3, 0.3, -9], [0, 0, 0], 40, W / 2, S.WIDE ? H * 0.54 : H * 0.48);
    const sc = new Scene();
    floorGrid(sc, -3.4, -14, 14, -6, 24, 1.5, '#33467A', 1, 0.35);
    dust(sc, t, 81, 90, [-10, 10, -3, 6, -4, 14], PAL.amber, 0.05, 0.15);
    sc.render(ctx);
    G.text(ctx, '5 IDEAS CLAVE', W / 2, SAFE.y + 60, { size: 34, fam: SANS, weight: 800, color: PAL.amber, align: 'center', boil: 0, alpha: sm(a / 0.6) });
    const L = S.LESSONS;
    const cur = L.filter((l) => l.t <= t).length - 1;
    // tarjetas anteriores: pequeñas, en fila al fondo
    const cw = 3.6, ch = cw * 520 / 900;
    const items = [];
    L.forEach((l, i) => {
      if (t < l.t - 0.6) return;
      const fly = clamp((t - (l.t - 0.6)) / 0.6); // llega justo en l.t
      const k = ease.outCubic(fly);
      let c = [lerp(6, 0, k), lerp(3, 0, k), lerp(26, 0, k)], yaw = lerp(1.2, 0, k), sc2 = 1;
      if (i < cur) { // se aparta al fondo
        const nxt = L[cur], m2 = ease.inOutQuad(clamp((t - nxt.t + 0.6) / 0.6));
        const slot = [-5.4 + i * 2.7, 3.1, 8];
        const slotY = S.WIDE ? 2.55 : 3.1;
        c = lerp3([0, 0, 0], [slot[0], slotY, slot[2]], m2); yaw = lerp(0, 0, m2); sc2 = lerp(1, 0.55, m2);
      }
      const land = t >= l.t ? Math.exp(-(t - l.t) * 10) : 0;
      const hw = cw / 2 * sc2 * (1 + land * 0.06), hh = ch / 2 * sc2 * (1 + land * 0.06);
      const q = [[-hw, hh, 0], [hw, hh, 0], [hw, -hh, 0], [-hw, -hh, 0]].map((p) => add(rotY(rotX(p, Math.sin(a * 0.8 + i) * 0.04), yaw), c));
      items.push({ z: dot(sub(c, CAM.pos), CAM.f), q, i, land, c });
    });
    items.sort((x, y) => y.z - x.z).forEach((it) => {
      const p = P(it.c); if (p && it.land > 0) spotlight(ctx, p[0], p[1], 420, 'rgba(255,220,160,', 0.22 * it.land);
      // sombra del grosor (canto)
      const off = it.q.map((v2) => add(v2, [0.05, -0.06, 0.08]));
      const pp = off.map(P); if (!pp.some((x) => !x)) { ctx.beginPath(); pp.forEach((x, i) => (i ? ctx.lineTo(x[0], x[1]) : ctx.moveTo(x[0], x[1]))); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); }
      texQuad(ctx, TEX.cards[it.i], it.q, 6, it.i === cur ? 1 : 0.85);
    });
    if (cur >= 0 && t >= L[cur].t) { const f = Math.exp(-(t - L[cur].t) * 12) * 0.2; if (f > 0.01) { ctx.fillStyle = `rgba(255,245,225,${f})`; ctx.fillRect(0, 0, W, H); } }
  };

  // ---- 10. final: la flor sobre la doble hélice de espino ----
  DRAW.flower = (ctx, t, s) => {
    const a = t - s.t0;
    sky(ctx, '#EDE6DA', '#F7F2EA');
    FOG = { color: '#F2ECE2', near: 8, far: 26 };
    const ang = a * 0.25;
    camera([Math.sin(ang) * 8.5, 2.8, -Math.cos(ang) * 8.5], [0, 2.3, 0], 44, S.WIDE ? W * 0.68 : W / 2, S.WIDE ? H * 0.5 : H * 0.45);
    const sc = new Scene();
    // doble hélice
    const turns = 2.2, hgt = 4.2;
    for (let st = 0; st < 2; st++) {
      let prev = null;
      for (let i = 0; i <= 80; i++) {
        const u = i / 80, th = u * turns * Math.PI * 2 + st * Math.PI;
        const p = [Math.cos(th) * 0.55, u * hgt - 0.3, Math.sin(th) * 0.55];
        if (prev) sc.line(prev, p, PAL.navy, 0.07, { world: true });
        if (i % 8 === 4) { const d = 0.16; sc.line(add(p, [-d, -d, 0]), add(p, [d, d, 0]), PAL.navy, 0.03, { world: true }); sc.line(add(p, [-d, d, 0]), add(p, [d, -d, 0]), PAL.navy, 0.03, { world: true }); }
        if (i % 14 === 7) { const lf = add(p, [Math.cos(th) * 0.35, 0.05, Math.sin(th) * 0.35]); sc.face([p, add(lf, [0, 0.12, 0]), add(lf, [Math.cos(th) * 0.25, 0, Math.sin(th) * 0.25]), add(lf, [0, -0.12, 0])], PAL.navy, { twoSided: true }); }
        prev = p;
      }
    }
    // la flor se abre en ev.bloom, un pétalo por corchea
    const top = [0, hgt - 0.2, 0];
    for (let i = 0; i < 6; i++) {
      const pk = ease.outBack(clamp((t - (S.ev.bloom + i * BEAT / 2)) / 0.5));
      if (pk <= 0) continue;
      const th = i / 6 * Math.PI * 2, open = lerp(1.35, 0.55, pk);
      const tip = add(top, [Math.cos(th) * Math.sin(open) * 0.95 * pk, Math.cos(open) * 0.95 * pk, Math.sin(th) * Math.sin(open) * 0.95 * pk]);
      const side = [-Math.sin(th) * 0.28 * pk, 0, Math.cos(th) * 0.28 * pk];
      const mid = lerp3(top, tip, 0.55);
      sc.face([top, add(mid, side), tip, sub(mid, side)], i % 2 ? PAL.coral : PAL.rose, { twoSided: true, k: 1.1 });
    }
    if (t >= S.ev.bloom) sc.ball(top, 0.14, PAL.amber, { bias: -0.2 });
    dust(sc, t, 91, 60, [-5, 5, -1, 6, -5, 5], PAL.coral, 0.035, 0.12);
    sc.render(ctx);
    const tp = P(top); if (tp && t >= S.ev.bloom) spotlight(ctx, tp[0], tp[1], 380, 'rgba(255,170,120,', 0.25 * Math.exp(-(t - S.ev.bloom) * 0.5));
    // texto final
    const x = S.WIDE ? SAFE.x + 40 : W / 2, al = S.WIDE ? 'left' : 'center';
    const y0 = S.WIDE ? H * 0.36 : SAFE.y + SAFE.h - 260;
    const a1 = sm((a - 0.3) / 0.8), a2 = sm((t - S.ev.end + BAR * 0.6) / 0.8);
    G.text(ctx, 'LA MAYOR PRISIÓN ESTÁ EN LA MENTE…', x, y0, { size: 30, fam: SANS, weight: 700, color: '#B0573C', alpha: a1, align: al, boil: 0 });
    text3d(ctx, '…y también la llave.', x, y0 + 90, { size: S.WIDE ? 76 : 62, color: '#1A2238', side: '#C9B8A0', depth: 6, alpha: sm((a - 1.0) / 0.8), align: al });
    G.text(ctx, 'La libertad es una elección.', x, y0 + 160, { size: 38, fam: SERIF, weight: 400, color: '#3B4256', alpha: sm((t - S.ev.bloom - BEAT * 2) / 0.8), align: al, boil: 0 });
    G.text(ctx, 'La bailarina de Auschwitz · Edith Eger', x, y0 + 250, { size: 28, fam: SANS, weight: 400, color: '#6B7184', alpha: a2, align: al, boil: 0 });
  };

  // ======================= MONTAJE =======================
  Studio.film({
    init() { buildTextures(); },
    draw(ctx, t) {
      const s = S.SCENES.find((x) => t >= x.t0 && t < x.t1) || S.SCENES[S.SCENES.length - 1];
      const shake = (() => { const c = S.cuts.filter((c2) => c2.t <= t).pop(); return c ? Math.exp(-(t - c.t) * 9) * (c.id === 'libre' ? 10 : 4) : 0; })();
      ctx.save(); ctx.translate(U.noise1(t * 30, 1) * shake, U.noise1(t * 30, 2) * shake);
      DRAW[s.kind](ctx, t, s);
      ctx.restore();
      sceneText(ctx, s, t);
      // silencio antes de la liberación: el mundo se apaga
      if (t >= S.ev.breath && t < S.ev.libre) { ctx.fillStyle = `rgba(0,0,0,${0.55 + 0.4 * (t - S.ev.breath) / BEAT})`; ctx.fillRect(0, 0, W, H); }
      // destello en cada corte
      const c = S.cuts.filter((c2) => c2.t <= t).pop();
      if (c && c.id !== 'lessons') { const f = Math.exp(-(t - c.t) * 14) * (c.id === 'libre' ? 0 : 0.55); if (f > 0.01) { ctx.fillStyle = `rgba(255,246,228,${f})`; ctx.fillRect(0, 0, W, H); } }
      // entrada desde negro
      if (t < 1.2) { ctx.fillStyle = `rgba(5,5,8,${1 - t / 1.2})`; ctx.fillRect(0, 0, W, H); }
      // barra de progreso discreta con los 4 actos
      progress(ctx, t);
    },
    post: { paper: 0, vignette: 0.45, grain: 0.05 },
    fadeOut: 2,
  });
  function progress(ctx, t) {
    if (t < S.T(4) || t >= S.T(36)) return;
    const y = H - SAFE.y * 0.6, x0 = SAFE.x, x1 = W - SAFE.x, k = (t - S.T(4)) / (S.T(36) - S.T(4));
    ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x0, y, x1 - x0, 3); ctx.fillStyle = PAL.amber; ctx.fillRect(x0, y, (x1 - x0) * k, 3); ctx.restore();
  }
})();
