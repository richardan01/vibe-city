/* VIBE CITY — map layout + procedural city generation */
(function () {
  const VC = window.VC;
  const T = (VC.T = { WATER: 0, SAND: 1, GROUND: 3, ROAD: 4, SIDEWALK: 5, DOCK: 6, BRIDGE: 7, PARK: 8, PLAZA: 9, RESERVED: 10 });
  const W = 8800, H = 6400, CELL = 25, COLS = W / CELL, ROWS = H / CELL;
  const ROAD_W = { major: 104, minor: 72, bridge: 104, pier: 64 };
  const SIDE = 18;

  const ISLANDS = [
    { name: 'west', rough: 30, pts: [[400,450],[1400,360],[2400,420],[3250,500],[3310,1500],[3280,2600],[3330,3700],[3290,4800],[3250,5700],[2300,5880],[1200,5850],[450,5720],[300,4600],[350,3400],[260,2300],[320,1300]] },
    { name: 'east', rough: 26, pts: [[4350,300],[5300,250],[6400,300],[7350,380],[7420,1500],[7380,2600],[7450,3700],[7400,4800],[7350,5900],[6300,6050],[5200,6000],[4400,5900],[4300,4800],[4340,3700],[4290,2600],[4330,1500]] },
    { name: 'prompt', rough: 14, circle: [3800, 880, 300] },
    { name: 'frontier', rough: 16, circle: [8360, 3300, 370] },
  ];
  const DOCKS = [[100, 1150, 640, 1150], [7600, 1720, 560, 360]];

  const ROADS = [
    [700,700,3050,700,'major'],[700,5450,3050,5450,'major'],[700,700,700,5450,'major'],[3050,700,3050,5450,'major'],
    [1550,700,1550,5450,'major'],[2400,700,2400,5450,'major'],[180,1500,3050,1500,'major'],[700,2400,3050,2400,'major'],
    [700,3300,3050,3300,'minor'],[700,4000,3050,4000,'major'],[700,4700,3050,4700,'major'],[1100,2400,1100,4000,'minor'],
    [2000,1500,2000,3300,'minor'],[1550,2850,3050,2850,'minor'],[400,1500,400,2200,'minor'],[1100,4000,1100,4700,'minor'],
    [2000,4000,2000,5450,'minor'],[2400,5000,3050,5000,'minor'],[1125,5200,1125,5450,'minor'],
    [3050,1500,3200,1500,'major'],[3200,1500,4420,1500,'bridge'],[4420,1500,4600,1500,'major'],
    [3800,1150,3800,1500,'bridge'],[3800,1000,3800,1150,'minor'],
    [3050,4700,3200,4700,'major'],[3200,4700,4420,4700,'bridge'],[4420,4700,4600,4700,'major'],
    [4600,600,6850,600,'major'],[4600,5500,6850,5500,'major'],[4600,600,4600,5500,'major'],[6850,600,6850,5500,'major'],
    [5300,600,5300,5500,'major'],[6050,600,6050,5500,'major'],[4950,600,4950,2500,'minor'],[5650,600,5650,2500,'minor'],
    [6450,3300,6450,5500,'minor'],[4600,1100,6850,1100,'minor'],[4600,1500,6850,1500,'major'],[4600,1900,6850,1900,'minor'],
    [4600,2500,6850,2500,'major'],[4600,3300,6850,3300,'major'],[4600,4000,6850,4000,'minor'],[4600,4700,6850,4700,'major'],
    [6850,1900,7380,1900,'minor'],[7380,1900,7640,1900,'pier'],[7640,1900,7700,1900,'minor'],
    [6850,3300,7340,3300,'major'],[7340,3300,8040,3300,'bridge','frontier'],[8040,3300,8150,3300,'minor'],
  ];

  const PARKS = [[770,4770,710,610],[5704,1570,276,276]];
  const PLAZAS = [[770,3354,276,576]];
  const PLAZA_CIRCLES = [[3800,960,85],[8190,3300,85]];

  /* Landmarks: one per chapter. marker = trigger point, spawn = taxi drop-off [x,y,angle]. */
  const U = -Math.PI / 2;
  const LANDMARKS = {
    coventry: { marker: [1125,5250], spawn: [1125,5420,U], yard: [[1000,4950,250,260]],
      parts: [{ shape:'cyl', x:1125, y:5060, r:78, z1:46, wall:'#e9e4f2', roof:'#c9d3e6', dome:true }],
      extra: [{ x:810,y:4800,w:150,h:90,z1:38,wall:'#b5553d',roof:'#7a3b2c' },{ x:1300,y:4800,w:150,h:90,z1:38,wall:'#b5553d',roof:'#7a3b2c' }],
      sign: { text:'COVENTRY UNI', color:'#7fd8ff', x:1125, y:4845 } },
    hpe: { marker: [1060,1330], spawn: [1060,1500,U], yard: [[800,1200,520,210]],
      parts: [{ x:800,y:790,w:520,h:380,z1:70,wall:'#8a8f98',roof:'#c3c7cc', fans:true }],
      sign: { text:'HPE DATA CENTER', color:'#22c1ff', x:1060, y:980 } },
    huawei: { marker: [2725,1340], spawn: [2725,1500,U], yard: [[2490,1220,470,190]],
      parts: [{ x:2490,y:800,w:470,h:400,z1:110,wall:'#dfe9f0',roof:'#eef3f6', dishes:true }],
      sign: { text:'HUAWEI CLOUD', color:'#ff5a5f', x:2725, y:1000 } },
    informatica: { marker: [5117,1100], spawn: [4800,1100,0], yard: [],
      parts: [{ x:5010,y:680,w:214,h:300,z1:60,wall:'#3d6b8f',roof:'#9aa3ad' },{ x:5045,y:700,w:150,h:250,z0:60,z1:440,wall:'#4f86a8',roof:'#b5bcc4', heli:true }],
      sign: { text:'INFORMATICA · CLAIRE', color:'#ff8a3d', x:5117, y:1005, z:62 } },
    animoca: { marker: [7700,1900], spawn: [7250,1900,0], yard: [],
      parts: [{ x:7820,y:1745,w:250,h:150,z1:55,wall:'#3a1e5c',roof:'#2a1640', invader:true }],
      sign: { text:'ARCADE · MOCA', color:'#b86bff', x:7945, y:1785 } },
    axi: { marker: [5675,3170], spawn: [5675,3300,U], yard: [[5400,3060,550,160]],
      parts: [{ x:5400,y:2600,w:550,h:440,z1:60,wall:'#1f3044',roof:'#3a4a5c', pool:true },{ x:5500,y:2650,w:350,h:330,z0:60,z1:400,wall:'#1d3b4f',roof:'#2a3646', ticker:true }],
      sign: { text:'AXI', color:'#2ee6a6', x:5675, y:3015, z:62 } },
    kpay: { marker: [4950,4540], spawn: [4950,4700,U], yard: [[4700,4370,500,250]], parking: [4700,4370,500,250],
      parts: [{ x:4700,y:4080,w:500,h:260,z1:46,wall:'#ffcf99',roof:'#e8e1d5', awning:true }],
      sign: { text:'KPAY', color:'#ffd23f', x:4950, y:4210 } },
    garage: { marker: [6260,5150], spawn: [6260,5500,U], yard: [[6140,5010,240,400]],
      parts: [{ x:6140,y:4800,w:240,h:190,z1:48,wall:'#d9d2c3',roof:'#6b6e75' }],
      sign: { text:'SHIP IT GARAGE', color:'#ff4fb0', x:6260, y:4895 } },
    evallab: { marker: [3800,960], spawn: [3800,1400,U], yard: [],
      parts: [{ x:3690,y:650,w:220,h:150,z1:90,wall:'#f2f6fa',roof:'#dde6ee', heptagon:true }],
      sign: { text:'EVAL LAB', color:'#37e6ff', x:3800, y:690 } },
    willing: { marker: [1950,3850], spawn: [1950,4000,U], yard: [[1820,3700,260,220]],
      parts: [{ x:1820,y:3460,w:260,h:220,z1:44,wall:'#f6c28b',roof:'#d8cfc0', heart:true }],
      sign: { text:'WILLING HEARTS', color:'#ff6b8b', x:1950, y:3510 } },
    frontier: { marker: [8190,3300], spawn: [7880,3300,0], yard: [],
      parts: [], rocket: [8470,3300],
      sign: { text:'FRONTIER', color:'#ffffff', x:8470, y:3460 } },
  };

  const PACKAGES = [[300,2150],[3180,1720],[3590,860],[7250,520],[8110,2050],[5900,1800],[800,4800],[900,3650],[2900,5250],[7200,5700],[4700,5800],[8560,3500]];
  const RAMPS = [{ x:3215, y:900, a:0, name:'PROMPT LEAP' },{ x:7150, y:2750, a:U, name:'BEACH HOP' },{ x:560, y:1640, a:Math.PI/2, name:'CONTAINER JUMP' }];
  const CLEAR = [[3070,850,270,100],[500,1560,120,140]];

  const ZONES = [
    { name:'Prompt Island', c:[3800,880,380] },{ name:'Frontier Island', c:[8360,3300,440] },
    { name:'Arcade Pier', r:[7380,1650,800,480] },{ name:'Frontier Bridge', r:[7340,3230,700,140] },
    { name:'North Bridge', r:[3200,1430,1220,140] },{ name:'South Bridge', r:[3200,4630,1220,140] },
    { name:'Data Center Docks', r:[0,0,1550,2400], s:'docks' },{ name:'Cloud Port', r:[1550,0,1850,2400], s:'tech' },
    { name:'Hawker Heights', r:[0,2400,3400,1600], s:'hawker' },{ name:'Coventry Heights', r:[0,4000,1550,2400], s:'residential' },
    { name:'Marina Flats', r:[1550,4000,1850,2400], s:'residential' },{ name:'Vibe Beach', r:[6930,0,600,6400], s:'beach' },
    { name:'Ocean Drive', r:[6050,0,880,3700], s:'hotels' },{ name:'Ocean Beach', r:[6050,3700,880,2700], s:'hotels' },
    { name:'Downtown', r:[4200,0,1850,2200], s:'downtown' },{ name:'Financial District', r:[4200,2200,1850,1500], s:'financial' },
    { name:'Merchant Mile', r:[4200,3700,1850,2700], s:'merchant' },{ name:'Vibe Bay', r:[3300,0,1000,6400] },
  ];

  const STYLES = {
    docks: { lot:[5,12], set:[6,14], h:[34,80], walls:['#7d7468','#8a8f94','#6e6a64','#9a6b4f'], roofs:['#9aa0a6','#7e858c','#b0a48f'], win:0, kind:'warehouse' },
    tech: { lot:[5,9], set:[10,22], h:[50,150], walls:['#e8eef2','#d0dde6','#bcd4e0','#f7f9fb'], roofs:['#cfd8dc','#8fbf6a','#4a5d73'], win:1, kind:'box' },
    hawker: { lot:[3,6], set:[4,10], h:[36,110], walls:['#f6c28b','#e9a3a3','#a3d9c9','#f7e1a1','#b9c6f0'], roofs:['#d8cfc0','#bfb5a4','#c9b8a0'], win:1, kind:'box' },
    residential: { lot:[3,5], set:[8,14], h:[24,40], walls:['#f5e6c8','#e8d3b0','#f2c6b4','#cfe3d2','#e6e0f0'], roofs:['#c8644a','#b5553d','#a4513c','#7a8a9a'], win:0, kind:'house' },
    downtown: { lot:[4,9], set:[6,14], h:[140,380], walls:['#3d6b8f','#4f86a8','#2f5878','#5e8fb0','#6c7fa8'], roofs:['#9aa3ad','#7f8a96','#b5bcc4'], win:2, kind:'tower' },
    financial: { lot:[5,10], set:[8,16], h:[160,340], walls:['#1f3044','#25364d','#2c2f4a','#1d3b4f'], roofs:['#3a4a5c','#2a3646','#46505e'], win:2, kind:'tower' },
    merchant: { lot:[4,8], set:[6,14], h:[30,90], walls:['#ffcf99','#ff9fb3','#9fd4ff','#c2f0a8','#fff0a0'], roofs:['#e8e1d5','#d9cbb5'], win:1, kind:'box' },
    hotels: { lot:[4,7], set:[4,10], h:[70,170], walls:['#ffb3c7','#9ff0d0','#ffd6a5','#c8b6ff','#a0d8ff','#fff1a8','#ffc4e1'], roofs:['#f4efe6','#e9e2f2','#f2ece0'], win:1, kind:'hotel' },
  };

  // ---------- helpers ----------
  function circlePts(cx, cy, r, n) { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
  function roughen(pts, rng, amp) {
    const out = [], ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28]; let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const nx = dy / len, ny = -dx / len, steps = Math.max(1, Math.round(len / 70));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, d = dist + len * t;
        const n = Math.sin(d * 0.004 + ph[0]) * 0.55 + Math.sin(d * 0.011 + ph[1]) * 0.3 + Math.sin(d * 0.027 + ph[2]) * 0.15;
        out.push([a[0] + dx * t + nx * n * amp, a[1] + dy * t + ny * n * amp]);
      }
      dist += len;
    }
    const sm = [];
    for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; sm.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); }
    return sm;
  }

  function build() {
    const rng = VC.rng(1986);
    const grid = new Uint8Array(COLS * ROWS);
    const world = { W, H, CELL, COLS, ROWS, T, ROAD_W, SIDE, grid, frontierOpen: false };
    const idx = (c, r) => r * COLS + c;
    const get = (x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return c < 0 || r < 0 || c >= COLS || r >= ROWS ? T.WATER : grid[idx(c, r)]; };
    world.cellAt = get;

    function fillPoly(pts, v, filt) {
      for (let r = 0; r < ROWS; r++) {
        const y = (r + 0.5) * CELL, xs = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const yi = pts[i][1], yj = pts[j][1]; if (yi > y !== yj > y) xs.push(pts[i][0] + ((y - yi) / (yj - yi)) * (pts[j][0] - pts[i][0])); }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), c1 = Math.min(COLS - 1, Math.floor(xs[k + 1] / CELL - 0.5));
          for (let c = c0; c <= c1; c++) if (!filt || filt(grid[idx(c, r)])) grid[idx(c, r)] = v;
        }
      }
    }
    function fillRect(x, y, w, h, v, filt) {
      const c0 = Math.max(0, Math.ceil(x / CELL - 0.5)), c1 = Math.min(COLS - 1, Math.floor((x + w) / CELL - 0.5));
      const r0 = Math.max(0, Math.ceil(y / CELL - 0.5)), r1 = Math.min(ROWS - 1, Math.floor((y + h) / CELL - 0.5));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!filt || filt(grid[idx(c, r)])) grid[idx(c, r)] = v;
    }
    function fillCircle(cx, cy, rad, v, filt) {
      for (let r = Math.floor((cy - rad) / CELL); r <= (cy + rad) / CELL; r++) for (let c = Math.floor((cx - rad) / CELL); c <= (cx + rad) / CELL; c++) {
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (Math.hypot((c + 0.5) * CELL - cx, (r + 0.5) * CELL - cy) <= rad && (!filt || filt(grid[idx(c, r)]))) grid[idx(c, r)] = v;
      }
    }
    const land = (t) => t !== T.WATER;

    // islands
    world.islands = ISLANDS.map((d) => ({ name: d.name, pts: roughen(d.circle ? circlePts(d.circle[0], d.circle[1], d.circle[2], 28) : d.pts, rng, d.rough) }));
    world.islands.forEach((i) => fillPoly(i.pts, T.GROUND));
    world.docks = DOCKS;
    DOCKS.forEach((d) => fillRect(d[0], d[1], d[2], d[3], T.DOCK));
    // sand ring + east beach
    const sand = [];
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      if (grid[idx(c, r)] !== T.GROUND) continue;
      let wet = false;
      for (let dr = -1; dr <= 1 && !wet; dr++) for (let dc = -1; dc <= 1; dc++) if (grid[idx(c + dc, r + dr)] === T.WATER) { wet = true; break; }
      const x = (c + 0.5) * CELL;
      if (wet || (x >= 6950 && x < 7600)) sand.push(idx(c, r));
    }
    sand.forEach((i) => (grid[i] = T.SAND));
    world.beachX = 6950;
    fillPoly(world.islands[2].pts, T.PARK, (t) => t === T.GROUND);
    fillPoly(world.islands[3].pts, T.PLAZA, (t) => t === T.GROUND || t === T.SAND);

    world.parks = PARKS; world.plazas = PLAZAS; world.plazaCircles = PLAZA_CIRCLES;
    PARKS.forEach((p) => fillRect(p[0], p[1], p[2], p[3], T.PARK, land));
    PLAZAS.forEach((p) => fillRect(p[0], p[1], p[2], p[3], T.PLAZA, land));
    PLAZA_CIRCLES.forEach((p) => fillCircle(p[0], p[1], p[2], T.PLAZA, land));
    CLEAR.forEach((p) => fillRect(p[0], p[1], p[2], p[3], T.PLAZA, land));
    PACKAGES.forEach((p) => fillCircle(p[0], p[1], 50, T.PLAZA, (t) => t === T.GROUND));

    // landmarks
    const buildings = [], decals = [], props = [], solids = [], circles = [];
    world.landmarks = {};
    for (const id in LANDMARKS) {
      const L = LANDMARKS[id];
      world.landmarks[id] = L;
      L.yard.forEach((y) => { fillRect(y[0], y[1], y[2], y[3], T.PLAZA, land); });
      if (L.parking) decals.push({ t: 'parking', x: L.parking[0], y: L.parking[1], w: L.parking[2], h: L.parking[3] });
      const tiers = [];
      L.parts.forEach((p) => {
        if (p.shape === 'cyl') {
          fillCircle(p.x, p.y, p.r + 10, T.RESERVED, land);
          buildings.push({ shape: 'cyl', x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2, cx: p.x, cy: p.y, r: p.r, z0: 0, z1: p.z1, wall: p.wall, roof: p.roof, dome: p.dome, lm: id });
          circles.push({ x: p.x, y: p.y, r: p.r, h: p.z1 });
        } else {
          fillRect(p.x, p.y, p.w, p.h, T.RESERVED, land);
          tiers.push({ x: p.x, y: p.y, w: p.w, h: p.h, z0: p.z0 || 0, z1: p.z1, wall: p.wall, roof: p.roof, win: p.z1 > 100 ? 2 : 1, feat: p });
        }
      });
      if (tiers.length) {
        const b0 = tiers[0];
        buildings.push({ shape: 'box', x: b0.x, y: b0.y, w: b0.w, h: b0.h, cx: b0.x + b0.w / 2, cy: b0.y + b0.h / 2, tiers, lm: id, seed: rng.int(1, 1e9) });
      }
      (L.extra || []).forEach((p) => {
        fillRect(p.x, p.y, p.w, p.h, T.RESERVED, land);
        buildings.push({ shape: 'box', x: p.x, y: p.y, w: p.w, h: p.h, cx: p.x + p.w / 2, cy: p.y + p.h / 2, tiers: [{ x: p.x, y: p.y, w: p.w, h: p.h, z0: 0, z1: p.z1, wall: p.wall, roof: p.roof, win: 1 }], seed: rng.int(1, 1e9) });
      });
      if (L.rocket) { props.push({ t: 'rocket', x: L.rocket[0], y: L.rocket[1], z: 170, launch: 0 }); circles.push({ x: L.rocket[0], y: L.rocket[1], r: 30, h: 170 }); decals.push({ t: 'pad', x: L.rocket[0], y: L.rocket[1], r: 110 }); }
    }

    // roads
    world.roads = ROADS.map((r) => {
      const x1 = Math.min(r[0], r[2]), x2 = Math.max(r[0], r[2]), y1 = Math.min(r[1], r[3]), y2 = Math.max(r[1], r[3]);
      return { x1, y1, x2, y2, kind: r[4], tag: r[5] || '', w: ROAD_W[r[4]], hor: y1 === y2 };
    });
    const isDeck = (k) => k === 'bridge' || k === 'pier';
    world.roads.forEach((s) => { if (isDeck(s.kind)) return; const e = s.w / 2 + SIDE; fillRect(s.x1 - (s.hor ? 0 : e), s.y1 - (s.hor ? e : 0), s.x2 - s.x1 + (s.hor ? 0 : 2 * e), s.y2 - s.y1 + (s.hor ? 2 * e : 0), T.SIDEWALK, (t) => t !== T.WATER && t !== T.ROAD && t !== T.RESERVED); });
    world.roads.forEach((s) => {
      const e = s.w / 2;
      const x = s.x1 - (s.hor ? 0 : e), y = s.y1 - (s.hor ? e : 0), w = s.x2 - s.x1 + (s.hor ? 0 : 2 * e), h = s.y2 - s.y1 + (s.hor ? 2 * e : 0);
      fillRect(x, y, w, h, T.BRIDGE, (t) => t === T.WATER);
      fillRect(x, y, w, h, T.ROAD, (t) => t !== T.BRIDGE && t !== T.RESERVED);
    });

    // intersections + lane markings
    const roads = world.roads;
    roads.forEach((s) => (s.cuts = []));
    world.intersections = [];
    for (const a of roads) for (const b of roads) {
      if (a === b || a.hor === b.hor || !a.hor) continue;
      if (b.x1 >= a.x1 - 1 && b.x1 <= a.x2 + 1 && a.y1 >= b.y1 - 1 && a.y1 <= b.y2 + 1) {
        a.cuts.push([b.x1, b.w / 2]); b.cuts.push([a.y1, a.w / 2]);
        world.intersections.push({ x: b.x1, y: a.y1, ha: a.w / 2, va: b.w / 2, major: a.kind !== 'minor' && b.kind !== 'minor' });
      }
    }
    roads.forEach((s) => {
      const from = s.hor ? s.x1 : s.y1, to = s.hor ? s.x2 : s.y2, pieces = [];
      const cuts = s.cuts.map((c) => [c[0] - c[1] - 8, c[0] + c[1] + 8]).sort((p, q) => p[0] - q[0]);
      let cur = from;
      cuts.forEach((c) => { if (c[0] > cur) pieces.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
      if (to > cur) pieces.push([cur, to]);
      s.pieces = pieces.filter((p) => p[1] - p[0] > 20);
    });

    // regions + BSP lots
    const regionOf = new Int32Array(COLS * ROWS).fill(-1);
    const regions = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (grid[idx(c, r)] !== T.GROUND || regionOf[idx(c, r)] >= 0) continue;
      const id = regions.length, q = [[c, r]]; regionOf[idx(c, r)] = id;
      let c0 = c, c1 = c, r0 = r, r1 = r, n = 0;
      while (q.length) {
        const [cc, rr] = q.pop(); n++;
        c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); r0 = Math.min(r0, rr); r1 = Math.max(r1, rr);
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dc, dr]) => {
          const nc = cc + dc, nr = rr + dr;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return;
          const k = idx(nc, nr);
          if (grid[k] === T.GROUND && regionOf[k] < 0) { regionOf[k] = id; q.push([nc, nr]); }
        });
      }
      regions.push({ id, c: c0, r: r0, w: c1 - c0 + 1, h: r1 - r0 + 1, n });
    }
    const zoneAt = (x, y) => {
      for (const z of ZONES) {
        if (z.c ? Math.hypot(x - z.c[0], y - z.c[1]) < z.c[2] : x >= z.r[0] && y >= z.r[1] && x < z.r[0] + z.r[2] && y < z.r[1] + z.r[3]) return z;
      }
      return { name: 'The Ocean' };
    };
    world.zoneAt = zoneAt;
    const covered = (rect, id) => {
      for (let r = rect.r; r < rect.r + rect.h; r++) for (let c = rect.c; c < rect.c + rect.w; c++) if (regionOf[idx(c, r)] !== id) return false;
      return true;
    };
    function fit(rect, id) {
      let { c, r, w, h } = rect;
      for (let g = 0; g < 60 && w > 0 && h > 0; g++) {
        let ok = true;
        const rowBad = (rr) => { for (let cc = c; cc < c + w; cc++) if (regionOf[idx(cc, rr)] !== id) return true; return false; };
        const colBad = (cc) => { for (let rr = r; rr < r + h; rr++) if (regionOf[idx(cc, rr)] !== id) return true; return false; };
        if (rowBad(r)) { r++; h--; ok = false; } else if (rowBad(r + h - 1)) { h--; ok = false; }
        else if (colBad(c)) { c++; w--; ok = false; } else if (colBad(c + w - 1)) { w--; ok = false; }
        if (ok) break;
      }
      const out = { c, r, w, h };
      return w > 0 && h > 0 && covered(out, id) ? out : null;
    }
    function bsp(rect, S, out) {
      const max = S.lot[1], min = S.lot[0];
      if ((rect.w <= max && rect.h <= max) || (rect.w < min * 2 && rect.h < min * 2)) { out.push(rect); return; }
      const horiz = rect.w >= rect.h;
      const len = horiz ? rect.w : rect.h;
      const a = VC.clamp(Math.round(len * rng.range(0.38, 0.62)), min, len - min);
      if (horiz) { bsp({ c: rect.c, r: rect.r, w: a, h: rect.h }, S, out); bsp({ c: rect.c + a, r: rect.r, w: rect.w - a, h: rect.h }, S, out); }
      else { bsp({ c: rect.c, r: rect.r, w: rect.w, h: a }, S, out); bsp({ c: rect.c, r: rect.r + a, w: rect.w, h: rect.h - a }, S, out); }
    }
    const hotelSigns = VC.DATA.hotelSigns.slice();
    regions.forEach((reg) => {
      if (reg.n < 6) return;
      const z0 = zoneAt((reg.c + reg.w / 2) * CELL, (reg.r + reg.h / 2) * CELL);
      const S0 = STYLES[z0.s] || STYLES.hawker;
      const leaves = [];
      bsp(reg, S0, leaves);
      leaves.forEach((lf) => {
        const f = fit(lf, reg.id);
        if (!f || f.w < 2 || f.h < 2) return;
        const lx = f.c * CELL, ly = f.r * CELL, lw = f.w * CELL, lh = f.h * CELL;
        const zone = zoneAt(lx + lw / 2, ly + lh / 2);
        const S = STYLES[zone.s] || S0;
        makeLot(S, zone.s, lx, ly, lw, lh);
      });
    });

    function makeLot(S, style, lx, ly, lw, lh) {
      if (style === 'residential') decals.push({ t: 'lawn', x: lx + 2, y: ly + 2, w: lw - 4, h: lh - 4 });
      if ((style === 'merchant' || style === 'tech' || style === 'docks') && rng.chance(0.14)) { decals.push({ t: 'parking', x: lx + 6, y: ly + 6, w: lw - 12, h: lh - 12 }); return; }
      const set = rng.range(S.set[0], S.set[1]);
      let x = lx + set, y = ly + set, w = lw - set * 2, h = lh - set * 2;
      if (w < 30 || h < 30) return;
      let kind = S.kind;
      let zt = rng.range(S.h[0], S.h[1]);
      if (style === 'residential') {
        if (rng.chance(0.12) && w > 90) { kind = 'box'; zt = rng.range(60, 110); }
        else {
          // house + backyard pool
          const hw = w * rng.range(0.55, 0.75), hh = h * rng.range(0.55, 0.75);
          if (rng.chance(0.45)) decals.push({ t: 'pool', x: x + hw + 6, y: y + hh * 0.2, w: Math.max(14, w - hw - 14), h: Math.max(14, hh * 0.5) });
          w = hw; h = hh;
          if (rng.chance(0.6)) props.push({ t: 'palm', x: lx + lw - 14, y: ly + lh - 14, z: rng.range(60, 90), v: rng.int(0, 3), rot: rng() * 6.28 });
        }
      }
      const wall = rng.pick(S.walls), roof = rng.pick(S.roofs);
      const tiers = [{ x, y, w, h, z0: 0, z1: zt, wall, roof, win: S.win }];
      const b = { shape: 'box', x, y, w, h, cx: x + w / 2, cy: y + h / 2, tiers, kind, seed: rng.int(1, 1e9), det: [] };
      if (kind === 'tower' && w > 110 && h > 110 && rng.chance(0.4)) {
        tiers[0].z1 = rng.range(40, 70);
        const ix = w * rng.range(0.15, 0.25), iy = h * rng.range(0.15, 0.25);
        tiers.push({ x: x + ix, y: y + iy, w: w - ix * 2, h: h - iy * 2, z0: tiers[0].z1, z1: zt, wall: VC.shade(wall, 1.1), roof, win: 2 });
      }
      const top = tiers[tiers.length - 1];
      // roof details (relative to top tier)
      if (kind === 'house') b.det.push({ t: 'ridge' });
      else {
        b.det.push({ t: 'rim' });
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) b.det.push({ t: 'ac', x: top.x + rng.range(8, top.w - 26), y: top.y + rng.range(8, top.h - 22), w: rng.range(10, 18), h: rng.range(8, 14) });
        if (kind === 'hotel' && rng.chance(0.5) && top.w > 60) b.det.push({ t: 'pool', x: top.x + top.w * 0.2, y: top.y + top.h * 0.25, w: top.w * 0.45, h: top.h * 0.4 });
        if (kind === 'tower' && top.z1 > 280 && rng.chance(0.4)) b.det.push({ t: 'heli', x: top.x + top.w / 2, y: top.y + top.h / 2, r: Math.min(top.w, top.h) * 0.3 });
        if (kind === 'warehouse') b.det.push({ t: 'stripes' });
        if (style === 'tech' && rng.chance(0.4)) b.det.push({ t: 'solar', x: top.x + 10, y: top.y + 10, w: top.w - 20, h: top.h * 0.45 });
      }
      if (style === 'hotels' && x + w > 6650 && hotelSigns.length) b.sign = { text: hotelSigns.shift(), color: rng.pick(['#ff4fb0', '#37e6ff', '#ffd23f', '#b86bff', '#2ee6a6']) };
      buildings.push(b);
    }

    // finalize buildings: z, solids
    buildings.forEach((b) => {
      b.maxZ = b.shape === 'cyl' ? b.z1 : Math.max(...b.tiers.map((t) => t.z1));
      if (b.shape !== 'cyl') solids.push({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, h: b.maxZ });
    });
    // landmark signs
    world.signs = [];
    for (const id in LANDMARKS) {
      const L = LANDMARKS[id], s = L.sign;
      const b = buildings.find((bb) => bb.lm === id && bb.shape === 'box');
      world.signs.push({ text: s.text, color: s.color, x: s.x, y: s.y, z: s.z != null ? s.z : b ? b.maxZ : 4, big: true });
    }
    buildings.forEach((b) => { if (b.sign) world.signs.push({ text: b.sign.text, color: b.sign.color, x: b.cx, y: b.cy, z: b.maxZ }); });

    // docks: containers + cranes
    const cColors = ['#c0392b', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400'];
    for (let y = 1740; y < 2240; y += 70) for (let x = 140; x < 690; x += 66) {
      if (Math.abs(x + 28 - 400) < 70) continue;
      if (x > 460 && x < 640 && y < 1800 && y > 1700) continue;
      if (Math.hypot(x - 300, y - 2150) < 80) continue;
      if (rng.chance(0.25)) continue;
      const z = (x > 480 && x < 640 && y < 1800) ? 36 : 22 * rng.int(1, 3);
      const col = rng.pick(cColors);
      buildings.push({ shape: 'box', kind: 'container', x, y, w: 56, h: 26, cx: x + 28, cy: y + 13, maxZ: z, tiers: [{ x, y, w: 56, h: 26, z0: 0, z1: z, wall: VC.shade(col, 0.8), roof: col, win: 0 }], det: [{ t: 'stripes' }], seed: 1 });
      solids.push({ x0: x, y0: y, x1: x + 56, y1: y + 26, h: z });
    }
    [[230, 1300], [230, 1950]].forEach((p) => props.push({ t: 'crane', x: p[0], y: p[1], z: 170 }));

    // beach: lifeguard towers, umbrellas, towels
    const towerCols = ['#ff9ec7', '#8ff0d0', '#ffe58a', '#8fd8ff'];
    [900, 2350, 2950, 3850, 4600, 5250].forEach((y, i) => {
      const x = 7230;
      buildings.push({ shape: 'box', kind: 'lifeguard', x: x - 20, y: y - 17, w: 40, h: 34, cx: x, cy: y, maxZ: 40, tiers: [{ x: x - 20, y: y - 17, w: 40, h: 34, z0: 18, z1: 40, wall: towerCols[i % 4], roof: '#ffffff', win: 0 }], det: [{ t: 'stripes' }], seed: 1 });
      solids.push({ x0: x - 16, y0: y - 14, x1: x + 16, y1: y + 14, h: 40 });
    });
    const okBeach = (x, y) => get(x, y) === T.SAND && Math.abs(y - 1900) > 120 && Math.abs(y - 3300) > 120 && x > 6980;
    for (let i = 0; i < 70; i++) {
      const x = rng.range(6990, 7360), y = rng.range(450, 5800);
      if (!okBeach(x, y)) continue;
      if (rng.chance(0.5)) props.push({ t: 'umbrella', x, y, z: 24, col: rng.pick(['#ff4fb0', '#37e6ff', '#ffd23f', '#2ee6a6', '#ff8a3d']), rot: rng() * 6.28 });
      else decals.push({ t: 'towel', x, y, w: 14, h: 30, col: rng.pick(['#ff4fb0', '#37e6ff', '#ffd23f', '#ffffff']), rot: rng.range(-0.5, 0.5) });
    }
    // palms
    const palmOk = (x, y) => { const t = get(x, y); return t !== T.WATER && t !== T.ROAD && t !== T.BRIDGE && t !== T.RESERVED && !solids.some((s) => x > s.x0 - 8 && x < s.x1 + 8 && y > s.y0 - 8 && y < s.y1 + 8); };
    const addPalm = (x, y) => { if (palmOk(x, y)) { props.push({ t: 'palm', x, y, z: rng.range(70, 110), v: rng.int(0, 3), rot: rng() * 6.28 }); circles.push({ x, y, r: 6, h: 90 }); } };
    for (let y = 640; y < 5480; y += 78) { if (Math.abs(y - 1900) > 60 && Math.abs(y - 3300) > 60) addPalm(6850 + 52 + 26, y); }
    for (let y = 660; y < 5480; y += 130) addPalm(6850 - 52 - 9, y);
    for (let i = 0; i < 110; i++) addPalm(rng.range(6990, 7360), rng.range(450, 5850));
    world.roads.forEach((s) => {
      if (s.kind !== 'major') return;
      const z = zoneAt((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
      if (!['hotels', 'residential', 'merchant', 'hawker'].includes(z.s)) return;
      const len = s.hor ? s.x2 - s.x1 : s.y2 - s.y1;
      for (let d = 60; d < len; d += 190) {
        const o = s.w / 2 + 9;
        if (s.hor) addPalm(s.x1 + d, s.y1 + (d % 380 < 190 ? o : -o)); else addPalm(s.x1 + (d % 380 < 190 ? o : -o), s.y1 + d);
      }
    });
    PARKS.forEach((p) => { for (let i = 0; i < p[2] * p[3] / 9000; i++) { const x = p[0] + rng.range(20, p[2] - 20), y = p[1] + rng.range(20, p[3] - 20); if (Math.hypot(x - 1125, y - 5100) > 170) { if (rng.chance(0.5)) addPalm(x, y); else if (palmOk(x, y)) { props.push({ t: 'tree', x, y, z: 40, r: rng.range(16, 26), col: rng.pick(['#3f8f4a', '#4fa35a', '#2f7d45']) }); circles.push({ x, y, r: 6, h: 40 }); } } } });
    for (let i = 0; i < 26; i++) { const a = rng() * 6.28, d = rng.range(140, 260); addPalm(3800 + Math.cos(a) * d, 880 + Math.sin(a) * d); }
    for (let i = 0; i < 16; i++) { const a = rng() * 6.28, d = rng.range(200, 320); addPalm(8360 + Math.cos(a) * d, 3300 + Math.sin(a) * d); }
    for (let i = 0; i < 260; i++) { const x = rng.range(300, 3300), y = rng.range(2400, 5800); if (get(x, y) === T.GROUND) addPalm(x, y); }
    // lamps
    world.roads.forEach((s) => {
      const len = s.hor ? s.x2 - s.x1 : s.y2 - s.y1;
      for (let d = 80, i = 0; d < len; d += 240, i++) {
        const o = (s.w / 2 + (s.kind === 'bridge' || s.kind === 'pier' ? 4 : 10)) * (i % 2 ? 1 : -1);
        const x = s.hor ? s.x1 + d : s.x1 + o, y = s.hor ? s.y1 + o : s.y1 + d;
        if (world.intersections.some((q) => Math.abs(q.x - x) < 70 && Math.abs(q.y - y) < 70)) continue;
        props.push({ t: 'lamp', x, y, z: 46 });
      }
    });
    // carousel on pier, hawker stalls
    props.push({ t: 'carousel', x: 7760, y: 2010, z: 22, r: 48 }); circles.push({ x: 7760, y: 2010, r: 48, h: 22 });
    for (let i = 0; i < 8; i++) {
      const x = 800 + (i % 2) * 130, y = 3420 + Math.floor(i / 2) * 120;
      const col = ['#ff6b6b', '#ffd23f', '#2ee6a6', '#37e6ff'][i % 4];
      buildings.push({ shape: 'box', kind: 'stall', x, y, w: 80, h: 60, cx: x + 40, cy: y + 30, maxZ: 26, tiers: [{ x, y, w: 80, h: 60, z0: 0, z1: 26, wall: '#d9cbb5', roof: col, win: 0 }], det: [{ t: 'stripes' }], seed: 1 });
      solids.push({ x0: x, y0: y, x1: x + 80, y1: y + 60, h: 26 });
    }
    // road text on frontier bridge: the AI product loop
    'PROBLEM WORKFLOW DATA MODEL EVAL LAUNCH LEARNING'.split(' ').forEach((wd, i) => decals.push({ t: 'text', text: wd, x: 7390 + i * 96, y: 3300, size: 19 }));
    // barricade
    world.barricade = { x0: 7395, y0: 3246, x1: 7425, y1: 3354, h: 30 };

    world.buildings = buildings; world.decals = decals; world.props = props; world.solids = solids; world.circles = circles;
    world.ramps = RAMPS.map((r) => ({ ...r, w: 56, l: 70 }));
    world.packages = PACKAGES.map((p, i) => ({ x: p[0], y: p[1], i, got: false }));
    world.flamingos = [[7100, 1250], [7200, 4100], [7250, 5300], [1300, 5250], [5850, 1650], [3650, 1100]].map((p) => ({ x: p[0], y: p[1] }));

    // spatial hash
    const HC = 256, hw = Math.ceil(W / HC), hh = Math.ceil(H / HC);
    const mk = () => Array.from({ length: hw * hh }, () => []);
    const hash = { b: mk(), p: mk(), s: mk(), c: mk() };
    const ins = (arr, i, x0, y0, x1, y1) => { for (let r = Math.max(0, Math.floor(y0 / HC)); r <= Math.min(hh - 1, Math.floor(y1 / HC)); r++) for (let c = Math.max(0, Math.floor(x0 / HC)); c <= Math.min(hw - 1, Math.floor(x1 / HC)); c++) arr[r * hw + c].push(i); };
    buildings.forEach((b, i) => ins(hash.b, i, b.x, b.y, b.x + b.w, b.y + b.h));
    props.forEach((p, i) => ins(hash.p, i, p.x - 60, p.y - 60, p.x + 60, p.y + 60));
    solids.forEach((s, i) => ins(hash.s, i, s.x0, s.y0, s.x1, s.y1));
    circles.forEach((c, i) => ins(hash.c, i, c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r));
    let stamp = 0;
    const marks = { b: new Uint32Array(buildings.length), p: new Uint32Array(props.length), s: new Uint32Array(solids.length), c: new Uint32Array(circles.length) };
    world.query = function (type, x0, y0, x1, y1, out) {
      stamp++; out.length = 0;
      const arr = hash[type], mark = marks[type];
      for (let r = Math.max(0, Math.floor(y0 / HC)); r <= Math.min(hh - 1, Math.floor(y1 / HC)); r++) for (let c = Math.max(0, Math.floor(x0 / HC)); c <= Math.min(hw - 1, Math.floor(x1 / HC)); c++) {
        const cell = arr[r * hw + c];
        for (let k = 0; k < cell.length; k++) { const i = cell[k]; if (mark[i] !== stamp) { mark[i] = stamp; out.push(i); } }
      }
      return out;
    };

    // road graph for traffic
    const nodes = new Map(), edges = [];
    const node = (x, y) => { const k = x + '|' + y; if (!nodes.has(k)) nodes.set(k, { x, y, e: [] }); return nodes.get(k); };
    roads.forEach((s) => {
      if (s.kind === 'pier') return;
      const pts = [s.hor ? s.x1 : s.y1, s.hor ? s.x2 : s.y2, ...s.cuts.map((c) => c[0])].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 1);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = s.hor ? node(pts[i], s.y1) : node(s.x1, pts[i]), b = s.hor ? node(pts[i + 1], s.y1) : node(s.x1, pts[i + 1]);
        const e = { a, b, w: s.w, closed: s.tag === 'frontier' };
        edges.push(e); a.e.push(e); b.e.push(e);
      }
    });
    world.graph = { nodes: [...nodes.values()], edges };
    return world;
  }

  VC.World = { build, W, H, CELL };
})();
