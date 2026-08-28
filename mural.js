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

  function makeStamp(r, g, b, seed) {
    var c = document.createElement("canvas");
    var size = 72;
    c.width = c.height = size;
    var x = c.getContext("2d");
    var rng = mulberry32(seed);
    var cx = size / 2;
    var cy = size / 2;
    var i, ang, dist, rr, a, gaus;
    for (i = 0; i < 560; i++) {
      ang = rng() * Math.PI * 2;
      gaus = (rng() + rng() + rng()) / 3;
      dist = gaus * 34;
      rr = 0.3 + rng() * 1.7;
      a = 0.035 + rng() * 0.13;
      if (dist > 22) a *= 0.42;
      x.fillStyle = "rgba(" + r + "," + g + "," + b + "," + a + ")";
      x.beginPath();
      x.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, rr, 0, Math.PI * 2);
      x.fill();
    }
    for (i = 0; i < 200; i++) {
      ang = rng() * Math.PI * 2;
      dist = rng() * rng() * 15;
      rr = 0.55 + rng() * 2.1;
      a = 0.07 + rng() * 0.16;
      x.fillStyle = "rgba(" + r + "," + g + "," + b + "," + a + ")";
      x.beginPath();
      x.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, rr, 0, Math.PI * 2);
      x.fill();
    }
    return c;
  }

  stamps.mag = makeStamp(255, 61, 138, 11);
  stamps.acid = makeStamp(230, 255, 61, 22);
  stamps.cyn = makeStamp(109, 255, 245, 33);
  stamps.rust = makeStamp(196, 92, 42, 44);
  stamps.cream = makeStamp(243, 234, 216, 55);
  stamps.fog = makeStamp(168, 158, 142, 66);

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
    { kind: "field", color: "fog", path: [[0.12, 0.18], [0.4, 0.12], [0.7, 0.22], [0.88, 0.18]], size: 0.42, start: 0, end: 4500, rate: 22, jitter: 0.08, alpha: 0.55 },
    { kind: "field", color: "mag", path: [[0.72, 0.06], [0.9, 0.22], [0.78, 0.48], [0.55, 0.62]], size: 0.5, start: 400, end: 6200, rate: 26, jitter: 0.07, alpha: 0.7 },
    { kind: "field", color: "cyn", path: [[0.82, 0.08], [0.94, 0.35], [0.88, 0.7], [0.76, 0.92]], size: 0.38, start: 1600, end: 8000, rate: 24, jitter: 0.06, alpha: 0.65 },
    { kind: "field", color: "rust", path: [[0.02, 0.55], [0.18, 0.7], [0.12, 0.9], [0.32, 0.96]], size: 0.4, start: 2800, end: 9000, rate: 22, jitter: 0.07, alpha: 0.6 },
    { kind: "field", color: "acid", path: [[0.2, 0.78], [0.45, 0.88], [0.68, 0.82], [0.5, 0.96]], size: 0.36, start: 4200, end: 11000, rate: 24, jitter: 0.06, alpha: 0.62 },
    { kind: "field", color: "mag", path: [[0.35, 0.08], [0.22, 0.28], [0.48, 0.4], [0.3, 0.52]], size: 0.28, start: 6000, end: 13000, rate: 18, jitter: 0.09, alpha: 0.4 },
    { kind: "scatter", color: "cream", x: 0.5, y: 0.28, rx: 0.28, ry: 0.2, size: 0.16, start: 7000, end: 15000, rate: 14, alpha: 0.35 },
    { kind: "stencil", color: "cream", clip: clipRook, bx: 0.48, by: 0.1, bw: 0.32, bh: 0.58, size: 0.22, start: 9000, end: 17500, rate: 36, jitter: 0.02, alpha: 0.85 },
    { kind: "scatter", color: "mag", x: 0.62, y: 0.32, rx: 0.18, ry: 0.28, size: 0.2, start: 9800, end: 16000, rate: 10, alpha: 0.28 },
    { kind: "stencil", color: "cyn", clip: clipBird, bx: 0.04, by: 0.42, bw: 0.32, bh: 0.32, size: 0.18, start: 12000, end: 18500, rate: 28, jitter: 0.02, alpha: 0.8 },
    { kind: "stencil", color: "acid", clip: function (c, W, H) { clipChevron(c, W, H, 0.06 * W, 0.72 * H, 0.2 * Math.min(W, H)); }, bx: 0.04, by: 0.68, bw: 0.2, bh: 0.2, size: 0.14, start: 13500, end: 19500, rate: 22, jitter: 0.015, alpha: 0.85 },
    { kind: "stencil", color: "mag", clip: function (c, W, H) { clipChevron(c, W, H, 0.1 * W, 0.78 * H, 0.2 * Math.min(W, H)); }, bx: 0.08, by: 0.74, bw: 0.2, bh: 0.2, size: 0.14, start: 14500, end: 20500, rate: 22, jitter: 0.015, alpha: 0.8 },
    { kind: "stencil", color: "cream", clip: clipTarget, bx: 0.76, by: 0.6, bw: 0.22, bh: 0.26, size: 0.16, start: 15000, end: 21500, rate: 24, jitter: 0.02, alpha: 0.7 },
    { kind: "stencil", color: "rust", clip: function (c, W, H) { clipBar(c, W, H, 0.84, 0.035); }, bx: 0.02, by: 0.8, bw: 0.42, bh: 0.1, size: 0.18, start: 16000, end: 22000, rate: 18, jitter: 0.02, alpha: 0.7 },
    { kind: "field", color: "cyn", path: [[0.55, 0.7], [0.7, 0.55], [0.92, 0.48]], size: 0.24, start: 17000, end: 25000, rate: 16, jitter: 0.08, alpha: 0.45 },
    { kind: "field", color: "acid", path: [[0.78, 0.12], [0.6, 0.08], [0.48, 0.18]], size: 0.2, start: 18500, end: 26000, rate: 14, jitter: 0.07, alpha: 0.4 },
    { kind: "scatter", color: "mag", x: 0.3, y: 0.85, rx: 0.22, ry: 0.12, size: 0.18, start: 20000, end: 28000, rate: 12, alpha: 0.4 },
    { kind: "scatter", color: "cream", x: 0.88, y: 0.22, rx: 0.12, ry: 0.18, size: 0.12, start: 21000, end: 29000, rate: 10, alpha: 0.35 },
    { kind: "field", color: "rust", path: [[0.4, 0.5], [0.55, 0.62], [0.42, 0.78]], size: 0.22, start: 22000, end: 30000, rate: 12, jitter: 0.08, alpha: 0.35 },
    { kind: "scatter", color: "cyn", x: 0.15, y: 0.2, rx: 0.16, ry: 0.16, size: 0.14, start: 24000, end: 32000, rate: 8, alpha: 0.3 }
  ];

  var drips = [
    { x: 0.74, y: 0.28, color: "mag", start: 7000, end: 16000, len: 0.22, width: 0.012 },
    { x: 0.81, y: 0.36, color: "mag", start: 8200, end: 17500, len: 0.18, width: 0.009 },
    { x: 0.9, y: 0.42, color: "cyn", start: 9000, end: 19000, len: 0.28, width: 0.011 },
    { x: 0.86, y: 0.55, color: "cyn", start: 11000, end: 21000, len: 0.2, width: 0.008 },
    { x: 0.16, y: 0.68, color: "rust", start: 10000, end: 20000, len: 0.24, width: 0.01 },
    { x: 0.48, y: 0.9, color: "acid", start: 12000, end: 22000, len: 0.08, width: 0.01 },
    { x: 0.62, y: 0.48, color: "cream", start: 15500, end: 25000, len: 0.26, width: 0.01 },
    { x: 0.58, y: 0.22, color: "cream", start: 16500, end: 26000, len: 0.14, width: 0.007 },
    { x: 0.7, y: 0.6, color: "mag", start: 18000, end: 28000, len: 0.16, width: 0.009 },
    { x: 0.12, y: 0.62, color: "cyn", start: 19000, end: 29000, len: 0.2, width: 0.008 }
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

  function drawDripSegment(d, fromU, toU, di) {
    if (toU <= fromU) return;
    var x = d.x * w;
    var y0 = d.y * h;
    var maxL = d.len * h;
    var yA = y0 + fromU * maxL;
    var yB = y0 + toU * maxL;
    var stamp = stamps[d.color];
    var ww = d.width * Math.min(w, h);
    var y, k, rng, sz;
    k = 0;
    for (y = yA; y <= yB; y += Math.max(1.2, ww * 0.45)) {
      rng = rngFor(200 + di, (fromU * 1000 + k) | 0);
      sz = ww * (1.6 + rng() * 1.8);
      ctx.globalAlpha = 0.45 + rng() * 0.35;
      ctx.drawImage(stamp, x - sz / 2 + (rng() - 0.5) * ww * 0.8, y - sz / 2, sz, sz);
      k++;
    }
    var tip = ww * (2.4 + (toU < 1 ? 1.6 : 0.4));
    ctx.globalAlpha = 0.55;
    ctx.drawImage(stamp, x - tip / 2, yB - tip * 0.35, tip, tip * 1.15);
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
