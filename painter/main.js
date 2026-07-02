/* Northlight paint-roller hero — scroll-scrubbed roll + paint reveal + headline beats */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // CSS shows the finished state statically

  var hero = document.getElementById('hero');
  var paint = document.getElementById('paint');
  var roller = document.getElementById('roller');
  var nap = document.getElementById('nap');
  var blurNode = document.getElementById('rollblurG');
  var cue = document.getElementById('cue');
  var beats = Array.prototype.slice.call(document.querySelectorAll('.beat'));

  /* ---- rolling motion: velocity -> vertical motion-blur + nap-scroll ---- */
  var lastP = 0, vel = 0;            // vel = |progress delta| per update, decayed each tick
  var curBlur = 0;                   // px of vertical gaussian blur, eased
  var MAXBLUR = 2.9, K_BLUR = 150, K_NAP = 22;  // velocity gains

  /* ---- Lenis smooth scroll wired to GSAP ticker ---- */
  var lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  gsap.registerPlugin(ScrollTrigger);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);

  // beat crossfade thresholds (progress): blank-canvas -> one-true-color -> lines-so-clean
  function setBeats(p) {
    var idx = p < 0.20 ? 0 : (p < 0.58 ? 1 : 2);
    beats.forEach(function (b, i) { b.classList.toggle('is-on', i === idx); });
  }

  /* Choreography (matches the reel): the wall is BLANK, then the roller appears at
     centre, travels UP to the top DRY (no paint), then rolls DOWN from the top laying
     the stripe — paint fills from the top edge down to the roller's leading edge.
     Sleeve-centre positions as a fraction of hero height (0 = top, 1 = bottom):        */
  var ENTER = 0.62, CENTER = 0.50, TOP = 0.06, BOT = 0.92;
  // phase boundaries in scroll progress:
  var P_APPEAR = 0.08,   // 0..A   : rise ENTER->CENTER, fade in (blank canvas)
      P_HOLD   = 0.15,   // A..H   : sit at CENTER (still blank)
      P_TOP    = 0.32,   // H..T   : rise CENTER->TOP, dry (no paint)
      P_DOWN   = 0.86;   // T..D   : descend TOP->BOT, painting;  D..1 : roll off

  function clamp(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function seg(p, a, b){ return clamp((p - a) / (b - a)); }     // 0..1 within [a,b]
  function ease(t){ return t * t * (3 - 2 * t); }              // smoothstep

  function apply(p, crisp) {
    var heroH = hero.offsetHeight, rollerH = roller.offsetHeight;
    var s, painting, op = 1;

    // scroll velocity (magnitude of progress change) drives blur + nap fade
    if (crisp) { vel = 0; curBlur = 0; }
    else { vel = Math.abs(p - lastP); }
    lastP = p;

    if (p < P_APPEAR) {                 // roller appears, rising to centre
      s = ENTER + (CENTER - ENTER) * ease(seg(p, 0, P_APPEAR));
      op = ease(seg(p, 0, P_APPEAR * 0.85));
      painting = false;
    } else if (p < P_HOLD) {            // sits loaded at centre — blank wall
      s = CENTER; painting = false;
    } else if (p < P_TOP) {            // travels UP to the top, dry
      s = CENTER + (TOP - CENTER) * ease(seg(p, P_HOLD, P_TOP));
      painting = false;
    } else if (p < P_DOWN) {           // rolls DOWN from the top, laying paint
      s = TOP + (BOT - TOP) * ease(seg(p, P_TOP, P_DOWN));   // eased both ends -> smooth
      painting = true;
    } else {                           // roll off the bottom edge; full stripe remains
      var e = seg(p, P_DOWN, 1);
      s = BOT + (1.30 - BOT) * (e * e);              // accelerate off-screen
      painting = true;
      op = 1 - ease(seg(p, 0.92, 1.0));              // fade to nothing by the end
    }

    // paint fills from the top down to the sleeve's CONTACT (bottom) edge, so it sits
    // BEHIND the whole sleeve (roller is z-above): the ragged leading edge hides behind
    // the roller, and below the sleeve is bare wall — no green reads as "paint underneath".
    var sleeveHalf = 0.115 * (rollerH / heroH);     // sleeve radius in hero-height fraction
    var botFrac = painting ? Math.min(1, s + sleeveHalf) : 0;
    paint.style.clipPath = botFrac > 0.001
      ? 'inset(0 0 ' + ((1 - botFrac) * 100).toFixed(2) + '% 0)'
      : 'inset(0 0 100% 0)';

    var y = s * heroH - 0.115 * rollerH;            // sleeve centre at s
    roller.style.transform = 'translate3d(-50%,' + y.toFixed(1) + 'px,0)';
    roller.style.opacity = op.toFixed(3);

    // nap ridges scroll with travel (rotation cue) — slightly faster than the sleeve
    // itself so the surface reads as turning; crisp/static frames leave it settled
    if (nap) nap.style.backgroundPositionY = (s * heroH * 1.5).toFixed(1) + 'px';

    if (crisp) {                                    // deterministic capture: no motion FX
      curBlur = 0;
      if (blurNode) blurNode.setAttribute('stdDeviation', '0 0');
      if (nap) nap.style.opacity = '0';
    }

    if (cue) cue.style.opacity = p > 0.03 ? '0' : '1';
    setBeats(p);
  }

  // continuous decay loop: eases blur + nap opacity toward rest so they fall the
  // instant scrolling stops (onUpdate stops firing, but this keeps ticking)
  gsap.ticker.add(function () {
    var targetBlur = Math.min(MAXBLUR, vel * K_BLUR);
    curBlur += (targetBlur - curBlur) * 0.28;
    if (curBlur < 0.02) curBlur = 0;
    if (blurNode) blurNode.setAttribute('stdDeviation', '0 ' + curBlur.toFixed(2));
    if (nap) nap.style.opacity = Math.min(0.5, vel * K_NAP).toFixed(3);
    vel *= 0.80;                                    // decay velocity toward 0 when idle
  });

  apply(0, true);

  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',
    end: '+=360%',          // longer travel -> each scroll tick moves progress less (smoother)
    pin: true,
    scrub: 1.1,             // softer catch-up smooths the scrub
    onUpdate: function (self) { apply(self.progress); },
    onRefresh: function () { apply(0, true); }
  });

  window.addEventListener('resize', function () { ScrollTrigger.refresh(); });

  // dev hook: deterministic beat capture for the compare loop (crisp = no motion FX)
  window.__setProgress = function (p) { apply(p, true); };
  // dev hook: capture a MID-MOTION frame with the roll's blur + nap at a given velocity
  window.__setProgressMoving = function (p, v) { lastP = p - (v || 0.01); apply(p); };
})();
