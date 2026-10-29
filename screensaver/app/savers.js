// Shared animations for the Mythic screensaver (used by saver.html and ../preview.html).
let current = null;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W, H, DPR;
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (current) current.init();
}
addEventListener('resize', resize);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- Starfield ---------- */
const starfield = {
  name: 'Starfield',
  init() {
    this.stars = Array.from({ length: 900 }, () => this.spawn(true));
    const g = this.g || ctx;                                       // g = offscreen target when used as a background
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  },
  spawn(anyZ) {
    return { x: rnd(-1, 1) * W, y: rnd(-1, 1) * H, z: anyZ ? rnd(1, W) : W, pz: 0 };
  },
  frame(dt) {
    const ctx = this.g || cv.getContext('2d');                    // same main context unless drawing offscreen
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, speed = 0.9 * W * dt;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.pz = s.z; s.z -= speed;
      if (s.z < 1) { this.stars[i] = this.spawn(false); continue; }
      const x = cx + s.x / s.z * cx * 0.5, y = cy + s.y / s.z * cy * 0.5;
      const px = cx + s.x / s.pz * cx * 0.5, py = cy + s.y / s.pz * cy * 0.5;
      if (x < 0 || x > W || y < 0 || y > H) { this.stars[i] = this.spawn(false); continue; }
      const b = 1 - s.z / W;
      ctx.strokeStyle = `rgba(${200 + 55 * b},${210 + 45 * b},255,${b})`;
      ctx.lineWidth = Math.max(0.5, b * 3);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
  }
};

/* ---------- 3D Pipes ---------- */
const pipes = {
  name: '3D Pipes',
  N: 14,
  init() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    this.used = new Set(); this.segments = 0; this.acc = 0;
    this.yaw = rnd(-0.6, 0.6); this.pitch = rnd(0.25, 0.5);       // camera must exist before drawing
    this.pipes = [this.newPipe(), this.newPipe()];
  },
  newPipe() {
    let p, tries = 0;
    do { p = [0, 0, 0].map(() => Math.floor(rnd(0, this.N))); } while (this.used.has(p + '') && tries++ < 50);
    this.used.add(p + '');
    const hue = Math.floor(rnd(0, 360));
    this.drawJoint(p, hue);
    return { p, dir: null, hue };
  },
  project([x, y, z]) {
    const n = this.N, s = Math.min(W, H) / n * 0.95;
    let X = (x - n / 2) * s, Y = (y - n / 2) * s, Z = (z - n / 2) * s;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    [X, Z] = [X * cy - Z * sy, X * sy + Z * cy];
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    [Y, Z] = [Y * cp - Z * sp, Y * sp + Z * cp];
    const f = 1400 / (1400 + Z);
    return [W / 2 + X * f, H / 2 + Y * f, f];
  },
  drawJoint(p, hue) {
    const [x, y, f] = this.project(p), r = Math.min(W, H) / this.N * 0.24 * f;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, `hsl(${hue},90%,85%)`); g.addColorStop(0.5, `hsl(${hue},80%,50%)`); g.addColorStop(1, `hsl(${hue},80%,18%)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  },
  drawSegment(a, b, hue) {
    const [x1, y1, f1] = this.project(a), [x2, y2, f2] = this.project(b);
    const w = Math.min(W, H) / this.N * 0.3 * (f1 + f2) / 2;
    ctx.lineCap = 'round';
    const layers = [[1, 20], [0.75, 38], [0.45, 58], [0.15, 85]];
    // offset the highlight a bit toward the top-left for a rounded look
    const dx = y2 - y1, dy = x1 - x2, len = Math.hypot(dx, dy) || 1, ox = -Math.abs(dx / len), oy = -Math.abs(dy / len);
    for (const [k, l] of layers) {
      const o = (1 - k) * w * 0.25;
      ctx.strokeStyle = `hsl(${hue},80%,${l}%)`; ctx.lineWidth = w * k;
      ctx.beginPath(); ctx.moveTo(x1 + ox * o, y1 + oy * o); ctx.lineTo(x2 + ox * o, y2 + oy * o); ctx.stroke();
    }
  },
  dirs: [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
  step(pipe) {
    const free = this.dirs.filter(d => {
      const q = pipe.p.map((v, i) => v + d[i]);
      return q.every(v => v >= 0 && v < this.N) && !this.used.has(q + '');
    });
    if (!free.length) return false;
    let d = pipe.dir;
    if (!d || !free.includes(d) || Math.random() < 0.25) {
      const nd = free[Math.floor(rnd(0, free.length))];
      if (d && nd !== d) this.drawJoint(pipe.p, pipe.hue);
      d = nd;
    }
    const q = pipe.p.map((v, i) => v + d[i]);
    this.drawSegment(pipe.p, q, pipe.hue);
    this.used.add(q + ''); pipe.p = q; pipe.dir = d; this.segments++;
    return true;
  },
  frame(dt) {
    this.acc += dt;
    while (this.acc > 0.03) {
      this.acc -= 0.03;
      for (let i = 0; i < this.pipes.length; i++) {
        if (!this.step(this.pipes[i])) {
          this.drawJoint(this.pipes[i].p, this.pipes[i].hue);
          this.pipes[i] = this.newPipe();
        }
      }
      if (this.segments > this.N * this.N * 4) { this.init(); return; }
    }
  }
};

/* ---------- Mystify ---------- */
const mystify = {
  name: 'Mystify',
  init() {
    this.shapes = [0, 1].map(() => ({
      pts: Array.from({ length: 4 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-1, 1) * 260, vy: rnd(-1, 1) * 260 })),
      hue: rnd(0, 360), trail: []
    }));
    this.acc = 0;
  },
  frame(dt) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    this.acc += dt;
    const snap = this.acc > 0.04; if (snap) this.acc = 0;
    for (const s of this.shapes) {
      for (const p of s.pts) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 0 || p.x > W) { p.vx *= -1; p.x = Math.max(0, Math.min(W, p.x)); }
        if (p.y < 0 || p.y > H) { p.vy *= -1; p.y = Math.max(0, Math.min(H, p.y)); }
      }
      s.hue = (s.hue + 30 * dt) % 360;
      if (snap) { s.trail.unshift(s.pts.map(p => [p.x, p.y])); if (s.trail.length > 8) s.trail.pop(); }
      s.trail.forEach((poly, i) => {
        ctx.strokeStyle = `hsla(${s.hue},100%,60%,${1 - i / 8})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); poly.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
      });
    }
  }
};

