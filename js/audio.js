/* VIBE CITY — procedural 80s radio + sound effects (Web Audio, no samples).
   All music is generated live from original chord progressions. */
(function () {
  const VC = window.VC;
  const A = (VC.Audio = { ready: false, station: 0, musicVol: 0.75, sfxVol: 0.7, muted: false });
  let ctx, master, musicOut, sfxOut, reverb, gated, delay, delayFb, noise, session = null, sched = null;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  A.stations = [
    { id: 'flashfm', name: 'Flash FM', tag: 'Vice City · 1986', color: '#ff4fb0', style: 'file', src: 'music/flash-fm.mp3', songs: [], available: false },
    { id: 'flash', name: 'Flash PM', tag: 'Hits for people who ship', color: '#ff4fb0', style: 'pop',
      songs: [
        { title: 'Neon Roadmap', artist: 'The Stakeholders', bpm: 118, key: 57, mode: 'maj', seed: 11, verse: ['I', 'V', 'vi', 'IV'], chorus: ['IV', 'V', 'I', 'vi'] },
        { title: 'Ship It Tonight', artist: 'Richie & The Release Train', bpm: 124, key: 62, mode: 'maj', seed: 12, verse: ['I', 'bVII', 'IV', 'I'], chorus: ['vi', 'IV', 'I', 'V'] },
      ] },
    { id: 'wave', name: 'Wave 1.0.3', tag: 'New wave. Versioned.', color: '#37e6ff', style: 'newwave',
      songs: [
        { title: 'Context Window', artist: 'The Attention Heads', bpm: 126, key: 57, mode: 'min', seed: 21, verse: ['i', 'bVI', 'bIII', 'bVII'], chorus: ['bVI', 'bVII', 'i', 'i'] },
        { title: 'Ocean Drive Data', artist: 'Pipeline', bpm: 120, key: 64, mode: 'min', seed: 22, verse: ['i', 'bVII', 'bVI', 'bVII'], chorus: ['iv', 'bVI', 'bVII', 'i'] },
      ] },
    { id: 'embed', name: 'Embedding 98.3', tag: 'Power ballads for latent feelings', color: '#c77dff', style: 'ballad',
      songs: [
        { title: 'Human in the Loop', artist: 'Feedback Loop', bpm: 74, key: 60, mode: 'maj', seed: 31, verse: ['I', 'iii', 'IV', 'V'], chorus: ['vi', 'IV', 'I', 'V'] },
        { title: 'Latent Space Love', artist: 'Gradient Descent', bpm: 70, key: 65, mode: 'maj', seed: 32, verse: ['I', 'vi', 'ii', 'V'], chorus: ['IV', 'V', 'iii', 'vi'] },
      ] },
    { id: 'feature', name: 'Feature 105', tag: 'Disco, funk & feature launches', color: '#ffd23f', style: 'disco',
      songs: [
        { title: 'Get Down (To Production)', artist: 'The Deployers', bpm: 116, key: 62, mode: 'min', seed: 41, verse: ['i', 'iv', 'i', 'iv'], chorus: ['bVI', 'bVII', 'i', 'i'] },
        { title: 'Retention (Uplift Me)', artist: 'Churn Baby Churn', bpm: 112, key: 65, mode: 'maj', seed: 42, verse: ['ii', 'V', 'I', 'vi'], chorus: ['IV', 'V', 'iii', 'vi'] },
      ] },
    { id: 'latent', name: 'Latent Style', tag: 'Electro from the edge of the distribution', color: '#7cff6b', style: 'electro',
      songs: [
        { title: 'Planet Prompt', artist: 'MC Context', bpm: 104, key: 55, mode: 'min', seed: 51, verse: ['i', 'i', 'bVII', 'bVI'], chorus: ['i', 'bIII', 'bVII', 'iv'] },
        { title: 'Tokenizer', artist: 'Soul Sonic Gradient', bpm: 110, key: 60, mode: 'min', seed: 52, verse: ['i', 'bVI', 'i', 'bVII'], chorus: ['iv', 'i', 'bVI', 'bVII'] },
      ] },
    { id: 'vcpr', name: 'VCPR', tag: 'Vibe City Product Radio · talk', color: '#ffffff', style: 'talk', songs: [] },
  ];

  // ---------- setup ----------
  A.init = function () {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.7;
    master.connect(comp); comp.connect(ctx.destination);
    A.analyser = ctx.createAnalyser(); A.analyser.fftSize = 2048; comp.connect(A.analyser);
    musicOut = ctx.createGain(); musicOut.gain.value = A.musicVol; musicOut.connect(master);
    sfxOut = ctx.createGain(); sfxOut.gain.value = A.sfxVol; sfxOut.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(2.4, 2.8, false);
    const rv = ctx.createGain(); rv.gain.value = 0.32; reverb.connect(rv); rv.connect(musicOut);
    gated = ctx.createConvolver(); gated.buffer = makeIR(0.22, 0, true);
    const gv = ctx.createGain(); gv.gain.value = 0.55; gated.connect(gv); gv.connect(musicOut);
    delay = ctx.createDelay(1.5); delayFb = ctx.createGain(); delayFb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    const dv = ctx.createGain(); dv.gain.value = 0.3;
    delay.connect(dlp); dlp.connect(delayFb); delayFb.connect(delay); dlp.connect(dv); dv.connect(musicOut);
    setupEngine();
    A.ready = true;
    sched = setInterval(tick, 25);
  };
  function makeIR(len, decay, gate) {
    const n = Math.floor(ctx.sampleRate * len), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n; lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * (gate ? (t < 0.9 ? 1 - t * 0.3 : (1 - t) * 7) : Math.pow(1 - t, decay));
      }
    }
    return b;
  }
  A.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); if (fileOn() && fileEl.paused) fileEl.play().catch(() => {}); };
  A.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend(); if (fileEl) fileEl.pause(); };
  A.setMuted = function (m) { A.muted = m; fileVol(); if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.05); if (m) stopTalk(); else if (A.stations[A.station] && A.stations[A.station].style === 'talk') startTalk(); };
  A.duck = function (on) { ducked = on; fileVol(); if (musicOut) musicOut.gain.setTargetAtTime(on ? A.musicVol * 0.35 : A.musicVol, ctx.currentTime, 0.2); };
  A.setMusicVol = function (v) { A.musicVol = v; if (musicOut) musicOut.gain.setTargetAtTime(v, ctx.currentTime, 0.05); fileVol(); };

  // ---------- local MP3 station (optional; only if music/flash-fm.mp3 exists) ----------
  // Played through a plain <audio> element: Web Audio would output silence for
  // file:// pages because of CORS, and the element streams a 60-min file cheaply.
  let fileEl = null, ducked = false;
  const fileSt = A.stations.find((s) => s.style === 'file');
  if (fileSt) {
    fileEl = new Audio();
    fileEl.preload = 'metadata'; fileEl.loop = true;
    fileEl.addEventListener('loadedmetadata', () => { fileSt.available = true; fileSt.duration = fileEl.duration; document.dispatchEvent(new Event('vc-file-station')); });
    fileEl.addEventListener('error', () => { fileSt.available = false; });
    fileEl.src = fileSt.src;
  }
  A.fileEl = fileEl;
  function fileVol() { if (fileEl) fileEl.volume = A.muted ? 0 : VC.clamp(A.musicVol * (ducked ? 0.35 : 1), 0, 1); }
  const fileOn = () => fileEl && A.stations[A.station] && A.stations[A.station].style === 'file';
  A.isAvailable = (i) => i < 0 || A.stations[i].style !== 'file' || A.stations[i].available;

  // ---------- voices ----------
  function out(gainVal, dest) { const g = ctx.createGain(); g.gain.value = gainVal; g.connect(dest || session.bus); return g; }
  function envGain(t, a, peak, dec, sus, end, rel, dest) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * sus, t + a, dec);
    g.gain.setValueAtTime(peak * sus, end); // approx
    g.gain.setTargetAtTime(0, end, rel);
    g.connect(dest); return g;
  }
  function osc(type, f, t, stop, dest, detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune; o.connect(dest); o.start(t); o.stop(stop); return o; }
  function noiseSrc(t, dur, dest) { const s = ctx.createBufferSource(); s.buffer = noise; s.connect(dest); s.start(t, Math.random() * 1.5, dur + 0.05); return s; }
  function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; b.connect(dest); return b; }
  function send(node, target, amt) { const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(target); }

  const V = {
    kick(t, v, deep) {
      const g = ctx.createGain(); g.connect(session.bus);
      const len = deep ? 0.8 : 0.32;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      const o = osc('sine', deep ? 70 : 150, t, t + len, g);
      o.frequency.setValueAtTime(deep ? 70 : 150, t); o.frequency.exponentialRampToValueAtTime(deep ? 42 : 48, t + (deep ? 0.25 : 0.1));
    },
    snare(t, v) {
      const g = ctx.createGain(); g.connect(session.bus); send(g, gated, 1.1);
      g.gain.setValueAtTime(v * 0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      noiseSrc(t, 0.2, filt('highpass', 1400, 0, g));
      const bg = ctx.createGain(); bg.connect(g); bg.gain.setValueAtTime(0.7, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc('triangle', 190, t, t + 0.12, bg);
    },
    clap(t, v) {
      const g = ctx.createGain(); g.connect(session.bus); send(g, reverb, 0.5);
      const bp = filt('bandpass', 1100, 0.9, g);
      [0, 0.011, 0.022].forEach((o) => { const gg = ctx.createGain(); gg.connect(bp); gg.gain.setValueAtTime(v * 0.5, t + o); gg.gain.exponentialRampToValueAtTime(0.001, t + o + (o === 0.022 ? 0.16 : 0.012)); noiseSrc(t + o, 0.18, gg); });
    },
    hat(t, v, open) {
      const g = ctx.createGain(); g.connect(session.bus);
      g.gain.setValueAtTime(v * 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.28 : 0.045));
      noiseSrc(t, 0.3, filt('highpass', 7500, 0, g));
    },
    tom(t, v, f) {
      const g = ctx.createGain(); g.connect(session.bus); send(g, gated, 0.9);
      g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      const o = osc('sine', f, t, t + 0.36, g); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.3);
    },
    crash(t, v) { const g = ctx.createGain(); g.connect(session.bus); send(g, reverb, 0.4); g.gain.setValueAtTime(v * 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6); noiseSrc(t, 1.7, filt('highpass', 4500, 0, g)); },
    cowbell(t, v) { const g = ctx.createGain(); const bp = filt('bandpass', 2600, 1.5, g); g.connect(session.bus); g.gain.setValueAtTime(v * 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); osc('square', 540, t, t + 0.26, bp); osc('square', 800, t, t + 0.26, bp); },
    bass(t, m, dur, v, kind) {
      const f = hz(m), end = t + dur;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'slap' ? 6 : 9;
      lp.frequency.setValueAtTime(kind === 'round' ? 700 : 2400, t); lp.frequency.setTargetAtTime(kind === 'round' ? 400 : 320, t, 0.07);
      const g = envGain(t, 0.005, v * 0.42, 0.15, 0.6, end, 0.03, session.bus); lp.connect(g);
      if (kind === 'sub') { osc('sine', f, t, end + 0.2, lp).frequency.setValueAtTime(f * 1.5, t); return; }
      osc(kind === 'round' ? 'triangle' : 'sawtooth', f, t, end + 0.2, lp);
      osc('square', f / 2, t, end + 0.2, lp);
    },
    pluck(t, m, v, dest) {
      const f = hz(m);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(4200, t); lp.frequency.setTargetAtTime(500, t, 0.06);
      const g = ctx.createGain(); g.connect(session.bus); send(g, delay, 0.6); send(g, reverb, 0.3);
      g.gain.setValueAtTime(v * 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      lp.connect(g); osc('sawtooth', f, t, t + 0.3, lp); osc('square', f * 1.003, t, t + 0.3, lp);
    },
    pad(t, notes, dur, v, bright) {
      const end = t + dur;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright ? 2600 : 1500;
      const g = envGain(t, 0.35, v * 0.05, 0.5, 0.85, end, 0.5, session.bus); lp.connect(g); send(g, reverb, 0.9);
      notes.forEach((m) => { [-9, 0, 9].forEach((dt) => osc('sawtooth', hz(m), t, end + 2, lp, dt)); });
    },
    lead(t, m, dur, v, kind) {
      const f = hz(m), end = t + dur;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'sax' ? 1900 : 3600;
      const g = envGain(t, kind === 'sax' ? 0.06 : 0.01, v * 0.12, 0.3, 0.75, end, 0.08, session.bus); lp.connect(g);
      send(g, delay, 0.45); send(g, reverb, 0.45);
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vd = ctx.createGain(); vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(kind === 'sax' ? 14 : 8, t + 0.25); vib.connect(vd); vib.start(t); vib.stop(end + 0.5);
      const o1 = osc(kind === 'sax' ? 'sawtooth' : 'square', f, t, end + 0.5, lp); const o2 = osc('sawtooth', f, t, end + 0.5, lp, 7);
      vd.connect(o1.detune); vd.connect(o2.detune);
    },
    ep(t, m, v) { // DX7-style FM electric piano
      const f = hz(m), g = ctx.createGain(); g.connect(session.bus); send(g, reverb, 0.6); send(g, delay, 0.2);
      g.gain.setValueAtTime(v * 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      const car = osc('sine', f, t, t + 1.9, g);
      const mod = ctx.createOscillator(); mod.frequency.value = f; const mi = ctx.createGain(); mi.gain.setValueAtTime(f * 2.2, t); mi.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.9);
      mod.connect(mi); mi.connect(car.frequency); mod.start(t); mod.stop(t + 1.9);
      const tine = ctx.createOscillator(); tine.frequency.value = f * 14; const ti = ctx.createGain(); ti.gain.setValueAtTime(f * 1.4, t); ti.gain.exponentialRampToValueAtTime(1, t + 0.08);
      tine.connect(ti); ti.connect(car.frequency); tine.start(t); tine.stop(t + 0.2);
    },
    stab(t, notes, v) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(3800, t + 0.03); lp.frequency.setTargetAtTime(1200, t + 0.03, 0.08);
      const g = ctx.createGain(); g.connect(session.bus); send(g, reverb, 0.5); lp.connect(g);
      g.gain.setValueAtTime(v * 0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      notes.forEach((m) => { osc('sawtooth', hz(m), t, t + 0.32, lp, -6); osc('sawtooth', hz(m), t, t + 0.32, lp, 6); });
    },
  };

  // ---------- composition ----------
  const DEG = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  function chord(rn, key) {
    let s = rn, flat = 0;
    if (s[0] === 'b') { flat = 1; s = s.slice(1); }
    const minor = s === s.toLowerCase();
    const root = key + DEG[s.toUpperCase()] - flat;
    return { root, notes: [root, root + (minor ? 3 : 4), root + 7] };
  }
  function voice(ch, prev) { // pad voicing near previous chord, MIDI 55-72
    const cands = [];
    for (let inv = 0; inv < 3; inv++) {
      const n = ch.notes.map((m, i) => { let x = m; while (x < 55) x += 12; while (x > 67) x -= 12; return i < inv ? x + 12 : x; }).sort((a, b) => a - b);
      cands.push(n);
    }
    if (!prev) return cands[0];
    let best = cands[0], bd = 1e9;
    cands.forEach((c) => { const d = c.reduce((s, m, i) => s + Math.abs(m - prev[i]), 0); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  const RHYTHMS = ['x..x..x.x...x...', 'x.x...x.x.x.....', 'x...x.x...x.x...', 'x..x..x...x.x.x.', 'x.......x.x.x...', 'x..x...x..x.x...'];
  function melody(rng, chords, scale, key, lo) {
    const steps = []; let cur = lo + 7;
    const motif = RHYTHMS[rng.int(0, RHYTHMS.length - 1)], answer = RHYTHMS[rng.int(0, RHYTHMS.length - 1)];
    const inScale = (m) => scale.includes((((m - key) % 12) + 12) % 12);
    const shape = []; // interval pattern reused for bar 3
    for (let bar = 0; bar < 4; bar++) {
      const ch = chords[bar], rh = bar === 1 ? answer : bar === 3 ? 'x...x...x-------' : motif;
      let k = 0;
      for (let s = 0; s < 16; s++) {
        const c = rh[s];
        if (c !== 'x') { steps.push(c === '-' ? -2 : -1); continue; }
        let target;
        if (bar === 2 && shape[k] !== undefined) target = cur + shape[k];
        else if (s % 4 === 0) {
          const tones = []; for (let o = -12; o <= 24; o += 12) ch.notes.forEach((n) => tones.push(n + o));
          tones.sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
          target = tones[rng.chance(0.7) ? 0 : 1];
        } else { target = cur + rng.pick([-2, -1, 1, 2, 2, -3, 3]); }
        while (!inScale(target)) target += target > cur ? 1 : -1;
        target = VC.clamp(target, lo, lo + 16);
        if (bar === 0) shape.push(target - cur);
        if (bar === 3 && s >= 8) { target = ch.notes[0]; while (target < lo) target += 12; while (target > lo + 14) target -= 12; }
        cur = target; steps.push(target); k++;
      }
    }
    // durations: count sustains
    return steps;
  }
  function makeSong(st, def) {
    const rng = VC.rng(def.seed), key = def.key;
    const scale = def.mode === 'min' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const vc = def.verse.map((r) => chord(r, key)), cc = def.chorus.map((r) => chord(r, key));
    const form = [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['bridge', 4], ['chorus', 8], ['outro', 4]];
    const bars = []; let prev = null;
    form.forEach(([sec, n], si) => { for (let b = 0; b < n; b++) { const ch = (sec === 'chorus' ? cc : vc)[b % 4]; prev = voice(ch, prev); bars.push({ sec, b, n, ch, pad: prev, last: b === n - 1 && si < form.length - 1 }); } });
    const leadLo = st.style === 'ballad' ? 64 : 67;
    return { def, st, bars, spb: 60 / def.bpm / 4, mv: melody(rng, vc, scale, key, leadLo - 5), mc: melody(rng, cc, scale, key, leadLo), steps: bars.length * 16 };
  }
  const DRUMS = {
    pop: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
    newwave: { k: 'x.....x.x.......', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '' },
    ballad: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x...x...x...x...', o: '' },
    disco: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
    electro: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.', o: '', cb: '.......x......x.' },
  };
  const BASS = { pop: 'R..R..R.R..R..O.', newwave: 'R.R.R.R.R.R.R.O.', ballad: 'R.......F.......', disco: 'R.O.R.O.R.O.RRO.', electro: 'R-.....R-..R-...' };

  function playStep(song, i, t) {
    const bar = song.bars[Math.floor(i / 16)], s = i % 16, st = song.st.style, spb = song.spb;
    if (!bar) return;
    const sec = bar.sec, full = sec === 'chorus', quiet = sec === 'intro' || sec === 'outro' || sec === 'bridge';
    const D = DRUMS[st];
    const fill = bar.last && s >= 12;
    // drums
    if (!(sec === 'intro' && bar.b < 2) && sec !== 'outro') {
      if (sec !== 'bridge' && D.k[s] === 'x') V.kick(t, 0.95, st === 'electro');
      if (sec === 'bridge' && s % 8 === 0) V.kick(t, 0.6, st === 'electro');
      if (fill) V.tom(t, 0.8, [220, 180, 140, 110][s - 12]);
      else if (!quiet && D.s[s] === 'x') { if (st === 'electro' || (full && st !== 'ballad')) V.clap(t, 0.8); if (st !== 'electro') V.snare(t, 0.9); }
      if (!quiet && D.h[s] === 'x') V.hat(t, s % 4 === 0 ? 0.9 : 0.55);
      if (full && D.o && D.o[s] === 'x') V.hat(t, 0.7, true);
      if (D.cb && D.cb[s] === 'x' && !quiet) V.cowbell(t, 0.8);
      if (bar.b === 0 && s === 0 && (sec === 'chorus' || sec === 'verse')) V.crash(t, 0.9);
    }
    // bass
    if (sec !== 'intro' && sec !== 'outro' && sec !== 'bridge') {
      const c = BASS[st][s];
      if (c === 'R' || c === 'O' || c === 'F') {
        let m = bar.ch.root; while (m > 45) m -= 12; while (m < 33) m += 12;
        if (c === 'O') m += 12; if (c === 'F') m += 7;
        const dur = st === 'ballad' ? spb * 7 : st === 'electro' ? spb * 2.5 : spb * 0.9;
        V.bass(t, m, dur, 0.85, st === 'ballad' ? 'round' : st === 'electro' ? 'sub' : st === 'disco' ? 'slap' : 'saw');
      }
    }
    // pads / chords
    if (s === 0) {
      if (st === 'ballad') bar.pad.forEach((m, k) => V.ep(t + k * spb * 0.5, m, 0.8));
      if (st !== 'disco' || quiet) V.pad(t, bar.pad, spb * 16, full ? 1 : 0.8, st === 'pop');
    }
    if (st === 'ballad' && s === 8) bar.pad.forEach((m) => V.ep(t, m + 12, 0.45));
    if (st === 'disco' && !quiet && (s === 2 || s === 6 || s === 10 || s === 14)) V.stab(t, bar.pad, 0.9);
    if (st === 'pop' && full && (s === 0 || s === 6 || s === 12)) V.stab(t, bar.pad.map((m) => m + 12), 0.7);
    // arp
    if ((st === 'newwave' || st === 'pop' || st === 'electro' || (st === 'ballad' && full)) && (sec !== 'outro' || bar.b < 2)) {
      if (st !== 'ballad' || s % 2 === 0) {
        const tones = bar.pad.concat(bar.pad.map((m) => m + 12));
        const pat = st === 'electro' ? [0, 2, 4, 2] : [0, 1, 2, 3, 4, 5, 4, 3];
        const m = tones[pat[s % pat.length]] + (st === 'electro' ? 12 : 0);
        V.pluck(t, m, st === 'newwave' ? 0.95 : quiet ? 0.45 : 0.6);
      }
    }
    // lead melody
    if (sec === 'chorus' || (sec === 'verse' && st !== 'disco')) {
      const mel = sec === 'chorus' ? song.mc : song.mv, idx = ((bar.b % 4) * 16) + s, m = mel[idx];
      if (m > 0) {
        let n = 1; while (idx + n < mel.length && mel[idx + n] === -2) n++;
        let gap = n; while (idx + gap < mel.length && mel[idx + gap] === -1) gap++;
        const dur = spb * Math.min(n + (gap - n) * 0.5, 8) * 0.92;
        V.lead(t, m + (sec === 'verse' ? -12 + (st === 'ballad' ? 12 : 0) : 0), dur, sec === 'verse' ? 0.7 : 1, st === 'ballad' ? 'sax' : 'sq');
      }
    }
  }

  // ---------- station manager ----------
  const songsCache = {};
  const epoch = Math.random() * 600;
  function songsFor(i) { if (!songsCache[i]) songsCache[i] = A.stations[i].songs.map((d) => makeSong(A.stations[i], d)); return songsCache[i]; }
  A.onNowPlaying = null;
  A.setStation = function (i, silent) {
    if (!ctx) { A.station = i; return; }
    A.station = i;
    if (session) { const old = session.bus; old.gain.setTargetAtTime(0, ctx.currentTime, 0.04); setTimeout(() => old.disconnect(), 400); }
    stopTalk();
    session = null;
    if (fileEl && !fileEl.paused) fileEl.pause();
    if (i >= 0 && !A.isAvailable(i)) i = A.station = (i + 1) % A.stations.length; // file missing -> next station
    if (!silent) A.sfx('static');
    if (i < 0) return;
    const st = A.stations[i];
    if (st.style === 'file') {
      // tune in mid-broadcast, like the real game
      if (st.duration) fileEl.currentTime = (Date.now() / 1000 + epoch) % st.duration;
      fileVol(); fileEl.play().catch(() => {});
      if (A.onNowPlaying) A.onNowPlaying(st, { title: 'Flash FM', artist: 'GTA Vice City (your MP3)' });
      return;
    }
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicOut); bus.gain.setTargetAtTime(1, ctx.currentTime + 0.25, 0.08);
    session = { bus, i };
    if (st.style === 'talk') { startTalk(); return; }
    const songs = songsFor(i);
    const total = songs.reduce((s, x) => s + x.steps * x.spb + 2, 0);
    let pos = (ctx.currentTime + epoch * (i + 1)) % total, si = 0;
    while (pos > songs[si].steps * songs[si].spb + 2) { pos -= songs[si].steps * songs[si].spb + 2; si = (si + 1) % songs.length; }
    session.si = si; session.step = Math.min(songs[si].steps - 1, Math.floor(pos / songs[si].spb)); session.next = ctx.currentTime + 0.3;
    if (A.onNowPlaying) A.onNowPlaying(st, songs[si].def);
  };
  function tick() {
    if (!session || session.si === undefined || !ctx || ctx.state !== 'running') return;
    const songs = songsFor(session.i);
    while (session.next < ctx.currentTime + 0.18) {
      const song = songs[session.si];
      playStep(song, session.step, session.next);
      session.next += song.spb; session.step++;
      if (session.step >= song.steps) {
        session.si = (session.si + 1) % songs.length; session.step = 0; session.next += 1.5;
        if (A.onNowPlaying) A.onNowPlaying(A.stations[session.i], songs[session.si].def);
      }
    }
  }

  // ---------- talk radio (speech synthesis) ----------
  let talkIdx = 0, talkOn = false, bed = null;
  function startTalk() {
    if (!('speechSynthesis' in window) || A.muted) return;
    talkOn = true;
    // soft music bed
    bed = setInterval(() => { if (session && ctx) { const t = ctx.currentTime + 0.05; V.pad(t, [57, 60, 64].map((m) => m + (Math.floor(t / 8) % 2 ? 5 : 0)), 7.8, 0.35, false); } }, 8000);
    if (session && ctx) V.pad(ctx.currentTime + 0.1, [57, 60, 64], 7.8, 0.35, false);
    speakNext();
  }
  function stopTalk() { talkOn = false; if (bed) clearInterval(bed); bed = null; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  function pickVoice(pref) {
    const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    for (const p of pref) { const v = vs.find((x) => x.name.includes(p)); if (v) return v; }
    return vs[0] || null;
  }
  function speakNext() {
    if (!talkOn) return;
    const lines = VC.DATA.talk, [who, text] = lines[talkIdx % lines.length];
    talkIdx++;
    const u = new SpeechSynthesisUtterance(text);
    const host = who === 'host';
    u.voice = host ? pickVoice(['Daniel', 'Google UK English Male', 'Arthur', 'Fred']) : pickVoice(['Samantha', 'Alex', 'Google US English', 'Aaron']);
    u.pitch = host ? 0.85 : 1.05; u.rate = host ? 1.0 : 1.04; u.volume = VC.clamp(A.musicVol * 1.2, 0, 1);
    u.onend = () => setTimeout(speakNext, talkIdx % lines.length === 0 ? 4000 : 350);
    u.onerror = () => setTimeout(speakNext, 1500);
    if (A.onTalk) A.onTalk(host ? 'HOST' : 'RICHIE', text);
    speechSynthesis.speak(u);
  }

  // ---------- sfx ----------
  let eng = null, screech = null;
  function setupEngine() {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0; lp.connect(g); g.connect(sfxOut);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.connect(lp); o1.start();
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.connect(lp); o2.start();
    eng = { lp, g, o1, o2 };
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 3;
    const sg = ctx.createGain(); sg.gain.value = 0; s.connect(bp); bp.connect(sg); sg.connect(sfxOut); s.start();
    screech = sg;
  }
  A.engine = function (speedFrac, throttle, slip, on) {
    if (!eng) return;
    const t = ctx.currentTime, s = VC.clamp(Math.abs(speedFrac), 0, 1);
    const gear = Math.min(4, Math.floor(s * 5)), rpm = (s * 5 - gear) * 0.7 + 0.3 * (gear > 0 ? 1 : s * 3);
    const f = 34 + rpm * 70 + gear * 6;
    eng.o1.frequency.setTargetAtTime(f, t, 0.05); eng.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    eng.lp.frequency.setTargetAtTime(280 + rpm * 1200 + throttle * 300, t, 0.05);
    eng.g.gain.setTargetAtTime(on ? 0.035 + Math.abs(throttle) * 0.03 + s * 0.02 : 0, t, 0.08);
    screech.gain.setTargetAtTime(on ? VC.clamp((slip - 90) / 260, 0, 1) * 0.06 : 0, t, 0.05);
  };
  let horn = null;
  A.horn = function (on) {
    if (!ctx) return;
    if (on && !horn) { const g = ctx.createGain(); g.gain.value = 0.07; const lp = filt('lowpass', 2000, 0, g); g.connect(sfxOut); horn = [osc('square', 415, ctx.currentTime, ctx.currentTime + 30, lp), osc('square', 523, ctx.currentTime, ctx.currentTime + 30, lp), g]; }
    if (!on && horn) { horn[2].gain.setTargetAtTime(0, ctx.currentTime, 0.02); horn[0].stop(ctx.currentTime + 0.1); horn[1].stop(ctx.currentTime + 0.1); horn = null; }
  };
  A.sfx = function (name, v) {
    if (!ctx || A.muted) return;
    const t = ctx.currentTime + 0.01, o = sfxOut;
    const tone = (type, f, start, dur, vol, dest) => { const g = ctx.createGain(); g.connect(dest || o); g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur); osc(type, f, start, start + dur + 0.05, g); return g; };
    const burst = (start, dur, vol, ftype, f, q) => { const g = ctx.createGain(); g.connect(o); g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.001, start + dur); noiseSrc(start, dur, filt(ftype, f, q, g)); return g; };
    switch (name) {
      case 'static': burst(t, 0.35, 0.12, 'bandpass', 1500, 0.6); break;
      case 'crash': burst(t, 0.25, 0.3 * (v || 1), 'lowpass', 900); tone('sine', 70, t, 0.25, 0.4 * (v || 1)); break;
      case 'pickup': tone('sine', 1319, t, 0.25, 0.15); tone('sine', 1976, t + 0.09, 0.4, 0.15); break;
      case 'pager': [0, 0.12, 0.36, 0.48].forEach((d) => tone('square', 2800, t + d, 0.07, 0.05)); break;
      case 'click': tone('sine', 1200, t, 0.03, 0.06); break;
      case 'splash': burst(t, 0.9, 0.35, 'lowpass', 1200); for (let i = 0; i < 6; i++) tone('sine', 300 + Math.random() * 600, t + 0.2 + i * 0.08, 0.06, 0.05); break;
      case 'thunder': burst(t, 2.6, 0.35, 'lowpass', 180); break;
      case 'stunt': { const g = burst(t, 0.6, 0.15, 'bandpass', 800, 2); [523, 659, 784, 1047].forEach((f, i) => tone('square', f, t + 0.1 + i * 0.07, 0.15, 0.04)); g; break; }
      case 'rocket': burst(t, 6, 0.4, 'lowpass', 140); tone('sine', 40, t, 6, 0.3); break;
      case 'passed': {
        // original triumphant jingle (bright arpeggio + held chord)
        const notes = [67, 72, 76, 79, 84];
        notes.forEach((m, i) => tone('square', hz(m), t + i * 0.09, 0.22, 0.05));
        [72, 76, 79, 84].forEach((m) => { tone('sawtooth', hz(m), t + 0.5, 1.4, 0.03); tone('sine', hz(m + 12), t + 0.5, 1.6, 0.03); });
        tone('sine', hz(48), t + 0.5, 1.2, 0.2);
        [96, 91, 88, 84].forEach((m, i) => tone('sine', hz(m), t + 0.7 + i * 0.1, 0.4, 0.03));
        break;
      }
    }
  };
})();
