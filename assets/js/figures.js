/* ReLeaf progress update — interactive figures.
   No dependencies. Reads window.RL_DATA (assets/js/data.js).

   Three figures, each drawn as one SVG with a fixed internal coordinate system
   and a horizontal scroll wrapper, so the type stays legible on a phone instead
   of shrinking. Every number drawn here comes from the raw files; nothing is
   smoothed, resampled or rounded except for display.                          */
(function () {
  'use strict';

  var D = window.RL_DATA;
  if (!D) return;

  var NS = 'http://www.w3.org/2000/svg';
  var MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  /* colours: green / orange is the pair that survives colour blindness, and the
     two series also differ in marker shape and line style.                    */
  var C = {
    ph:    '#23684a',   /* our in-line photometer */
    bd:    '#b25c14',   /* BioDrop, the commercial reference */
    ref:   '#3f5468',   /* the photometer's own reference channel */
    fit:   '#171717',
    grid:  '#e5e5e5',
    axis:  '#a3a3a3',
    text:  '#525252',
    fault: '#fbeae4',
    band:  '#f4f9f6'
  };

  /* ------------------------------------------------------------- helpers -- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* a text node that follows the page language toggle */
  function txt(parent, x, y, zh, en, attrs) {
    var a = attrs || {};
    function one(s, cls) {
      var t = el('text', {
        x: x, y: y, class: cls,
        'text-anchor': a.anchor || 'start',
        'font-size': a.size || 12,
        'font-weight': a.weight || 400,
        fill: a.fill || C.text,
        'font-family': a.mono ? MONO : null,
        transform: a.rotate ? 'rotate(' + a.rotate + ' ' + x + ' ' + y + ')' : null
      }, parent);
      t.textContent = s;
      return t;
    }
    if (en == null || en === zh) return one(zh, null);
    one(zh, 'zh'); one(en, 'en');
  }

  function lin(d0, d1, r0, r1) {
    var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    f.inv = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    f.dom = [d0, d1]; f.rng = [r0, r1];
    return f;
  }
  function log10s(d0, d1, r0, r1) {
    var a = Math.log10(d0), b = Math.log10(d1);
    var f = function (v) { return r0 + (Math.log10(v) - a) / (b - a) * (r1 - r0); };
    f.inv = function (p) { return Math.pow(10, a + (p - r0) / (r1 - r0) * (b - a)); };
    f.dom = [d0, d1]; f.rng = [r0, r1]; f.isLog = true;
    return f;
  }

  function niceTicks(d0, d1, want) {
    var span = d1 - d0, raw = span / (want || 6);
    var mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var out = [], v = Math.ceil(d0 / step) * step;
    for (; v <= d1 + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function logTicks(d0, d1) {
    var out = [];
    for (var e = Math.floor(Math.log10(d0)); e <= Math.ceil(Math.log10(d1)); e++)
      for (var m = 1; m <= 9; m++) {
        var v = m * Math.pow(10, e);
        if (v >= d0 * 0.999 && v <= d1 * 1.001) out.push({ v: v, major: m === 1 });
      }
    return out;
  }
  function fmt(v, dp) { return v.toFixed(dp == null ? 2 : dp); }

  /* ordinary least squares, returned with the pieces a caption needs */
  function ols(xs, ys) {
    var n = xs.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); syy += (ys[i] - my) * (ys[i] - my); }
    var b = sxy / sxx, a = my - b * mx, ssr = 0;
    for (i = 0; i < n; i++) { var r = ys[i] - (a + b * xs[i]); ssr += r * r; }
    return { a: a, b: b, r2: 1 - ssr / syy, sd: Math.sqrt(ssr / (n - 2)), n: n };
  }

  /* --------------------------------------------------------------- frame -- */
  /* Every figure gets the same chrome: an optional view switcher, a scrolling
     plot area, a live read-out strip, and a caption slot the HTML fills in.   */
  function frame(host, opts) {
    var wrap = document.createElement('div');
    wrap.className = 'plot';

    var bar = null;
    if (opts.views || opts.toggles) {
      bar = document.createElement('div');
      bar.className = 'plot__bar';
      wrap.appendChild(bar);
    }

    var scroll = document.createElement('div');
    scroll.className = 'plot__scroll';
    var stage = document.createElement('div');
    stage.className = 'plot__stage';
    scroll.appendChild(stage);
    wrap.appendChild(scroll);

    /* on a narrow screen the plot scrolls sideways rather than shrinking its
       type; say so, because a cut-off axis otherwise reads as a broken figure */
    var hint = document.createElement('p');
    hint.className = 'plot__hint';
    hint.innerHTML = '<span class="zh">← 左右滑動看完整張圖 →</span><span class="en">&larr; swipe sideways for the whole plot &rarr;</span>';
    wrap.appendChild(hint);

    var read = document.createElement('p');
    read.className = 'plot__read';
    read.innerHTML = '&nbsp;';
    wrap.appendChild(read);

    host.appendChild(wrap);
    return { wrap: wrap, bar: bar, stage: stage, read: read };
  }

  function group(bar, items, current, onPick, label) {
    var g = document.createElement('div');
    g.className = 'plot__grp';
    g.setAttribute('role', 'group');
    if (label) g.setAttribute('aria-label', label);
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.k = it.k;
      b.innerHTML = '<span class="zh">' + it.zh + '</span><span class="en">' + it.en + '</span>';
      b.setAttribute('aria-pressed', String(it.k === current));
      b.addEventListener('click', function () { onPick(it.k); });
      g.appendChild(b);
    });
    bar.appendChild(g);
    return g;
  }
  function markCurrent(g, k) {
    g.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.k === k));
    });
  }
  function toggle(bar, item, on, onFlip) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'plot__tog';
    b.innerHTML = '<span class="zh">' + item.zh + '</span><span class="en">' + item.en + '</span>';
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', function () {
      var next = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(next));
      onFlip(next);
    });
    bar.appendChild(b);
    return b;
  }

  /* axes: gridlines, ticks, labels. Returns nothing; draws into g.           */
  function axes(g, x, y, o) {
    var x0 = x.rng[0], x1 = x.rng[1], y0 = y.rng[0], y1 = y.rng[1];

    /* y */
    var yt = y.isLog ? logTicks(y.dom[0], y.dom[1]) : niceTicks(y.dom[0], y.dom[1], o.yn || 6).map(function (v) { return { v: v, major: true }; });
    yt.forEach(function (t) {
      var p = y(t.v);
      el('line', { x1: x0, x2: x1, y1: p, y2: p, stroke: C.grid, 'stroke-width': t.major ? 1 : .5 }, g);
      if (t.major) txt(g, x0 - 8, p + 4, fmt(t.v, o.ydp), null, { anchor: 'end', size: 11, mono: true });
    });
    /* x */
    var xt = x.isLog ? logTicks(x.dom[0], x.dom[1]) : niceTicks(x.dom[0], x.dom[1], o.xn || 7).map(function (v) { return { v: v, major: true }; });
    xt.forEach(function (t) {
      var p = x(t.v);
      el('line', { x1: p, x2: p, y1: y0, y2: y1, stroke: C.grid, 'stroke-width': t.major ? 1 : .5 }, g);
      if (t.major) txt(g, p, y0 + 18, fmt(t.v, o.xdp), null, { anchor: 'middle', size: 11, mono: true });
    });
    /* frame */
    el('line', { x1: x0, x2: x1, y1: y0, y2: y0, stroke: C.axis, 'stroke-width': 1 }, g);
    el('line', { x1: x0, x2: x0, y1: y0, y2: y1, stroke: C.axis, 'stroke-width': 1 }, g);

    if (o.xlab) txt(g, (x0 + x1) / 2, y0 + 40, o.xlab[0], o.xlab[1], { anchor: 'middle', size: 12, weight: 600, fill: '#404040' });
    if (o.ylab) txt(g, x0 - 44, (y0 + y1) / 2, o.ylab[0], o.ylab[1], { anchor: 'middle', size: 12, weight: 600, fill: '#404040', rotate: -90 });
  }

  function legend(g, x, y, items) {
    items.forEach(function (it, i) {
      var yy = y + i * 17;
      if (it.mark === 'square') {
        el('rect', { x: x, y: yy - 5, width: 9, height: 9, fill: it.open ? '#fff' : it.c, stroke: it.c, 'stroke-width': 1.4 }, g);
      } else if (it.mark === 'line') {
        el('line', { x1: x - 1, x2: x + 12, y1: yy, y2: yy, stroke: it.c, 'stroke-width': it.w || 2, 'stroke-dasharray': it.dash }, g);
      } else {
        el('circle', { cx: x + 4.5, cy: yy, r: 4, fill: it.open ? '#fff' : it.c, stroke: it.c, 'stroke-width': 1.4 }, g);
      }
      txt(g, x + 18, yy + 4, it.zh, it.en, { size: 11.5 });
    });
  }

  /* a transparent overlay that reports the nearest datum under the pointer   */
  function hover(svg, g, x, y, find, render, read) {
    var cross = el('g', { opacity: 0 }, g);
    var vl = el('line', { y1: y.rng[0], y2: y.rng[1], stroke: '#171717', 'stroke-width': .8, 'stroke-dasharray': '3 3' }, cross);
    var dot = el('circle', { r: 5.5, fill: 'none', stroke: '#171717', 'stroke-width': 1.6 }, cross);
    var rect = el('rect', {
      x: x.rng[0], y: y.rng[1], width: x.rng[1] - x.rng[0], height: y.rng[0] - y.rng[1],
      fill: 'transparent', style: 'cursor:crosshair'
    }, g);

    function move(ev) {
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      var hit = find(loc.x, loc.y);
      if (!hit) { cross.setAttribute('opacity', 0); read.innerHTML = '&nbsp;'; return; }
      cross.setAttribute('opacity', 1);
      vl.setAttribute('x1', hit.px); vl.setAttribute('x2', hit.px);
      dot.setAttribute('cx', hit.px); dot.setAttribute('cy', hit.py);
      read.innerHTML = render(hit);
    }
    rect.addEventListener('pointermove', move);
    rect.addEventListener('pointerdown', move);
    rect.addEventListener('pointerleave', function () {
      cross.setAttribute('opacity', 0); read.innerHTML = '&nbsp;';
    });
  }

  function stageSvg(stage, w, h) {
    stage.innerHTML = '';
    var svg = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img',
      style: 'display:block'
    }, stage);
    stage.style.minWidth = Math.round(w * 0.72) + 'px';
    return svg;
  }

  /* ═══════════════════════════════════════════ FIGURE · growth, 18 days ═══ */
  function figGrowth(host) {
    var g = D.gc, meta = D.gc_meta;
    var st = frame(host, { views: true });
    var view = 'lin', showRef = false, showFit = true;

    var gv = group(st.bar, [
      { k: 'lin', zh: '線性', en: 'Linear' },
      { k: 'log', zh: '對數', en: 'Log' }
    ], view, function (k) { view = k; markCurrent(gv, k); draw(); }, 'y axis scale');

    toggle(st.bar, { zh: '參考光通道', en: 'Reference channel' }, showRef, function (v) { showRef = v; draw(); });
    toggle(st.bar, { zh: '分段擬合', en: 'Phase fits' }, showFit, function (v) { showFit = v; draw(); });

    /* the four phases we fit, with the windows stated rather than implied */
    var PH = [
      { t0: 0,   t1: 7,   mu: null,      zh: '遲滯 0–7 h',    en: 'Lag 0–7 h',        note: 'OD 0.091 ± 0.016' },
      { t0: 7,   t1: 40,  mu: 0.0329,    zh: '第一段 7–40 h', en: 'Phase 1, 7–40 h',  note: 'R² 0.89 · t₂ 21 h' },
      { t0: 160, t1: 205, mu: 0.0165,    zh: '第二段 160–205 h', en: 'Phase 2, 160–205 h', note: 'R² 0.99 · t₂ 42 h' },
      { t0: 210, t1: 300, mu: 0,         zh: '平台 210–300 h', en: 'Plateau 210–300 h', note: 'OD 1.454' },
      { t0: 300, t1: 434, mu: -0.00265,  zh: '衰減 300–434 h', en: 'Decline 300–434 h', note: 'R² 0.96' }
    ];

    function draw() {
      var W = 900, H = 470, M = { l: 62, r: 58, t: 30, b: 62 };
      var svg = stageSvg(st.stage, W, H);
      svg.setAttribute('aria-label', 'B. subtilis 168 OD600 over 434 hours');
      var root = el('g', {}, svg);

      var x = lin(0, 440, M.l, W - M.r);
      var y = view === 'log' ? log10s(0.05, 2.2, H - M.b, M.t) : lin(0, 1.9, H - M.b, M.t);

      /* the window where the optical channel was failing */
      el('rect', {
        x: x(240), y: M.t, width: x(300) - x(240), height: (H - M.b) - M.t,
        fill: C.fault
      }, root);

      axes(root, x, y, {
        xlab: ['經過時間（小時）', 'Elapsed time (h)'],
        ylab: ['OD₆₀₀（線上光度計）', 'OD₆₀₀, in-line photometer'],
        ydp: 2, xdp: 0, xn: 8, yn: 7
      });

      /* day ticks along the top */
      for (var d = 0; d <= 18; d += 2) {
        var px = x(d * 24);
        if (px > W - M.r) break;
        el('line', { x1: px, x2: px, y1: M.t, y2: M.t - 5, stroke: C.axis }, root);
        txt(root, px, M.t - 10, 'D' + d, null, { anchor: 'middle', size: 10, mono: true, fill: '#a3a3a3' });
      }

      txt(root, x(270), M.t + 16, '光學通道故障', 'Optical channel fault',
        { anchor: 'middle', size: 11, weight: 600, fill: '#9a3d22' });

      /* phase bands + rates */
      if (showFit) {
        PH.forEach(function (p) {
          if (p.mu === null) return;
          el('line', { x1: x(p.t0), x2: x(p.t1), y1: H - M.b + 6, y2: H - M.b + 6, stroke: C.ph, 'stroke-width': 3, opacity: .55 }, root);
        });
      }

      /* the trace */
      var dpath = '', i;
      for (i = 0; i < g.t.length; i++) {
        var vy = g.od[i];
        if (y.isLog && vy <= 0.05) { dpath = ''; continue; }
        dpath += (dpath ? 'L' : 'M') + fmt(x(g.t[i]), 1) + ' ' + fmt(y(Math.max(vy, y.isLog ? 0.05 : -1)), 1);
      }
      el('path', { d: dpath, fill: 'none', stroke: C.ph, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, root);

      /* the photometer's own reference channel, right axis */
      if (showRef) {
        var yr = lin(0, 30, H - M.b, M.t), rp = '';
        for (i = 0; i < g.ref.length; i++)
          rp += (i ? 'L' : 'M') + fmt(x(g.t[i]), 1) + ' ' + fmt(yr(g.ref[i]), 1);
        el('path', { d: rp, fill: 'none', stroke: C.ref, 'stroke-width': 1, opacity: .8, 'stroke-dasharray': '2 2' }, root);
        niceTicks(0, 30, 4).forEach(function (v) {
          txt(root, W - M.r + 8, yr(v) + 4, fmt(v, 0), null, { size: 11, mono: true, fill: C.ref });
        });
        txt(root, W - M.r + 40, (M.t + H - M.b) / 2, '參考通道 lux', 'Reference channel, lux',
          { anchor: 'middle', size: 11.5, weight: 600, fill: C.ref, rotate: 90 });
      }

      /* rows where the channel read zero: ticks on the baseline */
      D.gc_dark.forEach(function (t) {
        el('line', { x1: x(t), x2: x(t), y1: H - M.b, y2: H - M.b - 7, stroke: '#9a3d22', 'stroke-width': 1, opacity: .55 }, root);
      });

      /* phase labels */
      if (showFit) {
        var lab = [
          { t: 23,  v: 1.72, zh: 'μ 0.0329 h⁻¹', en: 'μ 0.0329 h⁻¹' },
          { t: 182, v: 1.72, zh: 'μ 0.0165 h⁻¹', en: 'μ 0.0165 h⁻¹' },
          { t: 355, v: 1.72, zh: 'μ −0.0027 h⁻¹', en: 'μ −0.0027 h⁻¹' }
        ];
        lab.forEach(function (l) {
          var py = view === 'log' ? y(2.0) : y(l.v);
          txt(root, x(l.t), py, l.zh, l.en, { anchor: 'middle', size: 11.5, weight: 650, fill: C.ph, mono: true });
        });
        el('line', { x1: x(210), x2: x(434), y1: y(1.454), y2: y(1.454), stroke: C.fit, 'stroke-width': 1, 'stroke-dasharray': '5 4', opacity: .55 }, root);
        txt(root, x(436), y(1.454) - 6, 'K 1.454', null, { anchor: 'end', size: 11, mono: true, fill: '#171717' });
      }

      legend(root, x(232), y(view === 'log' ? 0.13 : 0.42), [
        { c: C.ph, mark: 'line', w: 1.6, zh: 'OD₆₀₀，n = ' + meta.n_valid, en: 'OD₆₀₀, n = ' + meta.n_valid },
        showRef ? { c: C.ref, mark: 'line', w: 1.2, dash: '2 2', zh: '參考光通道', en: 'Reference channel' } : null,
        { c: '#9a3d22', mark: 'line', w: 1.4, zh: '通道讀到 0，' + meta.n_dark + ' 筆', en: 'A channel read zero, ' + meta.n_dark + ' rows' }
      ].filter(Boolean));

      hover(svg, root, x, y, function (mx) {
        var tv = x.inv(mx), lo = 0, hi = g.t.length - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (g.t[mid] < tv) lo = mid + 1; else hi = mid; }
        if (lo > 0 && Math.abs(g.t[lo - 1] - tv) < Math.abs(g.t[lo] - tv)) lo--;
        return { i: lo, px: x(g.t[lo]), py: y(Math.max(g.od[lo], y.isLog ? 0.05 : -1)) };
      }, function (h) {
        var i = h.i;
        return '<b>' + g.t[i].toFixed(1) + ' h</b> · D' + (g.t[i] / 24).toFixed(1) +
               ' &nbsp;OD<sub>600</sub> <b>' + g.od[i].toFixed(3) + '</b>' +
               ' &nbsp;<span class="dim">ref ' + g.ref[i].toFixed(1) + ' lux</span>';
      }, st.read);
    }
    draw();
  }

  /* ═══════════════════════════════════════ FIGURE · trial comparison ══════ */
  function figTrials(host) {
    var T = D.trials;
    var st = frame(host, { views: true });
    var view = 'rate';
    var gv = group(st.bar, [
      { k: 'rate',  zh: '速率與上限', en: 'Rate and ceiling' },
      { k: 'power', zh: '6/10 那次測得到嗎', en: 'Could 10 June have seen it?' }
    ], view, function (k) { view = k; markCurrent(gv, k); draw(); }, 'view');

    function drawRate() {
      var W = 900, H = 470, M = { l: 250, t: 54, b: 96 };
      var svg = stageSvg(st.stage, W, H);
      var root = el('g', {}, svg);

      var colA = [264, 534];   /* μ, log */
      var colB = [606, 806];   /* plateau, linear */
      var x1 = log10s(0.008, 1.5, colA[0], colA[1]);
      var x2 = lin(1.2, 1.6, colB[0], colB[1]);
      var rowY = function (i) { return M.t + 34 + i * 46; };

      txt(root, colA[0], M.t, '比生長速率 μ（h⁻¹，對數軸）', 'Specific growth rate μ (h⁻¹, log)', { size: 12, weight: 650, fill: '#404040' });
      txt(root, colB[0], M.t, '平台 OD₆₀₀', 'Plateau OD₆₀₀', { size: 12, weight: 650, fill: '#404040' });

      /* axis ticks */
      logTicks(0.008, 1.5).forEach(function (t) {
        var p = x1(t.v);
        el('line', { x1: p, x2: p, y1: M.t + 12, y2: H - M.b, stroke: C.grid, 'stroke-width': t.major ? 1 : .5 }, root);
        if (t.major) txt(root, p, H - M.b + 16, String(t.v), null, { anchor: 'middle', size: 11, mono: true });
      });
      niceTicks(1.2, 1.6, 4).forEach(function (v) {
        var p = x2(v);
        el('line', { x1: p, x2: p, y1: M.t + 12, y2: H - M.b, stroke: C.grid }, root);
        txt(root, p, H - M.b + 16, v.toFixed(1), null, { anchor: 'middle', size: 11, mono: true });
      });

      T.forEach(function (r, i) {
        var yy = rowY(i);
        var warm = r.T === 37;
        txt(root, M.l - 14, yy + 4, r.label_zh, r.label_en, { anchor: 'end', size: 12, weight: 620, fill: '#171717' });
        txt(root, M.l - 14, yy + 19, r.date + ' · ' + r.T + ' °C · ' + r.vessel_zh,
                                     r.date + ' · ' + r.T + ' °C · ' + r.vessel_en,
          { anchor: 'end', size: 10.5, fill: '#a3a3a3' });

        if (r.mu > 0) {
          el('circle', { cx: x1(r.mu), cy: yy, r: 6, fill: warm ? C.bd : C.ph }, root);
          txt(root, x1(r.mu), yy - 12, r.mu.toFixed(r.mu < 0.1 ? 4 : 3) + ' · ' + r.window, null,
            { anchor: 'middle', size: 10.5, mono: true, fill: '#525252' });
        } else {
          /* no growth resolved: draw it as a bound, not as a point */
          el('line', { x1: x1(0.008), x2: x1(0.03), y1: yy, y2: yy, stroke: '#a3a3a3', 'stroke-width': 2 }, root);
          el('path', { d: 'M' + x1(0.03) + ' ' + (yy - 5) + 'L' + (x1(0.03) + 8) + ' ' + yy + 'L' + x1(0.03) + ' ' + (yy + 5) + 'Z', fill: '#a3a3a3' }, root);
          txt(root, x1(0.02), yy - 12, '無法分辨', 'not resolvable', { anchor: 'middle', size: 10.5, fill: '#737373' });
        }

        if (r.plateau) {
          el('rect', { x: x2(r.plateau) - 5, y: yy - 5, width: 10, height: 10, fill: warm ? C.bd : C.ph }, root);
          txt(root, x2(r.plateau), yy - 12, r.plateau.toFixed(3), null, { anchor: 'middle', size: 10.5, mono: true });
        } else {
          txt(root, (colB[0] + colB[1]) / 2, yy + 4, '未達平台', 'no plateau reached', { anchor: 'middle', size: 10.5, fill: '#a3a3a3' });
        }
      });

      /* the two spans that make the point */
      el('line', { x1: x1(0.0329), x2: x1(0.933), y1: H - M.b + 32, y2: H - M.b + 32, stroke: '#171717', 'stroke-width': 1 }, root);
      [0.0329, 0.933].forEach(function (v) {
        el('line', { x1: x1(v), x2: x1(v), y1: H - M.b + 27, y2: H - M.b + 37, stroke: '#171717' }, root);
      });
      txt(root, (x1(0.0329) + x1(0.933)) / 2, H - M.b + 48, '速率差 28 倍', 'rate spans 28×',
        { anchor: 'middle', size: 11.5, weight: 650, fill: '#171717' });

      el('line', { x1: x2(1.399), x2: x2(1.480), y1: H - M.b + 32, y2: H - M.b + 32, stroke: '#171717', 'stroke-width': 1 }, root);
      [1.399, 1.480].forEach(function (v) {
        el('line', { x1: x2(v), x2: x2(v), y1: H - M.b + 27, y2: H - M.b + 37, stroke: '#171717' }, root);
      });
      txt(root, (x2(1.399) + x2(1.480)) / 2, H - M.b + 48, '上限差 6 %', 'ceiling spans 6 %',
        { anchor: 'middle', size: 11.5, weight: 650, fill: '#171717' });

      legend(root, 24, H - M.b + 26, [
        { c: C.bd, zh: '37 °C 搖瓶', en: '37 °C, shaken' },
        { c: C.ph, zh: '22 °C 培養箱', en: '22 °C, incubator' }
      ]);
      st.read.innerHTML = '<span class="dim">' +
        '<span class="zh">六次試驗全部是批次培養、固定體積、無 fed-batch。速率由溫度與容器決定，上限由養分存量決定。兩者可以分開講。</span>' +
        '<span class="en">All six are batch, fixed volume, no fed-batch. Temperature and vessel set the rate; the nutrient inventory sets the ceiling. They move independently.</span></span>';
    }

    function drawPower() {
      var W = 900, H = 430, M = { l: 64, r: 44, t: 34, b: 62 };
      var svg = stageSvg(st.stage, W, H);
      var root = el('g', {}, svg);

      var mu = 0.0329, od0 = 0.172, sd = 0.0329;
      var x = lin(0, 24, M.l, W - M.r);
      var y = lin(0, 0.26, H - M.b, M.t);

      axes(root, x, y, {
        xlab: ['實驗長度（小時）', 'Length of the experiment (h)'],
        ylab: ['可累積的 ΔOD₆₀₀', 'Attainable ΔOD₆₀₀'], ydp: 2, xdp: 0, xn: 8
      });

      /* what the 10 June run could not have separated from its own scatter */
      el('rect', { x: M.l, y: y(sd), width: (W - M.r) - M.l, height: (H - M.b) - y(sd), fill: '#f5f5f5' }, root);
      el('line', { x1: M.l, x2: W - M.r, y1: y(sd), y2: y(sd), stroke: '#737373', 'stroke-dasharray': '4 3' }, root);
      txt(root, W - M.r - 8, y(sd) - 7, '該次實驗自身的散布，1 SD = 0.033', 'that run’s own scatter, 1 SD = 0.033',
        { anchor: 'end', size: 11.5, fill: '#525252' });

      el('line', { x1: M.l, x2: W - M.r, y1: y(3 * sd), y2: y(3 * sd), stroke: '#9a3d22', 'stroke-dasharray': '6 4' }, root);
      txt(root, W - M.r - 8, y(3 * sd) + 17, '要說得出「長了」，至少要 3 SD = 0.099', 'to call it growth, at least 3 SD = 0.099',
        { anchor: 'end', size: 11.5, weight: 600, fill: '#9a3d22' });

      /* growth attainable at the rate the 18-day run measured */
      var p = '';
      for (var h = 0; h <= 24; h += 0.1) {
        var dv = od0 * (Math.exp(mu * h) - 1);
        p += (h ? 'L' : 'M') + fmt(x(h), 1) + ' ' + fmt(y(dv), 1);
      }
      el('path', { d: p, fill: 'none', stroke: C.ph, 'stroke-width': 2.2 }, root);

      /* the two moments that matter */
      [[4.5,  '6/10 那次只跑到這裡，4.5 h', 'the 10 June run stopped here, 4.5 h', C.bd,     'end',   -12,  22, true],
       [13.8, '要跑到 13.8 h 才看得出來',   '13.8 hours would have been needed', '#9a3d22', 'start',  12, -14, false]
      ].forEach(function (m) {
        var dv = od0 * (Math.exp(mu * m[0]) - 1);
        el('line', { x1: x(m[0]), x2: x(m[0]), y1: H - M.b, y2: y(dv), stroke: m[3], 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, root);
        el('circle', { cx: x(m[0]), cy: y(dv), r: 5.5, fill: m[3] }, root);
        txt(root, x(m[0]) + m[5], y(dv) + m[6], m[1], m[2], { anchor: m[4], size: 11.5, weight: 650, fill: m[3] });
        if (m[7]) txt(root, x(m[0]) + m[5], y(dv) + m[6] + 15, 'ΔOD ' + dv.toFixed(3), null, { anchor: m[4], size: 10.5, mono: true, fill: '#525252' });
      });

      txt(root, M.l + 12, M.t + 16, 'μ = 0.0329 h⁻¹（18 天連續紀錄實測），起始 OD 0.172',
                                    'μ = 0.0329 h⁻¹ measured by the 18-day run, starting from OD 0.172',
        { size: 11.5, fill: '#525252' });

      st.read.innerHTML = '<span class="dim">' +
        '<span class="zh">用 18 天實測到的速率回推：6/10 那 4.5 小時最多只會漲 0.027 OD，比該次自身的散布還小。那次實驗沒有能力回答菌在裡面長不長。</span>' +
        '<span class="en">Run the measured rate backwards: in 4.5 hours the 10 June test could gain at most 0.027 OD, less than its own scatter. That experiment had no power to answer whether cells grow in there.</span></span>';
    }

    function draw() { view === 'rate' ? drawRate() : drawPower(); }
    draw();
  }

  /* ═══════════════════════════════════════════ FIGURE · TiO₂ calibration ══ */
  function figCal(host) {
    var c = D.cal;
    var mass = c.mass, ph = c.ph, bd = c.bd;
    var pair = [];
    for (var i = 0; i < mass.length; i++) if (bd[i] != null) pair.push({ m: mass[i], p: ph[i], b: bd[i] });

    var st = frame(host, { views: true });
    var view = 'mass';
    var gv = group(st.bar, [
      { k: 'mass', zh: '對 TiO₂ 質量', en: 'Against TiO₂ mass' },
      { k: 'xy',   zh: '兩台儀器對照', en: 'Instrument vs instrument' },
      { k: 'ba',   zh: '差值分析', en: 'Difference plot' }
    ], view, function (k) { view = k; markCurrent(gv, k); draw(); }, 'view');

    /* fits, computed here so the figure and its labels can never drift apart */
    var lowM = mass.map(function (m, j) { return { m: m, p: ph[j], b: bd[j] }; }).filter(function (r) { return r.m <= 30; });
    var fitPh = ols(lowM.map(function (r) { return r.m; }), lowM.map(function (r) { return r.p; }));
    var fitBd = ols(lowM.filter(function (r) { return r.b != null; }).map(function (r) { return r.m; }),
                    lowM.filter(function (r) { return r.b != null; }).map(function (r) { return r.b; }));
    var hiBd = pair.filter(function (r) { return r.m > 30; });
    var fitHiBd = ols(hiBd.map(function (r) { return r.m; }), hiBd.map(function (r) { return r.b; }));
    var hiPh = mass.map(function (m, j) { return { m: m, p: ph[j] }; }).filter(function (r) { return r.m > 30; });
    var fitHiPh = ols(hiPh.map(function (r) { return r.m; }), hiPh.map(function (r) { return r.p; }));
    var work = pair.filter(function (r) { return r.b <= 1.2; });
    var fitXY = ols(work.map(function (r) { return r.b; }), work.map(function (r) { return r.p; }));

    function drawMass() {
      var W = 900, H = 460, M = { l: 62, r: 30, t: 30, b: 62 };
      var svg = stageSvg(st.stage, W, H);
      var root = el('g', {}, svg);
      var x = lin(0, 62, M.l, W - M.r), y = lin(0, 2.7, H - M.b, M.t);

      el('rect', { x: x(30), y: M.t, width: x(62) - x(30), height: (H - M.b) - M.t, fill: C.fault, opacity: .5 }, root);

      axes(root, x, y, {
        xlab: ['加入的 TiO₂ 累積質量（mg，於 400 mL 循環中攪拌）', 'Cumulative TiO₂ added (mg, stirred in a 400 mL loop)'],
        ylab: ['讀值 OD₆₀₀', 'Reading, OD₆₀₀'], ydp: 1, xdp: 0, xn: 7, yn: 6
      });

      txt(root, x(46), y(0.42), '超出 BioDrop 規格', 'past BioDrop’s specification',
        { anchor: 'middle', size: 12, weight: 700, fill: '#9a3d22' });
      txt(root, x(46), y(0.30), '光度計平滑壓縮，BioDrop 開始跳', 'ours compresses smoothly, BioDrop starts to jump',
        { anchor: 'middle', size: 11.5, fill: '#9a3d22' });

      /* fitted lines over the band each was fitted on, dashed where extrapolated */
      function line(f, m0, m1, colour, dash) {
        /* stop where the fit would leave the top of the plot rather than draw
           off-canvas */
        var top = y.dom[1], mCap = (top - f.a) / f.b;
        if (m1 > mCap) m1 = mCap;
        if (m1 <= m0) return;
        el('line', { x1: x(m0), x2: x(m1), y1: y(f.a + f.b * m0), y2: y(f.a + f.b * m1), stroke: colour, 'stroke-width': 1.4, 'stroke-dasharray': dash, opacity: .85 }, root);
      }
      line(fitPh, 2, 30, C.ph, null);
      line(fitPh, 30, 62, C.ph, '5 4');
      line(fitBd, 2, 30, C.bd, null);
      line(fitBd, 30, 48, C.bd, '5 4');

      for (var j = 0; j < mass.length; j++) {
        if (bd[j] != null) el('rect', { x: x(mass[j]) - 4, y: y(bd[j]) - 4, width: 8, height: 8, fill: '#fff', stroke: C.bd, 'stroke-width': 1.5 }, root);
      }
      for (j = 0; j < mass.length; j++) el('circle', { cx: x(mass[j]), cy: y(ph[j]), r: 3.4, fill: C.ph }, root);

      legend(root, M.l + 14, M.t + 26, [
        { c: C.ph, zh: '線上光度計，n = ' + mass.length, en: 'In-line photometer, n = ' + mass.length },
        { c: C.bd, mark: 'square', open: true, zh: 'BioDrop，n = ' + pair.length, en: 'BioDrop, n = ' + pair.length },
        { c: '#737373', mark: 'line', dash: '5 4', w: 1.4, zh: '2–30 mg 擬合線外推', en: 'the 2–30 mg fit, extrapolated' }
      ]);

      var box = el('g', {}, root);
      el('rect', { x: W - M.r - 250, y: H - M.b - 94, width: 244, height: 92, fill: '#fff', stroke: C.grid, rx: 4 }, box);
      txt(box, W - M.r - 238, H - M.b - 74, '2–30 mg 線性', 'Linear over 2–30 mg', { size: 11.5, weight: 700, fill: '#171717' });
      txt(box, W - M.r - 238, H - M.b - 58, '光度計 R² ' + fitPh.r2.toFixed(4) + ' · 殘差 SD ' + fitPh.sd.toFixed(3), 'photometer R² ' + fitPh.r2.toFixed(4) + ' · resid SD ' + fitPh.sd.toFixed(3), { size: 11, fill: C.ph });
      txt(box, W - M.r - 238, H - M.b - 43, 'BioDrop R² ' + fitBd.r2.toFixed(4) + ' · 殘差 SD ' + fitBd.sd.toFixed(3), 'BioDrop R² ' + fitBd.r2.toFixed(4) + ' · resid SD ' + fitBd.sd.toFixed(3), { size: 11, fill: C.bd });
      txt(box, W - M.r - 238, H - M.b - 26, '> 30 mg：光度計仍單調，平均低 0.230',
                                            '> 30 mg: ours stays monotone, 0.230 low on average', { size: 11, fill: C.ph });
      txt(box, W - M.r - 238, H - M.b - 11, 'BioDrop 45 步階裡 5 次倒退，最大 −0.385',
                                            'BioDrop reverses on 5 of 45 steps, worst −0.385', { size: 11, fill: C.bd });

      hover(svg, root, x, y, function (mx) {
        var mv = x.inv(mx), best = 0;
        for (var j = 1; j < mass.length; j++) if (Math.abs(mass[j] - mv) < Math.abs(mass[best] - mv)) best = j;
        return { i: best, px: x(mass[best]), py: y(ph[best]) };
      }, function (h) {
        var j = h.i;
        return '<b>' + mass[j] + ' mg TiO<sub>2</sub></b>' +
               ' &nbsp;<span style="color:' + C.ph + '">光度計 / photometer <b>' + ph[j].toFixed(4) + '</b></span>' +
               (bd[j] != null ? ' &nbsp;<span style="color:' + C.bd + '">BioDrop <b>' + bd[j].toFixed(3) + '</b></span>' +
                 ' &nbsp;<span class="dim">Δ ' + (ph[j] - bd[j]).toFixed(3) + '</span>' : ' &nbsp;<span class="dim">BioDrop 未量 / not measured</span>');
      }, st.read);
    }

    function drawXY() {
      var W = 900, H = 530, M = { l: 62, r: 30, t: 30, b: 62 };
      var svg = stageSvg(st.stage, W, H);
      var root = el('g', {}, svg);
      /* square aspect so a 1:1 line really looks like 45° */
      var side = Math.min(W - M.l - M.r - 250, (H - M.t - M.b));
      var x = lin(0, 2.7, M.l, M.l + side), y = lin(0, 2.7, M.t + side, M.t);

      axes(root, x, y, {
        xlab: ['BioDrop 讀值 OD₆₀₀', 'BioDrop, OD₆₀₀'],
        ylab: ['線上光度計讀值 OD₆₀₀', 'In-line photometer, OD₆₀₀'], ydp: 1, xdp: 1, xn: 6, yn: 6
      });

      el('line', { x1: x(0), x2: x(2.7), y1: y(0), y2: y(2.7), stroke: '#a3a3a3', 'stroke-width': 1, 'stroke-dasharray': '4 4' }, root);
      txt(root, x(2.5), y(2.62), '1 : 1', null, { anchor: 'end', size: 11, mono: true, fill: '#737373' });

      /* the working band: this is where B. subtilis cultures actually sit */
      el('rect', { x: x(0), y: y(1.2), width: x(1.2) - x(0), height: y(0) - y(1.2), fill: C.band }, root);
      txt(root, x(0.06), y(1.14), '培養實際會用到的範圍', 'where cultures actually live',
        { size: 11, weight: 600, fill: C.ph });

      el('line', {
        x1: x(0), x2: x(1.2),
        y1: y(fitXY.a), y2: y(fitXY.a + fitXY.b * 1.2),
        stroke: C.fit, 'stroke-width': 1.6
      }, root);

      pair.forEach(function (r) {
        var inBand = r.b <= 1.2;
        el('circle', {
          cx: x(r.b), cy: y(r.p), r: 4.2,
          fill: inBand ? C.ph : '#fff', stroke: C.ph, 'stroke-width': 1.5
        }, root);
      });

      var bx = M.l + side + 34;
      var box = el('g', {}, root);
      txt(box, bx, M.t + 26, 'OD ≤ 1.2，n = ' + fitXY.n, 'OD ≤ 1.2, n = ' + fitXY.n, { size: 12, weight: 700, fill: '#171717' });
      [['y = ' + fitXY.b.toFixed(3) + ' x − ' + Math.abs(fitXY.a).toFixed(3), null],
       ['R² = ' + fitXY.r2.toFixed(4), null],
       ['殘差 SD = ' + fitXY.sd.toFixed(3) + ' OD', 'residual SD = ' + fitXY.sd.toFixed(3) + ' OD'],
       ['最大殘差 0.064 OD', 'largest residual 0.064 OD']
      ].forEach(function (l, k) {
        txt(box, bx, M.t + 48 + k * 17, l[0], l[1], { size: 11.5, mono: !l[1], fill: '#404040' });
      });
      txt(box, bx, M.t + 132, 'OD > 1.2　超出 BioDrop 規格', 'OD > 1.2, past BioDrop’s spec', { size: 12, weight: 700, fill: '#171717' });
      txt(box, bx, M.t + 152, '兩台差 0.198 ± 0.133', 'the two differ by 0.198 ± 0.133', { size: 11.5, fill: C.bd });
      txt(box, bx, M.t + 170, '刻意測到這裡，看各自怎麼壞', 'measured on purpose, to see how each fails', { size: 11.5, fill: '#737373' });

      legend(root, bx, M.t + 206, [
        { c: C.ph, zh: '工作範圍內', en: 'inside the working band' },
        { c: C.ph, open: true, zh: '工作範圍外', en: 'outside it' }
      ]);

      hover(svg, root, x, y, function (mx, my) {
        var best = null, bd2 = 1e9;
        pair.forEach(function (r, j) {
          var d = Math.pow(x(r.b) - mx, 2) + Math.pow(y(r.p) - my, 2);
          if (d < bd2) { bd2 = d; best = j; }
        });
        var r = pair[best];
        return { i: best, px: x(r.b), py: y(r.p) };
      }, function (h) {
        var r = pair[h.i];
        return '<b>' + r.m + ' mg</b> &nbsp;BioDrop <b>' + r.b.toFixed(3) + '</b>' +
               ' &nbsp;光度計 / photometer <b>' + r.p.toFixed(4) + '</b>' +
               ' &nbsp;<span class="dim">Δ ' + (r.p - r.b).toFixed(3) + '</span>';
      }, st.read);
    }

    function drawBA() {
      var W = 900, H = 440, M = { l: 62, r: 210, t: 30, b: 62 };
      var svg = stageSvg(st.stage, W, H);
      var root = el('g', {}, svg);
      var diffs = pair.map(function (r) { return r.p - r.b; });
      var dLo = Math.min.apply(null, diffs), dHi = Math.max.apply(null, diffs);
      var x = lin(0, 2.6, M.l, W - M.r),
          y = lin(Math.min(-0.1, dLo - 0.06), Math.max(0.1, dHi + 0.06), H - M.b, M.t);

      var lowD = pair.filter(function (r) { return (r.p + r.b) / 2 <= 1.2; }).map(function (r) { return r.p - r.b; });
      var mLow = lowD.reduce(function (a, b) { return a + b; }, 0) / lowD.length;
      var sLow = Math.sqrt(lowD.reduce(function (a, b) { return a + (b - mLow) * (b - mLow); }, 0) / (lowD.length - 1));

      /* limits of agreement over the working band, drawn as a band */
      el('rect', { x: x(0), y: y(mLow + 1.96 * sLow), width: x(1.2) - x(0), height: y(mLow - 1.96 * sLow) - y(mLow + 1.96 * sLow), fill: C.band }, root);

      axes(root, x, y, {
        xlab: ['兩台讀值的平均 OD₆₀₀', 'Mean of the two readings, OD₆₀₀'],
        ylab: ['光度計 − BioDrop（OD）', 'Photometer − BioDrop (OD)'], ydp: 2, xdp: 1, xn: 6, yn: 7
      });

      el('line', { x1: x(0), x2: x(2.6), y1: y(0), y2: y(0), stroke: '#a3a3a3' }, root);
      el('line', { x1: x(0), x2: x(1.2), y1: y(mLow), y2: y(mLow), stroke: C.fit, 'stroke-width': 1.6 }, root);
      [mLow + 1.96 * sLow, mLow - 1.96 * sLow].forEach(function (v) {
        el('line', { x1: x(0), x2: x(1.2), y1: y(v), y2: y(v), stroke: C.fit, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, root);
      });
      el('line', { x1: x(1.2), x2: x(1.2), y1: M.t, y2: H - M.b, stroke: '#9a3d22', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, root);
      txt(root, x(1.2) + 6, M.t + 14, 'OD 1.2', null, { size: 10.5, mono: true, fill: '#9a3d22' });

      pair.forEach(function (r) {
        var mn = (r.p + r.b) / 2, d = r.p - r.b, inB = mn <= 1.2;
        el('circle', { cx: x(mn), cy: y(d), r: 4.2, fill: inB ? C.ph : '#fff', stroke: inB ? C.ph : C.bd, 'stroke-width': 1.5 }, root);
      });

      var bx = W - M.r + 14;
      txt(root, bx, M.t + 24, 'OD ≤ 1.2，n = ' + lowD.length, 'OD ≤ 1.2, n = ' + lowD.length, { size: 12, weight: 700, fill: '#171717' });
      txt(root, bx, M.t + 44, '偏差 ' + mLow.toFixed(3) + ' OD', 'bias ' + mLow.toFixed(3) + ' OD', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 61, '一致性界限', 'limits of agreement', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 78, (mLow - 1.96 * sLow).toFixed(3) + ' … +' + (mLow + 1.96 * sLow).toFixed(3), null, { size: 11.5, mono: true, fill: '#404040' });
      txt(root, bx, M.t + 108, 'OD > 1.2，n = ' + (pair.length - lowD.length), 'OD > 1.2, n = ' + (pair.length - lowD.length), { size: 12, weight: 700, fill: '#171717' });
      txt(root, bx, M.t + 128, '偏差 −0.198，SD 0.133', 'bias −0.198, SD 0.133', { size: 11.5, fill: C.bd });
      txt(root, bx, M.t + 145, 'BioDrop 規格外，兩台都在外插', 'past BioDrop’s spec; both extrapolating', { size: 11.5, fill: C.bd });

      hover(svg, root, x, y, function (mx, my) {
        var best = 0, bb = 1e9;
        pair.forEach(function (r, j) {
          var mn = (r.p + r.b) / 2, d = r.p - r.b;
          var q = Math.pow(x(mn) - mx, 2) + Math.pow(y(d) - my, 2);
          if (q < bb) { bb = q; best = j; }
        });
        var r = pair[best];
        return { i: best, px: x((r.p + r.b) / 2), py: y(r.p - r.b) };
      }, function (h) {
        var r = pair[h.i];
        return '<b>' + r.m + ' mg</b> &nbsp;<span class="dim">平均 / mean</span> <b>' + ((r.p + r.b) / 2).toFixed(3) + '</b>' +
               ' &nbsp;<span class="dim">差 / difference</span> <b>' + (r.p - r.b).toFixed(3) + '</b>';
      }, st.read);
    }

    function draw() { view === 'mass' ? drawMass() : view === 'xy' ? drawXY() : drawBA(); }
    draw();
  }


  /* ═══════════════════════════════════ FIGURE · module hydraulics 2026-08-16 ═ */
  function figHydro(host) {
    var H = D.hyd, m = H.meta, R = H.rec;
    var st = frame(host, { views: true });
    var view = 'dp';
    var gv = group(st.bar, [
      { k: 'dp',    zh: '壓降對流量',   en: 'Pressure drop vs flow' },
      { k: 'ratio', zh: '扣掉管路之後', en: 'After subtracting the rig' },
      { k: 'win',   zh: '操作視窗',     en: 'Operating window' }
    ], view, function (k) { view = k; markCurrent(gv, k); draw(); }, 'view');

    function curve(x, y, a, b, q0, q1) {
      var d = '';
      for (var q = q0; q <= q1 + .01; q += 2)
        d += (d ? 'L' : 'M') + fmt(x(q), 1) + ' ' + fmt(y(a * q + b * q * q), 1);
      return d;
    }

    /* ---- view 1: the two configurations, and the module by difference ---- */
    function drawDP() {
      var W = 900, Ht = 470, M = { l: 66, r: 30, t: 30, b: 62 };
      var svg = stageSvg(st.stage, W, Ht);
      var root = el('g', {}, svg);
      var x = lin(0, 480, M.l, W - M.r), y = lin(0, 0.48, Ht - M.b, M.t);

      axes(root, x, y, {
        xlab: ['交叉流量 Q（mL/min）', 'Cross-flow rate Q (mL/min)'],
        ylab: ['壓降 ΔP（bar）', 'Pressure drop ΔP (bar)'], ydp: 2, xdp: 0, xn: 7, yn: 7
      });

      el('path', { d: curve(x, y, H.hf.a, H.hf.b, 0, 460), fill: 'none', stroke: C.bd, 'stroke-width': 1.6 }, root);
      el('path', { d: curve(x, y, H.bg.a, H.bg.b, 0, 460), fill: 'none', stroke: C.ref, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, root);
      el('path', { d: curve(x, y, H.net.a, H.net.b, 0, 460), fill: 'none', stroke: C.ph, 'stroke-width': 2.2 }, root);

      H.hf.q.forEach(function (q, i) {
        el('rect', { x: x(q) - 4, y: y(H.hf.p[i]) - 4, width: 8, height: 8, fill: '#fff', stroke: C.bd, 'stroke-width': 1.5 }, root);
      });
      H.bg.q.forEach(function (q, i) {
        el('circle', { cx: x(q), cy: y(H.bg.p[i]), r: 4, fill: '#fff', stroke: C.ref, 'stroke-width': 1.5 }, root);
      });
      H.hf.q.forEach(function (q, i) {
        el('circle', { cx: x(q), cy: y(H.net.p[i]), r: 3.6, fill: C.ph }, root);
      });

      /* how much of the total the rig itself accounts for */
      var qm = 275, tot = H.hf.a * qm + H.hf.b * qm * qm, bg = H.bg.a * qm + H.bg.b * qm * qm;
      el('line', { x1: x(qm), x2: x(qm), y1: y(0), y2: y(tot), stroke: '#171717', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, root);
      el('path', { d: 'M' + (x(qm) + 6) + ' ' + y(bg) + 'L' + (x(qm) + 6) + ' ' + y(tot), stroke: '#171717', 'stroke-width': 3 }, root);
      txt(root, x(qm) - 12, y((bg + tot) / 2) + 4, '模組本身只佔一半', 'the module is only half of it',
        { anchor: 'end', size: 11.5, weight: 650, fill: '#171717' });
      txt(root, x(qm) - 12, y(bg / 2) + 4, '另一半是閥、接頭、比色管', 'the rest is valves, fittings, the cuvette',
        { anchor: 'end', size: 11.5, fill: C.ref });

      legend(root, M.l + 16, M.t + 22, [
        { c: C.bd, mark: 'square', open: true, zh: '裝了模組（HFM）', en: 'Module installed (HFM)' },
        { c: C.ref, open: true, zh: '換成矽膠管的空跑（背景）', en: 'Silicone jumper, no module (background)' },
        { c: C.ph, zh: '相減得到的模組淨壓降', en: 'Module, by difference' }
      ]);

      var bx = W - M.r - 250;
      el('rect', { x: bx, y: Ht - M.b - 78, width: 244, height: 72, fill: '#fff', stroke: C.grid, rx: 4 }, root);
      txt(root, bx + 12, Ht - M.b - 60, 'ΔP = aQ + bQ²，強制過原點', 'ΔP = aQ + bQ², forced through the origin', { size: 11.5, weight: 700, fill: '#171717' });
      txt(root, bx + 12, Ht - M.b - 44, 'HFM　　R² ' + H.hf.r2.toFixed(4) + '，殘差 SD ' + H.hf.sd.toFixed(4) + ' bar',
                                        'HFM　　R² ' + H.hf.r2.toFixed(4) + ', residual SD ' + H.hf.sd.toFixed(4) + ' bar', { size: 11, fill: C.bd });
      txt(root, bx + 12, Ht - M.b - 29, '背景　　R² ' + H.bg.r2.toFixed(4) + '，殘差 SD ' + H.bg.sd.toFixed(4) + ' bar',
                                        'Background R² ' + H.bg.r2.toFixed(4) + ', residual SD ' + H.bg.sd.toFixed(4) + ' bar', { size: 11, fill: C.ref });
      txt(root, bx + 12, Ht - M.b - 14, '每點 n = 1，8 個 PWM 設定', 'n = 1 per point, 8 PWM settings', { size: 11, fill: '#737373' });

      hover(svg, root, x, y, function (mx) {
        var q = x.inv(mx), i = 0;
        H.hf.q.forEach(function (v, j) { if (Math.abs(v - q) < Math.abs(H.hf.q[i] - q)) i = j; });
        return { i: i, px: x(H.hf.q[i]), py: y(H.hf.p[i]) };
      }, function (h) {
        var i = h.i;
        return '<b>' + H.hf.q[i].toFixed(0) + ' mL/min</b>' +
          ' &nbsp;<span style="color:' + C.bd + '">HFM <b>' + H.hf.p[i].toFixed(4) + '</b> bar</span>' +
          ' &nbsp;<span style="color:' + C.ph + '">淨值 / net <b>' + H.net.p[i].toFixed(4) + '</b></span>' +
          ' &nbsp;<span class="dim">γ̇ ' + H.gamma[i] + ' s⁻¹ · Re ' + H.re[i] + '</span>';
      }, st.read);
    }

    /* ---- view 2: does the module behave like eleven 1 mm tubes? ---------- */
    function drawRatio() {
      var W = 900, Ht = 450, M = { l: 66, r: 200, t: 34, b: 62 };
      var svg = stageSvg(st.stage, W, Ht);
      var root = el('g', {}, svg);
      var x = lin(80, 480, M.l, W - M.r), y = lin(0.6, 1.45, Ht - M.b, M.t);

      el('rect', { x: M.l, y: y(1.0), width: (W - M.r) - M.l, height: y(0.85) - y(1.0), fill: C.band }, root);
      el('rect', { x: x(R.qCeil), y: M.t, width: (W - M.r) - x(R.qCeil), height: (Ht - M.b) - M.t, fill: C.fault, opacity: .55 }, root);

      axes(root, x, y, {
        xlab: ['交叉流量 Q（mL/min）', 'Cross-flow rate Q (mL/min)'],
        ylab: ['淨壓降 ÷ Hagen–Poiseuille 理論值', 'Net ΔP ÷ Hagen–Poiseuille prediction'], ydp: 1, xdp: 0, xn: 6, yn: 6
      });

      el('line', { x1: M.l, x2: W - M.r, y1: y(1), y2: y(1), stroke: '#171717', 'stroke-width': 1.2 }, root);
      txt(root, M.l + 8, y(1) - 7, '理論值', 'theory', { size: 11, fill: '#171717' });

      var d = '';
      H.hf.q.forEach(function (q, i) { d += (i ? 'L' : 'M') + fmt(x(q), 1) + ' ' + fmt(y(H.net.ratio[i]), 1); });
      el('path', { d: d, fill: 'none', stroke: C.ph, 'stroke-width': 1.6 }, root);
      H.hf.q.forEach(function (q, i) {
        var inBand = q <= R.qCeil;
        el('circle', { cx: x(q), cy: y(H.net.ratio[i]), r: 5, fill: inBand ? C.ph : '#fff', stroke: C.ph, 'stroke-width': 1.6 }, root);
      });

      txt(root, x(370), M.t + 18, '> 300 mL/min', null, { anchor: 'middle', size: 11.5, weight: 700, fill: '#9a3d22' });
      txt(root, x(370), M.t + 33, '模組頭部的局部損失開始主導', 'header minor losses take over', { anchor: 'middle', size: 11, fill: '#9a3d22' });

      var bx = W - M.r + 14;
      txt(root, bx, M.t + 22, '113–263 mL/min', null, { size: 12, weight: 700, fill: '#171717' });
      txt(root, bx, M.t + 42, '比值 0.90–0.96', 'ratio 0.90–0.96', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 59, '模組行為和 11 根 1 mm', 'the module behaves like eleven', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 74, '管子並聯一致', '1 mm tubes in parallel', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 104, '有效纖維數 n_eff ≈ 11', 'effective fibre count n_eff ≈ 11', { size: 12, weight: 700, fill: C.ph });
      txt(root, bx, M.t + 122, '標稱 11 根，沒有阻塞', 'nominal 11, none blocked', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 152, '獨立交叉檢查', 'independent cross-check', { size: 12, weight: 700, fill: '#171717' });
      txt(root, bx, M.t + 170, '由流量算的 γ̇ 與由壓降算的', 'γ̇ from flow and τ_w from pressure', { size: 11.5, fill: '#404040' });
      txt(root, bx, M.t + 185, 'τ_w 只差 2.8 %', 'agree to 2.8 %', { size: 11.5, fill: '#404040' });

      hover(svg, root, x, y, function (mx) {
        var q = x.inv(mx), i = 0;
        H.hf.q.forEach(function (v, j) { if (Math.abs(v - q) < Math.abs(H.hf.q[i] - q)) i = j; });
        return { i: i, px: x(H.hf.q[i]), py: y(H.net.ratio[i]) };
      }, function (h) {
        var i = h.i;
        return '<b>' + H.hf.q[i].toFixed(0) + ' mL/min</b> &nbsp;淨值 / net <b>' + H.net.p[i].toFixed(4) +
          '</b> bar &nbsp;理論 / theory <b>' + H.net.theo[i].toFixed(4) + '</b> &nbsp;比值 / ratio <b>' + H.net.ratio[i].toFixed(2) + '</b>';
      }, st.read);
    }

    /* ---- view 3: where the module may actually be run ------------------- */
    function drawWin() {
      var W = 900, Ht = 460, M = { l: 66, r: 76, t: 40, b: 62 };
      var svg = stageSvg(st.stage, W, Ht);
      var root = el('g', {}, svg);
      var x = lin(80, 480, M.l, W - M.r);
      var yg = lin(0, 7600, Ht - M.b, M.t);           /* shear rate */
      var yn = lin(0, 76, Ht - M.b, M.t);             /* axial non-uniformity, % */

      el('rect', { x: x(R.qCeil), y: M.t, width: (W - M.r) - x(R.qCeil), height: (Ht - M.b) - M.t, fill: C.fault, opacity: .55 }, root);
      el('rect', { x: M.l, y: yg(6000), width: (W - M.r) - M.l, height: yg(2000) - yg(6000), fill: C.band }, root);

      axes(root, x, yg, {
        xlab: ['交叉流量 Q（mL/min）', 'Cross-flow rate Q (mL/min)'],
        ylab: ['壁面剪切率 γ̇_w（s⁻¹）', 'Wall shear rate γ̇_w (s⁻¹)'], ydp: 0, xdp: 0, xn: 6, yn: 5
      });

      txt(root, M.l + 10, yg(6000) - 8, '廠商校準帶 2000–6000 s⁻¹', 'vendor-calibrated band, 2000–6000 s⁻¹',
        { size: 11, weight: 600, fill: C.ph });

      var dg = '', dn = '';
      H.hf.q.forEach(function (q, i) {
        dg += (i ? 'L' : 'M') + fmt(x(q), 1) + ' ' + fmt(yg(H.gamma[i]), 1);
        dn += (i ? 'L' : 'M') + fmt(x(q), 1) + ' ' + fmt(yn(H.net.p[i] / R.tmp * 100), 1);
      });
      el('path', { d: dg, fill: 'none', stroke: C.ph, 'stroke-width': 2 }, root);
      el('path', { d: dn, fill: 'none', stroke: C.bd, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, root);
      H.hf.q.forEach(function (q, i) {
        el('circle', { cx: x(q), cy: yg(H.gamma[i]), r: 4, fill: C.ph }, root);
        el('rect', { x: x(q) - 3.5, y: yn(H.net.p[i] / R.tmp * 100) - 3.5, width: 7, height: 7, fill: C.bd }, root);
      });

      /* the right-hand axis belongs to the non-uniformity trace */
      [0, 20, 40, 60].forEach(function (v) {
        txt(root, W - M.r + 10, yn(v) + 4, v + ' %', null, { size: 11, mono: true, fill: C.bd });
      });
      txt(root, W - M.r + 58, (M.t + Ht - M.b) / 2, '軸向 TMP 非均勻度（TMP 0.30 bar）', 'Axial TMP non-uniformity at TMP 0.30 bar',
        { anchor: 'middle', size: 11.5, weight: 600, fill: C.bd, rotate: 90 });
      el('line', { x1: M.l, x2: W - M.r, y1: yn(20), y2: yn(20), stroke: C.bd, 'stroke-width': .8, 'stroke-dasharray': '2 3' }, root);
      txt(root, M.l + 10, yn(20) - 6, '20 % 以下可視為均勻', 'below 20 % counts as uniform', { size: 10.5, fill: C.bd });

      el('line', { x1: x(R.q), x2: x(R.q), y1: M.t, y2: Ht - M.b, stroke: '#171717', 'stroke-width': 1.6 }, root);
      txt(root, x(R.q) - 8, M.t + 14, '建議操作點 263 mL/min', 'recommended, 263 mL/min', { anchor: 'end', size: 11.5, weight: 700, fill: '#171717' });
      txt(root, x(R.q) - 8, M.t + 29, 'γ̇ 4 060 s⁻¹ · TMP 0.30 bar · 非均勻度 28 %', 'γ̇ 4 060 s⁻¹ · TMP 0.30 bar · 28 % non-uniform',
        { anchor: 'end', size: 10.5, fill: '#525252' });
      txt(root, x(R.qCeil) + 8, Ht - M.b - 14, '300 mL/min 以上不建議', 'not recommended above 300 mL/min',
        { size: 11, weight: 600, fill: '#9a3d22' });

      legend(root, M.l + 10, Ht - M.b - 46, [
        { c: C.ph, zh: '壁面剪切率（左軸）', en: 'wall shear rate (left)' },
        { c: C.bd, mark: 'square', zh: '軸向 TMP 非均勻度（右軸）', en: 'axial TMP non-uniformity (right)' }
      ]);

      hover(svg, root, x, yg, function (mx) {
        var q = x.inv(mx), i = 0;
        H.hf.q.forEach(function (v, j) { if (Math.abs(v - q) < Math.abs(H.hf.q[i] - q)) i = j; });
        return { i: i, px: x(H.hf.q[i]), py: yg(H.gamma[i]) };
      }, function (h) {
        var i = h.i;
        return '<b>' + H.hf.q[i].toFixed(0) + ' mL/min</b> &nbsp;γ̇ <b>' + H.gamma[i] + '</b> s⁻¹' +
          ' &nbsp;τ_w <b>' + H.tau[i].toFixed(2) + '</b> Pa &nbsp;Re <b>' + H.re[i] + '</b>' +
          ' &nbsp;<span class="dim">非均勻度 / non-uniformity ' + (H.net.p[i] / R.tmp * 100).toFixed(0) + ' %</span>';
      }, st.read);
    }

    function draw() { view === 'dp' ? drawDP() : view === 'ratio' ? drawRatio() : drawWin(); }
    draw();
  }

  /* ------------------------------------------------------------- mount --- */
  var MAP = { growth: figGrowth, trials: figTrials, cal: figCal, hydro: figHydro };
  document.querySelectorAll('[data-fig]').forEach(function (host) {
    var f = MAP[host.dataset.fig];
    if (f) f(host);
  });
})();
