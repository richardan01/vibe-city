/* VIBE CITY — small shared helpers */
(function () {
  const VC = (window.VC = window.VC || {});

  /* Seeded RNG (mulberry32) with convenience helpers. */
  VC.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  };

  VC.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  VC.lerp = (a, b, t) => a + (b - a) * t;
  VC.smoothstep = (e0, e1, x) => {
    const t = VC.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  VC.angleDiff = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  VC.ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  /* Colour helpers. Colours are '#rrggbb' strings. */
  const rgbCache = new Map();
  VC.hexToRgb = function (hex) {
    let c = rgbCache.get(hex);
    if (c) return c;
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
    return c;
  };
  VC.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => VC.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  VC.rgba = function (hex, a) {
    const c = VC.hexToRgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  };
  VC.shade = function (hex, f) {
    const c = VC.hexToRgb(hex);
    return VC.rgbToHex(c[0] * f, c[1] * f, c[2] * f);
  };
  VC.mix = function (a, b, t) {
    const ca = VC.hexToRgb(a), cb = VC.hexToRgb(b);
    return VC.rgbToHex(VC.lerp(ca[0], cb[0], t), VC.lerp(ca[1], cb[1], t), VC.lerp(ca[2], cb[2], t));
  };

  /* Polygon helpers */
  VC.pointInPoly = function (x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  /* Escape text for innerHTML, then turn **x** into <strong>x</strong>. */
  VC.richText = function (s) {
    const esc = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  };

  VC.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };

  VC.isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  VC.prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