/* ---------- Matrix rain ---------- */
const matrix = {
  name: 'Matrix',
  chars: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789',
  init() {
    this.fs = 18; this.cols = Math.ceil(W / this.fs);
    this.drops = Array.from({ length: this.cols }, () => rnd(-H / this.fs, 0));
    this.speed = Array.from({ length: this.cols }, () => rnd(8, 22));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  },
  frame(dt) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, W, H);
    ctx.font = `${this.fs}px monospace`;
    for (let i = 0; i < this.cols; i++) {
      const prev = Math.floor(this.drops[i]);
      this.drops[i] += this.speed[i] * dt;
      const row = Math.floor(this.drops[i]);
      if (row === prev) continue;
      const ch = this.chars[Math.floor(rnd(0, this.chars.length))], x = i * this.fs, y = row * this.fs;
      ctx.fillStyle = '#0a3';                                     // recolor previous head green
      ctx.fillText(this.chars[Math.floor(rnd(0, this.chars.length))], x, y - this.fs);
      ctx.fillStyle = '#cfffd8'; ctx.fillText(ch, x, y);          // bright head
      if (y > H && Math.random() > 0.975) { this.drops[i] = rnd(-20, 0); this.speed[i] = rnd(8, 22); }
    }
  }
};

/* ---------- Bouncing text ---------- */
const bounce = {
  name: 'Bounce',
  text: 'AFK',
  init() {
    this.x = rnd(0, W / 2); this.y = rnd(0, H / 2);
    this.vx = 180; this.vy = 140; this.hue = rnd(0, 360); this.flash = 0;
  },
  frame(dt) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const fs = Math.min(W, H) * 0.12;
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(this.text).width, th = fs * 0.75;
    this.x += this.vx * dt; this.y += this.vy * dt;
    let hits = 0;
    if (this.x < 0) { this.x = 0; this.vx *= -1; hits++; }
    if (this.x + tw > W) { this.x = W - tw; this.vx *= -1; hits++; }
    if (this.y < 0) { this.y = 0; this.vy *= -1; hits++; }
    if (this.y + th > H) { this.y = H - th; this.vy *= -1; hits++; }
    if (hits) this.hue = (this.hue + rnd(60, 180)) % 360;
    if (hits === 2) this.flash = 1.5;                             // corner hit!
    if (this.flash > 0) {
      this.flash -= dt;
      ctx.fillStyle = `hsla(${this.hue},100%,50%,${0.15 * this.flash})`; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = `hsl(${this.hue},100%,60%)`;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 25;
    ctx.textBaseline = 'top'; ctx.fillText(this.text, this.x, this.y - fs * 0.12);
    ctx.shadowBlur = 0;
  }
};

