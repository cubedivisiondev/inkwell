/*
 * The starfield behind the crest (THE TOOL STANDARD section 2).
 *
 * Ink dropped into water is the figure: motes drift outward from the sigil and
 * fade as they go. The only colour in the field is PLUTO sand #ceba9d, the locked
 * PUDDY gold, which is also the only accent inside the sigil itself. Everything
 * else is white at low opacity.
 *
 * prefers-reduced-motion renders ONE still frame and never schedules the loop, so
 * a reduced-motion visitor burns no frames at all rather than watching a slower
 * animation.
 */
(function () {
  var c = document.getElementById('stars');
  if (!c || !c.getContext) return;

  var ctx = c.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, motes = [];
  var GOLD = '206,186,157';                       // PLUTO sand-300, held as channels
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var still = function () { return !!(RM && RM.matches); };

  /* The drift origin is the sigil's real centre, measured rather than guessed, so
     the field stays anchored to the crest at any viewport width. */
  function origin() {
    var s = document.querySelector('.sigil');
    if (!s) return { x: W / 2, y: H * 0.34 };
    var r = s.getBoundingClientRect();
    return { x: (r.left + r.width / 2) * DPR, y: (r.top + r.height / 2) * DPR };
  }

  function seed() {
    var o = origin();
    var count = Math.round(Math.min(200, (W * H) / (26000 * DPR)));
    motes = [];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var d = Math.pow(Math.random(), 0.55) * Math.max(W, H) * 0.62;
      motes.push({
        x: o.x + Math.cos(a) * d,
        y: o.y + Math.sin(a) * d,
        r: (Math.random() * 1.25 + 0.35) * DPR,
        a: a,
        v: (Math.random() * 0.09 + 0.02) * DPR,
        o: Math.random() * 0.5 + 0.12,
        gold: Math.random() < 0.16,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function size() {
    W = c.width = Math.floor(window.innerWidth * DPR);
    H = c.height = Math.floor(window.innerHeight * DPR);
    seed();
  }

  function frame(animate) {
    ctx.clearRect(0, 0, W, H);
    var o = origin();
    var reach = Math.max(W, H) * 0.68;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      if (animate) {
        m.x += Math.cos(m.a) * m.v;
        m.y += Math.sin(m.a) * m.v;
        m.tw += 0.012;
        var dx = m.x - o.x, dy = m.y - o.y;
        if (dx * dx + dy * dy > reach * reach) {       // drifted out, respawn at the nib
          var na = Math.random() * Math.PI * 2;
          m.x = o.x + Math.cos(na) * 6 * DPR;
          m.y = o.y + Math.sin(na) * 6 * DPR;
          m.a = na;
        }
      }
      var fade = animate ? (0.72 + Math.sin(m.tw) * 0.28) : 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.gold
        ? 'rgba(' + GOLD + ',' + (m.o * fade).toFixed(3) + ')'
        : 'rgba(255,255,255,' + (m.o * fade * 0.8).toFixed(3) + ')';
      ctx.fill();
    }
  }

  function loop() {
    frame(true);
    requestAnimationFrame(loop);
  }

  size();
  window.addEventListener('resize', size, { passive: true });
  if (still()) frame(false); else loop();
})();
