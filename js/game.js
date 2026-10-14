/* VIBE CITY — renderer, car physics, missions, HUD and UI */
(function () {
  const VC = window.VC, D = VC.DATA, T = VC.T, A = VC.Audio;
  const $ = (s) => document.querySelector(s);
  const clamp = VC.clamp, lerp = VC.lerp;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'vibecity.v1';
  const QS = new URLSearchParams(location.search);

  // ------------------------------------------------------------------ state
  let world, canvas, ctx, dpr = 1, sw = 0, sh = 0;
  const G = {
    state: 'loading', t: 0, hour: 18.6, timeScale: 1 / 60,
    car: { x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0, z: 0, vz: 0, steer: 0, slip: 0, lastSafe: null, air: 0 },
    cam: { x: 4400, y: 3200, zoom: 0.5, tx: 0, ty: 0, tz: 1 },
    visited: new Set(), pkgs: new Set(), stunts: new Set(),
    stats: { dist: 0, top: 0, time: 0, splash: 0 },
    npcs: [], parts: [], skids: [], storm: 1, shake: 0, zone: '', lastZoneT: 0,
    cut: null, current: null, neon: false, input: { throttle: 0, steer: 0, hb: false, horn: false },
  };
  VC.G = G;

  // ---------------------------------------------------------------- missions
  const MISSIONS = [];
  function setupMissions() {
    D.missions.forEach((m, i) => MISSIONS.push({ ...m, kind: 'main', order: i }));
    MISSIONS.push({ ...D.side, kind: 'side' });
    MISSIONS.push({ ...D.finale, kind: 'final' });
    MISSIONS.forEach((m) => { const L = world.landmarks[m.id]; m.mx = L.marker[0]; m.my = L.marker[1]; m.spawn = L.spawn; });
  }
  const mainMissions = () => MISSIONS.filter((m) => m.kind === 'main');
  const mainDone = () => mainMissions().filter((m) => G.visited.has(m.id)).length;
  const nextMission = () => mainMissions().find((m) => !G.visited.has(m.id)) || (world.frontierOpen && !G.visited.has('frontier') ? MISSIONS.find((m) => m.id === 'frontier') : null);

  // ----------------------------------------------------------------- sprites
  const SPR = {};
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function carSprite(type, body) {
    const S = 3, L = type === 'van' ? 52 : 46, Wd = 22, pad = 3;
    const c = VC.makeCanvas((L + pad * 2) * S, (Wd + pad * 2) * S), x = c.getContext('2d');
    x.scale(S, S); x.translate(pad + L / 2, pad + Wd / 2);
    x.fillStyle = '#0d0d12';
    [[-L / 2 + 9, -Wd / 2], [L / 2 - 9, -Wd / 2], [-L / 2 + 9, Wd / 2], [L / 2 - 9, Wd / 2]].forEach(([a, b]) => x.fillRect(a - 5, b - 2.5, 10, 5));
    const g = x.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
    g.addColorStop(0, VC.shade(body, 0.78)); g.addColorStop(0.5, VC.shade(body, 1.12)); g.addColorStop(1, VC.shade(body, 0.72));
    x.fillStyle = g; rr(x, -L / 2, -Wd / 2 + 1, L, Wd - 2, type === 'van' ? 3 : 7); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 0.7; x.stroke();
    if (type === 'player') {
      x.fillStyle = '#ff4fb0'; x.fillRect(-L / 2 + 2, -2.6, L - 4, 1.8); x.fillStyle = '#37e6ff'; x.fillRect(-L / 2 + 2, 0.8, L - 4, 1.8);
      x.fillStyle = '#1b1e2c'; rr(x, -9, -8, 15, 16, 4); x.fill(); // open cockpit
      x.fillStyle = '#2bd1c4'; rr(x, -7, -7, 6, 6, 2); x.fill(); rr(x, -7, 1, 6, 6, 2); x.fill();
      x.fillStyle = '#2a1a12'; x.beginPath(); x.arc(-3, -4, 3.2, 0, TAU); x.fill(); // Richie
      x.fillStyle = 'rgba(160,220,255,.75)'; x.beginPath(); x.moveTo(6, -8); x.lineTo(9, -7); x.lineTo(9, 7); x.lineTo(6, 8); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 4; i++) x.fillRect(13 + i * 2.2, -6, 1, 4);
    } else {
      const roofCol = type === 'police' ? '#f4f4f4' : VC.shade(body, type === 'taxi' ? 1.05 : 0.92);
      x.fillStyle = 'rgba(20,30,45,.85)'; rr(x, -12, -8.5, 25, 17, 3); x.fill();
      x.fillStyle = roofCol; rr(x, -9, -7.5, 17, 15, 2); x.fill();
      if (type === 'taxi') { x.fillStyle = '#222'; x.fillRect(-3, -4, 5, 8); x.fillStyle = '#ffe14d'; x.fillRect(-2.4, -3.4, 3.8, 6.8); }
      if (type === 'police') { x.fillStyle = '#ff2a2a'; x.fillRect(-2, -7, 4, 6); x.fillStyle = '#2a6bff'; x.fillRect(-2, 1, 4, 6); x.fillStyle = '#111'; x.fillRect(-L / 2 + 1, -Wd / 2 + 1, 8, Wd - 2); x.fillRect(L / 2 - 9, -Wd / 2 + 1, 8, Wd - 2); }
      if (type === 'van') { x.fillStyle = VC.shade(body, 1.08); x.fillRect(-L / 2 + 2, -8, 30, 16); }
    }
    x.fillStyle = '#fffbe0'; x.fillRect(L / 2 - 2.2, -Wd / 2 + 2.5, 2, 4); x.fillRect(L / 2 - 2.2, Wd / 2 - 6.5, 2, 4);
    x.fillStyle = '#ff2240'; x.fillRect(-L / 2 + 0.3, -Wd / 2 + 2.5, 1.8, 4); x.fillRect(-L / 2 + 0.3, Wd / 2 - 6.5, 1.8, 4);
    return { c, L, W: Wd, pad };
  }
  function palmSprite(seed) {
    const S = 2, R = 52, c = VC.makeCanvas(R * 2 * S, R * 2 * S), x = c.getContext('2d'), r = VC.rng(seed);
    x.scale(S, S); x.translate(R, R);
    const n = r.int(7, 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r.range(-0.2, 0.2), len = r.range(36, 48), w = r.range(7, 10);
      x.save(); x.rotate(a);
      const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#2f6e2c'); g.addColorStop(0.6, '#4f9d3a'); g.addColorStop(1, '#8cc04a');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -w, len, r.range(-3, 3)); x.quadraticCurveTo(len * 0.5, w * 0.6, 0, 0); x.fill();
      x.strokeStyle = 'rgba(20,50,20,.6)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -w * 0.2, len, 0); x.stroke();
      x.restore();
    }
    x.fillStyle = '#6b4a2a'; x.beginPath(); x.arc(0, 0, 4, 0, TAU); x.fill();
    return c;
  }
  function glowSprite(rgb, size, inner) {
    const c = VC.makeCanvas(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, `rgba(${rgb},${inner || 0.9})`); g.addColorStop(0.35, `rgba(${rgb},0.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, size, size); return c;
  }
  function coneSprite() {
    const c = VC.makeCanvas(256, 160), x = c.getContext('2d');
    const g = x.createRadialGradient(0, 80, 0, 0, 80, 256); g.addColorStop(0, 'rgba(255,245,200,.85)'); g.addColorStop(0.5, 'rgba(255,240,190,.25)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 80); x.lineTo(256, 0); x.lineTo(256, 160); x.closePath(); x.fill(); return c;
  }
  const signCache = new Map();
  function signSprite(text, color, big) {
    const key = text + color + big;
    if (signCache.has(key)) return signCache.get(key);
    const S = 3, size = (big ? 22 : 14) * S, pad = 14 * S;
    const m = VC.makeCanvas(10, 10).getContext('2d'); m.font = `700 ${size}px "Passion One", Impact, sans-serif`;
    const w = m.measureText(text).width;
    const c = VC.makeCanvas(w + pad * 2, size + pad * 2), x = c.getContext('2d');
    x.font = m.font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(10,5,20,.75)'; rr(x, pad * 0.5, pad * 0.5, w + pad, size + pad, 10); x.fill();
    x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = color; x.fillText(text, c.width / 2, c.height / 2 + 2);
    x.shadowBlur = 6; x.fillStyle = '#fff'; x.globalAlpha = 0.85; x.fillText(text, c.width / 2, c.height / 2 + 2);
    const out = { c, w: c.width / S, h: c.height / S };
    signCache.set(key, out); return out;
  }
  function patternCanvas(base, dots, n, seed, size) {
    const c = VC.makeCanvas(size, size), x = c.getContext('2d'), r = VC.rng(seed);
    x.fillStyle = base; x.fillRect(0, 0, size, size);
    for (let i = 0; i < n; i++) { x.fillStyle = r.pick(dots); x.globalAlpha = r.range(0.15, 0.5); x.fillRect(r() * size, r() * size, r.range(1, 3), r.range(1, 3)); }
    return c;
  }
  function buildSprites() {
    SPR.player = carSprite('player', '#f6f3ee');
    SPR.playerNeon = carSprite('player', '#ff7ad1');
    const cols = ['#9ff0d0', '#ff9e8a', '#8fd0ff', '#fff07a', '#c8b6ff', '#f2f2f2', '#ff6b8b', '#5f7fa8'];
    SPR.npc = [];
    cols.forEach((col) => { SPR.npc.push(carSprite('sedan', col)); });
    SPR.npc.push(carSprite('taxi', '#ffcc22'), carSprite('police', '#202024'), carSprite('van', '#e8e2d6'), carSprite('van', '#7fd8ff'));
    SPR.palms = [1, 2, 3, 4].map(palmSprite);
    SPR.warm = glowSprite('255,190,110', 128); SPR.pink = glowSprite('255,79,176', 128); SPR.cyan = glowSprite('55,230,255', 128);
    SPR.red = glowSprite('255,40,60', 64); SPR.white = glowSprite('255,255,255', 128); SPR.cone = coneSprite();
    const pc = (b, d, n, s) => ctx.createPattern(patternCanvas(b, d, n, s, 128), 'repeat');
    SPR.patGround = pc('#d8cbb7', ['#b9ab96', '#efe4d2', '#a99a86'], 500, 1);
    SPR.patSand = pc('#f1d9a6', ['#d9bd84', '#fff0c8', '#c9a86a'], 700, 2);
    SPR.patGrass = pc('#5da853', ['#4a9442', '#78c069', '#3f8a3a'], 900, 3);
    SPR.patDock = pc('#9c9a94', ['#86847e', '#b5b3ac'], 400, 4);
    SPR.patRoad = pc('#3a3940', ['#2e2d33', '#4a4950', '#55545c'], 700, 5);
    SPR.patPlaza = pc('#e6dccb', ['#d2c6b1', '#f4ece0'], 400, 6);
    const wc = VC.makeCanvas(256, 256), wx = wc.getContext('2d'), wr = VC.rng(9);
    for (let i = 0; i < 160; i++) { wx.strokeStyle = `rgba(255,255,255,${wr.range(0.05, 0.22)})`; wx.lineWidth = wr.range(1, 2.5); const X = wr() * 256, Y = wr() * 256, l = wr.range(8, 26); wx.beginPath(); wx.moveTo(X, Y); wx.quadraticCurveTo(X + l / 2, Y - 2, X + l, Y); wx.stroke(); }
    SPR.patWater = ctx.createPattern(wc, 'repeat');
  }
  // tinted sprite cache for night
  const tintCache = new Map();
  function tinted(src, key) {
    if (G.ambKey === 'day') return src;
    const k = key + '|' + G.ambKey;
    let c = tintCache.get(k);
    if (!c) {
      if (tintCache.size > 300) tintCache.clear();
      c = VC.makeCanvas(src.width, src.height); const x = c.getContext('2d');
      x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = G.ambHex; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0); tintCache.set(k, c);
    }
    return c;
  }
  const colCache = new Map();
  function tc(hex) { // tint a hex colour by ambient light
    if (G.ambKey === 'day') return hex;
    const k = hex + G.ambKey; let v = colCache.get(k);
    if (!v) { if (colCache.size > 2000) colCache.clear(); const a = VC.hexToRgb(hex), b = G.amb; v = `rgb(${(a[0] * b[0]) / 255 | 0},${(a[1] * b[1]) / 255 | 0},${(a[2] * b[2]) / 255 | 0})`; colCache.set(k, v); }
    return v;
  }

  // ---------------------------------------------------------------- lighting
  const AMB = [[0, '#3c427e'], [4.8, '#3c427e'], [6, '#b08aa8'], [7, '#ffe6cf'], [8.5, '#ffffff'], [16.5, '#ffffff'], [17.8, '#ffd6b8'], [18.8, '#f59a9e'], [19.6, '#a774b4'], [20.5, '#454b8c'], [24, '#3c427e']];
  function updateLight() {
    const h = G.hour % 24; let i = 0; while (AMB[i + 1][0] < h) i++;
    const [h0, c0] = AMB[i], [h1, c1] = AMB[i + 1], hex = VC.mix(c0, c1, (h - h0) / (h1 - h0));
    const stormMix = G.stormNear * 0.45;
    const fin = stormMix > 0 ? VC.mix(hex, '#4a5370', stormMix) : hex;
    G.amb = VC.hexToRgb(fin); G.ambHex = fin;
    const q = G.amb.map((v) => v >> 3).join(',');
    G.ambKey = fin === '#ffffff' ? 'day' : q;
    G.night = 1 - VC.smoothstep(0.55, 0.92, (G.amb[0] + G.amb[1] + G.amb[2]) / 765);
    G.sun = h > 6.5 && h < 19 ? Math.sin(((h - 6.5) / 12.5) * Math.PI) : 0;
  }

  // ------------------------------------------------------------------ render
  const tmp = [], tmp2 = [], tall = [];
  const isDeck = (k) => k === 'bridge' || k === 'pier';
  function islandPath() { if (!G.islandPath) { const p = new Path2D(); world.islands.forEach((i) => { p.moveTo(i.pts[0][0], i.pts[0][1]); i.pts.forEach((q) => p.lineTo(q[0], q[1])); p.closePath(); }); G.islandPath = p; } return G.islandPath; }
  function staticPaths() {
    if (G.paths) return G.paths;
    const P = { side: new Path2D(), road: new Path2D(), deck: new Path2D(), pier: new Path2D(), yellow: new Path2D(), white: new Path2D(), zebra: new Path2D() };
    world.roads.forEach((s) => {
      const target = s.kind === 'pier' ? P.pier : isDeck(s.kind) ? P.deck : P.road;
      if (!isDeck(s.kind)) { P.side.moveTo(s.x1, s.y1); P.side.lineTo(s.x2, s.y2); }
      target.moveTo(s.x1, s.y1); target.lineTo(s.x2, s.y2);
      if (s.kind === 'pier') return;
      s.pieces.forEach(([a, b]) => {
        const line = (path, off) => { if (s.hor) { path.moveTo(a, s.y1 + off); path.lineTo(b, s.y1 + off); } else { path.moveTo(s.x1 + off, a); path.lineTo(s.x1 + off, b); } };
        if (s.kind === 'minor') line(P.yellow, 0); else { line(P.yellow, -2.5); line(P.yellow, 2.5); line(P.white, -26); line(P.white, 26); }
      });
    });
    world.intersections.forEach((q) => {
      if (!q.major) return;
      // zebra stripes on 4 arms
      for (let i = -q.ha + 6; i < q.ha - 4; i += 9) { P.zebra.rect(q.x - q.va - 20, q.y + i, 14, 5); P.zebra.rect(q.x + q.va + 6, q.y + i, 14, 5); }
      for (let i = -q.va + 6; i < q.va - 4; i += 9) { P.zebra.rect(q.x + i, q.y - q.ha - 20, 5, 14); P.zebra.rect(q.x + i, q.y + q.ha + 6, 5, 14); }
    });
    G.paths = P; return P;
  }

  function project(x, y, z) { const k = G.camH / (G.camH - z); return [G.cam.x + (x - G.cam.x) * k, G.cam.y + (y - G.cam.y) * k]; }
  const kOf = (z) => G.camH / (G.camH - z);

  function render() {
    const cam = G.cam, z = cam.zoom;
    G.camH = 1500 / z;
    const shx = G.shake ? (Math.random() - 0.5) * G.shake : 0, shy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    const vw = sw / z, vh = sh / z, L = cam.x - vw / 2 - 40, Tp = cam.y - vh / 2 - 40, R = cam.x + vw / 2 + 40, B = cam.y + vh / 2 + 40;
    G.view = { L, T: Tp, R, B };
    // water
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f7fa6'; ctx.fillRect(0, 0, sw, sh);
    const wt = (x, y) => ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (sw / 2 - (cam.x - shx) * z), dpr * (sh / 2 - (cam.y - shy) * z));
    wt();
    ctx.save(); ctx.translate((G.t * 9) % 256, (G.t * 4) % 256); ctx.fillStyle = SPR.patWater; ctx.fillRect(L - 300, Tp - 300, vw + 700, vh + 700); ctx.restore();
    const ip = islandPath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(120,230,230,.18)'; ctx.lineWidth = 150; ctx.stroke(ip);
    ctx.strokeStyle = 'rgba(140,240,235,.35)'; ctx.lineWidth = 60; ctx.stroke(ip);
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + Math.sin(G.t * 1.6) * 0.2})`; ctx.lineWidth = 10 + Math.sin(G.t * 1.6) * 3; ctx.stroke(ip);
    // land
    ctx.fillStyle = SPR.patGround; ctx.fill(ip);
    ctx.save(); ctx.clip(ip);
    ctx.strokeStyle = SPR.patSand; ctx.lineWidth = 70; ctx.stroke(ip);
    ctx.fillStyle = SPR.patSand; ctx.fillRect(world.beachX, 0, 700, world.H);
    ctx.restore();
    world.docks.forEach((d) => { ctx.fillStyle = SPR.patDock; ctx.fillRect(d[0], d[1], d[2], d[3]); ctx.strokeStyle = '#6d6b66'; ctx.lineWidth = 4; ctx.strokeRect(d[0], d[1], d[2], d[3]); });
    // parks / plazas
    ctx.fillStyle = SPR.patGrass; world.parks.forEach((p) => ctx.fillRect(p[0], p[1], p[2], p[3]));
    ctx.fill(new Path2D(pathCircle(world.islands[2])));
    ctx.fillStyle = SPR.patPlaza; world.plazas.forEach((p) => ctx.fillRect(p[0], p[1], p[2], p[3]));
    for (const id in world.landmarks) world.landmarks[id].yard.forEach((y) => ctx.fillRect(y[0], y[1], y[2], y[3]));
    ctx.beginPath(); world.plazaCircles.forEach((c) => { ctx.moveTo(c[0] + c[2], c[1]); ctx.arc(c[0], c[1], c[2], 0, TAU); }); ctx.fill();
    // decals
    drawDecals(L, Tp, R, B);
    // roads
    const P = staticPaths();
    ctx.lineCap = 'square';
    ctx.strokeStyle = '#c4b8a6'; ctx.lineWidth = 104 + 36; ctx.stroke(P.side);
    ctx.strokeStyle = SPR.patRoad;
    world.roads.forEach((s) => { if (isDeck(s.kind) || s.x2 < L - 100 || s.x1 > R + 100 || s.y2 < Tp - 100 || s.y1 > B + 100) return; ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); });
    // decks (bridges / pier)
    ctx.lineCap = 'butt';
    world.roads.forEach((s) => {
      if (!isDeck(s.kind)) return;
      const pier = s.kind === 'pier';
      ctx.strokeStyle = 'rgba(0,20,40,.35)'; ctx.lineWidth = s.w + 10; ctx.beginPath(); ctx.moveTo(s.x1 + 14, s.y1 + 18); ctx.lineTo(s.x2 + 14, s.y2 + 18); ctx.stroke();
      ctx.strokeStyle = pier ? '#a8794f' : '#cfc7bb'; ctx.lineWidth = s.w + 12; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.strokeStyle = pier ? '#8b6040' : SPR.patRoad; ctx.lineWidth = s.w; ctx.stroke();
      if (pier) { ctx.strokeStyle = 'rgba(60,35,20,.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = s.x1; x < s.x2; x += 9) { ctx.moveTo(x, s.y1 - s.w / 2); ctx.lineTo(x, s.y1 + s.w / 2); } ctx.stroke(); }
    });
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffcc33'; ctx.stroke(P.yellow);
    ctx.setLineDash([22, 26]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke(P.white); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill(P.zebra);
    // road text
    world.decals.forEach((d) => { if (d.t !== 'text') return; ctx.save(); ctx.font = `700 ${d.size}px "Passion One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(d.text, d.x, d.y); ctx.restore(); });
    // barricade
    if (!world.frontierOpen) { const b = world.barricade; for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ff6a00'; ctx.fillRect(b.x0, b.y0 + i * 18, b.x1 - b.x0, 18); } }
    // skids
    if (G.skids.length) { ctx.strokeStyle = 'rgba(15,15,20,.35)'; ctx.lineWidth = 4; ctx.beginPath(); G.skids.forEach((s) => { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }); ctx.stroke(); }
    // ramps
    world.ramps.forEach((r) => { ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a); ctx.fillStyle = '#3b3b44'; ctx.fillRect(-r.l / 2, -r.w / 2, r.l, r.w); ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 4; i++) { ctx.beginPath(); const x0 = -r.l / 2 + 8 + i * 15; ctx.moveTo(x0, -r.w / 2 + 6); ctx.lineTo(x0 + 10, 0); ctx.lineTo(x0, r.w / 2 - 6); ctx.lineTo(x0 + 5, r.w / 2 - 6); ctx.lineTo(x0 + 15, 0); ctx.lineTo(x0 + 5, -r.w / 2 + 6); ctx.fill(); } ctx.restore(); });
    // shadows
    const bIdx = world.query('b', L - 500, Tp - 500, R + 500, B + 500, tmp);
    if (G.sun > 0.02) drawShadows(bIdx);
    // cars
    G.npcs.forEach((n) => drawCar(n.spr, n.x, n.y, n.a, 0));
    drawParticles(false);
    drawCar(G.neon ? SPR.playerNeon : SPR.player, G.car.x, G.car.y, G.car.a, G.car.z);
    // night tint for everything drawn so far
    if (G.ambKey !== 'day') { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = G.ambHex; ctx.fillRect(0, 0, sw, sh); ctx.restore(); }
    // ground lights
    ctx.globalCompositeOperation = 'lighter';
    const pIdx = world.query('p', L - 200, Tp - 200, R + 200, B + 200, tmp2);
    if (G.night > 0.05) {
      ctx.globalAlpha = G.night * 0.75;
      pIdx.forEach((i) => { const p = world.props[i]; if (p.t === 'lamp') ctx.drawImage(SPR.warm, p.x - 90, p.y - 90, 180, 180); });
      const lights = (x, y, a, big) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(SPR.cone, 18, -55 * big, 200 * big, 110 * big); ctx.drawImage(SPR.red, -34, -16, 18, 32); ctx.restore(); };
      G.npcs.forEach((n) => lights(n.x, n.y, n.a, 0.8));
      lights(G.car.x, G.car.y, G.car.a, 1);
      ctx.globalAlpha = G.night * 0.6; ctx.drawImage(SPR.pink, G.car.x - 50, G.car.y - 50, 100, 100);
      ctx.globalAlpha = 1;
    }
    MISSIONS.forEach((m) => { if (!markerActive(m)) return; const s = 110 + Math.sin(G.t * 4) * 10; ctx.globalAlpha = 0.55 + G.night * 0.3; ctx.drawImage(SPR.pink, m.mx - s, m.my - s, s * 2, s * 2); });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    MISSIONS.forEach((m) => { if (!markerActive(m)) return; ctx.strokeStyle = m.kind === 'side' ? '#7fd8ff' : '#ff4fb0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(m.mx, m.my, 46 + Math.sin(G.t * 4) * 4, 0, TAU); ctx.stroke(); });
    // tall pass
    tall.length = 0;
    bIdx.forEach((i) => { const b = world.buildings[i]; tall.push({ k: 0, o: b, x: b.cx, y: b.cy }); });
    pIdx.forEach((i) => { const p = world.props[i]; tall.push({ k: 1, o: p, x: p.x, y: p.y }); });
    world.signs.forEach((s) => { if (s.x > L - 300 && s.x < R + 300 && s.y > Tp - 300 && s.y < B + 300) tall.push({ k: 2, o: s, x: s.x, y: s.y + 1 }); });
    MISSIONS.forEach((m) => { if (markerActive(m) && m.mx > L - 200 && m.mx < R + 200 && m.my > Tp - 200 && m.my < B + 200) tall.push({ k: 3, o: m, x: m.mx, y: m.my }); });
    world.packages.forEach((p) => { if (!p.got && p.x > L && p.x < R && p.y > Tp && p.y < B) tall.push({ k: 4, o: p, x: p.x, y: p.y }); });
    const cx = cam.x, cy = cam.y;
    tall.forEach((t) => (t.d = (t.x - cx) * (t.x - cx) + (t.y - cy) * (t.y - cy) - (t.k === 2 ? 1 : 0)));
    tall.sort((a, b) => b.d - a.d);
    for (const t of tall) {
      if (t.k === 0) drawBuilding(t.o); else if (t.k === 1) drawProp(t.o); else if (t.k === 2) drawSign(t.o); else if (t.k === 3) drawMarkerTall(t.o); else drawPackage(t.o);
    }
    drawParticles(true);
    // neon glow
    if (G.night > 0.1) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = G.night * 0.35;
      world.signs.forEach((s) => { if (s.x < L - 200 || s.x > R + 200 || s.y < Tp - 200 || s.y > B + 200) return; const [px, py] = project(s.x, s.y, s.z + 2); const spr = SPR[s.color === '#37e6ff' || s.color === '#7fd8ff' || s.color === '#22c1ff' ? 'cyan' : s.color === '#ffffff' ? 'white' : 'pink']; ctx.drawImage(spr, px - 90, py - 50, 180, 100); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // storm
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.stormNear > 0.02) drawStorm();
    if (G.flash > 0) { ctx.fillStyle = `rgba(230,235,255,${G.flash})`; ctx.fillRect(0, 0, sw, sh); }
    // vignette
    if (!SPR.vig || SPR.vig.width !== sw) { SPR.vig = VC.makeCanvas(sw, sh); const x = SPR.vig.getContext('2d'), g = x.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.35, sw / 2, sh / 2, Math.max(sw, sh) * 0.75); g.addColorStop(0, 'rgba(40,0,60,0)'); g.addColorStop(1, 'rgba(40,0,60,.45)'); x.fillStyle = g; x.fillRect(0, 0, sw, sh); }
    ctx.drawImage(SPR.vig, 0, 0, sw, sh);
  }
  function pathCircle(isl) { let s = ''; isl.pts.forEach((p, i) => (s += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))); return s + 'Z'; }
  function markerActive(m) { if (m.kind === 'final') return world.frontierOpen; return true; }

  function drawDecals(L, Tp, R, B) {
    for (const d of world.decals) {
      if (d.t === 'text') continue;
      const x = d.x, y = d.y;
      if (x > R + 300 || y > B + 300 || x + (d.w || d.r || 0) < L - 300 || y + (d.h || d.r || 0) < Tp - 300) continue;
      switch (d.t) {
        case 'lawn': ctx.fillStyle = SPR.patGrass; ctx.fillRect(x, y, d.w, d.h); break;
        case 'pool': ctx.fillStyle = '#eef6f8'; ctx.fillRect(x - 3, y - 3, d.w + 6, d.h + 6); ctx.fillStyle = '#3fd0e8'; ctx.fillRect(x, y, d.w, d.h); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 2, y + 2, d.w * 0.5, 2); break;
        case 'parking': ctx.fillStyle = '#4a4950'; ctx.fillRect(x, y, d.w, d.h); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); for (let px = x + 8; px < x + d.w - 8; px += 28) { ctx.moveTo(px, y + 6); ctx.lineTo(px, y + 46); ctx.moveTo(px, y + d.h - 6); ctx.lineTo(px, y + d.h - 46); } ctx.stroke(); break;
        case 'towel': ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot); ctx.fillStyle = d.col; ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-d.w / 2, -2, d.w, 4); ctx.restore(); break;
        case 'pad': ctx.fillStyle = '#5b5e66'; ctx.beginPath(); ctx.arc(x, y, d.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 8; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.arc(x, y, d.r - 10, 0, TAU); ctx.stroke(); ctx.setLineDash([]); break;
      }
    }
  }
  function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function drawShadows(bIdx) {
    const h = G.hour % 24, ang = Math.PI * (0.15 + ((h - 6.5) / 12.5) * 0.7), len = 0.35 + (1 - G.sun) * 1.1;
    const sx = -Math.cos(ang) * len, sy = 0.55 * len;
    ctx.fillStyle = `rgba(30,20,60,${0.22 * Math.min(1, G.sun * 3)})`;
    ctx.beginPath();
    bIdx.forEach((i) => {
      const b = world.buildings[i], z = b.maxZ, dx = sx * z, dy = sy * z;
      const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const pts = hull([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + dx, y0 + dy], [x1 + dx, y0 + dy], [x1 + dx, y1 + dy], [x0 + dx, y1 + dy]]);
      ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath();
    });
    ctx.fill();
    G.shadowVec = [sx, sy];
  }
  function drawCar(spr, x, y, a, zz) {
    const s = 1 + zz / 250;
    ctx.fillStyle = 'rgba(10,5,25,.35)'; ctx.save(); ctx.translate(x + 4, y + 5); ctx.rotate(a); rr(ctx, -spr.L / 2, -spr.W / 2, spr.L, spr.W, 6); ctx.fill(); ctx.restore();
    let px = x, py = y;
    if (zz > 0) [px, py] = project(x, y, zz);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.scale(s, s);
    ctx.drawImage(spr.c, -spr.L / 2 - spr.pad, -spr.W / 2 - spr.pad, spr.L + spr.pad * 2, spr.W + spr.pad * 2);
    ctx.restore();
  }

  function drawBuilding(b) {
    const cam = G.cam;
    if (b.shape === 'cyl') {
      const kt = kOf(b.z1), tx = cam.x + (b.cx - cam.x) * kt, ty = cam.y + (b.cy - cam.y) * kt;
      ctx.strokeStyle = tc(VC.shade(b.wall, 0.8)); ctx.lineWidth = b.r * 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.cx, b.cy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.lineCap = 'butt';
      const r = b.r * kt;
      if (b.dome) {
        const g = ctx.createRadialGradient(tx - r * 0.3, ty - r * 0.3, r * 0.1, tx, ty, r);
        g.addColorStop(0, tc('#ffffff')); g.addColorStop(1, tc('#9aa6bd')); ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(G.t * 0.05); ctx.fillStyle = tc('#2b3550'); ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 1.05); ctx.restore();
      } else { ctx.fillStyle = tc(b.roof); ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.fill(); }
      return;
    }
    const nightLit = G.night;
    for (let ti = 0; ti < b.tiers.length; ti++) {
      const t = b.tiers[ti], kb = kOf(t.z0), kt = kOf(t.z1);
      const x0 = t.x, y0 = t.y, x1 = t.x + t.w, y1 = t.y + t.h;
      const P = (x, y, k) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k];
      const b00 = P(x0, y0, kb), b10 = P(x1, y0, kb), b11 = P(x1, y1, kb), b01 = P(x0, y1, kb);
      const t00 = P(x0, y0, kt), t10 = P(x1, y0, kt), t11 = P(x1, y1, kt), t01 = P(x0, y1, kt);
      const walls = [];
      if (cam.y < y0) walls.push([b00, b10, t10, t00, 0.86, x0, y0, x1, y0]);
      if (cam.y > y1) walls.push([b01, b11, t11, t01, 0.62, x0, y1, x1, y1]);
      if (cam.x < x0) walls.push([b00, b01, t01, t00, 1.0, x0, y0, x0, y1]);
      if (cam.x > x1) walls.push([b10, b11, t11, t10, 0.72, x1, y0, x1, y1]);
      for (const w of walls) {
        ctx.fillStyle = tc(VC.shade(t.wall, w[4]));
        ctx.beginPath(); ctx.moveTo(w[0][0], w[0][1]); ctx.lineTo(w[1][0], w[1][1]); ctx.lineTo(w[2][0], w[2][1]); ctx.lineTo(w[3][0], w[3][1]); ctx.closePath(); ctx.fill();
        if (t.win && G.cam.zoom > 0.38) drawWindows(b, t, w, nightLit);
      }
      // roof
      ctx.fillStyle = tc(t.roof);
      ctx.beginPath(); ctx.moveTo(t00[0], t00[1]); ctx.lineTo(t10[0], t10[1]); ctx.lineTo(t11[0], t11[1]); ctx.lineTo(t01[0], t01[1]); ctx.closePath(); ctx.fill();
      if (ti === b.tiers.length - 1) {
        ctx.save(); ctx.translate(cam.x * (1 - kt), cam.y * (1 - kt)); ctx.scale(kt, kt);
        roofDetails(b, t);
        ctx.restore();
      }
    }
  }
  function hash(a, b, c) { let h = (a ^ (b * 374761393) ^ (c * 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function drawWindows(b, t, w, night) {
    const [ax, ay, bx, by] = [w[5], w[6], w[7], w[8]];
    const len = Math.hypot(bx - ax, by - ay), dense = t.win === 2;
    const fh = dense ? 18 : 24, cw = dense ? 13 : 20;
    const floors = Math.floor((t.z1 - t.z0 - 8) / fh), cols = Math.floor((len - 6) / cw);
    if (floors < 1 || cols < 1 || floors * cols > 700) return;
    const cam = G.cam, ux = (bx - ax) / len, uy = (by - ay) / len;
    const lit = new Path2D(), dark = new Path2D();
    const off = (len - cols * cw) / 2;
    for (let f = 0; f < floors; f++) {
      const za = t.z0 + 8 + f * fh, zb = za + fh * (dense ? 0.62 : 0.5), ka = kOf(za), kb = kOf(zb);
      for (let c = 0; c < cols; c++) {
        const u0 = off + c * cw + 2, u1 = u0 + cw * (dense ? 0.7 : 0.55);
        const px0 = ax + ux * u0, py0 = ay + uy * u0, px1 = ax + ux * u1, py1 = ay + uy * u1;
        const isLit = night > 0.15 && hash(b.seed, f * 131 + c, w[4] * 100 | 0) < 0.42 * night;
        const p = isLit ? lit : dark;
        p.moveTo(cam.x + (px0 - cam.x) * ka, cam.y + (py0 - cam.y) * ka); p.lineTo(cam.x + (px1 - cam.x) * ka, cam.y + (py1 - cam.y) * ka);
        p.lineTo(cam.x + (px1 - cam.x) * kb, cam.y + (py1 - cam.y) * kb); p.lineTo(cam.x + (px0 - cam.x) * kb, cam.y + (py0 - cam.y) * kb); p.closePath();
      }
    }
    ctx.fillStyle = tc(dense ? '#a9d6f0' : '#5d6f86'); ctx.globalAlpha = dense ? 0.55 : 0.7; ctx.fill(dark); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffe7a3'; ctx.fill(lit);
  }
  function roofDetails(b, t) {
    const f = t.feat || {};
    if (b.det) for (const d of b.det) {
      switch (d.t) {
        case 'rim': ctx.strokeStyle = tc(VC.shade(t.roof, 0.78)); ctx.lineWidth = 3; ctx.strokeRect(t.x + 3, t.y + 3, t.w - 6, t.h - 6); break;
        case 'ac': ctx.fillStyle = tc('#8f969e'); ctx.fillRect(d.x, d.y, d.w, d.h); ctx.fillStyle = tc('#6b7178'); ctx.fillRect(d.x + 2, d.y + 2, d.w - 4, 3); break;
        case 'pool': ctx.fillStyle = '#41d3ea'; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.strokeStyle = tc('#ffffff'); ctx.lineWidth = 3; ctx.strokeRect(d.x, d.y, d.w, d.h); break;
        case 'heli': ctx.strokeStyle = tc('#ffd23f'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.stroke(); ctx.fillStyle = tc('#ffffff'); ctx.font = `700 ${d.r}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', d.x, d.y + 1); break;
        case 'solar': ctx.fillStyle = tc('#2d4a7a'); for (let x = d.x; x < d.x + d.w - 10; x += 14) ctx.fillRect(x, d.y, 11, d.h); break;
        case 'stripes': ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; ctx.beginPath(); if (t.w > t.h) for (let x = t.x + 6; x < t.x + t.w; x += 7) { ctx.moveTo(x, t.y); ctx.lineTo(x, t.y + t.h); } else for (let y = t.y + 6; y < t.y + t.h; y += 7) { ctx.moveTo(t.x, y); ctx.lineTo(t.x + t.w, y); } ctx.stroke(); break;
        case 'ridge': {
          ctx.fillStyle = tc(VC.shade(t.roof, 0.75));
          if (t.w > t.h) { ctx.fillRect(t.x, t.y + t.h / 2, t.w, t.h / 2); ctx.strokeStyle = tc(VC.shade(t.roof, 0.6)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x, t.y + t.h / 2); ctx.lineTo(t.x + t.w, t.y + t.h / 2); ctx.stroke(); }
          else { ctx.fillRect(t.x + t.w / 2, t.y, t.w / 2, t.h); ctx.strokeStyle = tc(VC.shade(t.roof, 0.6)); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x + t.w / 2, t.y); ctx.lineTo(t.x + t.w / 2, t.y + t.h); ctx.stroke(); }
          break;
        }
      }
    }
    // landmark features
    if (f.fans) { for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { const x = t.x + 50 + i * 60, y = t.y + 60 + j * 80; ctx.fillStyle = tc('#5c6168'); ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill(); ctx.save(); ctx.translate(x, y); ctx.rotate(G.t * 6 + i); ctx.fillStyle = tc('#c9ced4'); for (let k = 0; k < 4; k++) { ctx.rotate(TAU / 4); ctx.fillRect(-3, 0, 6, 19); } ctx.restore(); } }
    if (f.dishes) { [[0.2, 0.3], [0.5, 0.25], [0.8, 0.35]].forEach(([u, v], i) => { const x = t.x + t.w * u, y = t.y + t.h * v; ctx.fillStyle = tc('#ffffff'); ctx.beginPath(); ctx.arc(x, y, 28, 0, TAU); ctx.fill(); ctx.strokeStyle = tc('#9aa8b5'); ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = tc('#9aa8b5'); ctx.beginPath(); ctx.arc(x + 6, y - 6, 6, 0, TAU); ctx.fill(); }); ctx.fillStyle = tc('#8fbf6a'); ctx.fillRect(t.x + 30, t.y + t.h * 0.6, t.w - 60, t.h * 0.3); }
    if (f.heli) { ctx.strokeStyle = tc('#ffd23f'); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 45, 0, TAU); ctx.stroke(); ctx.fillStyle = tc('#fff'); ctx.font = '700 50px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', t.x + t.w / 2, t.y + t.h / 2 + 2); }
    if (f.pool) { ctx.fillStyle = '#41d3ea'; ctx.fillRect(t.x + 30, t.y + t.h - 70, t.w - 60, 40); }
    if (f.ticker) {
      ctx.save(); ctx.beginPath(); ctx.rect(t.x, t.y + t.h - 22, t.w, 18); ctx.clip();
      ctx.fillStyle = '#05140f'; ctx.fillRect(t.x, t.y + t.h - 22, t.w, 18);
      ctx.fillStyle = '#2ee6a6'; ctx.font = '700 15px "Passion One", monospace'; ctx.textBaseline = 'middle';
      const msg = 'AXI ▲ 3 HRS → 15 MIN ▲ INTENT ACC +30% ▲ CSAT +25% ▲ RETENTION ROI +33% ▲ USD 330K SAVED ▲ ';
      const wdt = ctx.measureText(msg).width, off = (G.t * 40) % wdt;
      ctx.fillText(msg + msg + msg, t.x - off, t.y + t.h - 13); ctx.restore();
    }
    if (f.invader) { const px = 9, map = ['..x.....x..', '...x...x...', '..xxxxxxx..', '.xx.xxx.xx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', 'x.x.....x.x', '...xx.xx...']; ctx.fillStyle = (Math.floor(G.t * 2) % 2) ? '#7cff6b' : '#b86bff'; map.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'x') ctx.fillRect(t.x + 75 + c * px, t.y + 60 + r * px, px - 1, px - 1); })); }
    if (f.heptagon) {
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2 + 20, r = 42;
      ctx.strokeStyle = 'rgba(55,230,255,.5)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let ring = 1; ring <= 3; ring++) for (let i = 0; i <= 7; i++) { const a = (i / 7) * TAU - Math.PI / 2, rr2 = (r * ring) / 3; i ? ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2) : ctx.moveTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
      ctx.stroke();
      const vals = [0.9, 0.75, 0.85, 0.6, 0.8, 0.7, 0.88]; ctx.fillStyle = 'rgba(55,230,255,.45)'; ctx.strokeStyle = '#37e6ff'; ctx.beginPath();
      vals.forEach((v, i) => { const a = (i / 7) * TAU - Math.PI / 2, rr2 = r * v * (0.9 + Math.sin(G.t * 2 + i) * 0.1); i ? ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2) : ctx.moveTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (f.heart) { const cx = t.x + t.w / 2, cy = t.y + t.h / 2 + 30, s = 3 + Math.sin(G.t * 3) * 0.3; ctx.fillStyle = '#ff6b8b'; ctx.beginPath(); ctx.moveTo(cx, cy + 10 * s); ctx.bezierCurveTo(cx - 16 * s, cy - 2 * s, cx - 8 * s, cy - 12 * s, cx, cy - 5 * s); ctx.bezierCurveTo(cx + 8 * s, cy - 12 * s, cx + 16 * s, cy - 2 * s, cx, cy + 10 * s); ctx.fill(); }
    if (f.awning) { const cols = ['#ff4fb0', '#ffd23f', '#37e6ff', '#2ee6a6']; for (let i = 0; i < 10; i++) { ctx.fillStyle = tc(cols[i % 4]); ctx.fillRect(t.x + i * (t.w / 10), t.y + t.h - 14, t.w / 10, 14); } }
  }
  function drawSign(s) {
    const spr = signSprite(s.text, s.color, s.big), k = kOf(s.z + 3), [px, py] = project(s.x, s.y, s.z + 3);
    const scale = s.big ? 1 : 0.9;
    ctx.drawImage(spr.c, px - (spr.w * k * scale) / 2, py - (spr.h * k * scale) / 2, spr.w * k * scale, spr.h * k * scale);
  }
  function drawProp(p) {
    const cam = G.cam;
    switch (p.t) {
      case 'palm': {
        const [tx, ty] = project(p.x, p.y, p.z), k = kOf(p.z);
        if (G.sun > 0.05 && G.shadowVec) { ctx.globalAlpha = 0.18 * Math.min(1, G.sun * 3); ctx.fillStyle = '#1e1440'; ctx.beginPath(); ctx.ellipse(p.x + G.shadowVec[0] * p.z, p.y + G.shadowVec[1] * p.z, 34, 26, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.strokeStyle = tc('#8a6a44'); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(lerp(p.x, tx, 0.5) + 6, lerp(p.y, ty, 0.5), tx, ty); ctx.stroke(); ctx.lineCap = 'butt';
        const spr = tinted(SPR.palms[p.v], 'palm' + p.v), s = 104 * k * 0.9;
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(p.rot + Math.sin(G.t * 1.3 + p.x) * 0.05); ctx.drawImage(spr, -s / 2, -s / 2, s, s); ctx.restore();
        break;
      }
      case 'tree': { const [tx, ty] = project(p.x, p.y, p.z), k = kOf(p.z); ctx.fillStyle = tc(VC.shade(p.col, 0.8)); ctx.beginPath(); ctx.arc(tx, ty, p.r * k, 0, TAU); ctx.fill(); ctx.fillStyle = tc(p.col); ctx.beginPath(); ctx.arc(tx - p.r * 0.25 * k, ty - p.r * 0.25 * k, p.r * 0.7 * k, 0, TAU); ctx.fill(); break; }
      case 'lamp': {
        const [tx, ty] = project(p.x, p.y, p.z);
        ctx.strokeStyle = tc('#4a4a55'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = G.night > 0.2 ? '#fff2c0' : tc('#9a9aa6'); ctx.beginPath(); ctx.arc(tx, ty, 4, 0, TAU); ctx.fill();
        break;
      }
      case 'umbrella': { const [tx, ty] = project(p.x, p.y, p.z), r = 20 * kOf(p.z); for (let i = 0; i < 8; i++) { ctx.fillStyle = tc(i % 2 ? '#ffffff' : p.col); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.arc(tx, ty, r, p.rot + (i / 8) * TAU, p.rot + ((i + 1) / 8) * TAU); ctx.fill(); } break; }
      case 'carousel': { const [tx, ty] = project(p.x, p.y, p.z), r = p.r * kOf(p.z); for (let i = 0; i < 12; i++) { ctx.fillStyle = tc(i % 2 ? '#ffd23f' : '#ff4fb0'); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.arc(tx, ty, r, G.t * 0.8 + (i / 12) * TAU, G.t * 0.8 + ((i + 1) / 12) * TAU); ctx.fill(); } ctx.fillStyle = tc('#ffffff'); ctx.beginPath(); ctx.arc(tx, ty, r * 0.2, 0, TAU); ctx.fill(); break; }
      case 'crane': {
        const legs = [[-40, -40], [40, -40], [40, 40], [-40, 40]], top = legs.map(([a, b]) => project(p.x + a, p.y + b, p.z));
        ctx.strokeStyle = tc('#e8a33a'); ctx.lineWidth = 6;
        legs.forEach(([a, b], i) => { ctx.beginPath(); ctx.moveTo(p.x + a, p.y + b); ctx.lineTo(top[i][0], top[i][1]); ctx.stroke(); });
        const boomEnd = project(p.x - 230, p.y, p.z + 10), boomBack = project(p.x + 90, p.y, p.z + 10);
        ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(boomBack[0], boomBack[1]); ctx.lineTo(boomEnd[0], boomEnd[1]); ctx.stroke();
        ctx.fillStyle = tc('#c4822a'); ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); top.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.closePath(); ctx.fill();
        break;
      }
      case 'rocket': {
        const lz = p.launch, z0 = lz, z1 = lz + p.z;
        if (z1 > G.camH * 0.8) break;
        const [bx, by] = project(p.x, p.y, z0), [tx, ty] = project(p.x, p.y, z1), k = kOf(z1);
        if (lz > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SPR.warm, bx - 70, by - 70, 140, 140); ctx.globalCompositeOperation = 'source-over'; }
        ctx.strokeStyle = tc('#e8ecf2'); ctx.lineWidth = 34; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = tc('#ff4fb0'); [0, 1, 2, 3].forEach((i) => { const a = (i / 4) * TAU + 0.78; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 34, by + Math.sin(a) * 34); ctx.lineTo(bx + Math.cos(a + 0.3) * 20, by + Math.sin(a + 0.3) * 20); ctx.fill(); });
        ctx.fillStyle = tc('#ffffff'); ctx.beginPath(); ctx.arc(tx, ty, 17 * k, 0, TAU); ctx.fill(); ctx.fillStyle = tc('#37e6ff'); ctx.beginPath(); ctx.arc(tx, ty, 8 * k, 0, TAU); ctx.fill();
        if (!lz) { ctx.strokeStyle = tc('#9aa0a8'); ctx.lineWidth = 5; const g0 = [p.x + 60, p.y], gt = project(p.x + 60, p.y, p.z + 20); ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(gt[0], gt[1]); ctx.stroke(); }
        break;
      }
    }
  }
  function drawMarkerTall(m) {
    const bob = Math.sin(G.t * 3) * 8, z = 95 + bob, [tx, ty] = project(m.mx, m.my, z), k = kOf(z);
    const col = m.kind === 'side' ? '#7fd8ff' : m.kind === 'final' ? '#ffffff' : '#ff4fb0';
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(m.mx, m.my, tx, ty); g.addColorStop(0, VC.rgba(col, 0.45)); g.addColorStop(1, VC.rgba(col, 0));
    ctx.strokeStyle = g; ctx.lineWidth = 56; ctx.beginPath(); ctx.moveTo(m.mx, m.my); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(tx, ty); ctx.scale(k * Math.abs(Math.cos(G.t * 2)) + 0.15, k); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = col; ctx.strokeStyle = '#2a0018'; ctx.lineWidth = 3; ctx.fillRect(-11, -11, 22, 22); ctx.strokeRect(-11, -11, 22, 22); ctx.restore();
    ctx.save(); ctx.translate(tx, ty - 26 * k); ctx.font = `900 ${22 * k}px "Passion One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#1a0010'; ctx.strokeText(m.letter, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(m.letter, 0, 0); ctx.restore();
  }
  function drawPackage(p) {
    const z = 16 + Math.sin(G.t * 3 + p.i) * 4, [tx, ty] = project(p.x, p.y, z);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(SPR.cyan, p.x - 40, p.y - 40, 80, 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(G.t * 1.5 + p.i); ctx.fillStyle = '#c89a5a'; ctx.fillRect(-10, -10, 20, 20); ctx.fillStyle = '#7a5530'; ctx.fillRect(-10, -2, 20, 4); ctx.fillRect(-2, -10, 4, 20); ctx.restore();
  }
  // particles
  function spawnPart(x, y, o) { if (G.parts.length > 400) G.parts.shift(); G.parts.push({ x, y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1, size: o.size || 8, col: o.col || '#ffffff', add: !!o.add, grow: o.grow || 0 }); }
  function updateParts(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life -= dt; if (p.life <= 0) { G.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.vz) p.vz -= 400 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; }
      p.size += p.grow * dt; p.vx *= 0.97; p.vy *= 0.97;
    }
  }
  function drawParticles(add) {
    for (const p of G.parts) {
      if (p.add !== add) continue;
      const a = clamp(p.life / p.max, 0, 1);
      let x = p.x, y = p.y; if (p.z > 0) [x, y] = project(p.x, p.y, p.z);
      if (add) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(SPR.warm, x - p.size, y - p.size, p.size * 2, p.size * 2); }
      else { ctx.globalAlpha = a * 0.6; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(x, y, p.size, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  const rain = Array.from({ length: 220 }, () => [Math.random(), Math.random(), Math.random()]);
  function drawStorm() {
    const s = G.stormNear;
    ctx.fillStyle = `rgba(20,25,45,${s * 0.25})`; ctx.fillRect(0, 0, sw, sh);
    ctx.strokeStyle = `rgba(200,215,255,${0.35 * s})`; ctx.lineWidth = 1.3; ctx.beginPath();
    const n = Math.floor(rain.length * s);
    for (let i = 0; i < n; i++) { const r = rain[i], x = ((r[0] * sw + G.t * 120) % sw), y = ((r[1] * sh + G.t * (700 + r[2] * 300)) % sh); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); }
    ctx.stroke();
  }

  // --------------------------------------------------------------- physics
  const MAXV = 560, ACC = 400, BRAKE = 950, REV = 220, MAXREV = 190;
  const SURF = { [T.SAND]: [4.5, 0.62], [T.PARK]: [6, 0.78], [T.GROUND]: [7.5, 0.9] };
  function stepCar(dt) {
    const c = G.car, inp = G.input;
    const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = -fy, ry = fx;
    let vf = c.vx * fx + c.vy * fy, vl = c.vx * rx + c.vy * ry;
    c.steer += clamp(inp.steer - c.steer, -dt * 7, dt * 7);
    if (c.z > 0) { // airborne
      c.vz -= 900 * dt; c.z += c.vz * dt; c.a += c.av * dt; c.av *= 0.98; c.air += dt;
      if (c.z <= 0) land();
    } else {
      const cell = world.cellAt(c.x, c.y), sf = SURF[cell] || [9, 1], maxV = MAXV * sf[1];
      const th = inp.throttle;
      if (th > 0) { if (vf < -10) vf += BRAKE * dt * th; else vf += ACC * th * (1 - Math.pow(clamp(vf / maxV, 0, 1), 2)) * dt; }
      else if (th < 0) { if (vf > 10) vf += th * BRAKE * dt; else vf += th * REV * (1 - clamp(-vf / MAXREV, 0, 1)) * dt; }
      else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 60 * dt);
      vf -= vf * 0.12 * dt;
      if (vf > maxV) vf -= (vf - maxV) * 2.5 * dt;
      if (inp.hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 280 * dt);
      vl *= Math.exp(-(inp.hb ? 1.5 : sf[0]) * dt);
      const sp = Math.abs(vf), turn = 2.7 * (1 - 0.4 * clamp(sp / MAXV, 0, 1)) * (inp.hb ? 1.35 : 1);
      c.av = c.steer * turn * clamp(sp / 110, 0, 1) * (vf < 0 ? -1 : 1);
      c.a += c.av * dt;
      c.slip = Math.abs(vl);
      if (c.slip > 110 && sp > 80) {
        const back = [[-15, -8], [-15, 8]].map(([a, b]) => [c.x + fx * a + rx * b, c.y + fy * a + ry * b]);
        if (c.lastBack) back.forEach((p, i) => { G.skids.push([c.lastBack[i][0], c.lastBack[i][1], p[0], p[1]]); });
        c.lastBack = back; if (G.skids.length > 900) G.skids.splice(0, 40);
        if (Math.random() < 0.3) spawnPart(back[0][0], back[0][1], { size: 7, grow: 30, life: 0.8, col: '#e0dce8' });
      } else c.lastBack = null;
      if ((cell === T.SAND || cell === T.PARK) && sp > 200 && Math.random() < 0.4) spawnPart(c.x - fx * 20, c.y - fy * 20, { size: 6, grow: 24, life: 0.7, col: cell === T.SAND ? '#e8cf96' : '#7fb26a' });
      // ramps
      for (const r of world.ramps) {
        const dx = c.x - r.x, dy = c.y - r.y, ca = Math.cos(r.a), sa = Math.sin(r.a), u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (Math.abs(u) < r.l / 2 && Math.abs(v) < r.w / 2 && vf > 260 && Math.cos(c.a - r.a) > 0.6) { c.z = 1; c.vz = vf * 0.55; c.air = 0; c.ramp = r; c.av *= 0.3; break; }
      }
    }
    c.vx = fx * vf + rx * vl; c.vy = fy * vf + ry * vl;
    const ox = c.x, oy = c.y;
    c.x += c.vx * dt; c.y += c.vy * dt;
    collide(c);
    G.stats.dist += Math.hypot(c.x - ox, c.y - oy);
    const cell = world.cellAt(c.x, c.y);
    if (c.z <= 0 && (cell === T.ROAD || cell === T.BRIDGE) && (!c.lastSafe || G.t - c.lastSafe[3] > 0.5)) c.lastSafe = [c.x, c.y, c.a, G.t];
  }
  function land() {
    const c = G.car;
    c.z = 0; const air = c.air; c.vz = 0;
    if (world.cellAt(c.x, c.y) === T.WATER) { splash(); return; }
    G.shake = 12; A.sfx('crash', 0.5);
    for (let i = 0; i < 12; i++) spawnPart(c.x, c.y, { vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, size: 8, grow: 30, life: 0.8, col: '#ddd6c8' });
    if (air > 0.45 && c.ramp) {
      const first = !G.stunts.has(c.ramp.name); G.stunts.add(c.ramp.name);
      bigText(air > 0.7 ? 'INSANE STUNT BONUS!' : 'UNIQUE STUNT BONUS!', `${c.ramp.name} · ${air.toFixed(2)}s airtime${first ? '' : ' · again'}`, '#ffd23f', 2.2);
      A.sfx('stunt'); save();
    }
    c.ramp = null;
  }
  function splash() {
    const c = G.car; G.stats.splash++;
    A.sfx('splash');
    for (let i = 0; i < 30; i++) spawnPart(c.x, c.y, { vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, vz: 150 + Math.random() * 200, size: 5, life: 1, col: '#e6fbff' });
    G.state = 'splash'; c.vx = c.vy = 0;
    bigText('SPLASH!', "Richie can't swim. Nobody in this city can.", '#37e6ff', 2.2);
    setTimeout(() => fade(() => { const s = c.lastSafe || [MISSIONS[0].spawn[0], MISSIONS[0].spawn[1], MISSIONS[0].spawn[2]]; c.x = s[0]; c.y = s[1]; c.a = s[2]; c.vx = c.vy = c.z = 0; G.cam.x = c.x; G.cam.y = c.y; G.state = 'play'; save(); }), 1600);
  }
  const qa = [], qb = [];
  function collide(c) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a), R = 11;
    const pts = [[c.x + fx * 11, c.y + fy * 11], [c.x - fx * 11, c.y - fy * 11]];
    let hit = 0;
    for (let iter = 0; iter < 2; iter++) for (let pi = 0; pi < 2; pi++) {
      const p = [c.x + (pi ? -fx : fx) * 11, c.y + (pi ? -fy : fy) * 11];
      let px = 0, py = 0;
      const push = (nx, ny, d) => { px += nx * d; py += ny * d; };
      const box = (x0, y0, x1, y1) => {
        const qx = clamp(p[0], x0, x1), qy = clamp(p[1], y0, y1), dx = p[0] - qx, dy = p[1] - qy, d2 = dx * dx + dy * dy;
        if (d2 >= R * R) return;
        if (d2 > 0.0001) { const d = Math.sqrt(d2); push(dx / d, dy / d, R - d); }
        else { const l = p[0] - x0, r = x1 - p[0], t = p[1] - y0, b = y1 - p[1], m = Math.min(l, r, t, b); if (m === l) push(-1, 0, l + R); else if (m === r) push(1, 0, r + R); else if (m === t) push(0, -1, t + R); else push(0, 1, b + R); }
      };
      world.query('s', p[0] - R, p[1] - R, p[0] + R, p[1] + R, qa).forEach((i) => { const s = world.solids[i]; if (c.z < s.h) box(s.x0, s.y0, s.x1, s.y1); });
      world.query('c', p[0] - R, p[1] - R, p[0] + R, p[1] + R, qb).forEach((i) => { const o = world.circles[i]; if (c.z >= o.h) return; const dx = p[0] - o.x, dy = p[1] - o.y, d = Math.hypot(dx, dy), m = R + o.r; if (d < m && d > 0.01) push(dx / d, dy / d, m - d); });
      if (!world.frontierOpen) { const b = world.barricade; box(b.x0, b.y0, b.x1, b.y1); }
      if (c.z <= 0) {
        const C = world.CELL;
        for (let gy = Math.floor((p[1] - R) / C); gy <= Math.floor((p[1] + R) / C); gy++) for (let gx = Math.floor((p[0] - R) / C); gx <= Math.floor((p[0] + R) / C); gx++) {
          if (world.cellAt(gx * C + 1, gy * C + 1) === T.WATER) box(gx * C, gy * C, gx * C + C, gy * C + C);
        }
      }
      G.npcs.forEach((n) => { const dx = p[0] - n.x, dy = p[1] - n.y, d = Math.hypot(dx, dy); if (d < 24 && d > 0.01) { push(dx / d, dy / d, (24 - d) * 0.6); n.bumped = 3; n.vx = (n.vx || 0) - (dx / d) * 80; n.vy = (n.vy || 0) - (dy / d) * 80; } });
      if (px || py) {
        c.x += px; c.y += py; const d = Math.hypot(px, py), nx = px / d, ny = py / d, vn = c.vx * nx + c.vy * ny;
        if (vn < 0) { c.vx -= 1.3 * vn * nx; c.vy -= 1.3 * vn * ny; c.vx *= 0.92; c.vy *= 0.92; hit = Math.max(hit, -vn); }
      }
    }
    if (hit > 120 && G.t - (G.lastCrash || 0) > 0.25) { G.lastCrash = G.t; A.sfx('crash', clamp(hit / 500, 0.2, 1)); G.shake = clamp(hit / 40, 2, 10); for (let i = 0; i < 6; i++) spawnPart(c.x + Math.cos(c.a) * 20, c.y + Math.sin(c.a) * 20, { vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, size: 3, life: 0.4, add: true }); }
  }

  // ---------------------------------------------------------------- traffic
  function spawnNPC() {
    const E = world.graph.edges, c = G.car;
    for (let tries = 0; tries < 20; tries++) {
      const e = E[Math.floor(Math.random() * E.length)];
      if (e.closed) continue;
      const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2, d = Math.hypot(mx - c.x, my - c.y);
      if (d < 900 || d > 2000) continue;
      const fwd = Math.random() < 0.5, n = { e, from: fwd ? e.a : e.b, to: fwd ? e.b : e.a, s: Math.random() * 0.6 + 0.2, v: 0, cruise: 150 + Math.random() * 90, spr: SPR.npc[Math.floor(Math.random() * SPR.npc.length)], bumped: 0 };
      placeNPC(n); G.npcs.push(n); return;
    }
  }
  function placeNPC(n) {
    const dx = n.to.x - n.from.x, dy = n.to.y - n.from.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, off = n.e.w / 4;
    n.len = len; n.x = n.from.x + dx * n.s - uy * off; n.y = n.from.y + dy * n.s + ux * off;
    const ta = Math.atan2(uy, ux); n.a = n.a === undefined ? ta : n.a + VC.angleDiff(n.a, ta) * 0.25;
  }
  function updateTraffic(dt) {
    const target = sw * sh < 500000 ? 14 : 26;
    if (G.npcs.length < target && Math.random() < 0.3) spawnNPC();
    const c = G.car;
    for (let i = G.npcs.length - 1; i >= 0; i--) {
      const n = G.npcs[i];
      if (Math.hypot(n.x - c.x, n.y - c.y) > 2600) { G.npcs.splice(i, 1); continue; }
      if (n.bumped > 0) { n.bumped -= dt; n.x += (n.vx || 0) * dt; n.y += (n.vy || 0) * dt; n.vx *= 0.9; n.vy *= 0.9; if (n.bumped <= 0) { n.vx = n.vy = 0; n.stuck = true; } continue; }
      if (n.stuck) continue;
      // look ahead
      const fx = Math.cos(n.a), fy = Math.sin(n.a);
      let block = 999;
      const check = (x, y) => { const dx = x - n.x, dy = y - n.y, f = dx * fx + dy * fy, l = Math.abs(-dx * fy + dy * fx); if (f > 0 && f < block && l < 20) block = f; };
      check(c.x, c.y); G.npcs.forEach((o) => o !== n && check(o.x, o.y));
      const endSlow = (1 - n.s) * n.len < 60 ? 110 : n.cruise;
      const tv = block < 45 ? 0 : block < 110 ? Math.min(endSlow, (block - 45) * 2) : endSlow;
      n.v += clamp(tv - n.v, -500 * dt, 180 * dt);
      n.s += (n.v * dt) / n.len;
      if (n.s >= 1) {
        const opts = n.to.e.filter((e) => e !== n.e && !e.closed);
        if (!opts.length) { G.npcs.splice(i, 1); continue; }
        const e = opts[Math.floor(Math.random() * opts.length)];
        n.from = n.to; n.to = e.a === n.from ? e.b : e.a; n.e = e; n.s = 0;
      }
      placeNPC(n);
    }
  }

  // --------------------------------------------------------------- missions
  function checkTriggers() {
    const c = G.car;
    for (const m of MISSIONS) {
      if (!markerActive(m)) continue;
      if (Math.hypot(c.x - m.mx, c.y - m.my) < 55 && c.z <= 0) {
        if (G.lastMission === m.id && G.t - G.lastMissionT < 4) continue;
        startMission(m); return;
      }
    }
    if (G.lastMission && G.t - G.lastMissionT > 4) { const m = MISSIONS.find((q) => q.id === G.lastMission); if (m && Math.hypot(c.x - m.mx, c.y - m.my) > 90) G.lastMission = null; }
    for (const p of world.packages) {
      if (p.got) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < 36) {
        p.got = true; G.pkgs.add(p.i); A.sfx('pickup');
        toast(`HIDDEN PACKAGE ${G.pkgs.size}/${world.packages.length}`, D.packages[p.i]);
        if (G.pkgs.size === world.packages.length) { G.neon = true; setTimeout(() => pager(D.pagers.allPackages), 1500); }
        updateHUD(); save();
      }
    }
  }
  function startMission(m) {
    G.state = 'cut'; G.current = m; G.lastMission = m.id; G.lastMissionT = G.t;
    const L = world.landmarks[m.id];
    const part = L.parts[0];
    const fx = part ? (part.shape === 'cyl' ? part.x : part.x + part.w / 2) : m.mx, fy = part ? (part.shape === 'cyl' ? part.y : part.y + part.h / 2) : m.my;
    G.cut = { t: 0, x: lerp(m.mx, fx, 0.5), y: lerp(m.my, fy, 0.5), zoom: Math.min(1.25, baseZoom() * 1.35) };
    document.body.classList.add('cinematic'); A.duck(true);
    bigText(m.title, m.company, m.color, 1.6, 'title');
    if (m.id === 'frontier') launchRocket();
    setTimeout(() => showCard(m), m.id === 'frontier' ? 4200 : 1500);
  }
  function launchRocket() {
    const r = world.props.find((p) => p.t === 'rocket');
    A.sfx('rocket'); G.rocket = r; G.cut.x = r.x - 80; G.cut.y = r.y;
  }
  function showCard(m) {
    G.state = 'card';
    const first = !G.visited.has(m.id);
    const el = $('#card');
    const intel = m.intel.map((s) => `<li>${VC.richText(s)}</li>`).join('');
    const extra = (m.quote ? `<blockquote>“${VC.richText(m.quote.text)}”<cite>— ${VC.richText(m.quote.by)}</cite></blockquote>` : '') + (m.motto ? `<div class="motto">${VC.richText(m.motto)}</div>` : '');
    const links = m.kind === 'final' ? `<p class="cta">${VC.richText(D.finale.cta)}</p><div class="links">${D.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}</div>` : '';
    el.innerHTML = `<div class="card-inner" style="--c:${m.color}">
      <div class="card-layer">${VC.richText(m.layer)}</div>
      <h2 class="card-title">${VC.richText(m.title)}</h2>
      <div class="card-role"><b>${VC.richText(m.company)}</b> · ${VC.richText(m.role)}</div>
      <div class="card-meta">${VC.richText([m.dates, m.place].filter(Boolean).join(' · '))}</div>
      <p class="card-intro">${VC.richText(m.intro)}</p>
      <ul class="card-intel">${intel}</ul>${extra}
      ${m.skills ? `<div class="chips">${m.skills.map((s) => `<span>${VC.richText(s)}</span>`).join('')}</div>` : ''}
      ${links}
      <button class="btn primary" id="card-ok">${first ? 'Mission complete ▸' : 'Back to the drive ▸'}</button>
    </div>`;
    el.classList.add('show');
    $('#card-ok').onclick = () => closeCard(m, first);
    $('#card-ok').focus({ preventScroll: true });
  }
  function closeCard(m, first) {
    $('#card').classList.remove('show');
    document.body.classList.remove('cinematic'); A.duck(false);
    G.state = 'play'; G.cut = null; G.current = null; G.lastMissionT = G.t;
    if (first) {
      G.visited.add(m.id);
      A.sfx('passed');
      bigText(m.kind === 'final' ? 'ALL CHAPTERS COMPLETE!' : 'MISSION PASSED!', m.reward, '#ff4fb0', 3);
      updateHUD(true); save();
      if (m.kind === 'main' && mainDone() === mainMissions().length && !world.frontierOpen) setTimeout(openFrontier, 3200);
      else if (m.kind === 'main' && m.pager) setTimeout(() => pager(m.pager), 3400);
      if (m.kind === 'final') setTimeout(() => showCredits(), 3500);
    }
  }
  function openFrontier() {
    world.frontierOpen = true; world.graph.edges.forEach((e) => (e.closed = false));
    save();
    G.state = 'cut'; document.body.classList.add('cinematic');
    G.cut = { t: 0, x: 7500, y: 3300, zoom: baseZoom() * 0.9 };
    A.sfx('thunder');
    bigText('THE STORM HAS PASSED', 'Bridge to Frontier Island is now open', '#ffffff', 3);
    setTimeout(() => { document.body.classList.remove('cinematic'); G.cut = null; G.state = 'play'; pager(D.pagers.bridgeOpen); }, 3600);
  }
  function showCredits() {
    const s = G.stats;
    toast('100% COMPLETE', `Distance ${(s.dist / 10000).toFixed(1)} km · top speed ${Math.round(s.top)} mph · splashes ${s.splash} · packages ${G.pkgs.size}/12. Thanks for driving.`, 9000);
  }

  // -------------------------------------------------------------------- HUD
  let radarCtx, mapImg;
  function buildMap() {
    const S = 0.12, c = VC.makeCanvas(world.W * S, world.H * S), x = c.getContext('2d');
    x.scale(S, S); x.fillStyle = '#0b5a7a'; x.fillRect(0, 0, world.W, world.H);
    x.fillStyle = '#cdbfa9'; x.fill(islandPath());
    x.save(); x.clip(islandPath()); x.fillStyle = '#f0d49c'; x.fillRect(world.beachX, 0, 800, world.H); x.restore();
    world.docks.forEach((d) => { x.fillStyle = '#9c9a94'; x.fillRect(d[0], d[1], d[2], d[3]); });
    x.fillStyle = '#5da853'; world.parks.forEach((p) => x.fillRect(p[0], p[1], p[2], p[3])); x.fill(new Path2D(pathCircle(world.islands[2])));
    x.fillStyle = '#9b8f7f'; world.buildings.forEach((b) => x.fillRect(b.x, b.y, b.w, b.h));
    x.strokeStyle = '#f7f1e6'; x.lineCap = 'square'; world.roads.forEach((s) => { x.lineWidth = s.w * 0.9; x.beginPath(); x.moveTo(s.x1, s.y1); x.lineTo(s.x2, s.y2); x.stroke(); });
    mapImg = c; mapImg.S = S;
  }
  function drawRadar() {
    const cv = $('#radar'), size = cv.clientWidth, d = Math.min(2, dpr);
    if (cv.width !== size * d) { cv.width = size * d; cv.height = size * d; }
    const x = radarCtx, c = G.car, sp = Math.hypot(c.vx, c.vy);
    const range = 1300 + sp * 1.2, s = size / (range * 2);
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, size, size);
    x.save(); x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 3, 0, TAU); x.clip();
    x.fillStyle = '#0b5a7a'; x.fillRect(0, 0, size, size);
    const S = mapImg.S;
    x.drawImage(mapImg, (c.x - range) * S, (c.y - range) * S, range * 2 * S, range * 2 * S, 0, 0, size, size);
    const toR = (wx, wy) => [size / 2 + (wx - c.x) * s, size / 2 + (wy - c.y) * s];
    const nm = nextMission();
    MISSIONS.forEach((m) => {
      if (!markerActive(m)) return;
      let [rx, ry] = toR(m.mx, m.my); const dx = rx - size / 2, dy = ry - size / 2, dd = Math.hypot(dx, dy), maxd = size / 2 - 12;
      if (dd > maxd) { rx = size / 2 + (dx / dd) * maxd; ry = size / 2 + (dy / dd) * maxd; }
      const flash = m === nm && Math.floor(G.t * 3) % 2;
      x.fillStyle = G.visited.has(m.id) ? '#6f6f80' : flash ? '#ffffff' : m.color;
      x.fillRect(rx - 8, ry - 8, 16, 16); x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(rx - 8, ry - 8, 16, 16);
      x.fillStyle = '#000'; x.font = '900 12px "Passion One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(m.letter, rx, ry + 1);
    });
    x.restore();
    x.strokeStyle = '#111'; x.lineWidth = 5; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 3, 0, TAU); x.stroke();
    x.strokeStyle = '#ff4fb0'; x.lineWidth = 2; x.stroke();
    x.save(); x.translate(size / 2, size / 2); x.rotate(c.a); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(9, 0); x.lineTo(-6, -6); x.lineTo(-3, 0); x.lineTo(-6, 6); x.closePath(); x.fill(); x.stroke(); x.restore();
    x.fillStyle = '#fff'; x.font = '900 13px "Passion One", sans-serif'; x.textAlign = 'center'; x.fillText('N', size / 2, 12);
  }
  function updateHUD(flash) {
    const done = mainDone(), total = mainMissions().length, stars = Math.round((done / total) * 6);
    $('#stars').innerHTML = Array.from({ length: 6 }, (_, i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
    if (flash) { $('#stars').classList.remove('flash'); void $('#stars').offsetWidth; $('#stars').classList.add('flash'); }
    $('#chapters').textContent = `CHAPTERS ${done}/${total}`;
    $('#pkgs').textContent = `PACKAGES ${G.pkgs.size}/${world.packages.length}`;
  }
  let btTimer = 0;
  function bigText(title, sub, color, dur, cls) {
    const el = $('#big'); el.className = 'show ' + (cls || '');
    el.innerHTML = `<div class="big-title" style="color:${color}">${VC.richText(title)}</div>${sub ? `<div class="big-sub">${VC.richText(sub)}</div>` : ''}`;
    clearTimeout(btTimer); btTimer = setTimeout(() => (el.className = ''), dur * 1000);
  }
  let toastT = 0;
  function toast(title, body, ms) { const el = $('#toast'); el.innerHTML = `<b>${VC.richText(title)}</b><span>${VC.richText(body)}</span>`; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms || 4500); }
  let pagerT = 0;
  function pager(msg) { if (!msg) return; const el = $('#pager'); el.querySelector('.lcd').textContent = msg; el.classList.add('show'); A.sfx('pager'); clearTimeout(pagerT); pagerT = setTimeout(() => el.classList.remove('show'), 7000); }
  let helpT = 0;
  function help(msg, ms) { const el = $('#help'); el.innerHTML = msg; el.classList.add('show'); clearTimeout(helpT); helpT = setTimeout(() => el.classList.remove('show'), ms || 6000); }
  let stationT = 0;
  function showStation(st, song) {
    const el = $('#station');
    el.innerHTML = st ? `<div class="st-name" style="color:${st.color}">${st.name}</div><div class="st-tag">${song ? `♪ ${VC.richText(song.title)} — ${VC.richText(song.artist)}` : VC.richText(st.tag)}</div>` : '<div class="st-name" style="color:#aaa">Radio Off</div>';
    el.classList.add('show'); clearTimeout(stationT); stationT = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function fade(mid) { const f = $('#fade'); f.classList.add('show'); setTimeout(() => { mid(); setTimeout(() => f.classList.remove('show'), 150); }, 450); }

  // ------------------------------------------------------------------ input
  const keys = {};
  const touch = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, hb: false, horn: false };
  function readInput() {
    const inp = G.input;
    let th = 0, st = 0;
    if (keys.KeyW || keys.ArrowUp) th += 1;
    if (keys.KeyS || keys.ArrowDown) th -= 1;
    if (keys.KeyA || keys.ArrowLeft) st -= 1;
    if (keys.KeyD || keys.ArrowRight) st += 1;
    let hb = !!keys.Space || touch.hb, horn = !!keys.KeyH || touch.horn;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.15) st = ax;
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05 || lt > 0.05) th = rt - lt;
      if (p.buttons[0] && p.buttons[0].pressed) th = Math.max(th, 1);
      if (p.buttons[5] && p.buttons[5].pressed) hb = true;
      if (p.buttons[1] && p.buttons[1].pressed) horn = true;
    }
    if (touch.active) {
      const dx = touch.x - touch.ox, dy = touch.y - touch.oy, mag = Math.min(1, Math.hypot(dx, dy) / 60);
      if (mag > 0.15) {
        const want = Math.atan2(dy, dx), diff = VC.angleDiff(G.car.a, want);
        if (Math.abs(diff) < 2.3) { st = clamp(diff * 2.2, -1, 1); th = mag * (Math.abs(diff) > 1.3 ? 0.55 : 1); }
        else { st = clamp(-VC.angleDiff(G.car.a + Math.PI, want) * 2, -1, 1); th = -mag; }
      }
    }
    inp.throttle = th; inp.steer = st; inp.hb = hb;
    if (horn !== inp.horn) { inp.horn = horn; A.horn(horn && G.state === 'play'); }
  }
  function bindInput() {
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code) && !e.target.closest('input')) e.preventDefault();
      if (keys[e.code]) return;
      keys[e.code] = true;
      onKey(e);
    });
    addEventListener('keyup', (e) => (keys[e.code] = false));
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    const zone = $('#touch-stick');
    zone.addEventListener('pointerdown', (e) => { touch.active = true; touch.id = e.pointerId; touch.ox = touch.x = e.clientX; touch.oy = touch.y = e.clientY; zone.setPointerCapture(e.pointerId); showStick(); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) { touch.x = e.clientX; touch.y = e.clientY; showStick(); } });
    const end = (e) => { if (e.pointerId === touch.id) { touch.active = false; $('#stick').style.display = 'none'; } };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const hold = (sel, prop) => { const b = $(sel); b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[prop] = true; }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => (touch[prop] = false))); };
    hold('#t-drift', 'hb'); hold('#t-horn', 'horn');
  }
  function showStick() { const s = $('#stick'); s.style.display = 'block'; s.style.left = touch.ox + 'px'; s.style.top = touch.oy + 'px'; const dx = touch.x - touch.ox, dy = touch.y - touch.oy, m = Math.hypot(dx, dy), k = m > 60 ? 60 / m : 1; s.firstElementChild.style.transform = `translate(${dx * k}px,${dy * k}px)`; }
  function onKey(e) {
    const s = G.state;
    if (s === 'title') { if (e.code === 'Enter') startGame(); return; }
    if (s === 'intro') { if (['Enter', 'Escape', 'Space'].includes(e.code)) endIntro(); return; }
    if (s === 'card') { if (e.code === 'Escape') $('#card-ok').click(); return; }
    if (overlayOpen()) { if (e.code === 'Escape' || (e.code === 'Tab' && $('#dossier').classList.contains('show')) || (e.code === 'KeyM' && $('#map').classList.contains('show'))) closeOverlays(); return; }
    if (s !== 'play') return;
    if (e.code === 'KeyR' || e.code === 'BracketRight') cycleStation(e.shiftKey ? -1 : 1);
    if (e.code === 'BracketLeft') cycleStation(-1);
    if (e.code === 'KeyN') toggleMute();
    if (e.code === 'KeyT') openTaxi();
    if (e.code === 'KeyM') openMap();
    if (e.code === 'Tab') openDossier();
    if (e.code === 'Escape' || e.code === 'KeyP') openPause();
  }

  // -------------------------------------------------------------- overlays
  const overlayOpen = () => ['#pause', '#taxi', '#map', '#dossier'].some((s) => $(s).classList.contains('show'));
  function openOverlay(sel) { closeOverlays(true); $(sel).classList.add('show'); if (G.state === 'play') G.state = 'paused'; A.duck(true); A.horn(false); }
  function closeOverlays(keep) {
    ['#pause', '#taxi', '#map', '#dossier'].forEach((s) => $(s).classList.remove('show'));
    if (!keep) { if (G.state === 'paused') G.state = 'play'; if (G.state === 'play') A.duck(false); if (G.state === 'title') $('#title').classList.add('show'); }
  }
  function openPause() { openOverlay('#pause'); }
  function openTaxi() {
    const list = MISSIONS.map((m) => {
      const locked = m.kind === 'final' && !world.frontierOpen, done = G.visited.has(m.id);
      return `<button class="taxi-item ${done ? 'done' : ''}" ${locked ? 'disabled' : ''} data-id="${m.id}"><i style="background:${m.color}">${m.letter}</i><span><b>${VC.richText(m.title)}</b><small>${VC.richText(m.district)} · ${VC.richText(m.company)}</small></span><em>${locked ? '🔒 storm' : done ? '✓' : 'NEW'}</em></button>`;
    }).join('');
    $('#taxi-list').innerHTML = list;
    $('#taxi-list').querySelectorAll('button').forEach((b) => (b.onclick = () => taxiTo(b.dataset.id)));
    openOverlay('#taxi');
  }
  function taxiTo(id) {
    const m = MISSIONS.find((q) => q.id === id); closeOverlays(true);
    A.sfx('click');
    fade(() => { const c = G.car; c.x = m.spawn[0]; c.y = m.spawn[1]; c.a = m.spawn[2]; c.vx = c.vy = c.z = 0; G.cam.x = c.x; G.cam.y = c.y; G.npcs.length = 0; G.state = 'play'; A.duck(false); G.lastMission = null; });
    toast('VIBE CABS', `"${m.district}? Hop in, boss." First ride's on the house.`, 2500);
  }
  function openMap() {
    openOverlay('#map');
    const cv = $('#map-canvas'), box = cv.parentElement.getBoundingClientRect();
    const s = Math.min(box.width / world.W, box.height / world.H);
    cv.width = world.W * s * dpr; cv.height = world.H * s * dpr; cv.style.width = world.W * s + 'px'; cv.style.height = world.H * s + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.drawImage(mapImg, 0, 0, world.W * s, world.H * s);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    [['Data Center Docks', 900, 300], ['Cloud Port', 2400, 300], ['Hawker Heights', 1800, 3150], ['Coventry Heights', 900, 5650], ['Marina Flats', 2600, 5650], ['Downtown', 5300, 450], ['Financial District', 5200, 2900], ['Merchant Mile', 5000, 5750], ['Ocean Beach', 6450, 5750], ['Vibe Beach', 7180, 4300], ['Prompt Island', 3800, 520], ['Frontier Island', 8360, 2850]].forEach(([n, wx, wy]) => {
      x.font = `${Math.max(11, 22 * s / 0.12 * 0.12 * 6)}px "Mr Dafoe", cursive`; x.lineWidth = 3; x.strokeStyle = 'rgba(20,0,30,.8)'; x.strokeText(n, wx * s, wy * s); x.fillStyle = '#ffe1f3'; x.fillText(n, wx * s, wy * s);
    });
    MISSIONS.forEach((m) => {
      const px = m.mx * s, py = m.my * s, locked = !markerActive(m);
      x.fillStyle = locked ? '#555' : G.visited.has(m.id) ? '#777' : m.color; x.fillRect(px - 10, py - 10, 20, 20); x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(px - 10, py - 10, 20, 20);
      x.fillStyle = '#000'; x.font = '900 15px "Passion One", sans-serif'; x.fillText(locked ? '?' : m.letter, px, py + 1);
    });
    x.save(); x.translate(G.car.x * s, G.car.y * s); x.rotate(G.car.a); x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.moveTo(12, 0); x.lineTo(-8, -8); x.lineTo(-4, 0); x.lineTo(-8, 8); x.closePath(); x.fill(); x.stroke(); x.restore();
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect(), wx = (e.clientX - r.left) / s, wy = (e.clientY - r.top) / s;
      const m = MISSIONS.find((q) => markerActive(q) && Math.hypot(q.mx - wx, q.my - wy) < 30 / s);
      if (m) taxiTo(m.id);
    };
  }
  function openDossier() { openOverlay('#dossier'); $('#dossier .scroll').scrollTop = 0; }
  function buildDossier() {
    const p = D.person;
    const sec = (m) => `<article class="dos-ch" style="--c:${m.color}"><header><span class="dos-title">${VC.richText(m.title)}</span><span class="dos-dates">${VC.richText(m.dates)}</span></header>
      <h3>${VC.richText(m.company)} — ${VC.richText(m.role)}</h3>${m.place ? `<div class="dos-place">${VC.richText(m.place)}</div>` : ''}
      <ul>${m.intel.map((s) => `<li>${VC.richText(s)}</li>`).join('')}</ul>${m.quote ? `<blockquote>“${VC.richText(m.quote.text)}” <cite>— ${VC.richText(m.quote.by)}</cite></blockquote>` : ''}</article>`;
    const chronological = D.missions.slice().reverse();
    $('#dossier-body').innerHTML = `
      <div class="dos-head"><h1>${VC.richText(p.name)} <small>“${VC.richText(p.alias)}”</small></h1><p class="dos-sub">${VC.richText(p.title)} · ${VC.richText(p.location)}</p><p>${VC.richText(p.headline)}</p>
      <div class="links">${D.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}</div></div>
      <h2 class="dos-h">Next mission</h2><article class="dos-ch" style="--c:#fff"><h3>${VC.richText(D.finale.role)}</h3><ul>${D.finale.intel.map((s) => `<li>${VC.richText(s)}</li>`).join('')}</ul></article>
      <h2 class="dos-h">The journey (newest first)</h2>${chronological.map(sec).join('')}
      <h2 class="dos-h">Off the clock</h2>${sec(D.side)}
      <h2 class="dos-h">Skills</h2><div class="dos-skills">${Object.entries(D.skills).map(([k, v]) => `<div><b>${VC.richText(k)}</b><p>${v.map(VC.richText).join(' · ')}</p></div>`).join('')}</div>
      <h2 class="dos-h">Certifications & courses</h2><ul class="dos-list">${D.packages.map((s) => `<li>${VC.richText(s)}</li>`).join('')}</ul>
      <h2 class="dos-h">Education & languages</h2><p>BSc (Hons) Software Engineering, Coventry University (2010–2013) · ${D.languages.map(VC.richText).join(' · ')}</p>`;
  }
  function cycleStation(dir) {
    const n = A.stations.length; let i = A.station;
    do { i += dir; if (i >= n) i = -1; else if (i < -1) i = n - 1; } while (!A.isAvailable(i));
    A.setStation(i); showStation(i >= 0 ? A.stations[i] : null); save();
  }
  function toggleMute() { A.setMuted(!A.muted); $('#btn-sound').textContent = A.muted ? 'Sound: OFF' : 'Sound: ON'; toast(A.muted ? 'SOUND OFF' : 'SOUND ON', A.muted ? 'Press N to bring the radio back.' : 'Press R to change station.', 1800); save(); }

  // ----------------------------------------------------------- save / load
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: [...G.visited], p: [...G.pkgs], s: G.stunts.size ? [...G.stunts] : [], st: G.stats, station: A.station, muted: A.muted, open: world.frontierOpen, car: [G.car.x, G.car.y, G.car.a] })); } catch (e) { /* private mode */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!d) return null;
      d.v.forEach((x) => G.visited.add(x)); d.p.forEach((x) => { G.pkgs.add(x); if (world.packages[x]) world.packages[x].got = true; }); (d.s || []).forEach((x) => G.stunts.add(x));
      Object.assign(G.stats, d.st || {}); A.station = d.station == null ? 0 : d.station; A.muted = !!d.muted;
      if (d.open) { world.frontierOpen = true; world.graph.edges.forEach((e) => (e.closed = false)); }
      G.neon = G.pkgs.size === world.packages.length;
      return d;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------- game flow
  function baseZoom() { const m = Math.min(sw, sh); return m / (700 + 300 * clamp((m - 400) / 800, 0, 1)); }
  function startGame() {
    A.init(); A.resume();
    $('#title').classList.remove('show');
    document.body.classList.add('ingame');
    const saved = G.saved;
    const c = G.car;
    if (saved && saved.car) { c.x = saved.car[0]; c.y = saved.car[1]; c.a = saved.car[2]; } else { const s = MISSIONS[0].spawn; c.x = s[0]; c.y = s[1]; c.a = s[2]; }
    if (!A.muted) A.setStation(A.station, true); else A.setMuted(true);
    if (saved && saved.v.length) { G.state = 'play'; G.cam.x = c.x; G.cam.y = c.y; G.cam.zoom = baseZoom(); showStation(A.station >= 0 ? A.stations[A.station] : null); pager(nextMission() ? 'Welcome back. Next stop is flashing on your radar.' : 'Welcome back.'); return; }
    G.state = 'intro'; G.introT = 0; document.body.classList.add('cinematic');
    G.cam.x = 4400; G.cam.y = 3200; G.cam.zoom = Math.min(sw / world.W, sh / world.H) * 1.6;
    const lines = [['VIBE CITY, 2026', ''], ['Richie has spent 12+ years', 'building the layer underneath great products.'], ['Every stop on this map is a chapter.', 'Every chapter gets him closer to the frontier.']];
    lines.forEach((l, i) => setTimeout(() => { if (G.state === 'intro') bigText(l[0], l[1], i ? '#ffffff' : '#ff4fb0', 2.1, 'intro'); }, 300 + i * 2300));
    G.introTimer = setTimeout(endIntro, 7400);
  }
  function endIntro() {
    if (G.state !== 'intro') return;
    clearTimeout(G.introTimer); G.state = 'play'; document.body.classList.remove('cinematic'); $('#big').className = '';
    showStation(A.station >= 0 ? A.stations[A.station] : null);
    setTimeout(() => pager(D.pagers.start), 900);
    const tch = VC.isTouch();
    help(tch ? 'Drag on the left to drive · <b>DRIFT</b> to slide · tap <b>📻</b> to change station' : '<b>W A S D</b> / arrows to drive · <b>SPACE</b> handbrake · <b>R</b> radio · <b>T</b> taxi · <b>M</b> map · <b>TAB</b> résumé', 9000);
    setTimeout(() => help('Drive into the glowing <b style="color:#ff4fb0">pink markers</b> to open each chapter of Richie\'s story.', 7000), 9500);
  }

  // ----------------------------------------------------------------- loop
  let last = 0, hudT = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (document.hidden) return;
    G.t += dt;
    const s = G.state;
    const running = s === 'play' || s === 'cut' || s === 'card' || s === 'intro' || s === 'splash' || s === 'title';
    if (running) G.hour = (G.hour + dt * G.timeScale) % 24;
    readInput();
    const c = G.car;
    if (s === 'play') {
      const sub = 3; for (let i = 0; i < sub; i++) stepCar(dt / sub);
      updateTraffic(dt); checkTriggers();
      const mph = (Math.hypot(c.vx, c.vy) / 10) * 2.237; G.stats.top = Math.max(G.stats.top, mph); G.stats.time += dt;
    } else if (s === 'cut' || s === 'card') {
      c.vx *= 0.9; c.vy *= 0.9; c.x += c.vx * dt; c.y += c.vy * dt;
    }
    if (G.rocket && G.rocket.launch < 3000) { G.rocket.launch += dt * (40 + G.rocket.launch * 1.2); G.shake = Math.max(G.shake, 6); if (Math.random() < 0.8) spawnPart(G.rocket.x + (Math.random() - 0.5) * 60, G.rocket.y + (Math.random() - 0.5) * 60, { size: 14, grow: 60, life: 2.2, col: '#e8e4f0' }); }
    updateParts(dt);
    G.shake *= Math.pow(0.02, dt); if (G.shake < 0.3) G.shake = 0;
    G.flash = Math.max(0, (G.flash || 0) - dt * 3);
    // storm
    const sd = Math.hypot(G.cam.x - 7700, G.cam.y - 3300);
    G.storm = world.frontierOpen ? Math.max(0, G.storm - dt * 0.3) : 1;
    G.stormNear = G.storm * (1 - VC.smoothstep(700, 1500, sd));
    if (G.stormNear > 0.3 && Math.random() < dt * 0.15) { G.flash = 0.7; setTimeout(() => A.sfx('thunder'), 400 + Math.random() * 800); }
    updateLight();
    // camera
    const cam = G.cam;
    if (s === 'intro') { G.introT += dt; const t = VC.ease.inOutCubic(clamp((G.introT - 1.2) / 5.5, 0, 1)); cam.x = lerp(4400, c.x, t); cam.y = lerp(3200, c.y, t); cam.zoom = lerp(Math.min(sw / world.W, sh / world.H) * 1.6, baseZoom(), t); }
    else if (G.cut) { cam.x = lerp(cam.x, G.cut.x, 1 - Math.pow(0.03, dt)); cam.y = lerp(cam.y, G.cut.y, 1 - Math.pow(0.03, dt)); cam.zoom = lerp(cam.zoom, G.rocket && G.current && G.current.id === 'frontier' ? baseZoom() * 0.75 : G.cut.zoom, 1 - Math.pow(0.05, dt)); }
    else if (s !== 'title') {
      const sp = Math.hypot(c.vx, c.vy), tx = c.x + c.vx * 0.35, ty = c.y + c.vy * 0.35;
      cam.x = lerp(cam.x, tx, 1 - Math.pow(0.02, dt)); cam.y = lerp(cam.y, ty, 1 - Math.pow(0.02, dt));
      const tz = baseZoom() / (1 + clamp(sp / MAXV, 0, 1) * 0.42 + c.z / 400);
      cam.zoom = lerp(cam.zoom, tz, 1 - Math.pow(0.15, dt));
    } else { cam.x = 5600 + Math.sin(G.t * 0.05) * 600; cam.y = 2600 + Math.cos(G.t * 0.04) * 500; cam.zoom = baseZoom() * 0.7; }
    render();
    // HUD
    if (s !== 'title') {
      drawRadar();
      A.engine(Math.hypot(c.vx, c.vy) / MAXV, G.input.throttle, c.slip, s === 'play' && c.z <= 0);
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.2;
        const h = Math.floor(G.hour), m = Math.floor((G.hour % 1) * 60);
        $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        $('#speed').textContent = Math.round((Math.hypot(c.vx, c.vy) / 10) * 2.237) + ' MPH';
        const z = world.zoneAt(c.x, c.y).name;
        if (z !== G.zone && s === 'play') { G.zone = z; const el = $('#zone'); el.textContent = z; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
        const nm = nextMission(), arrow = $('#objective');
        if (nm && s === 'play') { const d = Math.hypot(nm.mx - c.x, nm.my - c.y); arrow.textContent = `NEXT ▸ ${nm.title} · ${Math.round(d / 10)}m`; arrow.classList.add('show'); } else arrow.classList.remove('show');
      }
    }
  }

  // ------------------------------------------------------------------ boot
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    sw = window.innerWidth; sh = window.innerHeight;
    canvas.width = Math.round(sw * dpr); canvas.height = Math.round(sh * dpr);
    canvas.style.width = sw + 'px'; canvas.style.height = sh + 'px';
  }
  async function boot() {
    canvas = $('#game'); ctx = canvas.getContext('2d', { alpha: false });
    if (VC.isTouch()) document.body.classList.add('touch');
    resize(); addEventListener('resize', resize);
    const bar = $('#load-bar');
    bar.style.width = '20%';
    try { await Promise.race([Promise.all(['900 20px "Passion One"', '700 20px "Passion One"', '20px "Mr Dafoe"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
    bar.style.width = '45%';
    await new Promise((r) => setTimeout(r, 30));
    world = VC.World.build(); VC.world = world;
    bar.style.width = '80%';
    buildSprites(); setupMissions(); buildMap(); buildDossier();
    radarCtx = $('#radar').getContext('2d');
    G.saved = load();
    updateHUD();
    bindInput(); bindUI();
    A.onNowPlaying = (st, song) => { if (G.state === 'play' || G.state === 'intro') showStation(st, song); };
    A.onTalk = (who, text) => { if (G.state === 'play') { const el = $('#caption'); el.innerHTML = `<b>${who}:</b> ${VC.richText(text)}`; el.classList.add('show'); clearTimeout(G.capT); G.capT = setTimeout(() => el.classList.remove('show'), 5000); } };
    bar.style.width = '100%';
    setTimeout(() => {
      $('#loading').classList.add('hide');
      G.state = 'title'; $('#title').classList.add('show');
      $('#btn-start').textContent = G.saved && G.saved.v.length ? `▶ Continue (${G.saved.v.length} chapters found)` : '▶ Start the drive';
      $('#btn-sound').textContent = A.muted ? 'Sound: OFF' : 'Sound: ON';
      if (QS.has('autostart')) startGame();
    }, 350);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { A.suspend(); if (G.state === 'play') openPause(); } else if (G.state !== 'title') A.resume(); });
    requestAnimationFrame(frame);
    VC.debug = { G, world, teleport: (id) => { const m = MISSIONS.find((q) => q.id === id); G.car.x = m.spawn[0]; G.car.y = m.spawn[1]; G.car.a = m.spawn[2]; G.cam.x = G.car.x; G.cam.y = G.car.y; }, hour: (h) => (G.hour = h), mission: (id) => startMission(MISSIONS.find((q) => q.id === id)), visitAll: () => { mainMissions().forEach((m) => G.visited.add(m.id)); updateHUD(); openFrontier(); } };
  }
  function updateLegal() {
    if (!A.stations.some((s) => s.style === 'file' && s.available)) return;
    $('#legal').textContent = 'A fan-made homage to the 1980s and open-world games. Flash FM: your own MP3, played from this computer (music/flash-fm.mp3) and not part of the public site. All other music is original and generated live in your browser. Not affiliated with Rockstar Games.';
  }
  function bindUI() {
    updateLegal(); document.addEventListener('vc-file-station', updateLegal);
    $('#btn-start').onclick = startGame;
    $('#btn-resume-mode').onclick = () => { openOverlay('#dossier'); $('#title').classList.remove('show'); };
    $('#btn-sound').onclick = () => { A.muted = !A.muted; $('#btn-sound').textContent = A.muted ? 'Sound: OFF' : 'Sound: ON'; save(); };
    $('#btn-reset').onclick = () => { if (confirm('Reset your progress?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => closeOverlays()));
    $('#p-resume').onclick = () => closeOverlays();
    $('#p-map').onclick = openMap; $('#p-taxi').onclick = openTaxi; $('#p-dossier').onclick = openDossier;
    $('#p-sound').onclick = toggleMute;
    $('#p-reset').onclick = () => { if (confirm('Reset your progress and start over?')) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
    $('#vol').oninput = (e) => A.setMusicVol(e.target.value / 100);
    $('#h-taxi').onclick = () => G.state === 'play' && openTaxi();
    $('#h-radio').onclick = () => G.state === 'play' && cycleStation(1);
    $('#h-map').onclick = () => G.state === 'play' && openMap();
    $('#h-cv').onclick = () => G.state === 'play' && openDossier();
    $('#h-pause').onclick = () => G.state === 'play' && openPause();
    $('#game').addEventListener('click', () => { if (G.state === 'intro') endIntro(); });
  }
  window.addEventListener('DOMContentLoaded', boot);
})();