/* ---------- Plasma ---------- */
const plasma = {
  name: 'Plasma',
  init() {
    this.s = 6; this.w = Math.ceil(W / this.s); this.h = Math.ceil(H / this.s);
    this.off = document.createElement('canvas'); this.off.width = this.w; this.off.height = this.h;
    this.octx = this.off.getContext('2d'); this.img = this.octx.createImageData(this.w, this.h); this.t = 0;
  },
  frame(dt) {
    this.t += dt;
    const { w, h, img, t } = this, d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.06 + t) + Math.sin(y * 0.05 + t * 1.3)
              + Math.sin((x + y) * 0.04 + t * 0.7) + Math.sin(Math.hypot(x - w / 2, y - h / 2) * 0.07 - t * 1.6);
      const i = (y * w + x) * 4;
      d[i] = 128 + 127 * Math.sin(v * Math.PI);
      d[i + 1] = 128 + 127 * Math.sin(v * Math.PI + 2.1);
      d[i + 2] = 128 + 127 * Math.sin(v * Math.PI + 4.2);
      d[i + 3] = 255;
    }
    this.octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.off, 0, 0, W, H);
  }
};

/* ---------- MYTHIC: starfield + chunky arcade-style rainbow name ---------- */
const mythic = {
  name: 'Mythic',
  // thick 2-cell strokes so the letters read as chunky arcade shapes
  glyphs: {
    M: ['1100011', '1110111', '1111111', '1101011', '1100011', '1100011', '1100011'],
    Y: ['110011', '110011', '011110', '001100', '001100', '001100', '001100'],
    T: ['111111', '111111', '001100', '001100', '001100', '001100', '001100'],
    H: ['110011', '110011', '110011', '111111', '110011', '110011', '110011'],
    I: ['1111', '0110', '0110', '0110', '0110', '0110', '1111'],
    C: ['011111', '111111', '110000', '110000', '110000', '111111', '011111'],
  },
  text: 'MYTHIC',
  layer() {
    const c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR;
    const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return [c, g];
  },
  init() {
    [this.starC, this.starG] = this.layer();
    [this.textC, this.textG] = this.layer();
    [this.reflC, this.reflG] = this.layer();
    this.halos = [8, 20].map(div => {
      const c = document.createElement('canvas'); c.width = Math.ceil(W / div); c.height = Math.ceil(H / div);
      return [c, c.getContext('2d')];
    });
    this.stars = Object.create(starfield); this.stars.g = this.starG; this.stars.init();
    this.t = 0;
  },
  frame(dt) {
    this.t += dt;
    const t = this.t;

    // background: the classic starfield in a black void
    this.stars.frame(dt);
    ctx.drawImage(this.starC, 0, 0, W, H);

    // layout: letters packed tight, each one overlapping the last by a hair
    const widths = [...this.text].map(ch => this.glyphs[ch][0].length);
    const overlap = 0.35;                                           // in blocks
    const cols = widths.reduce((a, w) => a + w, 0) - overlap * (widths.length - 1);
    const b = Math.floor(Math.min(W * 0.8 / cols, H * 0.32 / 7) * 0.82);   // logo scale
    const x0 = (W - cols * b) / 2, yMid = (H - 7 * b) / 2 - b * 0.6 + Math.sin(t * 0.8) * b * 0.25;
    const o = b * 0.45;                                             // outline thickness

    const g = this.textG;
    g.clearRect(0, 0, W, H);
    let cx = x0;
    for (let li = 0; li < this.text.length; li++) {
      const rows = this.glyphs[this.text[li]], w = widths[li];
      const y0 = yMid + Math.sin(t * 2 + li * 0.7) * b * 0.12;    // tiny arcade wobble
      const cells = [];
      for (let r = 0; r < 7; r++) for (let c = 0; c < w; c++) if (rows[r][c] === '1') cells.push([cx + c * b, y0 + r * b, c]);
      // thick dark outline first, so this letter sits on top of the previous one
      g.fillStyle = 'rgba(6,4,24,0.55)';
      for (const [x, y] of cells) g.fillRect(x - o, y - o, b + o * 2, b + o * 2);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      for (const [x, y] of cells) g.fillRect(x - o * 0.3, y - o * 0.3, b + o * 0.6, b + o * 0.6);
      // rainbow fill, flowing left → right across the whole word
      for (const [x, y] of cells) {
        const hue = ((t * 90 - (x - x0) / b * 8) % 360 + 360) % 360;
        g.fillStyle = `hsl(${hue},100%,52%)`;
        g.fillRect(x - 0.5, y - 0.5, b + 1, b + 1);
      }
      // faint block grid so it still reads as blocks
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = Math.max(1, b * 0.05);
      for (const [x, y] of cells) g.strokeRect(x, y, b, b);
      cx += (w - overlap) * b;
    }

    // Y2K gloss: shiny top half, darker bottom, and a sheen that sweeps across every few seconds
    g.globalCompositeOperation = 'source-atop';
    const top = yMid - o, bot = yMid + 7 * b + o;
    const gl = g.createLinearGradient(0, top, 0, bot);
    gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,40,0.35)');
    g.fillStyle = gl; g.fillRect(0, top - b, W, bot - top + b * 2);
    const sweep = ((t % 5) / 5) * (W + W * 0.6) - W * 0.3;
    const sh = g.createLinearGradient(sweep - b * 3, top, sweep + b * 3, bot);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.6)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, top - b, W, bot - top + b * 2);
    g.globalCompositeOperation = 'source-over';

    // glassy floor reflection, fading out downward (masked on its own layer so the stars stay visible)
    const reflY = bot + b * 0.3, rh = (bot - top) * 0.9, r = this.reflG;
    r.clearRect(0, 0, W, H);
    r.save(); r.translate(0, reflY * 2); r.scale(1, -1); r.drawImage(this.textC, 0, 0, W, H); r.restore();
    r.globalCompositeOperation = 'destination-in';
    const fade = r.createLinearGradient(0, reflY, 0, reflY + rh);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    r.fillStyle = fade; r.fillRect(0, 0, W, H);
    r.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.28; ctx.drawImage(this.reflC, 0, 0, W, H); ctx.globalAlpha = 1;

    // soft rainbow halo that bleeds the logo's colours out into the void
    ctx.globalCompositeOperation = 'lighter';
    for (const [[c, hg], alpha] of [[this.halos[0], 0.45], [this.halos[1], 0.6]]) {
      hg.clearRect(0, 0, c.width, c.height); hg.imageSmoothingEnabled = true;
      hg.drawImage(this.textC, 0, 0, c.width, c.height);
      ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // the name itself
    ctx.drawImage(this.textC, 0, 0, W, H);

    // stars keep streaking faintly across the logo so it sits *in* space, not on top of it
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    ctx.drawImage(this.starC, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
};

/* ---------- Random (cycles every 30s) ---------- */
const savers = [starfield, pipes, mystify, matrix, bounce, plasma, mythic];
const random = {
  name: 'Random',
  init() { this.pick(); },
  pick() { this.cur = savers[Math.floor(rnd(0, savers.length))]; this.cur.init(); this.t = 0; },
  frame(dt) { this.t += dt; if (this.t > 30) this.pick(); this.cur.frame(dt); }
};
const all = [...savers, random];

