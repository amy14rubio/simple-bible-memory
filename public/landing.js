/* The little demo on the landing page: it looks like the app's own study screens. Flip and rate a flashcard, type a verse, fill in the blanks,
   and read about speaking. Plain script, no libraries. The verses are copied from the app's own decks (World English Bible, Reina-Valera 1909).
   Nothing here is saved or sent anywhere. Only the flashcard offers another verse; the other three use one fixed verse. */
(function () {
  // The language picker in the footer is a <details> (it works without any script); this only closes it with Escape or a click elsewhere.
  var lang = document.querySelector('details.lang');
  if (lang) {
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lang.open) { lang.open = false; lang.querySelector('summary').focus(); } });
    document.addEventListener('click', function (e) { if (lang.open && !lang.contains(e.target)) lang.open = false; });
  }
})();
(function () {
  var root = document.getElementById('demo');
  if (!root) return;
  var lang = document.documentElement.lang === 'es' ? 'es' : 'en';

  var CARDS = {"en": [{"ref": "Proverbs 3:5-6", "text": "Trust in the LORD with all your heart, and don’t lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight."}, {"ref": "Romans 5:8", "text": "But God commends his own love toward us, in that while we were yet sinners, Christ died for us."}, {"ref": "2 Timothy 1:7", "text": "For God didn’t give us a spirit of fear, but of power, love, and self-control."}], "es": [{"ref": "Proverbios 3:5-6", "text": "Fíate de Jehová de todo tu corazón, y no estribes en tu prudencia. Reconócelo en todos tus caminos, y él enderezará tus veredas."}, {"ref": "Romanos 5:8", "text": "Mas Dios encarece su caridad para con nosotros, porque siendo aún pecadores, Cristo murió por nosotros."}, {"ref": "2 Timoteo 1:7", "text": "Porque no nos ha dado Dios el espíritu de temor, sino el de fortaleza, y de amor, y de templanza."}]};
  var FIXED = { en: CARDS.en[2], es: CARDS.es[2] }; // 2 Timothy 1:7 for typing, blanks and speaking
  var BLANKS = {
    en: { template: 'For God didn’t give us a spirit of {0}, but of {1}, love, and {2}.', answers: ['fear', 'power', 'self-control'], bank: ['love', 'fear', 'power', 'faith', 'self-control', 'joy'] },
    es: { template: 'Porque no nos ha dado Dios el espíritu de {0}, sino el de {1}, y de amor, y de {2}.', answers: ['temor', 'fortaleza', 'templanza'], bank: ['amor', 'temor', 'fortaleza', 'fe', 'templanza', 'gozo'] }
  };
  var MIC = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>';
  var T = {
    en: { modes: [['flash', 'Flashcard'], ['type', 'Type'], ['blanks', 'Fill in the blanks'], ['speak', 'Speak']], tabs: 'Choose a way to study',
          show: 'Show answer', next: 'Try another verse', again: 'Try again', bank: 'Word bank',
          rates: [['Again', '1m', 'again'], ['Hard', '6m', 'hard'], ['Good', '10m', 'good'], ['Easy', '2d', 'easy']],
          rated: function (label, when) { return label + '! You’d see this verse again in ' + when + '. The better you remember it, the longer it waits.'; },
          right: 'Correct.', wrong: function (w) { return 'Not quite: the word was “' + w + '”.'; }, done: 'That’s it! In the app you’d now rate how it went.',
          typeLabel: 'Type the verse from memory', typePlaceholder: 'Type the verse from memory…', yourAnswer: 'Your answer', correctVerse: 'Correct verse',
          typed: function (n, total) { return 'You remembered ' + n + ' of ' + total + ' words.'; },
          speakText: ['Recite verses hands-free while you drive or go about your day. The app reads them back, and you rate yourself for easy, relaxed practice.'] },
    es: { modes: [['flash', 'Tarjeta'], ['type', 'Escribir'], ['blanks', 'Completar espacios'], ['speak', 'Hablar']], tabs: 'Elige una forma de estudiar',
          show: 'Mostrar respuesta', next: 'Probar otro versículo', again: 'Probar otra vez', bank: 'Banco de palabras',
          rates: [['Otra vez', '1 min', 'again'], ['Difícil', '6 min', 'hard'], ['Bien', '10 min', 'good'], ['Fácil', '2 d', 'easy']],
          rated: function (label, when) { return '¡' + label + '! Volverías a ver este versículo en ' + when + '. Mientras mejor lo recuerdes, más tarde vuelve.'; },
          right: 'Correcto.', wrong: function (w) { return 'Casi: la palabra era “' + w + '”.'; }, done: '¡Eso es! En la app ahora calificarías cómo te fue.',
          typeLabel: 'Escribe el versículo de memoria', typePlaceholder: 'Escribe el versículo de memoria…', yourAnswer: 'Tu respuesta', correctVerse: 'Versículo correcto',
          typed: function (n, total) { return 'Recordaste ' + n + ' de ' + total + ' palabras.'; },
          speakText: ['Recita versículos sin manos mientras manejas o sigues con tu día. La app te los lee de vuelta, y tú te calificas para una práctica fácil y tranquila.'] }
  }[lang];

  var mode = 'flash', cardIndex = 0, step = 'front', rating = null, blankStep = 0, picked = [], verdict = '', typedText = '';
  var userActed = false; // focus is only moved after the visitor has done something, so loading the page never steals it

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(label, cls, onClick) { var b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', function () { userActed = true; onClick(); }); return b; }
  function render() {
    root.textContent = '';
    var tabs = el('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', T.tabs);
    T.modes.forEach(function (m) {
      var b = button(m[1], 'tab', function () { mode = m[0]; reset(); render(); });
      b.setAttribute('aria-pressed', String(mode === m[0]));
      tabs.appendChild(b);
    });
    root.appendChild(tabs);
    // Like the app's study screens: the card in the middle, the buttons along the bottom.
    var card = el('div', 'demo-card'), body = el('div', 'd-body'), bar = el('div', 'd-bar');
    var status = el('p', 'sr-only'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var focusTarget = ({ flash: renderFlash, type: renderType, blanks: renderBlanks, speak: renderSpeak })[mode](body, bar, status);
    card.appendChild(body); card.appendChild(bar);
    root.appendChild(card);
    root.appendChild(status);
    if (userActed && focusTarget) focusTarget.focus();
  }
  function reset() { cardIndex = 0; step = 'front'; rating = null; blankStep = 0; picked = []; verdict = ''; typedText = ''; }

  function ratesRow(onRate) {
    var rates = el('div', 'd-rates'), first = null;
    T.rates.forEach(function (r, i) {
      var b = button('', 'rate', function () { onRate(i); });
      b.appendChild(el('span', 'rate-name ' + r[2], r[0])); b.appendChild(el('small', null, r[1])); // (shown the other way up: the time above the word, as in the app)
      b.setAttribute('aria-label', r[0] + ', ' + r[1]);
      rates.appendChild(b); if (!first) first = b;
    });
    return { row: rates, first: first };
  }

  function renderFlash(body, bar, status) {
    var c = CARDS[lang][cardIndex];
    body.appendChild(el('p', 'd-ref big', c.ref));
    if (step === 'front') {
      var show = button(T.show, 'button full', function () { step = 'back'; render(); });
      bar.appendChild(show);
      return show;
    }
    body.appendChild(el('p', 'd-verse', c.text));
    if (step === 'back') {
      var r = ratesRow(function (i) { rating = i; step = 'rated'; render(); });
      bar.appendChild(r.row);
      return r.first;
    }
    var msg = el('p', 'd-msg', T.rated(T.rates[rating][0], T.rates[rating][1])); body.appendChild(msg);
    status.textContent = msg.textContent;
    var nextBtn = button(T.next, 'button secondary full', function () { cardIndex = (cardIndex + 1) % CARDS[lang].length; step = 'front'; rating = null; render(); });
    bar.appendChild(nextBtn);
    return nextBtn;
  }

  // ---- typing: like the app, a plain line to type on, then your answer and the correct verse with right words green and missed ones red
  function norm(w) { return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ-]/g, ''); }
  // Compares the words typed with the verse's words (longest run in common), and says for each step whether it was a match, a verse word that
  // was left out ('x'), or an extra word that was typed ('i').
  function align(expected, typed) {
    var e = expected.map(norm), t = typed.map(norm), n = e.length, m = t.length, i, j;
    var L = []; for (i = 0; i <= n; i++) { L.push([]); for (j = 0; j <= m; j++) L[i].push(0); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = (e[i] && e[i] === t[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = [], a = 0, b = 0;
    while (a < n && b < m) {
      if (e[a] && e[a] === t[b]) { ops.push(['m', a, b]); a++; b++; } else if (L[a + 1][b] >= L[a][b + 1]) { ops.push(['x', a]); a++; } else { ops.push(['i', b]); b++; }
    }
    while (a < n) ops.push(['x', a++]);
    while (b < m) ops.push(['i', b++]);
    return ops;
  }
  function paintedExpected(words, ops) {
    var cls = []; ops.forEach(function (o) { if (o[0] === 'm') cls[o[1]] = 'ok'; if (o[0] === 'x') cls[o[1]] = 'miss'; });
    var p = el('p', 'd-verse left');
    words.forEach(function (w, i) { p.appendChild(el('span', cls[i], w)); if (i < words.length - 1) p.appendChild(document.createTextNode(' ')); });
    return p;
  }
  function paintedTyped(typedWords, ops) {
    // Your words: right ones green, extra ones struck through in red, and one red "_" wherever words of the verse were left out.
    var p = el('p', 'd-verse left'), prevGap = false;
    ops.forEach(function (o) {
      if (o[0] === 'x') { if (!prevGap) { p.appendChild(el('span', 'bad', '_')); p.appendChild(document.createTextNode(' ')); } prevGap = true; return; }
      prevGap = false;
      p.appendChild(o[0] === 'm' ? el('span', 'ok', typedWords[o[2]]) : el('del', 'bad', typedWords[o[1]]));
      p.appendChild(document.createTextNode(' '));
    });
    return p;
  }
  function renderType(body, bar, status) {
    var c = FIXED[lang];
    body.appendChild(el('p', 'd-ref', c.ref));
    if (step === 'front') {
      var input = el('textarea', 'd-input'); input.setAttribute('aria-label', T.typeLabel); input.placeholder = T.typePlaceholder; input.rows = 1; input.value = typedText;
      input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.spellcheck = false;
      function fit() { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; }
      input.addEventListener('input', function () { typedText = input.value; fit(); });
      body.appendChild(input);
      bar.appendChild(button(T.show, 'button full', function () { step = 'back'; render(); }));
      setTimeout(fit, 0);
      return input;
    }
    var words = c.text.split(/\s+/), typedWords = typedText.split(/\s+/).filter(Boolean), ops = align(words, typedWords);
    var right = ops.filter(function (o) { return o[0] === 'm'; }).length;
    var results = el('div', 'd-results');
    if (typedWords.length) {
      results.appendChild(el('h3', 'd-label', T.yourAnswer)); results.appendChild(paintedTyped(typedWords, ops));
      results.appendChild(el('h3', 'd-label', T.correctVerse)); results.appendChild(paintedExpected(words, ops));
    } else {
      results.appendChild(el('h3', 'd-label', T.correctVerse)); results.appendChild(el('p', 'd-verse left', c.text)); // nothing typed: just the verse, as in the app
    }
    body.appendChild(results);
    status.textContent = T.typed(right, words.length);
    if (step === 'back') {
      var r = ratesRow(function (i) { rating = i; step = 'rated'; render(); });
      bar.appendChild(r.row);
      return r.first;
    }
    var msg = el('p', 'd-msg', T.typed(right, words.length) + ' ' + T.rated(T.rates[rating][0], T.rates[rating][1])); body.appendChild(msg);
    status.textContent = msg.textContent;
    var again = button(T.again, 'button secondary full', function () { step = 'front'; typedText = ''; rating = null; render(); });
    bar.appendChild(again);
    return again;
  }

  function renderBlanks(body, bar, status) {
    var b = BLANKS[lang], parts = b.template.split(/\{(\d)\}/);
    body.appendChild(el('p', 'd-ref', FIXED[lang].ref));
    var verse = el('p', 'd-verse blanks');
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { verse.appendChild(document.createTextNode(parts[i])); continue; }
      var n = Number(parts[i]), span;
      if (n < blankStep) {
        span = el('span', picked[n] === b.answers[n] ? '' : 'wrong', b.answers[n]);
      } else {
        span = el('span', n === blankStep ? 'blank current' : 'blank', ' '); span.style.width = Math.max(4, b.answers[n].length) + 'ch';
        if (n === blankStep) span.setAttribute('aria-current', 'step');
      }
      verse.appendChild(span);
    }
    body.appendChild(verse);
    if (blankStep >= b.answers.length) {
      body.appendChild(el('p', 'd-msg', T.done));
      status.textContent = verdict + ' ' + T.done;
      var again = button(T.again, 'button secondary full', function () { reset(); render(); });
      bar.appendChild(again);
      return again;
    }
    var bank = el('div', 'd-bank'); bank.setAttribute('role', 'group'); bank.setAttribute('aria-label', T.bank); var first = null;
    b.bank.forEach(function (w) {
      var wb = button(w, 'word', function () {
        picked[blankStep] = w;
        verdict = w === b.answers[blankStep] ? T.right : T.wrong(b.answers[blankStep]);
        blankStep++; render();
      });
      bank.appendChild(wb); if (!first) first = wb;
    });
    bar.appendChild(bank);
    if (verdict) status.textContent = verdict;
    return first;
  }

  // ---- speaking: not a demo (a web page cannot safely listen to the microphone), just what it is, in a few positive words
  function renderSpeak(body, bar) {
    var mic = el('span', 'mic on'); mic.innerHTML = MIC; body.appendChild(mic);
    T.speakText.forEach(function (t) { body.appendChild(el('p', 'd-explain', t)); });
    bar.hidden = true;
    return null;
  }

  root.hidden = false;
  render();
})();
