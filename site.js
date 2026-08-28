(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("reduced", reduced);

  if (!reduced) initSpray();

  var form = document.getElementById("book-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = document.getElementById("form-note");
      if (note) {
        note.textContent = "Studio demo — nothing was sent. The 555 number is a placeholder.";
      }
    });
  }

  function initSpray() {
    var canvas = document.createElement("canvas");
    canvas.id = "spray-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d", { alpha: true });

    var dpr = 1;
    var w = 0;
    var h = 0;

    var CSS_STAMP = 108;
    var stampPx = CSS_STAMP;
    var halfCss = CSS_STAMP / 2;

    var CANS = [
      [255, 61, 138],
      [230, 255, 61],
      [109, 255, 245],
      [36, 86, 214]
    ];
    var canIndex = 0;
    var canStart = performance.now();
    var CAN_HOLD = 7000;
    var LIFE = 3000;
    var MAX_BURSTS = 220;
    var MAX_DRIPS = 72;
    var pool = [];
    var bursts = [];
    var drips = [];
    var lastX = null;
    var lastY = null;
    var lastT = 0;
    var lastDripAt = 0;
    var running = true;
    var grainTile = makeGrain(384);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      var next = Math.round(CSS_STAMP * dpr);
      if (next !== stampPx) {
        stampPx = next;
        pool.length = 0;
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function makeGrain(size) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var g = c.getContext("2d");
      var img = g.createImageData(size, size);
      var d = img.data;
      var i;
      for (i = 0; i < d.length; i += 4) {
        var n = 176 + ((Math.random() * 79) | 0);
        d[i] = d[i + 1] = d[i + 2] = n;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    function canColor(now) {
      if (now - canStart > CAN_HOLD) {
        canIndex = (canIndex + 1) % CANS.length;
        canStart = now;
      }
      return CANS[canIndex];
    }

    function clamp(n, a, b) {
      return n < a ? a : n > b ? b : n;
    }

    function gauss() {
      var u = Math.random();
      var v = Math.random();
      if (u < 1e-9) u = 1e-9;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
    }

    function acquireStamp() {
      var c = pool.pop();
      if (!c) {
        c = document.createElement("canvas");
        c.width = stampPx;
        c.height = stampPx;
      } else {
        c.getContext("2d").clearRect(0, 0, c.width, c.height);
      }
      return c;
    }

    function releaseStamp(c) {
      if (pool.length < 64) pool.push(c);
    }

    function speckle(sctx, x, y, rgb, a, size) {
      if (a < 0.02) return;
      sctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
      sctx.fillRect(x, y, size, size);
    }

    function jitter(rgb) {
      return [
        clamp(rgb[0] + ((Math.random() * 16) | 0) - 8, 0, 255),
        clamp(rgb[1] + ((Math.random() * 14) | 0) - 7, 0, 255),
        clamp(rgb[2] + ((Math.random() * 14) | 0) - 7, 0, 255)
      ];
    }

    function paintStamp(sctx, wet, rgb, isTouch) {
      var px = stampPx / CSS_STAMP;
      var cx = stampPx / 2;
      var coreN = isTouch ? (18 + wet * 32) | 0 : (28 + wet * 140) | 0;
      var bodyN = isTouch ? (16 + wet * 24) | 0 : (28 + wet * 100) | 0;
      var mistN = isTouch ? (22 + wet * 28) | 0 : (48 + wet * 120) | 0;
      var overN = isTouch ? (12 + wet * 16) | 0 : (32 + wet * 56) | 0;
      var i, dx, dy, r2, a, sz, ang, dist, sigma, limit, g;

      sctx.imageSmoothingEnabled = false;
      g = sctx.createRadialGradient(cx, cx, 0, cx, cx, (15 + wet * 6) * px);
      g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.12 + wet * 0.2) + ")");
      g.addColorStop(0.4, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.05 + wet * 0.08) + ")");
      g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(cx, cx, (15 + wet * 6) * px, 0, Math.PI * 2);
      sctx.fill();

      sigma = (3.4 + wet * 1.7) * px;
      limit = 12 * px;
      for (i = 0; i < coreN; i++) {
        dx = gauss() * sigma;
        dy = gauss() * sigma;
        r2 = dx * dx + dy * dy;
        if (r2 > limit * limit) continue;
        if (Math.random() < 0.1) continue;
        a = (0.3 + wet * 0.44) * Math.exp(-r2 / (2 * sigma * sigma * 1.35));
        a *= 0.7 + Math.random() * 0.3;
        sz = Math.max(1, (0.4 + Math.random() * 0.8) * px);
        speckle(sctx, cx + dx, cx + dy, jitter(rgb), a, sz);
      }

      sigma = (7.6 + wet * 2.6) * px;
      limit = 20 * px;
      for (i = 0; i < bodyN; i++) {
        dx = gauss() * sigma;
        dy = gauss() * sigma;
        r2 = dx * dx + dy * dy;
        if (r2 > limit * limit) continue;
        if (Math.random() < 0.12) continue;
        a = (0.12 + wet * 0.22) * Math.exp(-r2 / (2 * sigma * sigma * 1.8));
        a *= 0.6 + Math.random() * 0.4;
        sz = Math.max(1, (0.35 + Math.random() * 0.7) * px);
        speckle(sctx, cx + dx, cx + dy, jitter(rgb), a, sz);
      }

      for (i = 0; i < mistN; i++) {
        ang = Math.random() * Math.PI * 2;
        dist = (Math.abs(gauss()) * (12 + wet * 8) + 8 + Math.random() * 14) * px;
        if (dist > (halfCss - 2) * px) dist = (halfCss - 2) * px;
        dx = Math.cos(ang) * dist;
        dy = Math.sin(ang) * dist;
        a = 0.03 + Math.random() * (0.07 + wet * 0.04);
        sz = Math.max(1, (0.25 + Math.random() * 0.5) * px);
        speckle(sctx, cx + dx, cx + dy, jitter(rgb), a, sz);
      }

      for (i = 0; i < overN; i++) {
        ang = Math.random() * Math.PI * 2;
        dist = (16 + Math.random() * (28 + wet * 10)) * px;
        if (dist > (halfCss - 1) * px) dist = (halfCss - 1) * px;
        a = 0.07 + Math.random() * 0.13;
        sz = Math.max(1, (0.4 + Math.random() * 0.8) * px);
        speckle(sctx, cx + Math.cos(ang) * dist, cx + Math.sin(ang) * dist, jitter(rgb), a, sz);
        if (Math.random() < 0.4) {
          speckle(
            sctx,
            cx + Math.cos(ang) * dist + (Math.random() - 0.5) * 2.4 * px,
            cx + Math.sin(ang) * dist + (Math.random() - 0.5) * 2.4 * px,
            jitter(rgb),
            a * 0.65,
            Math.max(1, (0.3 + Math.random() * 0.4) * px)
          );
        }
      }

      sctx.save();
      sctx.globalCompositeOperation = "multiply";
      sctx.globalAlpha = 0.26;
      sctx.drawImage(grainTile, 0, 0, stampPx, stampPx);
      sctx.restore();
    }

    function makeDrip(x, y, wet, rgb, now) {
      var maxLen = Math.random() < 0.38
        ? 8 + Math.random() * 22
        : 18 + Math.random() * (28 + wet * 82);
      var n = Math.max(10, (maxLen + 6) | 0);
      var wob = new Array(n);
      var acc = 0;
      var i;
      for (i = 0; i < n; i++) {
        acc += (Math.random() - 0.5) * 0.62;
        acc *= 0.9;
        wob[i] = acc;
      }
      var c = jitter(rgb);
      return {
        x: x + (Math.random() - 0.5) * 8,
        y: y + 7 + Math.random() * 6,
        maxLen: maxLen,
        thick: 0.65 + Math.random() * (0.45 + wet * 1.7),
        cr: c[0],
        cg: c[1],
        cb: c[2],
        a: 0.4 + wet * 0.34 + Math.random() * 0.08,
        born: now,
        life: LIFE * (0.88 + Math.random() * 0.18),
        growDur: 400 + Math.random() * 800,
        bead: Math.random() < 0.7,
        wob: wob
      };
    }

    function emit(x, y, speed, isTouch, now) {
      var rgb = canColor(now);
      var wet = 1 / (1 + speed * 2.6);
      var cvs = acquireStamp();
      paintStamp(cvs.getContext("2d"), wet, rgb, isTouch);
      bursts.push({
        cvs: cvs,
        x: x,
        y: y,
        born: now,
        life: LIFE * (0.86 + Math.random() * 0.2)
      });

      if (!isTouch && wet > 0.38 && now - lastDripAt > (wet > 0.72 ? 48 : 95)) {
        var chance = Math.pow(wet, 1.35) * 0.58;
        if (Math.random() < chance) {
          lastDripAt = now;
          drips.push(makeDrip(x, y, wet, rgb, now));
          if (wet > 0.68 && Math.random() < 0.4) {
            drips.push(makeDrip(x + (Math.random() - 0.5) * 11, y, wet * 0.82, rgb, now));
          }
        }
      }

      if (bursts.length > MAX_BURSTS) {
        var drop = bursts.length - MAX_BURSTS;
        var k;
        for (k = 0; k < drop; k++) releaseStamp(bursts[k].cvs);
        bursts.splice(0, drop);
      }
      if (drips.length > MAX_DRIPS) drips.splice(0, drips.length - MAX_DRIPS);
    }

    function onMove(e) {
      var isTouch = e.pointerType === "touch";
      var x = e.clientX;
      var y = e.clientY;
      var now = performance.now();
      var speed = 0.18;

      if (lastX != null) {
        var dx = x - lastX;
        var dy = y - lastY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var dt = Math.max(8, now - lastT);
        speed = dist / dt;

        if (isTouch) {
          if (dist > 3 && dist < 22) emit(x, y, speed, true, now);
        } else if (dist > 0.85) {
          var spacing = 3.5 + speed * 12;
          var steps = Math.min(12, Math.max(1, Math.round(dist / spacing)));
          var s;
          for (s = 1; s <= steps; s++) {
            emit(lastX + (dx * s) / steps, lastY + (dy * s) / steps, speed, false, now);
          }
        }
      } else if (!isTouch) {
        emit(x, y, 0.05, false, now);
      }

      lastX = x;
      lastY = y;
      lastT = now;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", function (e) {
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = performance.now();
    }, { passive: true });
    window.addEventListener("pointerleave", function () {
      lastX = lastY = null;
    });
    window.addEventListener("blur", function () {
      lastX = lastY = null;
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        running = false;
        var i;
        for (i = 0; i < bursts.length; i++) releaseStamp(bursts[i].cvs);
        bursts.length = 0;
        drips.length = 0;
        ctx.clearRect(0, 0, w, h);
      } else if (!running) {
        running = true;
        lastX = lastY = null;
        requestAnimationFrame(frame);
      }
    });

    function fadeOf(age, life) {
      var u = age / life;
      if (u < 0.32) return 1;
      var f = 1 - (u - 0.32) / 0.68;
      return f < 0 ? 0 : f;
    }

    function frame(now) {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      var i = 0;
      while (i < bursts.length) {
        var b = bursts[i];
        var age = now - b.born;
        if (age >= b.life) {
          releaseStamp(b.cvs);
          bursts[i] = bursts[bursts.length - 1];
          bursts.pop();
          continue;
        }
        ctx.globalAlpha = fadeOf(age, b.life);
        ctx.drawImage(b.cvs, b.x - halfCss, b.y - halfCss, CSS_STAMP, CSS_STAMP);
        i++;
      }
      ctx.globalAlpha = 1;

      i = 0;
      while (i < drips.length) {
        var d = drips[i];
        age = now - d.born;
        if (age >= d.life) {
          drips[i] = drips[drips.length - 1];
          drips.pop();
          continue;
        }
        var tGrow = age / d.growDur;
        if (tGrow > 1) tGrow = 1;
        tGrow = 1 - (1 - tGrow) * (1 - tGrow);
        var len = d.maxLen * tGrow;
        var fade = fadeOf(age, d.life);
        var n = Math.max(3, len | 0);
        var k, u, px, py, tw, wob;
        ctx.fillStyle = "rgba(" + d.cr + "," + d.cg + "," + d.cb + "," + (d.a * fade) + ")";
        for (k = 0; k < n; k++) {
          u = k / (n - 1 || 1);
          wob = d.wob[k] || d.wob[d.wob.length - 1] || 0;
          px = d.x + wob;
          py = d.y + k * (len / n);
          tw = d.thick * (1 - u * 0.3);
          if (((k * 17 + (d.born | 0)) & 7) === 0) continue;
          ctx.globalAlpha = fade * (0.72 + (k % 3) * 0.1);
          ctx.fillRect(px, py, Math.max(0.7, tw), 1.2);
          if (tw > 1.35) ctx.fillRect(px - 0.55, py + 0.15, 0.9, 0.9);
        }
        if (d.bead && tGrow > 0.8) {
          wob = d.wob[Math.min(n, d.wob.length - 1)] || 0;
          px = d.x + wob;
          py = d.y + len;
          var br = 1.05 + d.thick * 0.85;
          ctx.globalAlpha = fade * 0.92;
          ctx.fillRect(px - br * 0.35, py - 0.2, br, br * 0.9);
          ctx.fillRect(px + 0.5, py + 0.45, 0.9, 0.9);
          ctx.fillRect(px - 0.9, py + br * 0.45, 0.7, 0.7);
        }
        i++;
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.16;
      var tx, ty;
      for (ty = 0; ty < h; ty += 384) {
        for (tx = 0; tx < w; tx += 384) {
          ctx.drawImage(grainTile, tx, ty);
        }
      }
      ctx.restore();

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
