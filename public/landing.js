(function () {
  // Text reveal: the hero title and tagline play when the page opens; each section heading plays once when it scrolls into view.
  // The words stay real text (spaces and all), so copying, searching and screen readers see the same sentence. Nothing runs for visitors who ask for less motion.
  var root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { root.classList.remove('reveal-pending'); return; }
  var split = function (el, base) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      if (i) el.appendChild(document.createTextNode(' '));
      var s = document.createElement('span');
      s.className = 'rv-word'; s.textContent = w; s.style.setProperty('--i', i); if (base) s.style.setProperty('--base', base + 'ms');
      el.appendChild(s);
    });
    return words.length;
  };
  var title = document.querySelector('.hero h1'), lead = document.querySelector('.hero .lead');
  var n = title ? split(title, 0) : 0;
  if (lead) split(lead, n * 80 + 120); // the tagline starts right after the title
  var heads = Array.prototype.slice.call(document.querySelectorAll('main h2'));
  heads.forEach(function (h) { split(h, 0); });
  // The lines under the headings reveal word by word too, just after their heading.
  var subs = Array.prototype.slice.call(document.querySelectorAll('main .sub, .free p'));
  subs.forEach(function (el) { split(el, 450); });
  // The letter, the donation button and the footer fade and rise in, one after another within their group.
  var groups = [
    { sel: ['.top .brand', '.top nav .button'], base: 0 }, // the top bar and the hero buttons play on load, after the title
    { sel: ['.hero .stores .badge'], base: 420, step: 70 },
    { sel: ['.hero .phone'], base: 250 },
    { sel: ['.spaced-phone'], base: 0 },
    { sel: ['.flips li'], base: 0, step: 90 },
    { sel: ['.hello .letter p'], base: 0 }, // each paragraph of the note comes in a moment after the one before (they all start when the letter comes into view)
    { sel: ['.notes li'], base: 0 }, // the pictures with their notes come in one after another
    { sel: ['.free .button'], base: 0 },
    { sel: ['footer .foot-brand', 'footer .foot-col', 'footer .lang'], base: 0 }
  ];
  var blocks = [];
  groups.forEach(function (g) {
    var els = Array.prototype.slice.call(document.querySelectorAll(g.sel.join(',')));
    els.forEach(function (el, i) { el.classList.add('rv-block'); el.style.setProperty('--d', g.base + i * (g.step || 110) + 'ms'); blocks.push(el); });
  });
  // Once a block has finished appearing, hand it back to its normal styles, so a button's hover and focus transitions carry no reveal delay.
  var settle = function (el) {
    if (!el.classList.contains('rv-block')) return;
    el.classList.remove('rv-block', 'rv-go'); el.style.removeProperty('--d'); el.setAttribute('data-revealed', '');
  };
  blocks.forEach(function (el) {
    // the rise (transform) always changes, even for a button whose own styles keep its opacity fixed
    el.addEventListener('transitionend', function (e) { if (e.target === el && e.propertyName === 'transform' && el.classList.contains('rv-go')) settle(el); });
    // If the browser never reports the end of the animation (a busy or background tab skips it), the block is handed back anyway.
    new MutationObserver(function () { if (el.classList.contains('rv-go') && el.classList.contains('rv-block')) setTimeout(function () { settle(el); }, 2500); }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  root.classList.remove('reveal-pending');
  if (title) title.classList.add('rv-go');
  if (lead) lead.classList.add('rv-go');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-go'); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    heads.concat(subs).forEach(function (h) { io.observe(h); });
    var bo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-go'); bo.unobserve(e.target); } });
    }, { threshold: 0.15 });
    // The pictures beside the note wait until they are half in view, so on the first screen only the note's title shows, not a corner of a picture.
    var po = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('rv-go'); po.unobserve(e.target); } });
    }, { threshold: 0.5 });
    blocks.forEach(function (b) { if (!b.matches('.hello .letter p')) (b.matches('.notes li') ? po : bo).observe(b); });
    // The paragraphs of the note are not watched one by one: when the letter comes into view they all start, 110ms apart.
    var letter = document.querySelector('.hello .letter');
    if (letter) {
      var lo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          Array.prototype.forEach.call(letter.querySelectorAll('p'), function (p) { p.classList.add('rv-go'); });
          lo.unobserve(letter);
        });
      }, { threshold: 0.15 });
      lo.observe(letter);
    }
  } else heads.concat(subs, blocks).forEach(function (h) { h.classList.add('rv-go'); });
})();
(function () {
  var top = document.querySelector('header.top');
  if (top) {
    var sync = function () { top.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }
})();
(function () {
  // The language picker in the footer is a <details> (it works without any script); this only closes it with Escape or a click elsewhere.
  var lang = document.querySelector('details.lang');
  if (lang) {
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lang.open) { lang.open = false; lang.querySelector('summary').focus(); } });
    document.addEventListener('click', function (e) { if (lang.open && !lang.contains(e.target)) lang.open = false; });
  }
})();
(function () {
  // Motion on the phones: how far each one has travelled through the screen (--p, 0 to 1) moves it a little, and on a computer the hero phone leans toward the pointer.
  // Nothing runs for visitors who ask for less motion (the page then shows the phones still).
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var spots = Array.prototype.slice.call(document.querySelectorAll('.hero-phone, .spaced-wrap, .ratings'));
  if (!spots.length) return;
  var queued = false;
  var update = function () {
    queued = false;
    var vh = window.innerHeight;
    spots.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var p = (vh - r.top) / (vh + r.height);
      el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
    });
  };
  var ask = function () { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', ask, { passive: true });
  window.addEventListener('resize', ask);
  update();
  // On a computer, a phone leans a little toward the pointer while it is over the part of the page the phone belongs to.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    [['.hero', '.hero-phone'], ['.spaced-wrap', '.spaced-phone']].forEach(function (pair) {
      var area = document.querySelector(pair[0]), phone = document.querySelector(pair[1]);
      if (!area || !phone) return;
      area.addEventListener('pointermove', function (e) {
        var r = area.getBoundingClientRect();
        phone.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        phone.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
      area.addEventListener('pointerleave', function () { phone.style.setProperty('--mx', 0); phone.style.setProperty('--my', 0); });
    });
  }
})();

(function () {
  // The feature cards: a tap (or Enter or Space) turns a card over and keeps it turned until you tap again. With a mouse, hovering turns it too (that part is CSS).
  Array.prototype.forEach.call(document.querySelectorAll('.flip'), function (b) {
    b.addEventListener('click', function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); });
  });
})();
(function () {
  // The three phone photos next to the letter are not part of the open-source repository (they show Bible text under a license). A copy of the site that does not have them
  // simply shows the letter: a picture that cannot load is taken out, and when none is left the whole column goes and the letter is centered.
  var wrap = document.querySelector('.hello-wrap');
  var pics = wrap && wrap.querySelector('.pics');
  if (!pics) return;
  function drop(img) {
    var li = img.closest('li');
    if (li) li.remove();
    if (!pics.querySelector('.notes li')) { pics.remove(); wrap.classList.add('no-pics'); }
  }
  Array.prototype.forEach.call(pics.querySelectorAll('.notes img'), function (img) {
    if (img.complete && img.naturalWidth === 0) drop(img);
    else img.addEventListener('error', function () { drop(img); }, { once: true });
  });
})();
