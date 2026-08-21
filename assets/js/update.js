/* ReLeaf · progress update page. Three small jobs: language, contents rail,
   lightbox. No dependencies, no build step.                                  */
(function () {
  'use strict';

  /* ------------------------------------------------------------ language */
  var KEY = 'releaf-update-lang';
  var root = document.documentElement;

  function setLang(lang) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'zh' ? 'zh-Hant' : 'en');
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    document.querySelectorAll('.langtoggle button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
  }

  try { setLang(localStorage.getItem(KEY) || 'zh'); } catch (e) { setLang('zh'); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.langtoggle button');
    if (b) setLang(b.dataset.lang);
  });

  /* ------------------------------------------------------------ contents */
  var body = document.querySelector('.pagebody');
  var list = document.querySelector('.toc__list');
  if (body && list) {
    var heads = body.querySelectorAll('section.sec > h2');
    heads.forEach(function (h) {
      var sec = h.parentElement;
      if (!sec.id) return;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      /* the rail follows the active language too */
      var zh = h.querySelector('.zh'), en = h.querySelector('.en');
      if (zh && en) {
        a.innerHTML = '<span class="zh">' + zh.textContent.trim() + '</span>' +
                      '<span class="en">' + en.textContent.trim() + '</span>';
      } else {
        a.textContent = h.textContent.trim();
      }
      li.appendChild(a);
      list.appendChild(li);
    });

    var links = list.querySelectorAll('a');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    body.querySelectorAll('section.sec').forEach(function (s) { if (s.id) obs.observe(s); });
  }

  /* ------------------------------------------------------------ lightbox */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img'), lbCap = lb.querySelector('figcaption');
    document.addEventListener('click', function (e) {
      var img = e.target.closest('.fig img');
      if (img) {
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt;
        var cap = img.closest('figure').querySelector('figcaption');
        lbCap.textContent = cap ? cap.textContent.trim() : '';
        lb.classList.add('is-open');
        return;
      }
      if (e.target.closest('.lightbox')) lb.classList.remove('is-open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') lb.classList.remove('is-open');
    });
  }
})();
