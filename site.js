(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("reduced", reduced);

  if (!reduced) initSpray();
  initLooks();

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

  function initLooks() {
    var looks = document.querySelectorAll("article.look");
    if (!looks.length) return;

    function reveal(el) {
      el.classList.add("in-view");
    }

    if (reduced || !("IntersectionObserver" in window)) {
      looks.forEach(reveal);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });

    looks.forEach(function (el, i) {
      if (i === 0) {
        reveal(el);
        return;
      }
      el.classList.add("await-paint");
      io.observe(el);
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
    var CSS_STAMP = 96;
    var stampPx = 0;

    var CANS = [
      [229, 54, 90],
      [242, 177, 41],
      [47, 98, 232],
      [123, 63, 212]
    ];
    var canIndex = 0;
    var canStart = performance.now();
    var CAN_HOLD = 9000;
    var LIFE = 3000;
    var MAX_BURSTS = 150;
    var MAX_DROPS = 380;
    var stamps = [];
    var dropStamp = [];
    var bursts = [];
    var drops = [];
    var lastX = null;
    var lastY = null;
    var lastT = 0;
    var running = true;

    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function gauss(rng) {
      var u = rng();
      var v = rng();
      if (u < 1e-9) u = 1e-9;
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
    }

    function clamp(n, a, b) {
      return n < a ? a : n > b ? b : n;
    }

    function jitter(rgb, rng, amt) {
      amt = amt || 7;
      return [
        clamp(rgb[0] + ((rng() * amt * 2) | 0) - amt, 0, 255),
        clamp(rgb[1] + ((rng() * amt * 2) | 0) - amt, 0, 255),
        clamp(rgb[2] + ((rng() * amt * 1.6) | 0) - (amt * 0.8 | 0), 0, 255)
      ];
    }

    function makeGrainTile(size, seed) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var g = c.getContext("2d");
      var img = g.createImageData(size, size);
      var d = img.data;
      var rng = mulberry32(seed);
      var i, n;
      for (i = 0; i < d.length; i += 4) {
        n = 118 + ((rng() * 38) | 0);
        d[i] = d[i + 1] = d[i + 2] = n;
        /* Variable alpha film grain — avoids hard tile edges when stamped. */
        d[i + 3] = 40 + ((rng() * 90) | 0);
      }
      g.putImageData(img, 0, 0);
      return c;
    }

    var grainTile = makeGrainTile(192, 91);

    function paintSprayStamp(sctx, size, rgb, seed, wet) {
      var rng = mulberry32(seed);
      var cx = size / 2;
      var px = size / 96;
      var i, dx, dy, r2, a, sz, ang, dist, sigma, col, g;

      sctx.clearRect(0, 0, size, size);

      function dot(x, y, r, c, alpha) {
        if (alpha < 0.012 || r < 0.08) return;
        sctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
        sctx.beginPath();
        sctx.arc(x, y, r, 0, Math.PI * 2);
        sctx.fill();
      }

      function softDrop(x, y, r, c, alpha) {
        if (alpha < 0.02) return;
        g = sctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        g.addColorStop(0, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")");
        g.addColorStop(0.4, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (alpha * 0.42) + ")");
        g.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
        sctx.fillStyle = g;
        sctx.beginPath();
        sctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        sctx.fill();
      }

      g = sctx.createRadialGradient(cx, cx, 0, cx, cx, 46 * px);
      g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.09 + wet * 0.09) + ")");
      g.addColorStop(0.3, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.045 + wet * 0.045) + ")");
      g.addColorStop(0.66, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.016 + wet * 0.018) + ")");
      g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(cx, cx, 46 * px, 0, Math.PI * 2);
      sctx.fill();

      g = sctx.createRadialGradient(cx, cx, 0, cx, cx, 13 * px);
      g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.14 + wet * 0.12) + ")");
      g.addColorStop(0.55, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.05 + wet * 0.04) + ")");
      g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(cx, cx, 13 * px, 0, Math.PI * 2);
      sctx.fill();

      sigma = (5.4 + wet * 2.1) * px;
      for (i = 0; i < (480 + wet * 260) | 0; i++) {
        dx = gauss(rng) * sigma;
        dy = gauss(rng) * sigma;
        r2 = dx * dx + dy * dy;
        if (r2 > (44 * px) * (44 * px)) continue;
        a = (0.07 + wet * 0.09) * Math.exp(-r2 / (2 * sigma * sigma * 1.55));
        a *= 0.5 + rng() * 0.5;
        sz = (0.18 + rng() * 0.42) * px;
        dot(cx + dx, cx + dy, sz, jitter(rgb, rng, 6), a);
      }

      sigma = (3.0 + wet * 1.3) * px;
      for (i = 0; i < (110 + wet * 70) | 0; i++) {
        dx = gauss(rng) * sigma;
        dy = gauss(rng) * sigma;
        r2 = dx * dx + dy * dy;
        a = (0.11 + wet * 0.14) * Math.exp(-r2 / (2 * sigma * sigma * 1.15));
        a *= 0.6 + rng() * 0.4;
        sz = (0.22 + rng() * 0.55) * px;
        dot(cx + dx, cx + dy, sz, jitter(rgb, rng, 5), a);
      }

      for (i = 0; i < (90 + wet * 50) | 0; i++) {
        ang = rng() * Math.PI * 2;
        dist = (Math.abs(gauss(rng)) * (9 + wet * 6) + 13 + rng() * 15) * px;
        if (dist > 46 * px) dist = 46 * px;
        a = 0.02 + rng() * (0.05 + wet * 0.03);
        sz = (0.16 + rng() * 0.38) * px;
        dot(cx + Math.cos(ang) * dist, cx + Math.sin(ang) * dist, sz, jitter(rgb, rng, 7), a);
      }

      for (i = 0; i < (16 + wet * 14) | 0; i++) {
        ang = rng() * Math.PI * 2;
        dist = (13 + rng() * rng() * (26 + wet * 8)) * px;
        a = 0.07 + rng() * 0.13;
        sz = (0.32 + rng() * rng() * 1.35) * px;
        dx = cx + Math.cos(ang) * dist;
        dy = cx + Math.sin(ang) * dist;
        col = jitter(rgb, rng, 5);
        softDrop(dx, dy, sz, col, a);
        if (rng() < 0.42) {
          dot(dx + (rng() - 0.5) * 2.1 * px, dy + (rng() - 0.5) * 2.1 * px, sz * 0.38, col, a * 0.45);
        }
      }

      /* Grain only on painted pigment — never a full opaque tile square. */
      sctx.save();
      sctx.globalCompositeOperation = "source-atop";
      sctx.globalAlpha = 0.14;
      sctx.drawImage(grainTile, 0, 0, size, size);
      sctx.restore();

      /* Soft circular mask so stamp edges never read as a box while moving. */
      sctx.save();
      sctx.globalCompositeOperation = "destination-in";
      g = sctx.createRadialGradient(cx, cx, 0, cx, cx, 48 * px);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.72, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(cx, cx, 48 * px, 0, Math.PI * 2);
      sctx.fill();
      sctx.restore();
    }

    function makeDropStamp(rgb) {
      var size = 28;
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var x = c.getContext("2d");
      var cx = size / 2;
      var g = x.createRadialGradient(cx, cx, 0, cx, cx, 11);
      g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.82)");
      g.addColorStop(0.32, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.34)");
      g.addColorStop(0.7, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.07)");
      g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cx, 11, 0, Math.PI * 2);
      x.fill();
      return c;
    }

    function buildStamps() {
      var px = stampPx;
      var ci, v, c, sctx, rgb;
      stamps = [];
      dropStamp = [];
      for (ci = 0; ci < CANS.length; ci++) {
        rgb = CANS[ci];
        stamps[ci] = [];
        for (v = 0; v < 8; v++) {
          c = document.createElement("canvas");
          c.width = c.height = px;
          sctx = c.getContext("2d");
          paintSprayStamp(sctx, px, rgb, 110 + ci * 17 + v * 91, 0.32 + (v % 4) * 0.18);
          stamps[ci].push(c);
        }
        dropStamp[ci] = makeDropStamp(rgb);
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
      var next = Math.round(CSS_STAMP * dpr);
      if (next !== stampPx) {
        stampPx = next;
        buildStamps();
      }
    }
    resize();
    window.addEventListener("resize", resize);

    function canColor(now) {
      if (now - canStart > CAN_HOLD) {
        canIndex = (canIndex + 1) % CANS.length;
        canStart = now;
      }
      return CANS[canIndex];
    }

    function fadeOf(age, life) {
      var u = age / life;
      if (u < 0.16) return 1;
      var t = (u - 0.16) / 0.84;
      var f = Math.pow(1 - t, 1.5);
      return f < 0 ? 0 : f;
    }

    function emit(x, y, speed, isTouch, now) {
      canColor(now);
      var wet = 1 / (1 + speed * 2.4);
      var pack = stamps[canIndex];
      var stamp = pack[(Math.random() * pack.length) | 0];
      var scale = (isTouch ? 0.76 : 0.9) * (0.7 + wet * 0.5) * (0.92 + Math.random() * 0.14);

      bursts.push({
        cvs: stamp,
        x: x + (Math.random() - 0.5) * 2.2,
        y: y + (Math.random() - 0.5) * 2.2,
        rot: Math.random() * Math.PI * 2,
        scale: scale,
        a: 0.7 + wet * 0.24,
        born: now,
        life: LIFE * (0.88 + Math.random() * 0.16)
      });

      if (Math.random() < 0.58 + wet * 0.22) {
        bursts.push({
          cvs: stamp,
          x: x + (Math.random() - 0.5) * 7,
          y: y + (Math.random() - 0.5) * 7,
          rot: Math.random() * Math.PI * 2,
          scale: scale * (1.32 + Math.random() * 0.38),
          a: 0.16 + wet * 0.12,
          born: now,
          life: LIFE * (0.68 + Math.random() * 0.2)
        });
      }

      var dropN = isTouch ? (2 + (wet * 3) | 0) : (4 + (wet * 7) | 0);
      var i, ang, dist, g, sz;
      for (i = 0; i < dropN; i++) {
        ang = Math.random() * Math.PI * 2;
        g = Math.abs((Math.random() + Math.random() + Math.random()) / 3);
        dist = 7 + g * (20 + wet * 14);
        sz = 0.32 + Math.random() * Math.random() * 2.1;
        drops.push({
          cvs: dropStamp[canIndex],
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist,
          s: 3.4 + sz * 3.6,
          a: 0.2 + Math.random() * 0.28,
          born: now,
          life: LIFE * (0.72 + Math.random() * 0.24)
        });
      }

      if (bursts.length > MAX_BURSTS) bursts.splice(0, bursts.length - MAX_BURSTS);
      if (drops.length > MAX_DROPS) drops.splice(0, drops.length - MAX_DROPS);
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
          if (dist > 3 && dist < 24) emit(x, y, speed, true, now);
        } else if (dist > 1) {
          var spacing = 7.5 + speed * 11;
          var steps = Math.min(7, Math.max(1, Math.round(dist / spacing)));
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
        bursts.length = 0;
        drops.length = 0;
        ctx.clearRect(0, 0, w, h);
      } else if (!running) {
        running = true;
        lastX = lastY = null;
        requestAnimationFrame(frame);
      }
    });

    function frame(now) {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      var i = 0;
      var b, age, fade, size;
      while (i < bursts.length) {
        b = bursts[i];
        age = now - b.born;
        if (age >= b.life) {
          bursts[i] = bursts[bursts.length - 1];
          bursts.pop();
          continue;
        }
        fade = fadeOf(age, b.life) * b.a;
        size = CSS_STAMP * b.scale;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.drawImage(b.cvs, -size / 2, -size / 2, size, size);
        ctx.restore();
        i++;
      }

      i = 0;
      var d;
      while (i < drops.length) {
        d = drops[i];
        age = now - d.born;
        if (age >= d.life) {
          drops[i] = drops[drops.length - 1];
          drops.pop();
          continue;
        }
        ctx.globalAlpha = fadeOf(age, d.life) * d.a;
        ctx.drawImage(d.cvs, d.x - d.s / 2, d.y - d.s / 2, d.s, d.s);
        i++;
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
