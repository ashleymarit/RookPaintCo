(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("reduced", reduced);

  if (!reduced) {
    var colors = ["#ff3d8a", "#e6ff3d", "#6dfff5", "#f3ead8"];
    var last = 0;
    window.addEventListener("pointermove", function (e) {
      var now = performance.now();
      if (now - last < 40) return;
      last = now;
      var d = document.createElement("span");
      d.className = "spray-dot";
      d.style.left = e.clientX + "px";
      d.style.top = e.clientY + "px";
      d.style.setProperty("--dot", colors[(Math.random() * colors.length) | 0]);
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, 560);
    }, { passive: true });
  }

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
})();
