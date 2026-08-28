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

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    var CANS = [
      [255, 61, 138],
      [230, 255, 61],
      [109, 255, 245]
    ];
    var canIndex = 0;
    var canStart = performance.now();
    var CAN_HOLD = 7000;
    var LIFE = 3000;
    var MAX = 2000;
    var particles = [];
    var lastX = null;
    var lastY = null;
    var lastT = 0;
    var running = true;

    function canColor(now) {
      if (now - canStart > CAN_HOLD) {
        canIndex = (canIndex + 1) % CANS.length;
        canStart = now;
      }
      return CANS[canIndex];
    }

    function jitter(rgb) {
      return [
        clamp(rgb[0] + ((Math.random() * 40) | 0) - 20, 0, 255),
        clamp(rgb[1] + ((Math.random() * 36) | 0) - 18, 0, 255),
        clamp(rgb[2] + ((Math.random() * 30) | 0) - 15, 0, 255)
      ];
    }

    function clamp(n, a, b) {
      return n < a ? a : n > b ? b : n;
    }

    function addDot(x, y, r, rgb, a, now, life) {
      particles.push({
        x: x, y: y, r: r,
        cr: rgb[0], cg: rgb[1], cb: rgb[2],
        a: a, born: now, life: life
      });
    }

    function emit(x, y, speed, isTouch, now) {
      var rgb = canColor(now);
      var slow = 1 / (1 + speed * 2.1);
      var coreN = isTouch ? (5 + (slow * 7) | 0) : (14 + (slow * 20) | 0);
      var haloN = isTouch ? (4 + (slow * 5) | 0) : (10 + (slow * 14) | 0);
      var i, ang, dist, g, c, life, px, py;

      for (i = 0; i < coreN; i++) {
        ang = Math.random() * Math.PI * 2;
        g = (Math.random() + Math.random() + Math.random()) / 3;
        dist = g * (9 + slow * 8);
        px = x + Math.cos(ang) * dist;
        py = y + Math.sin(ang) * dist;
        c = jitter(rgb);
        life = LIFE * (0.86 + Math.random() * 0.2);
        addDot(px, py, 1.35 + Math.random() * (3.1 + slow * 2.0), c, 0.48 + Math.random() * 0.28, now, life);
      }

      for (i = 0; i < haloN; i++) {
        ang = Math.random() * Math.PI * 2;
        dist = 14 + Math.random() * (22 + slow * 12);
        c = jitter(rgb);
        addDot(
          x + Math.cos(ang) * dist,
          y + Math.sin(ang) * dist,
          0.55 + Math.random() * 1.55,
          c,
          0.18 + Math.random() * 0.22,
          now,
          LIFE * (0.72 + Math.random() * 0.26)
        );
      }

      if (Math.random() < 0.22 + slow * 0.18) {
        ang = Math.random() * Math.PI * 2;
        dist = Math.random() * 7;
        c = jitter(rgb);
        addDot(
          x + Math.cos(ang) * dist,
          y + Math.sin(ang) * dist + 2,
          2.8 + Math.random() * 3.2,
          c,
          0.46 + Math.random() * 0.2,
          now,
          LIFE * (0.9 + Math.random() * 0.12)
        );
        addDot(
          x + (Math.random() - 0.5) * 18,
          y + 8 + Math.random() * 12,
          0.5 + Math.random() * 1.1,
          jitter(rgb),
          0.22 + Math.random() * 0.2,
          now,
          LIFE * (0.75 + Math.random() * 0.2)
        );
      }

      if (particles.length > MAX) particles.splice(0, particles.length - MAX);
    }

    function onMove(e) {
      var isTouch = e.pointerType === "touch";
      var x = e.clientX;
      var y = e.clientY;
      var now = performance.now();
      var speed = 0.2;

      if (lastX != null) {
        var dx = x - lastX;
        var dy = y - lastY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var dt = Math.max(8, now - lastT);
        speed = dist / dt;

        if (isTouch) {
          if (dist > 2 && dist < 26) emit(x, y, speed, true, now);
        } else if (dist > 1) {
          var steps = Math.min(8, Math.max(1, Math.round(dist / 7)));
          var s;
          for (s = 1; s <= steps; s++) {
            emit(lastX + (dx * s) / steps, lastY + (dy * s) / steps, speed, false, now);
          }
        }
      } else if (!isTouch) {
        emit(x, y, 0.06, false, now);
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
        particles.length = 0;
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
      while (i < particles.length) {
        var p = particles[i];
        var age = now - p.born;
        if (age >= p.life) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        var u = age / p.life;
        var fade = u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7;
        if (fade < 0) fade = 0;
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + p.cr + "," + p.cg + "," + p.cb + "," + (p.a * fade) + ")";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        i++;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
