/* Home mural: empty wall fills with spray over ~30s. Does not touch site.js. */
(function () {
  var canvas = document.getElementById("mural-wall");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DURATION = 32000;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var stage = canvas.parentElement;
  var dpr = 1;
  var w = 0;
  var h = 0;
  var t0 = performance.now();
  var stamps = {};
  var cursor = [];
  var dripCursor = [];
  var revealed = {};
  var running = false;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFor(job, i) {
    return mulberry32((job * 1000003 + i * 9176 + 17) >>> 0);
  }

  function gauss(rng) {
    var u = rng();
    var v = rng();
    if (u < 1e-9) u = 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function makeStamp(r, g, b, seed) {
    var c = document.createElement("canvas");
    var size = 112;
    c.width = c.height = size;
    var x = c.getContext("2d");
    var rng = mulberry32(seed);
    var cx = size / 2;
    var cy = size / 2;
    var i, dx, dy, dist, rr, a, ang, grad, colR, colG, colB;

    function jitter() {
      colR = r + ((rng() * 12) | 0) - 6;
      colG = g + ((rng() * 10) | 0) - 5;
      colB = b + ((rng() * 10) | 0) - 5;
      if (colR < 0) colR = 0; if (colR > 255) colR = 255;
      if (colG < 0) colG = 0; if (colG > 255) colG = 255;
      if (colB < 0) colB = 0; if (colB > 255) colB = 255;
    }

    function speckle(px, py, rad, alpha) {
      if (alpha < 0.012) return;
      x.fillStyle = "rgba(" + colR + "," + colG + "," + colB + "," + alpha + ")";
      x.beginPath();
      x.arc(px, py, rad, 0, Math.PI * 2);
      x.fill();
    }

    grad = x.createRadialGradient(cx, cy, 1, cx, cy, 52);
    grad.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0.16)");
    grad.addColorStop(0.36, "rgba(" + r + "," + g + "," + b + ",0.07)");
    grad.addColorStop(0.7, "rgba(" + r + "," + g + "," + b + ",0.022)");
    grad.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);

    grad = x.createRadialGradient(cx, cy, 0, cx, cy, 14);
    grad.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0.18)");
    grad.addColorStop(0.6, "rgba(" + r + "," + g + "," + b + ",0.05)");
    grad.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
    x.fillStyle = grad;
    x.beginPath();
    x.arc(cx, cy, 14, 0, Math.PI * 2);
    x.fill();

    for (i = 0; i < 1600; i++) {
      dx = gauss(rng) * 16;
      dy = gauss(rng) * 16;
      dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 50) continue;
      jitter();
      a = (0.035 + rng() * 0.09) * Math.exp(-(dist * dist) / (2 * 18 * 18));
      rr = 0.16 + rng() * 0.48;
      speckle(cx + dx, cy + dy, rr, a);
    }

    for (i = 0; i < 260; i++) {
      dx = gauss(rng) * 7;
      dy = gauss(rng) * 7;
      dist = Math.sqrt(dx * dx + dy * dy);
      jitter();
      a = (0.07 + rng() * 0.14) * Math.exp(-(dist * dist) / (2 * 9 * 9));
      rr = 0.28 + rng() * 0.7;
      speckle(cx + dx, cy + dy, rr, a);
    }

    for (i = 0; i < 80; i++) {
      ang = rng() * Math.PI * 2;
      dist = 18 + rng() * rng() * 32;
      if (dist > 52) continue;
      jitter();
      a = 0.045 + rng() * 0.11;
      rr = 0.28 + rng() * rng() * 1.55;
      dx = cx + Math.cos(ang) * dist;
      dy = cy + Math.sin(ang) * dist;
      speckle(dx, dy, rr, a);
      if (rng() < 0.38) speckle(dx + (rng() - 0.5) * 2.8, dy + (rng() - 0.5) * 2.8, rr * 0.42, a * 0.5);
    }

    return c;
  }

  stamps.mag = makeStamp(229, 54, 90, 11);
  stamps.acid = makeStamp(242, 177, 41, 22);
  stamps.cyn = makeStamp(47, 98, 232, 33);
  stamps.rust = makeStamp(212, 102, 42, 44);
  stamps.cream = makeStamp(243, 234, 216, 55);
  stamps.fog = makeStamp(168, 158, 142, 66);
  stamps.violet = makeStamp(123, 63, 212, 77);
  stamps.oxide = makeStamp(42, 155, 82, 88);
  stamps.enamel = makeStamp(23, 138, 98, 99);
  stamps.sky = makeStamp(61, 154, 138, 111);

  function seglen(path) {
    if (path._len) return path._len;
    var segs = [];
    var total = 0;
    var i, dx, dy, len;
    for (i = 1; i < path.length; i++) {
      dx = path[i][0] - path[i - 1][0];
      dy = path[i][1] - path[i - 1][1];
      len = Math.sqrt(dx * dx + dy * dy);
      segs.push(len);
      total += len;
    }
    path._segs = segs;
    path._len = total || 1;
    return path._len;
  }

  function pointOnPath(path, u) {
    if (u <= 0) return path[0];
    if (u >= 1) return path[path.length - 1];
    seglen(path);
    var d = u * path._len;
    var i, t;
    for (i = 0; i < path._segs.length; i++) {
      if (d <= path._segs[i]) {
        t = path._segs[i] ? d / path._segs[i] : 0;
        return [
          path[i][0] + (path[i + 1][0] - path[i][0]) * t,
          path[i][1] + (path[i + 1][1] - path[i][1]) * t
        ];
      }
      d -= path._segs[i];
    }
    return path[path.length - 1];
  }

  function clipRook(c, W, H) {
    var s = 0.5 * H;
    var bw = s * 0.7;
    var x = 0.62 * W - bw / 2;
    var y = 0.14 * H;
    var m = bw / 7;
    c.beginPath();
    c.moveTo(x, y + s * 0.15);
    c.lineTo(x, y);
    c.lineTo(x + m, y);
    c.lineTo(x + m, y + s * 0.15);
    c.lineTo(x + m * 2, y + s * 0.15);
    c.lineTo(x + m * 2, y);
    c.lineTo(x + m * 3, y);
    c.lineTo(x + m * 3, y + s * 0.15);
    c.lineTo(x + m * 4, y + s * 0.15);
    c.lineTo(x + m * 4, y);
    c.lineTo(x + m * 5, y);
    c.lineTo(x + m * 5, y + s * 0.15);
    c.lineTo(x + m * 6, y + s * 0.15);
    c.lineTo(x + m * 6, y);
    c.lineTo(x + m * 7, y);
    c.lineTo(x + m * 7, y + s * 0.15);
    c.lineTo(x + bw, y + s * 0.22);
    c.lineTo(x + bw * 0.84, y + s * 0.22);
    c.lineTo(x + bw * 0.76, y + s * 0.7);
    c.lineTo(x + bw * 0.9, y + s * 0.78);
    c.lineTo(x + bw * 0.9, y + s);
    c.lineTo(x + bw * 0.1, y + s);
    c.lineTo(x + bw * 0.1, y + s * 0.78);
    c.lineTo(x + bw * 0.24, y + s * 0.7);
    c.lineTo(x + bw * 0.16, y + s * 0.22);
    c.closePath();
  }

  function clipBird(c, W, H) {
    var x = 0.08 * W;
    var y = 0.58 * H;
    var s = 0.28 * Math.min(W, H);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + s * 0.32, y - s * 0.42, x + s * 0.72, y - s * 0.12);
    c.quadraticCurveTo(x + s * 0.5, y + s * 0.06, x + s * 0.34, y + s * 0.1);
    c.quadraticCurveTo(x + s * 0.58, y + s * 0.28, x + s * 0.95, y + s * 0.14);
    c.quadraticCurveTo(x + s * 0.42, y + s * 0.5, x, y + s * 0.14);
    c.closePath();
  }

  function clipChevron(c, W, H, ox, oy, s) {
    c.beginPath();
    c.moveTo(ox, oy);
    c.lineTo(ox + s * 0.52, oy + s * 0.32);
    c.lineTo(ox, oy + s * 0.64);
    c.lineTo(ox + s * 0.2, oy + s * 0.64);
    c.lineTo(ox + s * 0.72, oy + s * 0.32);
    c.lineTo(ox + s * 0.2, oy);
    c.closePath();
  }

  function clipTarget(c, W, H) {
    var cx = 0.86 * W;
    var cy = 0.72 * H;
    var r = 0.11 * Math.min(W, H);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.closePath();
  }

  function clipBar(c, W, H, y, thick) {
    c.beginPath();
    c.rect(0.04 * W, y * H, 0.38 * W, thick * H);
  }

  var jobs = [
    /* Edges first — keep mid wall more open */
    { kind: "field", color: "oxide", path: [[0.02, 0.18], [0.16, 0.22], [0.1, 0.48], [0.04, 0.62]], size: 0.36, start: 0, end: 8500, rate: 22, jitter: 0.06, alpha: 0.62 },
    { kind: "field", color: "sky", path: [[0.12, 0.02], [0.4, 0.0], [0.72, 0.04], [0.92, 0.08]], size: 0.34, start: 0, end: 7000, rate: 18, jitter: 0.05, alpha: 0.5 },
    { kind: "field", color: "fog", path: [[0.1, 0.14], [0.35, 0.08], [0.62, 0.16], [0.88, 0.12]], size: 0.32, start: 200, end: 5000, rate: 14, jitter: 0.07, alpha: 0.35 },
    { kind: "field", color: "mag", path: [[0.78, 0.04], [0.94, 0.18], [0.9, 0.42], [0.82, 0.58]], size: 0.38, start: 400, end: 8000, rate: 20, jitter: 0.06, alpha: 0.62 },
    { kind: "field", color: "cyn", path: [[0.88, 0.1], [0.96, 0.38], [0.92, 0.68], [0.84, 0.9]], size: 0.32, start: 1600, end: 9500, rate: 18, jitter: 0.05, alpha: 0.55 },
    { kind: "field", color: "enamel", path: [[0.62, 0.72], [0.78, 0.68], [0.92, 0.8], [0.74, 0.92]], size: 0.34, start: 800, end: 10000, rate: 18, jitter: 0.06, alpha: 0.58 },
    { kind: "field", color: "rust", path: [[0.02, 0.58], [0.14, 0.72], [0.08, 0.9], [0.28, 0.96]], size: 0.34, start: 2800, end: 10000, rate: 16, jitter: 0.06, alpha: 0.55 },
    { kind: "field", color: "acid", path: [[0.22, 0.82], [0.42, 0.9], [0.62, 0.84], [0.48, 0.96]], size: 0.3, start: 4200, end: 11500, rate: 16, jitter: 0.05, alpha: 0.52 },
    /* Mid stays lighter — smaller, lower alpha, later */
    { kind: "field", color: "oxide", path: [[0.12, 0.38], [0.22, 0.5], [0.18, 0.62]], size: 0.22, start: 5500, end: 12000, rate: 10, jitter: 0.07, alpha: 0.32 },
    { kind: "field", color: "mag", path: [[0.32, 0.1], [0.22, 0.22], [0.34, 0.34]], size: 0.2, start: 6500, end: 12500, rate: 10, jitter: 0.08, alpha: 0.28 },
    { kind: "field", color: "violet", path: [[0.58, 0.58], [0.68, 0.66], [0.6, 0.78]], size: 0.2, start: 8000, end: 14500, rate: 8, jitter: 0.07, alpha: 0.28 },
    { kind: "scatter", color: "cream", x: 0.72, y: 0.22, rx: 0.14, ry: 0.12, size: 0.12, start: 7500, end: 15000, rate: 8, alpha: 0.28 },
    { kind: "scatter", color: "enamel", x: 0.2, y: 0.28, rx: 0.1, ry: 0.12, size: 0.12, start: 8500, end: 16000, rate: 6, alpha: 0.25 },
    /* Stencils keep presence but not mid pile */
    { kind: "stencil", color: "cream", clip: clipRook, bx: 0.52, by: 0.12, bw: 0.28, bh: 0.52, size: 0.2, start: 9000, end: 17500, rate: 28, jitter: 0.02, alpha: 0.78 },
    { kind: "scatter", color: "mag", x: 0.68, y: 0.28, rx: 0.12, ry: 0.16, size: 0.14, start: 10000, end: 16000, rate: 6, alpha: 0.22 },
    { kind: "stencil", color: "cyn", clip: clipBird, bx: 0.04, by: 0.44, bw: 0.28, bh: 0.28, size: 0.16, start: 12000, end: 18500, rate: 24, jitter: 0.02, alpha: 0.75 },
    { kind: "stencil", color: "acid", clip: function (c, W, H) { clipChevron(c, W, H, 0.06 * W, 0.72 * H, 0.2 * Math.min(W, H)); }, bx: 0.04, by: 0.68, bw: 0.2, bh: 0.2, size: 0.14, start: 13500, end: 19500, rate: 20, jitter: 0.015, alpha: 0.8 },
    { kind: "stencil", color: "mag", clip: function (c, W, H) { clipChevron(c, W, H, 0.1 * W, 0.78 * H, 0.2 * Math.min(W, H)); }, bx: 0.08, by: 0.74, bw: 0.2, bh: 0.2, size: 0.14, start: 14500, end: 20500, rate: 20, jitter: 0.015, alpha: 0.75 },
    { kind: "stencil", color: "cream", clip: clipTarget, bx: 0.78, by: 0.62, bw: 0.2, bh: 0.24, size: 0.14, start: 15000, end: 21500, rate: 20, jitter: 0.02, alpha: 0.65 },
    { kind: "stencil", color: "rust", clip: function (c, W, H) { clipBar(c, W, H, 0.84, 0.035); }, bx: 0.02, by: 0.8, bw: 0.4, bh: 0.1, size: 0.16, start: 16000, end: 22000, rate: 14, jitter: 0.02, alpha: 0.65 },
    { kind: "field", color: "cyn", path: [[0.7, 0.78], [0.84, 0.7], [0.94, 0.82]], size: 0.18, start: 17500, end: 25500, rate: 10, jitter: 0.07, alpha: 0.32 },
    { kind: "field", color: "acid", path: [[0.82, 0.1], [0.7, 0.06], [0.6, 0.14]], size: 0.16, start: 19000, end: 26500, rate: 8, jitter: 0.06, alpha: 0.28 },
    { kind: "scatter", color: "mag", x: 0.18, y: 0.88, rx: 0.14, ry: 0.08, size: 0.14, start: 20000, end: 28000, rate: 8, alpha: 0.3 },
    { kind: "scatter", color: "cream", x: 0.9, y: 0.18, rx: 0.08, ry: 0.12, size: 0.1, start: 21000, end: 29000, rate: 6, alpha: 0.28 },
    { kind: "scatter", color: "enamel", x: 0.86, y: 0.86, rx: 0.1, ry: 0.08, size: 0.12, start: 19500, end: 28500, rate: 6, alpha: 0.26 }
  ];

  /* Drips: same color as spray; origin = terminus (end) of that spray field. */
  var drips = [
    { x: 0.82, y: 0.58, color: "mag", start: 5200, end: 14500, len: 0.26, width: 0.012, lean: 0.01, wobble: 1.1 },
    { x: 0.84, y: 0.9, color: "cyn", start: 7000, end: 17000, len: 0.08, width: 0.009, lean: 0.004, wobble: 1.0 },
    { x: 0.04, y: 0.62, color: "oxide", start: 4500, end: 14000, len: 0.24, width: 0.011, lean: -0.006, wobble: 1.15 },
    { x: 0.74, y: 0.92, color: "enamel", start: 5500, end: 15000, len: 0.06, width: 0.01, lean: -0.008, wobble: 1.05 },
    { x: 0.28, y: 0.96, color: "rust", start: 7000, end: 16500, len: 0.04, width: 0.009, lean: 0.006, wobble: 0.95 },
    { x: 0.48, y: 0.96, color: "acid", start: 8000, end: 16500, len: 0.04, width: 0.01, lean: 0.002, wobble: 0.8 },
    { x: 0.92, y: 0.08, color: "sky", start: 4000, end: 12000, len: 0.16, width: 0.008, lean: -0.01, wobble: 1.2 },
    { x: 0.18, y: 0.62, color: "oxide", start: 9000, end: 18500, len: 0.2, width: 0.007, lean: 0.005, wobble: 1.0 },
    { x: 0.34, y: 0.34, color: "mag", start: 10000, end: 18500, len: 0.18, width: 0.006, lean: -0.008, wobble: 0.9 },
    { x: 0.6, y: 0.78, color: "violet", start: 11500, end: 20500, len: 0.14, width: 0.007, lean: 0.008, wobble: 1.05 },
    { x: 0.94, y: 0.82, color: "cyn", start: 20000, end: 28500, len: 0.12, width: 0.007, lean: -0.006, wobble: 1.1 }
  ];

  function stampsAt(job, elapsed) {
    if (elapsed <= job.start) return 0;
    var t = Math.min(elapsed, job.end) - job.start;
    return Math.floor((t / 1000) * job.rate);
  }

  function placeStamp(job, ji, i) {
    var rng = rngFor(ji + 1, i);
    var stamp = stamps[job.color];
    var size = job.size * (0.72 + rng() * 0.55) * Math.min(w, h);
    var px, py, p, total, u;
    ctx.globalAlpha = (job.alpha || 0.6) * (0.65 + rng() * 0.5);

    if (job.kind === "field") {
      total = Math.max(1, Math.floor(((job.end - job.start) / 1000) * job.rate) - 1);
      u = i / total;
      p = pointOnPath(job.path, u);
      px = p[0] * w + (rng() - 0.5) * job.jitter * w;
      py = p[1] * h + (rng() - 0.5) * job.jitter * h;
    } else if (job.kind === "scatter") {
      px = (job.x + (rng() - 0.5) * 2 * job.rx) * w;
      py = (job.y + (rng() - 0.5) * 2 * job.ry) * h;
    } else {
      px = (job.bx + rng() * job.bw) * w;
      py = (job.by + rng() * job.bh) * h;
    }

    if (job.clip) {
      ctx.save();
      job.clip(ctx, w, h);
      ctx.clip();
      ctx.drawImage(stamp, px - size / 2, py - size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(stamp, px - size / 2, py - size / 2, size, size);
    }
  }

  function dripRgb(color) {
    var s = stamps[color];
    if (!s) return [241, 232, 214];
    /* Approximate from stamp seeds used at makeStamp — keep in sync with palette. */
    var map = {
      mag: [229, 54, 90],
      acid: [242, 177, 41],
      cyn: [47, 98, 232],
      rust: [212, 102, 42],
      cream: [243, 234, 216],
      fog: [168, 158, 142],
      violet: [123, 63, 212],
      oxide: [42, 155, 82],
      enamel: [23, 138, 98],
      sky: [61, 154, 138]
    };
    return map[color] || [241, 232, 214];
  }

  function drawDripSegment(d, fromU, toU, di) {
    if (toU <= fromU) return;
    var rgb = dripRgb(d.color);
    var x0 = d.x * w;
    var y0 = d.y * h;
    var maxL = d.len * h;
    var baseW = d.width * Math.min(w, h);
    var lean = (d.lean || 0) * w;
    var wobble = d.wobble || 1;
    var steps = Math.max(6, Math.ceil((toU - fromU) * maxL / 2.2));
    var i, t, t2, y, x, half, alpha, tipR, g, rng;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (i = 0; i < steps; i++) {
      t = fromU + ((toU - fromU) * i) / steps;
      t2 = fromU + ((toU - fromU) * (i + 1)) / steps;
      rng = rngFor(410 + di, (t * 800) | 0);

      /* Gravity taper: thicker near origin, thinner toward tip. */
      half = baseW * (1.15 - t * 0.78) * (0.82 + rng() * 0.28);
      if (half < 0.35) half = 0.35;

      y = y0 + t * maxL;
      x = x0 + lean * t * t + Math.sin(t * 9.2 * wobble + di) * baseW * 0.55 * wobble
        + Math.sin(t * 21 + di * 1.7) * baseW * 0.18;

      alpha = (0.72 - t * 0.42) * (0.75 + rng() * 0.25);
      if (alpha < 0.05) alpha = 0.05;

      ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
      ctx.lineWidth = half * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x0 + lean * t2 * t2 + Math.sin(t2 * 9.2 * wobble + di) * baseW * 0.55 * wobble
          + Math.sin(t2 * 21 + di * 1.7) * baseW * 0.18,
        y0 + t2 * maxL
      );
      ctx.stroke();
    }

    /* Soft translucent tip bead — not a hard circle stamp. */
    t = toU;
    rng = rngFor(510 + di, (t * 900) | 0);
    y = y0 + t * maxL;
    x = x0 + lean * t * t + Math.sin(t * 9.2 * wobble + di) * baseW * 0.55 * wobble;
    tipR = baseW * (1.1 + (1 - t) * 1.4) * (0.9 + rng() * 0.35);
    g = ctx.createRadialGradient(x, y + tipR * 0.15, 0, x, y + tipR * 0.35, tipR * 1.8);
    g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.55 * (1 - t * 0.35)) + ")");
    g.addColorStop(0.45, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.22 * (1 - t * 0.4)) + ")");
    g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + tipR * 0.2, tipR * 0.72, tipR * 1.15, lean * 0.002, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintTo(elapsed) {
    var ji, i, n, d, u, prev;
    ctx.globalCompositeOperation = "source-over";
    for (ji = 0; ji < jobs.length; ji++) {
      n = stampsAt(jobs[ji], elapsed);
      for (i = cursor[ji]; i < n; i++) placeStamp(jobs[ji], ji, i);
      cursor[ji] = n;
    }
    for (ji = 0; ji < drips.length; ji++) {
      d = drips[ji];
      if (elapsed <= d.start) continue;
      u = Math.min(1, (elapsed - d.start) / (d.end - d.start));
      prev = dripCursor[ji] || 0;
      drawDripSegment(d, prev, u, ji);
      dripCursor[ji] = u;
    }
    ctx.globalAlpha = 1;
  }

  function revealButtons(elapsed) {
    var nodes = document.querySelectorAll(".rack-btn");
    var i, el, when;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (revealed[i]) continue;
      when = parseInt(el.getAttribute("data-reveal"), 10) || (5000 + i * 4000);
      if (reduced || elapsed >= when) {
        el.classList.add("is-painted");
        revealed[i] = true;
      }
    }
  }

  function sizeCanvas() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetPaint() {
    cursor = jobs.map(function () { return 0; });
    dripCursor = drips.map(function () { return 0; });
    ctx.clearRect(0, 0, w, h);
  }

  function elapsedNow() {
    if (reduced) return DURATION;
    return Math.min(DURATION, Math.max(0, performance.now() - t0));
  }

  function onResize() {
    sizeCanvas();
    resetPaint();
    paintTo(elapsedNow());
  }

  function frame(now) {
    if (!running) return;
    var elapsed = Math.min(DURATION, now - t0);
    paintTo(elapsed);
    revealButtons(elapsed);
    if (elapsed < DURATION) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  sizeCanvas();
  resetPaint();

  if (reduced) {
    paintTo(DURATION);
    revealButtons(DURATION);
  } else {
    running = true;
    revealButtons(0);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", onResize);
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(stage);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (reduced) return;
    var elapsed = elapsedNow();
    paintTo(elapsed);
    revealButtons(elapsed);
    if (elapsed < DURATION && !running) {
      running = true;
      requestAnimationFrame(frame);
    }
  });
})();
