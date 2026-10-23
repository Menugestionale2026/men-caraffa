/* La Caraffa – menù pubblico. Legge data/menu.json e disegna la pagina nella lingua scelta. */
(() => {
  'use strict';
  const LANGS = [['it', 'IT', 'Italiano'], ['en', 'EN', 'English'], ['de', 'DE', 'Deutsch'], ['sl', 'SL', 'Slovenščina']];
  const CODES = LANGS.map(l => l[0]);
  const LOCALE = { it: 'it-IT', en: 'en-GB', de: 'de-DE', sl: 'sl-SI' };
  const state = { data: null, lang: 'it', query: '', gallery: [], photoAnchor: {}, lbIndex: 0 };
  const $ = id => document.getElementById(id);

  /* ---------- utilità ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }
  const svg = (inner, sw = 1.8) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    chev: svg('<path d="m6 9 6 6 6-6"/>', 2.2),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    prev: svg('<path d="m15 5-7 7 7 7"/>'),
    next: svg('<path d="m9 5 7 7-7 7"/>'),
    up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 2),
    phone: svg('<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 5.100 5.100l1.400-2.300L19 14.500V18a1.500 1.500 0 0 1-1.500 1.500A13.500 13.500 0 0 1 3.500 5.500 1.500 1.500 0 0 1 5 4z"/>', 1.7),
    pin: svg('<path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0 1 13 0c0 5.200-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/>', 1.7),
    camera: svg('<path d="M3.5 8.5a1 1 0 0 1 1-1H7l1.6-2.5h6.8L17 7.500h2.500a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><circle cx="12" cy="13" r="3.600"/>', 1.7),
  };
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cap = (s, lang) => s ? s.charAt(0).toLocaleUpperCase(lang) + s.slice(1) : s;
  const safeId = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* testo nella lingua scelta, con ripiego sull'italiano */
  const tr = (obj, lang = state.lang) => (obj && (obj[lang] || obj.it)) || '';
  const ui = key => tr(state.data.ui && state.data.ui[key]);

  function fmtPrice(n) {
    if (n == null || n === '' || isNaN(n)) return '';
    const v = Number(n);
    const s = state.lang === 'en' ? v.toFixed(2) : v.toFixed(2).replace('.', ',');
    return state.lang === 'it' ? `€ ${s}` : state.lang === 'en' ? `€${s}` : `${s} €`;
  }
  function fmtDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso || '';
    return new Intl.DateTimeFormat(LOCALE[state.lang], { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
  function itemDesc(it) {
    const own = it.desc && (it.desc[state.lang] || it.desc.it);
    if (own) return own;
    if (it.ingredients && it.ingredients.length) {
      const parts = it.ingredients.map(k => tr(state.data.ingredients[k])).filter(Boolean);
      return cap(parts.join(', '), state.lang);
    }
    return '';
  }
  const media = (f, small) => `media/${encodeURIComponent(f)}${small ? '-sm' : ''}.jpg`;
  const catVisible = c => c.groups.some(g => g.type === 'allergens' || g.items.some(i => !i.hidden));
  const dishId = it => 'd-' + safeId(it.id);

  function detectLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (CODES.includes(q)) return q;
    try { const s = localStorage.getItem('caraffa-lang'); if (CODES.includes(s)) return s; } catch (e) { /* ignora */ }
    const nav = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'it'])
      .map(l => String(l).slice(0, 2).toLowerCase());
    for (const l of nav) if (CODES.includes(l)) return l;
    return 'en';
  }
  function setLang(l) {
    if (!CODES.includes(l) || l === state.lang) return;
    state.lang = l;
    try { localStorage.setItem('caraffa-lang', l); } catch (e) { /* ignora */ }
    try { const u = new URL(location.href); u.searchParams.set('lang', l); history.replaceState(null, '', u); } catch (e) { /* ignora */ }
    render();
  }

  /* ---------- foto: elenco unico, in ordine di menù ---------- */
  function collectPhotos() {
    const list = [], first = {};
    state.data.categories.filter(catVisible).forEach(c => c.groups.forEach(g => g.items.forEach(it => {
      if (it.hidden) return;
      (it.photos || []).filter(p => p && p.file).forEach((p, k) => {
        const anchor = 'foto-' + safeId(it.id) + (k ? '-' + (k + 1) : '');
        list.push({ photo: p, item: it, anchor });
        if (!k) first[it.id] = anchor;
      });
    })));
    state.gallery = list; state.photoAnchor = first;
  }
  /* vai a un punto della pagina (foto o piatto), lo evidenzia e lascia la voce nella cronologia: «indietro» riporta dove eri */
  function goTo(id) {
    const el = $(id); if (!el) return;
    if (location.hash !== '#' + id) { try { history.pushState(null, '', location.pathname + location.search + '#' + id); } catch (e) { /* ignora */ } }
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl');
    setTimeout(() => el.classList.remove('hl'), 2800);
  }

  /* ---------- copertina ---------- */
  function langPills() {
    return h('ul', { class: 'langs', role: 'group', 'aria-label': ui('language') },
      LANGS.map(([c, short, name]) => h('li', null,
        h('button', { type: 'button', lang: c, 'aria-pressed': String(c === state.lang), title: name, 'aria-label': name, onclick: () => setLang(c) }, short))));
  }
  const LOGO_SRC = 'assets/img/logo.png';
  function brandLogo(decorative) {
    const name = state.data.meta.name || 'La Caraffa';
    return h('img', { src: LOGO_SRC, width: 1200, height: 336, alt: decorative ? '' : (name + (ui('subtitle') ? ' – ' + ui('subtitle') : '')), decoding: 'async' });
  }
  function renderCover() {
    const m = state.data.meta, cover = $('top');
    const cats = state.data.categories.filter(catVisible);
    const toc = cats.map(c => h('li', null, h('a', { href: '#c-' + safeId(c.id) }, tr(c.title))));
    if (state.gallery.length) toc.push(h('li', null, h('a', { href: '#foto' }, ui('photosShort') || 'Foto')));
    cover.replaceChildren(
      langPills(),
      h('h1', { class: 'brand-logo' }, brandLogo()),
      ui('heroText') && h('p', { class: 'tagline' }, ui('heroText')),
      h('ul', { class: 'toc', 'aria-label': ui('catNav') }, toc),
      state.gallery.length && ui('photoHint') && h('p', { class: 'hint' }, h('span', { html: ICON.camera }), ui('photoHint')),
      m.menuDate && h('p', { class: 'date' }, ui('menuFrom').replace('{date}', fmtDate(m.menuDate))));
  }

  /* ---------- barra delle categorie, ricerca, lingua ---------- */
  let langPopOpen = false;
  function fitBar() { document.documentElement.style.setProperty('--bar-h', $('catnav').offsetHeight + 'px'); }
  function renderNav() {
    const nav = $('catnav');
    nav.setAttribute('aria-label', ui('catNav'));
    const items = state.data.categories.filter(catVisible).map(c => ({ key: c.id, id: 'c-' + safeId(c.id), label: tr(c.short) || tr(c.title) }));
    if (state.gallery.length) items.push({ key: 'foto', id: 'foto', label: ui('photosShort') || 'Foto' });
    const ul = h('ul', null, items.map(x => h('li', null, h('a', { href: '#' + x.id, 'data-cat': x.key }, x.label))));

    const input = h('input', { type: 'search', id: 'q', placeholder: ui('searchPlaceholder'), 'aria-label': ui('searchPlaceholder'), autocomplete: 'off', enterkeyhint: 'search', value: state.query });
    const row = h('div', { class: 'searchrow', role: 'search', hidden: !state.query }, h('span', { html: ICON.search }), input);
    const sbtn = h('button', { type: 'button', class: 'search-btn', 'aria-label': ui('searchPlaceholder'), 'aria-expanded': String(!!state.query), html: ICON.search });
    const openSearch = open => {
      row.hidden = !open; sbtn.setAttribute('aria-expanded', String(open));
      if (open) input.focus(); else if (state.query) { state.query = ''; input.value = ''; applySearch(); }
      fitBar();
    };
    sbtn.addEventListener('click', () => openSearch(row.hidden));
    input.addEventListener('input', () => { state.query = input.value; applySearch(); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { openSearch(false); sbtn.focus(); } });

    const cur = LANGS.find(l => l[0] === state.lang);
    const pop = h('div', { class: 'lang-pop', role: 'group', 'aria-label': ui('language'), hidden: true },
      LANGS.map(([c, , name]) => h('button', { type: 'button', lang: c, 'aria-pressed': String(c === state.lang), onclick: () => { toggleLang(false); setLang(c); } }, name)));
    const btn = h('button', { type: 'button', class: 'lang-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': ui('language') }, cur[1], h('span', { html: ICON.chev }));
    btn.addEventListener('click', e => { e.stopPropagation(); toggleLang(); });
    const wrap = h('div', { class: 'lang-wrap' }, btn, pop);
    nav.replaceChildren(h('div', { class: 'bar' }, ul, sbtn, wrap), row);
    function toggleLang(force) {
      langPopOpen = force === undefined ? !langPopOpen : force;
      pop.hidden = !langPopOpen; btn.setAttribute('aria-expanded', String(langPopOpen));
    }
    if (!nav.dataset.bound) {
      nav.dataset.bound = '1';
      document.addEventListener('click', e => { const w = document.querySelector('.lang-wrap'); if (langPopOpen && w && !w.contains(e.target)) { langPopOpen = false; w.querySelector('.lang-pop').hidden = true; w.querySelector('.lang-btn').setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && langPopOpen) { const w = document.querySelector('.lang-wrap'); langPopOpen = false; w.querySelector('.lang-pop').hidden = true; w.querySelector('.lang-btn').setAttribute('aria-expanded', 'false'); w.querySelector('.lang-btn').focus(); } });
      addEventListener('resize', fitBar);
    }
    fitBar();
  }
  function setActive(key) {
    document.querySelectorAll('#catnav a[data-cat]').forEach(a => {
      const on = a.dataset.cat === key;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on) {
        const ul = a.closest('ul'), r = a.getBoundingClientRect(), u = ul.getBoundingClientRect();
        if (r.left < u.left + 8 || r.right > u.right - 8) ul.scrollTo({ left: ul.scrollLeft + (r.left - u.left) - (u.width - r.width) / 2, behavior: 'smooth' });
      }
    });
  }
  let spy;
  function startSpy() {
    if (spy) spy.disconnect();
    if (!('IntersectionObserver' in window)) return;
    spy = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(e.target.dataset.id); });
    }, { rootMargin: '-30% 0px -65% 0px' });
    document.querySelectorAll('.cat, #foto').forEach(c => spy.observe(c));
  }

  /* ---------- piatti ---------- */
  function allergenEl(ids) {
    const map = Object.fromEntries(state.data.allergens.map(a => [a.id, a]));
    const known = (ids || []).filter(i => map[i]);
    if (!known.length) return null;
    return h('span', { class: 'alg' },
      h('span', { 'aria-hidden': 'true', title: known.map(i => tr(map[i].name)).join(', ') }, `(${known.join(',')})`),
      h('span', { class: 'sr' }, `${ui('allergensLabel')}: ${known.map(i => tr(map[i].name)).join(', ')}`));
  }
  function tagEl(b) {
    const t = { new: 'badgeNew', spicy: 'badgeSpicy', top: 'badgeTop' }[b];
    return t ? h('span', { class: 'tag' }, ui(t)) : null;
  }
  function dishEl(it) {
    const name = tr(it.name), desc = itemDesc(it), note = tr(it.note), price = fmtPrice(it.price);
    const anchor = state.photoAnchor[it.id];
    /* il nome delle pizze con foto è un link: un tocco e si arriva all'immagine in fondo */
    const label = anchor
      ? h('a', { href: '#' + anchor, 'data-go': anchor, 'aria-label': `${ui('seePhoto') || 'Foto'}: ${name}` }, name, h('span', { html: ICON.camera }))
      : name;
    return h('li', { class: 'dish' + (it.soldOut ? ' soldout' : ''), id: dishId(it), 'data-s': norm([name, tr(it.name, 'it'), desc, note].join(' ')) },
      h('div', { class: 'dish-top' },
        h('div', { class: 'nm' }, label, allergenEl(it.allergens), it.soldOut && h('span', { class: 'tag out' }, ui('soldOut')), tagEl(it.badge)),
        price && h('span', { class: 'pr' }, price)),
      desc && h('p', { class: 'desc' }, desc),
      note && h('span', { class: 'note' }, note));
  }
  function legend() {
    const frag = document.createDocumentFragment();
    frag.append(h('p', { class: 'alg-intro' }, ui('allergensIntro')),
      h('ul', { class: 'alg-legend' }, state.data.allergens.map(a => h('li', null, h('b', null, a.id), tr(a.name)))),
      h('p', { class: 'frozen' }, ui('frozen')));
    return frag;
  }
  function renderMain() {
    const main = $('menu');
    main.replaceChildren();
    state.data.categories.filter(catVisible).forEach(c => {
      const sec = h('section', { class: 'cat', id: 'c-' + safeId(c.id), 'data-id': c.id, 'aria-labelledby': 'h-' + safeId(c.id) },
        h('h2', { class: 'cat-title', id: 'h-' + safeId(c.id) }, tr(c.title)),
        tr(c.subtitle) && h('p', { class: 'cat-sub' }, tr(c.subtitle)));
      c.groups.forEach(g => {
        const gEl = h('div', { class: 'group', 'data-type': g.type || 'items' });
        if (tr(g.title)) gEl.append(h('h3', { class: 'group-title' }, tr(g.title)));
        if (tr(g.subtitle)) gEl.append(h('p', { class: 'group-sub' }, tr(g.subtitle)));
        if (g.type === 'allergens') gEl.append(legend());
        else gEl.append(h('ul', { class: 'dishes' }, g.items.filter(i => !i.hidden).map(dishEl)));
        sec.append(gEl);
      });
      main.append(sec);
    });
    main.append(h('p', { class: 'nores', id: 'nores', hidden: true }, ui('noResults')));
  }

  /* ---------- foto in fondo ---------- */
  function renderGallery() {
    const sec = $('foto');
    sec.dataset.id = 'foto';
    if (!state.gallery.length) { sec.replaceChildren(); sec.hidden = true; return; }
    sec.hidden = false;
    sec.setAttribute('aria-labelledby', 'h-foto');
    sec.replaceChildren(h('div', { class: 'gallery-in' },
      h('h2', { id: 'h-foto' }, ui('gallery') || 'Foto'),
      h('ul', { class: 'shots' }, state.gallery.map((g, i) => {
        const name = tr(g.item.name), ph = g.photo, z = ph.zoom && ph.zoom !== 1 ? `;transform:scale(${ph.zoom});transform-origin:${ph.pos || '50% 50%'}` : '';
        const back = dishId(g.item);
        return h('li', { class: 'shot', id: g.anchor, 'data-s': norm([name, tr(g.item.name, 'it')].join(' ')) },
          h('figure', { style: 'margin:0' },
            h('button', { type: 'button', class: 'shot-img', 'data-gi': i, 'aria-label': `${ui('zoom')}: ${name}` },
              h('img', { src: media(ph.file, true), alt: name, width: 640, height: 640, loading: 'lazy', decoding: 'async', style: `object-position:${ph.pos || '50% 50%'}${z}` })),
            h('figcaption', null, h('span', { class: 'shot-name' }, name),
              h('a', { class: 'back', href: '#' + back, 'data-go': back }, '↑ ' + (ui('backToDish') || 'Torna al piatto')))));
      }))));
    sec.querySelectorAll('button.shot-img').forEach(b => b.addEventListener('click', () => openLightbox(+b.dataset.gi)));
  }

  /* ---------- ricerca ---------- */
  function applySearch() {
    const q = norm(state.query.trim());
    const main = $('menu');
    let any = false;
    main.querySelectorAll('[data-s]').forEach(c => { const ok = !q || c.dataset.s.includes(q); c.hidden = !ok; if (ok) any = true; });
    main.querySelectorAll('.group').forEach(g => {
      g.hidden = !!q && (g.dataset.type === 'allergens' || ![...g.querySelectorAll('[data-s]')].some(c => !c.hidden));
    });
    main.querySelectorAll('.cat').forEach(s => { s.hidden = !!q && ![...s.querySelectorAll('.group')].some(g => !g.hidden); });
    const gal = $('foto'), shots = [...gal.querySelectorAll('[data-s]')];
    shots.forEach(c => { c.hidden = !!q && !c.dataset.s.includes(q); });
    gal.hidden = !state.gallery.length || (!!q && shots.every(c => c.hidden));
    $('nores').hidden = !q || any;
  }

  /* ---------- piè di pagina ---------- */
  function renderFoot() {
    const m = state.data.meta, f = $('foot');
    const extra = tr(state.data.ui.footerNote);
    f.replaceChildren(h('div', { class: 'foot-in' },
      h('div', { class: 'brand-logo', 'aria-hidden': 'true' }, brandLogo(true)),
      (m.phone || m.address) && h('div', { class: 'contacts' },
        m.phone && h('a', { class: 'cbtn', href: 'tel:' + String(m.phone).replace(/[^+\d]/g, '') },
          h('span', { class: 'cbtn-i', html: ICON.phone }),
          h('span', { class: 'cbtn-t' }, h('b', null, ui('call')), h('small', null, m.phone))),
        m.address && h('a', { class: 'cbtn', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.address), target: '_blank', rel: 'noopener' },
          h('span', { class: 'cbtn-i', html: ICON.pin }),
          h('span', { class: 'cbtn-t' }, h('b', null, ui('directions')), h('small', null, m.address)))),
      extra && h('p', null, extra),
      langPills(),
      h('a', { class: 'totop', href: '#top' }, ui('top'))));
  }

  /* ---------- foto ingrandita ---------- */
  const lb = () => $('lightbox');
  function openLightbox(i) {
    const d = lb();
    if (!d.open) { buildLightbox(); d.showModal(); }
    showPhoto(i);
  }
  function buildLightbox() {
    const d = lb();
    d.replaceChildren(
      h('div', { class: 'lb-stage' },
        h('span', { class: 'lb-count', id: 'lb-count' }),
        h('button', { type: 'button', class: 'lb-btn lb-close', 'aria-label': ui('close'), html: ICON.close, onclick: () => d.close() }),
        h('button', { type: 'button', class: 'lb-btn lb-prev', 'aria-label': ui('prev'), html: ICON.prev, onclick: () => showPhoto(state.lbIndex - 1) }),
        h('button', { type: 'button', class: 'lb-btn lb-next', 'aria-label': ui('next'), html: ICON.next, onclick: () => showPhoto(state.lbIndex + 1) }),
        h('img', { id: 'lb-img', alt: '' })),
      h('div', { class: 'lb-cap', id: 'lb-cap', 'aria-live': 'polite' }));
  }
  function showPhoto(i) {
    const n = state.gallery.length; if (!n) return;
    state.lbIndex = (i + n) % n;
    const { photo, item } = state.gallery[state.lbIndex];
    const img = $('lb-img'), name = tr(item.name);
    img.src = media(photo.file); img.alt = name;
    $('lb-count').textContent = `${state.lbIndex + 1} / ${n}`;
    const price = fmtPrice(item.price), desc = itemDesc(item), back = dishId(item);
    $('lb-cap').replaceChildren(
      h('h2', null, name), price && h('span', { class: 'price' }, price), desc && h('p', null, desc),
      h('a', { href: '#' + back, 'data-go': back }, '↑ ' + (ui('backToDish') || 'Torna al piatto')));
    const nx = state.gallery[(state.lbIndex + 1) % n]; if (nx) new Image().src = media(nx.photo.file);
  }
  function lightboxEvents() {
    const d = lb();
    d.addEventListener('click', e => { if (e.target === d || e.target.classList.contains('lb-stage')) d.close(); });
    d.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') showPhoto(state.lbIndex - 1);
      if (e.key === 'ArrowRight') showPhoto(state.lbIndex + 1);
    });
    let x0 = null;
    d.addEventListener('pointerdown', e => { x0 = e.clientX; });
    d.addEventListener('pointerup', e => {
      if (x0 == null) return; const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 60 && e.target.closest('.lb-stage')) showPhoto(state.lbIndex + (dx < 0 ? 1 : -1));
    });
    /* link «torna al piatto» e «vedi foto»: scorrimento morbido con evidenziazione */
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[data-go]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      if (d.open) d.close();
      goTo(a.dataset.go);
    });
  }

  /* ---------- avvio ---------- */
  function render() {
    document.documentElement.lang = state.lang;
    const name = (state.data.meta.name || 'La Caraffa');
    document.title = `${name} – ${ui('subtitle')}`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = `${name}: ${ui('heroText')}`;
    const skip = document.querySelector('.skip'); if (skip) skip.textContent = ({ it: 'Vai al menù', en: 'Skip to menu', de: 'Zum Menü', sl: 'Na meni' })[state.lang];
    collectPhotos();
    renderCover(); renderNav(); renderMain(); renderGallery(); renderFoot();
    applySearch(); startSpy();
    const first = state.data.categories.find(catVisible); if (first) setActive(first.id);
  }
  function fab() {
    const b = h('button', { type: 'button', class: 'totop-fab', html: ICON.up, 'aria-label': 'Top', onclick: () => scrollTo({ top: 0 }) });
    document.body.append(b);
    addEventListener('scroll', () => b.classList.toggle('on', scrollY > 900), { passive: true });
  }
  /* Il menù sta in data/menu.json. Se non è leggibile (es. pagina aperta da file locale)
     si usa data/menu.js, una copia identica che il pannello aggiorna a ogni salvataggio. */
  function loadScriptData() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'data/menu.js?v=' + Date.now();
      s.onload = () => (window.CARAFFA_MENU ? resolve(window.CARAFFA_MENU) : reject(new Error('menu.js vuoto')));
      s.onerror = () => reject(new Error('menu.js non trovato'));
      document.head.append(s);
    });
  }
  async function loadData() {
    if (location.protocol === 'file:') return loadScriptData();
    try {
      const r = await fetch('data/menu.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) {
      return loadScriptData();
    }
  }
  async function init() {
    state.lang = detectLang();
    if (location.protocol === 'file:') {
      /* pagina aperta con doppio clic: i browser vietano fetch() e i font su file locali */
      document.head.append(h('link', { rel: 'stylesheet', href: 'assets/fonts-local.css' }));
    }
    try {
      state.data = await loadData();
    } catch (e) {
      $('menu').replaceChildren(
        h('p', { class: 'nores' }, 'Menù non disponibile / Menu unavailable'),
        h('p', { class: 'nores', style: 'padding-top:0;font-size:.85em' }, 'Non riesco a leggere data/menu.json. / Cannot read data/menu.json.'));
      return;
    }
    render(); lightboxEvents(); fab();
    if (location.hash.length > 1) {
      let t = null; try { t = $(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* hash non valido */ }
      if (t) requestAnimationFrame(() => t.scrollIntoView({ behavior: 'instant', block: /^(c-|foto$)/.test(t.id) ? 'start' : 'center' }));
    }
  }
  init();
})();
