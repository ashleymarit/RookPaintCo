/* Home-only wall mural. Paint accumulates on canvas — not a CSS fade.
   site.js mouse trail is untouched. */
(function () {
  var canvas = document.getElementById("mural-wall");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ctx = canvas.getContext("2d", { alpha: true });

  var MAG = [255, 61, 138];
  var ACID = [230, 255, 61];
  var CYN = [109, 255, 245];
  var CREAM = [243, 234, 216];
  var RUST = [196, 92, 42];

  var cssW = 0;
  var cssH = 0;
  var ox = 0.48;
  var oy = 0.08;
  var sx = 0.50;
  var sy = 0.86;
  var MAX_DOTS = 52;
  var dotsLeft = MAX_DOTS;

  var start = 0;
  var pausedAt = 0;
  var running = true;
  var finished = false;
  var lastGlow = null;

  function mx(u) { return (ox + u * sx) * cssW; }
  function my(v) { return (oy + v * sy) * cssH; }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  function layoutRegion() {
    var wide = cssW / Math.max(1, cssH) > 1.05;
    if (wide) {
      ox = 0.46; oy = 0.06; sx = 0.52; sy = 0.90;
    } else {
      ox = 0.06; oy = 0.40; sx = 0.88; sy = 0.56;
    }
    MAX_DOTS = (cssW < 700 || "ontouchstart" in window) ? 30 : 52;
  }

  function resize() {
    var stage = canvas.parentElement;
    var r = stage.getBoundingClientRect();
    var nextW = Math.max(1, Math.floor(r.width));
    var nextH = Math.max(1, Math.floor(r.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var snap = null;
    if (cssW && cssH && (canvas.width > 1)) {
      snap = document.createElement("canvas");
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext("2d").drawImage(canvas, 0, 0);
    }
    cssW = nextW;
    cssH = nextH;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (snap) {
      ctx.drawImage(snap, 0, 0, cssW, cssH);
    }
    layoutRegion();
  }

  function jitter(rgb) {
    return [
      clamp(rgb[0] + ((Math.random() * 36) | 0) - 18, 0, 255),
      clamp(rgb[1] + ((Math.random() * 32) | 0) - 16, 0, 255),
      clamp(rgb[2] + ((Math.random() * 28) | 0) - 14, 0, 255)
    ];
  }

  var ROOK_BOX = { x: 0.28, y: 0.05, w: 0.48, h: 0.72 };

  function inRookLocal(u, v) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    if (v < 0.13) {
      if (u < 0.08 || u > 0.92) return false;
      var x = (u - 0.08) / 0.84;
      var cell = x * 3;
      var f = cell - Math.floor(cell);
      if (cell >= 2.999) return true;
      return f < 0.58;
    }
    if (v < 0.22) return u >= 0.08 && u <= 0.92;
    if (v < 0.34) return u >= 0.22 && u <= 0.78;
    if (v < 0.76) {
      var t = (v - 0.34) / 0.42;
      var L = 0.20 - t * 0.02;
      var R = 0.80 + t * 0.02;
      if (u < L || u > R) return false;
      if (u > 0.42 && u < 0.58 && v > 0.44 && v < 0.62) return false;
      return true;
    }
    if (v < 0.88) return u >= 0.12 && u <= 0.88;
    return u >= 0.06 && u <= 0.94;
  }

  function inRook(u, v) {
    return inRookLocal((u - ROOK_BOX.x) / ROOK_BOX.w, (v - ROOK_BOX.y) / ROOK_BOX.h);
  }

  function inMoon(u, v) {
    var dx = u - 0.82, dy = v - 0.18;
    var r = 0.11;
    if (dx * dx + dy * dy > r * r) return false;
    var dx2 = u - (0.82 + r * 0.40), dy2 = v - 0.18;
    var ri = r * 0.76;
    return dx2 * dx2 + dy2 * dy2 > ri * ri;
  }

  function inBars(u, v) {
    if (u < 0.04 || u > 0.46) return false;
    if (v > 0.78 && v < 0.83) return true;
    if (v > 0.86 && v < 0.90) return true;
    if (v > 0.93 && v < 0.96) return true;
    return false;
  }

  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
    var x = x1 + t * dx, y = y1 + t * dy;
    return Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
  }

  function inSlash(u, v) {
    return distSeg(u, v, 0.08, 0.10, 0.96, 0.78) < 0.055 + Math.sin(u * 18) * 0.008;
  }

  function inField(u, v, cx, cy, rx, ry) {
    var dx = (u - cx) / rx, dy = (v - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function uvFromPx(px, py) {
    return {
      u: (px / cssW - ox) / sx,
      v: (py / cssH - oy) / sy
    };
  }

  function spray(x, y, rgb, spread, n, aMul, test) {
    var i, ang, g, dist, px, py, r, a, c, uv, ok, over;
    var budget = Math.min(n, dotsLeft);
    for (i = 0; i < budget; i++) {
      ang = Math.random() * Math.PI * 2;
      g = (Math.random() + Math.random() + Math.random()) / 3;
      dist = g * spread;
      px = x + Math.cos(ang) * dist;
      py = y + Math.sin(ang) * dist;
      over = false;
      if (test) {
        uv = uvFromPx(px, py);
        ok = test(uv.u, uv.v);
        if (!ok) {
          if (Math.random() > 0.07) continue;
          over = true;
        }
      }
      c = jitter(rgb);
      r = (over ? 0.5 : 1.1) + Math.random() * (over ? 1.2 : 2.8);
      a = (over ? 0.05 : 0.14) + Math.random() * (over ? 0.08 : 0.22);
      a *= aMul;
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      dotsLeft--;
      if (dotsLeft <= 0) return;
    }
  }

  function halo(x, y, rgb, spread, n) {
    var i, ang, dist, c;
    var budget = Math.min(n, dotsLeft);
    for (i = 0; i < budget; i++) {
      ang = Math.random() * Math.PI * 2;
      dist = spread * (0.55 + Math.random() * 0.7);
      c = jitter(rgb);
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.06 + Math.random() * 0.1) + ")";
      ctx.arc(x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, 0.4 + Math.random() * 1.3, 0, Math.PI * 2);
      ctx.fill();
      dotsLeft--;
    }
  }

  function sweepPos(job, t) {
    var u = clamp((t - job.t0) / (job.t1 - job.t0), 0, 0.999);
    var s = u * job.sweeps;
    var si = s | 0;
    var sf = s - si;
    if (si % 2) sf = 1 - sf;
    var x = job.cx + (sf * 2 - 1) * job.rx;
    var y = job.cy - job.ry + ((si + 0.5) / job.sweeps) * 2 * job.ry;
    x += Math.sin(t * 3.7 + si) * job.rx * 0.07;
    y += Math.cos(t * 2.9) * job.ry * 0.05;
    return { x: mx(x), y: my(y), lift: sf < 0.035 || sf > 0.965 };
  }

  function slashPos(t, job) {
    var u = clamp((t - job.t0) / (job.t1 - job.t0), 0, 1);
    var passes = 5;
    var s = u * passes;
    var si = s | 0;
    var sf = s - si;
    if (si % 2) sf = 1 - sf;
    var x1 = 0.08, y1 = 0.10, x2 = 0.96, y2 = 0.78;
    var x = x1 + (x2 - x1) * sf;
    var y = y1 + (y2 - y1) * sf;
    var nx = -(y2 - y1), ny = (x2 - x1);
    var len = Math.sqrt(nx * nx + ny * ny) || 1;
    var off = ((si + 0.5) / passes - 0.5) * 0.09;
    x += (nx / len) * off;
    y += (ny / len) * off;
    return { x: mx(x), y: my(y) };
  }

  var drips = [
    { u: 0.58, v: 0.68, len: 0.22, rgb: MAG, t0: 17.5, drawn: 0 },
    { u: 0.72, v: 0.70, len: 0.26, rgb: MAG, t0: 19.2, drawn: 0 },
    { u: 0.64, v: 0.74, len: 0.16, rgb: CREAM, t0: 25.0, drawn: 0 },
    { u: 0.80, v: 0.52, len: 0.18, rgb: ACID, t0: 15.5, drawn: 0 },
    { u: 0.50, v: 0.54, len: 0.14, rgb: RUST, t0: 13.8, drawn: 0 },
    { u: 0.86, v: 0.76, len: 0.12, rgb: CYN, t0: 21.5, drawn: 0 },
    { u: 0.68, v: 0.78, len: 0.20, rgb: CREAM, t0: 27.0, drawn: 0 },
    { u: 0.44, v: 0.82, len: 0.10, rgb: MAG, t0: 26.5, drawn: 0 }
  ];

  var jobs = [
    { kind: "ghost", t0: 0.4, t1: 3.4 },
    { kind: "field", rgb: MAG, cx: 0.62, cy: 0.40, rx: 0.34, ry: 0.32, t0: 2.0, t1: 9.2, sweeps: 8 },
    { kind: "field", rgb: RUST, cx: 0.38, cy: 0.58, rx: 0.22, ry: 0.16, t0: 7.2, t1: 12.4, sweeps: 4 },
    { kind: "slash", rgb: ACID, t0: 8.6, t1: 15.8 },
    { kind: "field", rgb: CYN, cx: 0.70, cy: 0.72, rx: 0.36, ry: 0.22, t0: 13.0, t1: 20.2, sweeps: 6 },
    { kind: "stencil", test: inRook, rgb: CREAM, cx: 0.52, cy: 0.42, rx: 0.22, ry: 0.38, t0: 16.2, t1: 27.4, sweeps: 10 },
    { kind: "stencil", test: inMoon, rgb: ACID, cx: 0.82, cy: 0.18, rx: 0.14, ry: 0.16, t0: 21.8, t1: 27.8, sweeps: 5 },
    { kind: "stencil", test: inBars, rgb: MAG, cx: 0.24, cy: 0.88, rx: 0.22, ry: 0.12, t0: 24.6, t1: 29.4, sweeps: 4 },
    { kind: "drips", t0: 13.5, t1: 34.0 },
    { kind: "specks", t0: 5.5, t1: 36.5 },
    { kind: "extra", t0: 34.0, t1: 42.0 }
  ];

  function stepGhost(t) {
    var u = clamp((t - 0.4) / 3.0, 0, 1);
    var n = 6 + (u * 4) | 0;
    var i, ru, rv, edge;
    for (i = 0; i < n && dotsLeft > 0; i++) {
      ru = ROOK_BOX.x + Math.random() * ROOK_BOX.w;
      rv = ROOK_BOX.y + Math.random() * ROOK_BOX.h;
      edge = inRook(ru, rv);
      if (!edge) {
        if (inRook(ru + 0.03, rv) || inRook(ru - 0.03, rv) || inRook(ru, rv + 0.03) || inRook(ru, rv - 0.03)) {
          spray(mx(ru), my(rv), CREAM, 10, 3, 0.35, null);
        }
      } else if (Math.random() < 0.25) {
        spray(mx(ru), my(rv), CREAM, 8, 2, 0.18, null);
      }
    }
  }

  function stepDrips(t) {
    var i, d, grow, target, x, y0, y, step, k, c;
    for (i = 0; i < drips.length; i++) {
      d = drips[i];
      if (t < d.t0 || dotsLeft <= 0) continue;
      grow = 6.2;
      target = d.len * smooth(clamp((t - d.t0) / grow, 0, 1));
      if (target <= d.drawn + 0.002) continue;
      x = mx(d.u);
      y0 = my(d.v);
      step = Math.max(2, sy * cssH * 0.012);
      for (k = d.drawn; k <= target && dotsLeft > 0; k += 0.012) {
        y = y0 + k * sy * cssH;
        c = jitter(d.rgb);
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.28 + Math.random() * 0.22) + ")";
        ctx.arc(x + (Math.random() - 0.5) * 2.4, y, 1.3 + Math.random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
        dotsLeft--;
      }
      if (target >= d.len * 0.96) {
        c = jitter(d.rgb);
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0.4)";
        ctx.ellipse(x, y0 + d.len * sy * cssH, 3.2 + Math.random() * 2, 4.5 + Math.random() * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      d.drawn = target;
    }
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  function stepSpecks(t) {
    var n = t > 30 ? 2 : 4;
    var i, u, v, rgb;
    for (i = 0; i < n && dotsLeft > 0; i++) {
      u = 0.04 + Math.random() * 0.92;
      v = 0.04 + Math.random() * 0.92;
      rgb = Math.random() < 0.34 ? MAG : Math.random() < 0.5 ? ACID : CYN;
      if (Math.random() < 0.2) rgb = CREAM;
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.12 + Math.random() * 0.28) + ")";
      ctx.arc(mx(u), my(v), 0.4 + Math.random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
      dotsLeft--;
    }
  }

  var extraLast = 0;
  var extraCount = 0;
  function stepExtra(t) {
    if (t - extraLast < 0.55) return;
    extraLast = t;
    extraCount++;
    if (extraCount > 12) return;
    var u = 0.18 + Math.random() * 0.7;
    var v = 0.12 + Math.random() * 0.76;
    var rgb = extraCount % 3 === 0 ? CREAM : extraCount % 3 === 1 ? MAG : CYN;
    spray(mx(u), my(v), rgb, 22, 10, 0.45, null);
    halo(mx(u), my(v), rgb, 34, 6);
  }

  function paintJob(job, t) {
    if (t < job.t0 || t > job.t1) return;
    var p, n, spr;
    if (job.kind === "ghost") { stepGhost(t); return; }
    if (job.kind === "drips") { stepDrips(t); return; }
    if (job.kind === "specks") { stepSpecks(t); return; }
    if (job.kind === "extra") { stepExtra(t); return; }
    if (job.kind === "slash") {
      p = slashPos(t, job);
      lastGlow = p;
      spray(p.x, p.y, job.rgb, 38, 16, 0.85, inSlash);
      halo(p.x, p.y, job.rgb, 52, 7);
      return;
    }
    p = sweepPos(job, t);
    lastGlow = p;
    n = p.lift ? 6 : (job.kind === "stencil" ? 18 : 14);
    spr = job.kind === "stencil" ? 26 : 42;
    spray(p.x, p.y, job.rgb, spr, n, p.lift ? 0.4 : 0.9, job.test || function (u, v) {
      return inField(u, v, job.cx, job.cy, job.rx, job.ry);
    });
    if (!p.lift) halo(p.x, p.y, job.rgb, spr + 16, 5);
  }

  function paintFinished() {
    var j, i, p, stamps, u, v, x, y, job;
    dotsLeft = 8000;
    for (j = 0; j < jobs.length; j++) {
      job = jobs[j];
      if (job.kind === "ghost") {
        for (i = 0; i < 80; i++) stepGhost(3);
        continue;
      }
      if (job.kind === "drips") {
        for (i = 0; i < drips.length; i++) drips[i].t0 = 0;
        stepDrips(40);
        continue;
      }
      if (job.kind === "specks") {
        for (i = 0; i < 180; i++) stepSpecks(10);
        continue;
      }
      if (job.kind === "extra") continue;
      stamps = job.kind === "stencil" ? 220 : 160;
      for (i = 0; i < stamps && dotsLeft > 0; i++) {
        if (job.kind === "slash") {
          p = slashPos(job.t0 + (i / stamps) * (job.t1 - job.t0), job);
          spray(p.x, p.y, job.rgb, 36, 10, 0.9, inSlash);
        } else if (job.test) {
          var hit = false, tries = 0;
          while (!hit && tries < 8) {
            tries++;
            u = job.cx + (Math.random() * 2 - 1) * job.rx;
            v = job.cy + (Math.random() * 2 - 1) * job.ry;
            hit = job.test(u, v);
          }
          if (hit || Math.random() < 0.12) spray(mx(u), my(v), job.rgb, 22, 8, 0.95, job.test);
        } else {
          var ang = Math.random() * Math.PI * 2;
          var rad = Math.sqrt(Math.random());
          u = job.cx + Math.cos(ang) * job.rx * rad;
          v = job.cy + Math.sin(ang) * job.ry * rad;
          spray(mx(u), my(v), job.rgb, 32, 8, 0.9, function (uu, vv) {
            return inField(uu, vv, job.cx, job.cy, job.rx, job.ry);
          });
        }
      }
    }
    finished = true;
  }

  function elapsed(now) {
    if (!start) start = now;
    if (!running) return (pausedAt - start) / 1000;
    return (now - start) / 1000;
  }

  function frame(now) {
    if (reduced) return;
    if (!running) return;
    var t = elapsed(now);
    dotsLeft = MAX_DOTS;
    lastGlow = null;
    var i;
    for (i = 0; i < jobs.length; i++) paintJob(jobs[i], t);
    if (t > 42 && extraCount >= 12) {
      finished = true;
      return;
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      running = false;
      pausedAt = performance.now();
    } else if (!finished) {
      if (pausedAt && start) start += performance.now() - pausedAt;
      running = true;
      requestAnimationFrame(frame);
    }
  });

  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(resize, 80);
  });

  resize();
  if (reduced) {
    paintFinished();
  } else {
    requestAnimationFrame(frame);
  }
})();
