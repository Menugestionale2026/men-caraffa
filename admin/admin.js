/* Pannello del menù – La Caraffa. Modifica data/menu.json tramite api/ (Node, PHP, Cloudflare o GitHub Pages). */
(() => {
  'use strict';
  const LANGS = [['it', 'IT', 'Italiano'], ['en', 'EN', 'English'], ['de', 'DE', 'Deutsch'], ['sl', 'SL', 'Slovenščina']];
  const UI_LABELS = {
    subtitle: ['Sottotitolo del locale', 'Compare nel titolo della scheda del browser e per i lettori di schermo. Il logo in cima alla pagina ha già «Pizzeria & Paninoteca» scritto dentro.'],
    heroText: ['Frase sotto il sottotitolo', 'In cima alla pagina, in piccolo'],
    gallery: ['Titolo della sezione con le foto', 'In fondo al menù'],
    photoHint: ['Spiegazione del simbolo fotocamera', 'Compare sotto l’indice, in cima alla pagina'],
    photosShort: ['Voce «Foto» nell’indice e nella barra', ''], seePhoto: ['Link accanto al nome: «Vedi la foto»', 'Usato dai lettori di schermo'], backToDish: ['Link sotto ogni foto: «Torna al piatto»', ''],
    footerNote: ['Testo extra in fondo (facoltativo)', 'Es. orari o avvisi'],
    searchPlaceholder: ['Testo nella casella di ricerca', ''],
    noResults: ['Messaggio quando la ricerca non trova nulla', ''],
    soldOut: ['Etichetta «Esaurito»', ''], badgeNew: ['Etichetta «Novità»', ''], badgeSpicy: ['Etichetta «Piccante»', ''], badgeTop: ['Etichetta «Consigliata»', ''],
    menuFrom: ['Frase con la data del menù', 'Scrivi {date} dove deve comparire la data'],
    allergensIntro: ['Frase sopra l’elenco degli allergeni', ''], frozen: ['Nota sui prodotti congelati', ''], allergensLabel: ['La parola «Allergeni»', 'Usata dai lettori di schermo'],
    close: ['Pulsante «Chiudi»', ''], prev: ['Pulsante foto precedente', ''], next: ['Pulsante foto successiva', ''], zoom: ['Testo «Ingrandisci la foto»', ''],
    call: ['Tasto «Chiama» (telefono)', 'In fondo alla pagina, se hai scritto il numero di telefono'], directions: ['Tasto «Come arrivare» (mappa)', 'In fondo alla pagina, se hai scritto l’indirizzo'],
    language: ['La parola «Lingua»', ''], top: ['Pulsante «Torna su»', ''], catNav: ['Nome della barra delle categorie', 'Usato dai lettori di schermo'],
  };
  const MAIN_UI = ['subtitle', 'heroText', 'photoHint', 'gallery', 'footerNote', 'menuFrom', 'searchPlaceholder', 'noResults'];

  const S = { menu: null, saved: '', tab: 'menu', catId: null, media: [], backups: null, mustChange: false, binary: false, thumbs: {}, lastSaved: null, query: '', newCat: null };
  const $app = document.getElementById('app');
  const logoImg = cls => h('img', { class: cls, src: '../assets/img/logo.png', alt: 'La Caraffa – Pizzeria & Paninoteca', width: 1200, height: 336 });

  /* ---------- utilità ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled' || k === 'selected' || k === 'open' || k === 'multiple') el[k] = !!v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(2)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
    return el;
  }
  /* miniatura di una foto: quella appena caricata si vede subito, anche se il sito non l'ha ancora pubblicata */
  const thumbSrc = f => S.thumbs[f] || '../media/' + f + '-sm.jpg';
  const L0 = () => ({ it: '', en: '', de: '', sl: '' });
  const ensureL = (o, k) => { if (!o[k] || typeof o[k] !== 'object') o[k] = L0(); LANGS.forEach(([c]) => { if (typeof o[k][c] !== 'string') o[k][c] = ''; }); return o[k]; };
  const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const rid = () => Math.random().toString(36).slice(2, 6);
  const cap = s => s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
  const lt = o => (o && (o.it || o.en || o.de || o.sl)) || '';
  const money = v => v == null ? '–' : '€ ' + Number(v).toFixed(2).replace('.', ',');
  let toastT;
  function toast(msg, isErr) {
    const t = document.getElementById('toast'); t.textContent = msg; t.className = 'on' + (isErr ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, isErr ? 6000 : 3200);
  }
  /* ---------- modalità «doppio clic» ----------
     Se admin/index.html è aperto direttamente dal computer (file://), non c'è un server: il pannello
     chiede di scegliere la cartella del menù e legge/scrive i file lì (serve Chrome o Edge).
     Sul sito online (Node o PHP) si usa invece api/ con la password, come sempre. */
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function validateMenu(m) {
    if (!isObj(m)) return 'Il file non è un menù valido.';
    if (!isObj(m.meta) || !isObj(m.ui) || !isObj(m.ingredients)) return 'Mancano meta, ui o ingredients.';
    if (!Array.isArray(m.allergens) || !Array.isArray(m.categories)) return 'Mancano allergeni o categorie.';
    for (const c of m.categories) {
      if (!isObj(c) || typeof c.id !== 'string' || !isObj(c.title) || !Array.isArray(c.groups)) return 'Una categoria non è valida.';
      for (const g of c.groups) {
        if (!isObj(g) || !Array.isArray(g.items)) return 'Un gruppo non è valido.';
        for (const i of g.items) if (!isObj(i) || typeof i.id !== 'string' || !isObj(i.name)) return 'Un piatto non è valido.';
      }
    }
    return null;
  }
  const LOCAL = {
    on: location.protocol === 'file:' || window.CARAFFA_LOCAL === true,
    dir: null,
    KEEP: 40,
    async sub(path, create) { let d = this.dir; for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create: !!create }); return d; },
    async file(path, name) { const d = path ? await this.sub(path) : this.dir; return (await d.getFileHandle(name)).getFile(); },
    async exists(path, name) { try { await this.file(path, name); return true; } catch (e) { if (e && e.name === 'NotFoundError') return false; throw e; } },
    async put(path, name, data) {
      const d = path ? await this.sub(path, true) : this.dir;
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      try { await w.write(data); await w.close(); } catch (e) { try { await w.abort(); } catch (x) { /* ignora */ } throw e; }
    },
    async names(path) { const d = await this.sub(path); const out = []; for await (const [name, handle] of d.entries()) if (handle.kind === 'file') out.push(name); return out; },
    stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; },
    async backup() {
      if (!(await this.exists('data', 'menu.json'))) return;
      const text = await (await this.file('data', 'menu.json')).text();
      let name = `menu-${this.stamp()}.json`, i = 1;
      while (await this.exists('private/backups', name).catch(() => false)) name = `menu-${this.stamp()}-${++i}.json`;
      await this.put('private/backups', name, text);
      const all = (await this.names('private/backups')).filter(f => /^menu-[\d-]+\.json$/.test(f)).sort();
      for (const f of all.slice(0, Math.max(0, all.length - this.KEEP))) await (await this.sub('private/backups')).removeEntry(f);
    },
    async writeMenu(obj) {
      obj.updatedAt = new Date().toISOString();
      const json = JSON.stringify(obj, null, 1);
      await this.put('data', 'menu.json', json);
      /* data/menu.js = copia di menu.json, serve a index.html aperto con doppio clic */
      const safe = json.split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
      await this.put('data', 'menu.js', 'window.CARAFFA_MENU = ' + safe + ';\n');
    },
    async usedPhotos() {
      const used = new Set();
      try {
        const m = JSON.parse(await (await this.file('data', 'menu.json')).text());
        (m.categories || []).forEach(c => (c.groups || []).forEach(g => (g.items || []).forEach(i => (i.photos || []).forEach(p => p && p.file && used.add(p.file)))));
      } catch (e) { /* ignora */ }
      return used;
    },
    async run(action, opts) {
      const body = opts.body || {};
      if (action === 'me') return { authenticated: true, mustChange: false };
      if (action === 'logout') return { ok: true };
      if (action === 'menu') return JSON.parse(await (await this.file('data', 'menu.json')).text());
      if (action === 'save') {
        const err = validateMenu(body); if (err) throw new Error(err);
        await this.backup(); await this.writeMenu(body);
        return { ok: true, updatedAt: body.updatedAt };
      }
      if (action === 'backups') {
        let names = []; try { names = (await this.names('private/backups')).filter(f => /^menu-[\d-]+\.json$/.test(f)); } catch (e) { if (!e || e.name !== 'NotFoundError') throw e; }
        const list = [];
        for (const name of names.sort().reverse()) { const f = await this.file('private/backups', name); list.push({ name, size: f.size, time: new Date(f.lastModified).toISOString() }); }
        return { backups: list };
      }
      if (action === 'restore') {
        if (!/^menu-[\d-]+\.json$/.test(body.name || '')) throw new Error('Versione non valida.');
        const menu = JSON.parse(await (await this.file('private/backups', body.name)).text());
        const err = validateMenu(menu); if (err) throw new Error(err);
        await this.backup(); await this.writeMenu(menu);
        return { ok: true };
      }
      if (action === 'media') {
        let names = []; try { names = await this.names('media'); } catch (e) { if (!e || e.name !== 'NotFoundError') throw e; }
        const set = new Set(names), used = await this.usedPhotos();
        const files = names.filter(f => /^[a-z0-9][a-z0-9-]*\.jpg$/.test(f) && !f.endsWith('-sm.jpg')).map(f => f.slice(0, -4)).sort();
        return { media: files.map(f => ({ file: f, used: used.has(f), small: set.has(f + '-sm.jpg') })) };
      }
      if (action === 'upload') {
        const bytes = s => { const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(s || '')); if (!m) return null; const bin = atob(m[1]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
        const full = bytes(body.full), small = bytes(body.small);
        if (!full || !small) throw new Error('Servono due immagini JPEG valide.');
        const base = slug(body.name) || 'foto'; let name = base, n = 1;
        while (await this.exists('media', name + '.jpg').catch(() => false)) name = `${base}-${++n}`;
        await this.put('media', name + '.jpg', full); await this.put('media', name + '-sm.jpg', small);
        return { ok: true, file: name };
      }
      if (action === 'deleteMedia') {
        const f = String(body.file || '');
        if (!/^[a-z0-9][a-z0-9-]*$/.test(f)) throw new Error('Nome non valido.');
        if ((await this.usedPhotos()).has(f)) throw new Error('La foto è usata nel menù salvato. Toglila dal piatto e salva, poi eliminala.');
        const d = await this.sub('media');
        for (const x of [f + '.jpg', f + '-sm.jpg']) { try { await d.removeEntry(x); } catch (e) { if (!e || e.name !== 'NotFoundError') throw e; } }
        return { ok: true };
      }
      throw new Error('Operazione non disponibile.');
    },
    async call(action, opts) {
      try { return await this.run(action, opts); }
      catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('Il browser non permette più di scrivere nella cartella. Ricarica la pagina e scegli di nuovo la cartella.');
        if (e && e.name === 'NotFoundError') throw new Error('Non trovo un file nella cartella del menù. Controlla di aver scelto la cartella giusta.');
        throw e;
      }
    },
    async pick() {
      let d;
      try { d = await window.showDirectoryPicker({ id: 'caraffa-menu', mode: 'readwrite' }); }
      catch (e) { if (e && e.name === 'AbortError') return false; throw e; }
      for (const get of [async () => d, async () => d.getDirectoryHandle('la-caraffa-menu')]) {
        try {
          const root = await get();
          await (await root.getDirectoryHandle('data')).getFileHandle('menu.json');
          this.dir = root; return true;
        } catch (e) { /* prova la prossima */ }
      }
      throw new Error('Questa cartella non contiene il menù. Scegli la cartella «la-caraffa-menu», quella che ha dentro index.html e la cartella data.');
    },
  };

  /* ---------- modalità «GitHub Pages» ----------
     Se accanto a questa pagina c'è admin/config.json con {"mode":"github","owner":…,"repo":…,"branch":…}, il sito sta su GitHub Pages:
     non c'è un server, quindi il pannello scrive direttamente nel repository (un «commit» a ogni salvataggio) usando una chiave
     cifrata con la password (admin/vault.json). GitHub Pages ripubblica il sito da solo in 1–2 minuti. */
  const GH = {
    on: false, cfg: null, token: null,
    async init() {
      if (LOCAL.on || !window.CaraffaGH) return;
      try {
        const r = await fetch('config.json', { cache: 'no-store' }); if (!r.ok) return;
        const c = await r.json();
        if (c && c.mode === 'github' && c.owner && c.repo) { this.cfg = c; this.on = true; }
      } catch (e) { /* nessun config.json: non è un sito su GitHub */ }
    },
    get branch() { return (this.cfg && this.cfg.branch) || 'main'; },
    cl() { return window.CaraffaGH.client(this.cfg, this.token); },
    loadToken() {
      if (this.token) return;
      try { const s = JSON.parse(localStorage.getItem('caraffa_gh') || 'null'); if (s && s.token && s.exp > Date.now()) this.token = s.token; } catch (e) { /* storage non disponibile */ }
    },
    persist() { try { localStorage.setItem('caraffa_gh', JSON.stringify({ token: this.token, exp: Date.now() + 12 * 3600 * 1000 })); } catch (e) { /* resta in memoria */ } },
    forget() { this.token = null; try { localStorage.removeItem('caraffa_gh'); } catch (e) { /* ignora */ } },
    async vault() {
      try { return JSON.parse(await window.CaraffaGH.client(this.cfg, null).text('admin/vault.json', this.branch, true)); }
      catch (e) {
        if (e && e.code === 'notfound') throw new Error('Il pannello non è ancora configurato: apri il file INSTALLA.html (nella cartella dello zip) e segui le istruzioni.');
        if (e instanceof SyntaxError) throw new Error('Il file admin/vault.json non è leggibile.');
        throw e;
      }
    },
    usedIn(m) {
      const used = new Set();
      ((m.meta && m.meta.heroPhotos) || []).forEach(p => p && p.file && used.add(p.file));
      (m.categories || []).forEach(c => (c.groups || []).forEach(g => (g.items || []).forEach(i => (i.photos || []).forEach(p => p && p.file && used.add(p.file)))));
      return used;
    },
    jpeg(dataUrl, max) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '')); if (!m) return null;
      const b = m[1], n = Math.floor(b.length * 3 / 4); if (n < 500 || n > max) return null;
      const head = atob(b.slice(0, 8)); if (head.charCodeAt(0) !== 0xFF || head.charCodeAt(1) !== 0xD8 || head.charCodeAt(2) !== 0xFF) return null;
      return b;
    },
    async writeMenu(c, obj, message) {
      obj.updatedAt = new Date().toISOString();
      const json = JSON.stringify(obj, null, 1);
      const safe = json.split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
      await c.commit(this.branch, [{ path: 'data/menu.json', text: json }, { path: 'data/menu.js', text: 'window.CARAFFA_MENU = ' + safe + ';\n' }], message);
      return obj.updatedAt;
    },
    async call(action, opts) {
      const G = window.CaraffaGH, body = opts.body || {};
      if (action === 'me') { this.loadToken(); return { authenticated: !!this.token, mustChange: false }; }
      if (action === 'logout') { this.forget(); return { ok: true }; }
      if (action === 'login') {
        const token = await G.openVault(await this.vault(), String(body.password || ''));
        const info = await G.client(this.cfg, token).repoInfo();
        if (info && info.permissions && info.permissions.push === false) throw new G.GhError('Il token può solo leggere il sito, non modificarlo: deve avere «Contents: Read and write». Vedi la guida, «Rinnovare il token».', 'perm');
        this.token = token; this.persist();
        return { ok: true, mustChange: false };
      }
      this.loadToken();
      if (!this.token) throw new G.GhError('Accedi per continuare.', 'token');
      const c = this.cl(), br = this.branch;
      const currentMenu = async () => JSON.parse(await c.text('data/menu.json', br));
      if (action === 'password') {
        const next = String(body.next || '');
        if (next.length < G.MIN_PASSWORD) throw new Error('La nuova password deve avere almeno ' + G.MIN_PASSWORD + ' caratteri.');
        await G.openVault(await this.vault(), String(body.current || ''));
        const nv = await G.makeVault(this.token, next);
        await c.commit(br, [{ path: 'admin/vault.json', text: JSON.stringify(nv, null, 1) + '\n' }], 'Password del pannello cambiata');
        return { ok: true };
      }
      if (action === 'menu') return currentMenu();
      if (action === 'save') {
        const err = validateMenu(body); if (err) throw new Error(err);
        return { ok: true, updatedAt: await this.writeMenu(c, body, 'Menù aggiornato dal pannello') };
      }
      if (action === 'backups') {
        const list = await c.history('data/menu.json', br, 41);
        return { backups: list.slice(1).map(x => ({ name: 'menu-' + x.sha, size: 0, time: x.commit.author.date })) };
      }
      if (action === 'restore') {
        const m = /^menu-([0-9a-f]{40})$/.exec(String(body.name || '')); if (!m) throw new Error('Versione non valida.');
        let menu;
        try { menu = JSON.parse(await c.text('data/menu.json', m[1])); } catch (e) { if (e && e.code === 'notfound') throw new Error('Non trovo quella versione.'); throw e; }
        const err = validateMenu(menu); if (err) throw new Error(err);
        await this.writeMenu(c, menu, 'Menù ripristinato a una versione precedente');
        return { ok: true };
      }
      if (action === 'media') {
        const files = await c.files(br), names = new Set(files.map(f => f.path).filter(x => /^media\/[a-z0-9][a-z0-9-]*\.jpg$/.test(x)).map(x => x.slice(6)));
        let used = new Set(); try { used = this.usedIn(await currentMenu()); } catch (e) { /* ignora */ }
        const list = [...names].filter(f => !f.endsWith('-sm.jpg')).map(f => f.slice(0, -4)).sort();
        return { media: list.map(f => ({ file: f, used: used.has(f), small: names.has(f + '-sm.jpg') })) };
      }
      if (action === 'upload') {
        const full = this.jpeg(body.full, 3 * 1024 * 1024), small = this.jpeg(body.small, 1024 * 1024);
        if (!full || !small) throw new Error('Servono due immagini JPEG valide.');
        const have = new Set((await c.files(br)).map(f => f.path));
        const base = slug(body.name) || 'foto'; let name = base, n = 1;
        while (have.has('media/' + name + '.jpg') || have.has('media/' + name + '-sm.jpg')) name = `${base}-${++n}`;
        await c.commit(br, [{ path: 'media/' + name + '.jpg', base64: full }, { path: 'media/' + name + '-sm.jpg', base64: small }], 'Foto aggiunta: ' + name);
        return { ok: true, file: name };
      }
      if (action === 'deleteMedia') {
        const f = String(body.file || '');
        if (!/^[a-z0-9][a-z0-9-]*$/.test(f)) throw new Error('Nome non valido.');
        let used = new Set(); try { used = this.usedIn(await currentMenu()); } catch (e) { /* ignora */ }
        if (used.has(f)) throw new Error('La foto è usata nel menù salvato. Toglila dal piatto e salva, poi eliminala.');
        const have = new Set((await c.files(br)).map(x => x.path));
        const gone = ['media/' + f + '.jpg', 'media/' + f + '-sm.jpg'].filter(x => have.has(x));
        if (gone.length) await c.commit(br, gone.map(path => ({ path, remove: true })), 'Foto eliminata: ' + f);
        return { ok: true };
      }
      throw new Error('Operazione non disponibile.');
    },
  };
  function renderLocalPicker(message) {
    S.menu = null; document.title = 'Pannello del menù – La Caraffa';
    const supported = typeof window.showDirectoryPicker === 'function';
    const err = h('p', { class: 'err', role: 'alert' }, message || '');
    const go = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      err.textContent = '';
      try { if (await LOCAL.pick()) { await loadMenu(); renderApp(); } }
      catch (e) { err.textContent = e.message; }
    } }, 'Scegli la cartella del menù');
    $app.replaceChildren(h('div', { class: 'login' }, logoImg('logo-login'),
      supported
        ? [h('p', { style: 'margin:0' }, 'Scegli la cartella «la-caraffa-menu», quella che hai estratto dallo zip. Le modifiche si salvano direttamente lì dentro.'),
          h('p', { class: 'hint' }, 'Il browser ti chiederà il permesso di modificare i file di quella cartella: rispondi «Modifica file». Non scegliere Download o Desktop, ma la cartella del menù.'),
          err, go]
        : [h('p', { class: 'err' }, 'Per modificare il menù con il doppio clic serve Google Chrome o Microsoft Edge, su computer.'),
          h('p', null, 'Clic destro su questo file → «Apri con» → Google Chrome (o Microsoft Edge). Con Safari, Firefox o dal telefono non funziona: in quel caso il pannello va usato dal sito online (istruzioni in LEGGIMI.md).')]));
  }
  async function api(action, opts = {}) {
    if (LOCAL.on) return LOCAL.call(action, opts);
    if (GH.on) {
      try { return await GH.call(action, opts); }
      catch (e) {
        if (e && e.code === 'token' && action !== 'login') { GH.forget(); renderLogin(e.message); throw Object.assign(new Error('unauthorized'), { silent: true }); }
        throw e;
      }
    }
    const post = opts.body !== undefined || opts.form !== undefined || opts.method === 'POST';
    let res;
    try {
      res = await fetch('../api/?action=' + encodeURIComponent(action), {
        method: post ? 'POST' : 'GET', credentials: 'same-origin',
        headers: post ? (opts.form ? { 'X-Requested-With': 'caraffa-admin' } : { 'Content-Type': 'application/json', 'X-Requested-With': 'caraffa-admin' }) : {},
        body: post ? (opts.form || JSON.stringify(opts.body || {})) : undefined,
      });
    } catch (e) { throw Object.assign(new Error('Non riesco a collegarmi al server. Controlla la connessione.'), { network: true }); }
    let data = null; try { data = await res.json(); } catch (e) { /* risposta non JSON */ }
    if (res.status === 401 && action !== 'login' && action !== 'password') { renderLogin('La sessione è scaduta. Accedi di nuovo.'); throw Object.assign(new Error('unauthorized'), { silent: true }); }
    if (!res.ok) throw Object.assign(new Error((data && data.message) || 'Errore del server (' + res.status + ').'), { status: res.status, data });
    return data;
  }
  function confirmBox(msg, okLabel = 'Conferma', danger = false) {
    return new Promise(resolve => {
      const d = h('dialog', { class: 'dlg-sm' },
        h('div', { class: 'dlg-b' }, h('p', { style: 'margin:0;font-weight:700' }, msg)),
        h('div', { class: 'dlg-f' },
          h('button', { class: 'btn', type: 'button', onclick: () => { resolve(false); d.close(); } }, 'Annulla'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => { resolve(true); d.close(); } }, okLabel)));
      d.addEventListener('close', () => { resolve(false); d.remove(); });
      document.body.append(d); d.showModal();
    });
  }
  const isDirty = () => !!S.menu && JSON.stringify(S.menu) !== S.saved;

  /* ---------- accesso ---------- */
  function renderLogin(message) {
    S.menu = null;
    document.title = 'Accesso – La Caraffa';
    const err = h('p', { class: 'err', role: 'alert' }, message || '');
    const pw = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true, id: 'pw' });
    const form = h('form', { onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Controllo…';
      try { const r = await api('login', { body: { password: pw.value } }); S.mustChange = !!r.mustChange; await start(); }
      catch (x) { if (!x.silent) err.textContent = x.message; btn.disabled = false; btn.textContent = 'Entra'; pw.select(); }
    } }, h('label', { class: 'f', for: 'pw' }, h('span', { class: 'l' }, 'Password'), pw), err, h('button', { class: 'btn primary', type: 'submit' }, 'Entra'));
    $app.replaceChildren(h('div', { class: 'login' }, logoImg('logo-login'), h('p', { style: 'margin:0' }, 'Pannello per modificare il menù.'), form));
    pw.focus();
  }
  function renderForcedPassword() {
    const err = h('p', { class: 'err', role: 'alert' });
    const f = passwordForm(err, async () => { S.mustChange = false; await start(); }, true);
    $app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'brand' }, 'Scegli la tua password'),
      h('p', { style: 'margin:0' }, 'Prima di iniziare sostituisci la password che hai ricevuto con una tua (almeno 8 caratteri).'), f, err));
  }
  function passwordForm(err, done, forced) {
    const cur = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true });
    const nw = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', required: true, minlength: GH.on ? 10 : 8 });
    const rp = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', required: true, minlength: GH.on ? 10 : 8 });
    return h('form', { style: 'display:grid;gap:14px;margin-top:14px', onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      if (nw.value !== rp.value) { err.textContent = 'Le due password nuove non coincidono.'; return; }
      try { await api('password', { body: { current: cur.value, next: nw.value } }); toast('Password cambiata.'); await done(); }
      catch (x) { if (!x.silent) err.textContent = x.message; }
    } },
      h('label', { class: 'f' }, h('span', { class: 'l' }, forced ? 'Password ricevuta' : 'Password attuale'), cur),
      h('label', { class: 'f' }, h('span', { class: 'l' }, 'Nuova password'), nw),
      h('label', { class: 'f' }, h('span', { class: 'l' }, 'Ripeti la nuova password'), rp),
      h('button', { class: 'btn primary', type: 'submit' }, 'Salva la nuova password'));
  }

  /* ---------- struttura principale ---------- */
  const ALL_TABS = [['menu', 'Piatti'], ['ingredients', 'Ingredienti'], ['media', 'Foto'], ['texts', 'Testi del sito'], ['versions', 'Versioni salvate'], ['account', 'Account']];
  const TABS = LOCAL.on ? ALL_TABS.filter(t => t[0] !== 'account') : ALL_TABS;
  let saveBtn, statusEl, panelEl, tabsEl;
  function renderApp() {
    document.title = 'Pannello del menù – La Caraffa';
    saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Salva modifiche');
    statusEl = h('span', { class: 'status', 'aria-live': 'polite' });
    tabsEl = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(S.tab === id), 'data-tab': id, onclick: () => { S.tab = id; renderApp(); } }, label)));
    panelEl = h('div', { class: 'panel', role: 'tabpanel' });
    $app.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('span', { class: 'logo-chip' }, logoImg('')), h('small', null, 'Pannello del menù')),
        statusEl,
        h('a', { class: 'btn small', href: LOCAL.on ? '../index.html' : '../', target: '_blank', rel: 'noopener' }, 'Vedi il menù ↗'),
        saveBtn,
        h('button', { class: 'btn small', type: 'button', onclick: logout }, LOCAL.on ? 'Cambia cartella' : 'Esci')),
      tabsEl, h('main', null,
        LOCAL.on && h('div', { class: 'help', style: 'margin-bottom:14px' }, 'Stai modificando la cartella «' + (LOCAL.dir ? LOCAL.dir.name : '') + '» sul tuo computer. Per aggiornare il menù online, dopo aver salvato ricarica sul sito le cartelle «data» e «media».'),
        panelEl));
    updateStatus(); renderTab();
  }
  function updateStatus() {
    if (!saveBtn) return;
    const d = isDirty();
    saveBtn.disabled = !d;
    statusEl.className = 'status' + (d ? ' dirty' : '');
    statusEl.textContent = d ? 'Modifiche non salvate' : (S.lastSaved ? 'Salvato alle ' + S.lastSaved : '');
  }
  const touch = () => updateStatus();
  function renderTab() {
    panelEl.replaceChildren();
    ({ menu: tabMenu, ingredients: tabIngredients, media: tabMedia, texts: tabTexts, versions: tabVersions, account: tabAccount })[S.tab](panelEl);
  }
  async function logout() {
    if (isDirty() && !(await confirmBox('Ci sono modifiche non salvate. Uscire lo stesso?', 'Esci senza salvare', true))) return;
    if (LOCAL.on) { LOCAL.dir = null; return renderLocalPicker(); }
    try { await api('logout', { method: 'POST' }); } catch (e) { /* ignora */ }
    renderLogin();
  }

  /* ---------- salvataggio ---------- */
  function cleaned(menu) {
    const m = JSON.parse(JSON.stringify(menu));
    const allEmpty = o => !o || LANGS.every(([c]) => !String(o[c] || '').trim());
    const trimL = o => { if (o) LANGS.forEach(([c]) => { if (typeof o[c] === 'string') o[c] = o[c].trim(); }); return o; };
    m.categories.forEach(c => {
      trimL(c.title); trimL(c.short); if (allEmpty(c.subtitle)) c.subtitle = null; else trimL(c.subtitle);
      c.groups.forEach(g => {
        if (allEmpty(g.title)) g.title = null; else trimL(g.title);
        if (allEmpty(g.subtitle)) g.subtitle = null; else trimL(g.subtitle);
        g.items.forEach(i => {
          trimL(i.name);
          i.desc = allEmpty(i.desc) ? null : trimL(i.desc);
          i.note = allEmpty(i.note) ? null : trimL(i.note);
          i.price = (i.price === '' || i.price == null || isNaN(i.price)) ? null : Math.round(Number(i.price) * 100) / 100;
          i.ingredients = (i.ingredients || []).filter(k => m.ingredients[k]);
          i.photos = (i.photos || []).filter(p => p && p.file);
          i.allergens = m.allergens.map(a => a.id).filter(id => (i.allergens || []).includes(id));
          i.badge = i.badge || null;
        });
      });
    });
    Object.values(m.ingredients).forEach(trimL);
    Object.values(m.ui).forEach(trimL);
    return m;
  }
  async function save() {
    const m = cleaned(S.menu);
    for (const c of m.categories) {
      if (!lt(c.title)) return toast('Una categoria non ha il titolo.', true);
      for (const g of c.groups) for (const i of g.items) if (!(i.name.it || '').trim()) return toast('Un piatto in «' + lt(c.title) + '» non ha il nome in italiano.', true);
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Salvo…';
    try {
      const r = await api('save', { body: m });
      m.updatedAt = r.updatedAt; S.menu = m; S.saved = JSON.stringify(S.menu);
      const now = new Date(); S.lastSaved = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      S.backups = null; toast(LOCAL.on ? 'Salvato nella cartella del menù.' : GH.on ? 'Salvato. Il sito online si aggiorna entro 1–2 minuti.' : 'Salvato. Il menù online è aggiornato.');
    } catch (e) {
      if (e.silent) return;   /* sessione scaduta: è già comparsa la pagina di accesso */
      toast(e.message, true);
    }
    saveBtn.textContent = 'Salva modifiche'; updateStatus();
    if (S.tab === 'menu' || S.tab === 'ingredients') renderTab();
  }
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.menu) { e.preventDefault(); if (isDirty()) save(); } });
  addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- campi riutilizzabili ---------- */
  function mlField(obj, key, label, { area = false, rows, ph, cols = false, hint } = {}) {
    const o = ensureL(obj, key);
    return h('div', null, label && h('div', { style: 'font-weight:700;font-size:14px;margin-bottom:4px' }, label),
      h('div', { class: 'ml' + (cols ? ' cols' : '') }, LANGS.map(([c, short, name]) =>
        h('label', { class: 'lng', title: name }, h('b', null, short),
          h(area ? 'textarea' : 'input', { class: 'in', value: o[c], rows: rows || 3, placeholder: ph || (c === 'it' ? '' : 'Vuoto = come l’italiano'), lang: c, oninput: e => { o[c] = e.target.value; touch(); } })))),
      hint && h('p', { class: 'hint' }, hint));
  }
  const textField = (obj, key, label, opts = {}) =>
    h('label', { class: 'f' }, h('span', { class: 'l' }, label), h('input', Object.assign({ class: 'in', value: obj[key] || '', oninput: e => { obj[key] = e.target.value; touch(); } }, opts)));
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
  const cats = () => S.menu.categories;
  const allItems = function* () { for (const c of cats()) for (const g of c.groups) for (const i of g.items) yield { c, g, i }; };
  const uniqueId = base => { const ids = new Set([...allItems()].map(x => x.i.id)); let id = base || 'piatto'; while (ids.has(id)) id = (base || 'piatto') + '-' + rid(); return id; };
  const genDesc = (item, lang) => cap((item.ingredients || []).map(k => { const d = S.menu.ingredients[k]; return d && (d[lang] || d.it); }).filter(Boolean).join(', '));
  const thumbOf = (item) => { const p = (item.photos || [])[0]; return h('div', { class: 'thumb' }, p ? h('img', { src: thumbSrc(p.file), alt: '', loading: 'lazy' }) : '–'); };

  /* ---------- scheda "Piatti" ---------- */
  function tabMenu(p) {
    const m = S.menu;
    if (!m.categories.some(c => c.id === S.catId)) S.catId = m.categories[0] && m.categories[0].id;
    const cat = m.categories.find(c => c.id === S.catId);
    const left = h('div', { class: 'cats' },
      cats().map(c => h('button', { class: 'catbtn', type: 'button', 'aria-current': String(c.id === S.catId), onclick: () => { S.catId = c.id; S.query = ''; renderTab(); } },
        lt(c.title) || '(senza titolo)',
        h('small', null, String(c.groups.reduce((n, g) => n + g.items.length, 0))))),
      h('button', { class: 'btn small', type: 'button', onclick: () => {
        const c = { id: 'cat-' + rid(), title: { it: 'Nuova categoria', en: 'New category', de: 'Neue Kategorie', sl: 'Nova kategorija' }, short: L0(), subtitle: null, groups: [newGroup()] };
        c.short = Object.assign(L0(), { it: 'Nuova' }); cats().push(c); S.catId = c.id; S.newCat = c.id; renderTab(); touch();
      } }, '+ Nuova categoria'));
    const search = searchBox();
    const right = h('div', null, search.box, search.results, cat ? categoryEditor(cat) : h('p', null, 'Nessuna categoria.'));
    p.append(h('div', { class: 'help' }, 'Scegli una categoria, poi tocca ', h('b', null, 'Modifica'), ' su un piatto per cambiare nome, ingredienti, allergeni e foto. Il menù online cambia solo dopo aver premuto ', h('b', null, 'Salva modifiche'), '.'),
      h('div', { class: 'menu-layout' }, left, right));
  }
  function searchBox() {
    const results = h('ul', { class: 'sresults', hidden: true });
    const input = h('input', { class: 'in', type: 'search', placeholder: 'Cerca un piatto in tutto il menù…', 'aria-label': 'Cerca un piatto', value: S.query, oninput: e => {
      S.query = e.target.value; const q = S.query.trim().toLowerCase();
      results.replaceChildren();
      if (!q) { results.hidden = true; return; }
      const hits = [...allItems()].filter(x => LANGS.some(([c]) => (x.i.name[c] || '').toLowerCase().includes(q))).slice(0, 12);
      results.hidden = false;
      if (!hits.length) results.append(h('li', { style: 'padding:10px 12px' }, 'Nessun piatto trovato.'));
      hits.forEach(x => results.append(h('li', null, h('button', { type: 'button', onclick: () => { S.catId = x.c.id; S.query = ''; renderTab(); openItem(x.i, x.g, x.c); } },
        h('b', null, x.i.name.it), h('small', null, lt(x.c.title)), h('span', { style: 'margin-left:auto' }, money(x.i.price))))));
    } });
    return { box: h('div', { style: 'margin-bottom:14px' }, input), results };
  }
  const newGroup = () => ({ id: 'g-' + rid(), type: 'items', layout: 'cards', title: null, subtitle: null, items: [] });
  const newItem = () => ({ id: uniqueId('nuovo-piatto'), name: { it: 'Nuovo piatto', en: '', de: '', sl: '' }, price: null, allergens: [], ingredients: [], desc: null, note: null, photos: [], badge: null, soldOut: false, hidden: false, check: false });

  function categoryEditor(cat) {
    const wrap = h('div');
    const settings = h('details', { class: 'group', open: S.newCat === cat.id },
      h('summary', { style: 'padding:10px 14px;font-weight:700;cursor:pointer;background:var(--beige-2);border-radius:12px' }, 'Impostazioni della categoria: titolo e nomi'),
      h('div', { style: 'padding:14px;display:grid;gap:14px' },
        mlField(cat, 'title', 'Titolo della categoria', { cols: true }),
        mlField(cat, 'short', 'Nome corto per la barra in alto', { cols: true, hint: 'Se lasci vuoto si usa il titolo.' }),
        mlField(cat, 'subtitle', 'Frase sotto il titolo (facoltativa)', { cols: true }),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { if (swap(cats(), cats().indexOf(cat), cats().indexOf(cat) - 1)) { renderTab(); touch(); } } }, '↑ Sposta su'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { if (swap(cats(), cats().indexOf(cat), cats().indexOf(cat) + 1)) { renderTab(); touch(); } } }, '↓ Sposta giù'),
          h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
            const n = cat.groups.reduce((a, g) => a + g.items.length, 0);
            if (await confirmBox(`Eliminare la categoria «${lt(cat.title)}»${n ? ' e i suoi ' + n + ' piatti' : ''}?`, 'Elimina', true)) { cats().splice(cats().indexOf(cat), 1); S.catId = null; renderTab(); touch(); }
          } }, 'Elimina categoria'))));
    S.newCat = null;
    wrap.append(settings, h('div', { style: 'height:16px' }));
    cat.groups.forEach(g => wrap.append(groupEditor(cat, g)));
    wrap.append(h('button', { class: 'btn small', type: 'button', onclick: () => { cat.groups.push(newGroup()); renderTab(); touch(); } }, '+ Nuovo gruppo (sottotitolo con altri piatti)'));
    return wrap;
  }
  function groupEditor(cat, g) {
    const idx = cat.groups.indexOf(g);
    const settings = h('details', { style: 'width:100%' }, h('summary', { style: 'cursor:pointer;font-weight:700;font-size:14px' }, 'Titolo del gruppo'),
      h('div', { style: 'display:grid;gap:12px;padding:10px 0 4px' },
        mlField(g, 'title', 'Titolo del gruppo (facoltativo)', { cols: true }),
        g.type === 'allergens' ? null : mlField(g, 'subtitle', 'Frase sotto il titolo (facoltativa)', { cols: true }),
        g.type === 'allergens' ? h('p', { class: 'hint' }, 'In questo gruppo il sito mostra l’elenco degli allergeni. I nomi si modificano in «Testi del sito».') : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { if (swap(cat.groups, idx, idx - 1)) { renderTab(); touch(); } } }, '↑ Sposta su'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { if (swap(cat.groups, idx, idx + 1)) { renderTab(); touch(); } } }, '↓ Sposta giù'),
          h('button', { class: 'btn small danger', type: 'button', onclick: async () => {
            if (await confirmBox(`Eliminare questo gruppo${g.items.length ? ' e i suoi ' + g.items.length + ' piatti' : ''}?`, 'Elimina', true)) { cat.groups.splice(idx, 1); renderTab(); touch(); }
          } }, 'Elimina gruppo'))));
    const head = h('header', null, h('h3', null, lt(g.title) || (cat.groups.length > 1 ? 'Gruppo senza titolo' : 'Piatti')),
      g.type === 'allergens' ? null : h('button', { class: 'btn small', type: 'button', onclick: () => { const it = newItem(); g.items.push(it); S.query = ''; renderTab(); touch(); openItem(it, g, cat); } }, '+ Nuovo piatto'));
    const body = g.type === 'allergens' ? h('p', { style: 'padding:12px 14px;margin:0' }, 'Elenco degli allergeni (A–N), tradotto in automatico nelle 4 lingue.')
      : h('ul', { class: 'items' }, g.items.length ? g.items.map(it => itemRow(cat, g, it)) : h('li', { style: 'padding:14px' }, 'Nessun piatto. Premi «+ Nuovo piatto».'));
    return h('section', { class: 'group' }, head, h('div', { style: 'padding:6px 14px 0;border-bottom:1px solid var(--line)' }, settings), body);
  }
  function itemRow(cat, g, it) {
    const price = h('input', { class: 'in price-in', type: 'number', step: '0.1', min: '0', inputmode: 'decimal', placeholder: '€', 'aria-label': 'Prezzo di ' + it.name.it,
      value: it.price == null ? '' : it.price, oninput: e => { it.price = e.target.value === '' ? null : parseFloat(e.target.value); touch(); } });
    const move = d => () => { if (swap(g.items, g.items.indexOf(it), g.items.indexOf(it) + d)) { renderTab(); touch(); } };
    const warn = it.check ? 'Da verificare' : (it.price == null ? 'Manca il prezzo' : null);
    return h('li', { class: 'item' + (it.hidden ? ' off' : '') },
      thumbOf(it),
      h('div', { class: 'nm' }, it.name.it || '(senza nome)', ' ', warn && h('span', { class: 'chip warn' }, '⚠ ' + warn), it.hidden && h('span', { class: 'chip off' }, 'Nascosto'), it.soldOut && h('span', { class: 'chip out' }, 'Esaurito'),
        h('small', null, (it.desc && it.desc.it) || genDesc(it, 'it') || ' ')),
      h('div', { class: 'ctl' }, price,
        h('label', { class: 'tick' }, h('input', { type: 'checkbox', checked: it.soldOut, onchange: e => { it.soldOut = e.target.checked; touch(); renderTab(); } }), 'Esaurito'),
        h('button', { class: 'btn small', type: 'button', onclick: () => openItem(it, g, cat) }, 'Modifica'),
        h('button', { class: 'btn small icon', type: 'button', 'aria-label': 'Sposta su', onclick: move(-1) }, '↑'),
        h('button', { class: 'btn small icon', type: 'button', 'aria-label': 'Sposta giù', onclick: move(1) }, '↓')));
  }

  /* ---------- finestra di modifica del piatto ---------- */
  function openItem(it, g, cat) {
    const d = h('dialog', { 'aria-label': 'Modifica piatto' });
    const body = h('div', { class: 'dlg-b' });
    const draw = () => { body.replaceChildren(...itemForm(it, g, cat, draw)); };
    draw();
    d.append(h('div', { class: 'dlg-h' }, h('h2', null, 'Modifica piatto'), h('button', { class: 'btn small', type: 'button', onclick: () => d.close() }, 'Chiudi')), body,
      h('div', { class: 'dlg-f' },
        h('button', { class: 'btn danger spacer', type: 'button', onclick: async () => {
          if (await confirmBox(`Eliminare «${it.name.it}»?`, 'Elimina il piatto', true)) { g.items.splice(g.items.indexOf(it), 1); d.close(); touch(); renderTab(); }
        } }, 'Elimina piatto'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => d.close() }, 'Fatto')));
    d.addEventListener('close', () => { d.remove(); renderTab(); touch(); });
    document.body.append(d); d.showModal();
  }
  function itemForm(it, g, cat, redraw) {
    const out = [];
    out.push(h('fieldset', null, h('legend', null, 'Nome e prezzo'),
      mlField(it, 'name', null, { cols: true, ph: '' }),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { LANGS.slice(1).forEach(([c]) => { it.name[c] = it.name.it; }); touch(); redraw(); } }, 'Copia il nome italiano nelle altre lingue'),
        h('label', { class: 'f', style: 'max-width:180px' }, h('span', { class: 'l' }, 'Prezzo in euro'),
          h('input', { class: 'in', type: 'number', step: '0.1', min: '0', inputmode: 'decimal', value: it.price == null ? '' : it.price, oninput: e => { it.price = e.target.value === '' ? null : parseFloat(e.target.value); touch(); } })))));

    /* descrizione: ingredienti o testo libero */
    const free = !!(it.desc && LANGS.some(([c]) => (it.desc[c] || '').trim()));
    const mode = h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('label', { class: 'tick' }, h('input', { type: 'radio', name: 'dmode', checked: !free, onchange: async () => {
        if (free && !(await confirmBox('Passando alla lista ingredienti il testo libero verrà cancellato. Continuare?', 'Continua', true))) return redraw();
        it.desc = null; touch(); redraw();
      } }), 'Lista di ingredienti (tradotta da sola)'),
      h('label', { class: 'tick' }, h('input', { type: 'radio', name: 'dmode', checked: free, onchange: () => {
        if (!free) { it.desc = L0(); LANGS.forEach(([c]) => { it.desc[c] = genDesc(it, c); }); touch(); }
        redraw();
      } }), 'Testo libero (scrivo io le traduzioni)'));
    const descBox = free ? mlField(it, 'desc', null, { area: true, rows: 4, cols: true }) : ingredientPicker(it, redraw);
    out.push(h('fieldset', null, h('legend', null, 'Descrizione'), mode, descBox));
    out.push(h('fieldset', null, h('legend', null, 'Nota breve (facoltativa)'), mlField(it, 'note', null, { cols: true, ph: '', hint: 'Compare in un riquadro tratteggiato. Es. «cotta al forno».' })));
    out.push(h('fieldset', null, h('legend', null, 'Allergeni'),
      h('div', { class: 'algs' }, S.menu.allergens.map(a => h('label', null,
        h('input', { type: 'checkbox', checked: (it.allergens || []).includes(a.id), onchange: e => {
          const s = new Set(it.allergens || []); e.target.checked ? s.add(a.id) : s.delete(a.id); it.allergens = [...s]; touch();
        } }), h('b', null, a.id), ' ', a.name.it)))));
    out.push(h('fieldset', null, h('legend', null, 'Foto'), photoEditor(it, 'photos', 6, redraw),
      h('p', { class: 'hint' }, 'Le foto compaiono nella galleria in fondo al menù, e il nome del piatto diventa un link che porta alla sua foto. Nella galleria la foto è un quadrato: con i cursori scegli quale parte mostrare; toccandola si apre intera.')));
    const badge = h('select', { class: 'in', onchange: e => { it.badge = e.target.value || null; touch(); } },
      [['', 'Nessuna'], ['new', 'Novità'], ['spicy', 'Piccante'], ['top', 'Consigliata']].map(([v, l]) => h('option', { value: v, selected: (it.badge || '') === v }, l)));
    out.push(h('fieldset', null, h('legend', null, 'Opzioni'),
      h('div', { class: 'row', style: 'align-items:center' },
        h('label', { class: 'f' }, h('span', { class: 'l' }, 'Etichetta accanto al nome'), badge),
        h('label', { class: 'tick' }, h('input', { type: 'checkbox', checked: it.soldOut, onchange: e => { it.soldOut = e.target.checked; touch(); } }), 'Esaurito'),
        h('label', { class: 'tick' }, h('input', { type: 'checkbox', checked: it.hidden, onchange: e => { it.hidden = e.target.checked; touch(); } }), 'Nascondi dal menù'),
        h('label', { class: 'tick' }, h('input', { type: 'checkbox', checked: it.check, onchange: e => { it.check = e.target.checked; touch(); } }), 'Da verificare (avviso solo qui)')),
      h('div', { class: 'row', style: 'margin-top:12px' },
        h('label', { class: 'f' }, h('span', { class: 'l' }, 'Sposta in un’altra categoria'),
          h('select', { class: 'in', onchange: e => {
            const dest = cats().find(c => c.id === e.target.value); if (!dest || dest === cat) return;
            const dg = dest.groups.find(x => x.type !== 'allergens') || (dest.groups.push(newGroup()), dest.groups[dest.groups.length - 1]);
            g.items.splice(g.items.indexOf(it), 1); dg.items.push(it); S.catId = dest.id; touch(); toast('Spostato in «' + lt(dest.title) + '».');
            document.querySelector('dialog[open]')?.close();
          } }, cats().map(c => h('option', { value: c.id, selected: c === cat }, lt(c.title))))))));
    return out;
  }

  /* ingredienti nel piatto */
  function ingredientPicker(it, redraw) {
    const ing = S.menu.ingredients;
    it.ingredients = it.ingredients || [];
    const chips = h('div', { class: 'chips' }, it.ingredients.length ? it.ingredients.map((k, idx) => ing[k] && h('span', { class: 'ichip' }, ing[k].it,
      h('button', { type: 'button', 'aria-label': 'Sposta prima', onclick: () => { if (swap(it.ingredients, idx, idx - 1)) { touch(); redraw(); } } }, '‹'),
      h('button', { type: 'button', 'aria-label': 'Sposta dopo', onclick: () => { if (swap(it.ingredients, idx, idx + 1)) { touch(); redraw(); } } }, '›'),
      h('button', { type: 'button', 'aria-label': 'Togli ' + ing[k].it, onclick: () => { it.ingredients.splice(idx, 1); touch(); redraw(); } }, '✕'))) : h('small', null, 'Nessun ingrediente.'));
    const list = h('datalist', { id: 'ing-list' }, Object.values(ing).map(v => h('option', { value: v.it })));
    const input = h('input', { class: 'in', list: 'ing-list', placeholder: 'Scrivi un ingrediente e premi Invio…', 'aria-label': 'Aggiungi ingrediente', autocomplete: 'off' });
    const newBox = h('div', { hidden: true, style: 'margin:10px 0;padding:12px;border:2px dashed var(--line);border-radius:12px' });
    const add = () => {
      const txt = input.value.trim(); if (!txt) return;
      const key = Object.keys(ing).find(k => (ing[k].it || '').toLowerCase() === txt.toLowerCase());
      if (key) { if (!it.ingredients.includes(key)) it.ingredients.push(key); touch(); return redraw(); }
      const o = { it: txt, en: '', de: '', sl: '' };
      newBox.hidden = false;
      newBox.replaceChildren(h('p', { style: 'margin:0 0 8px;font-weight:700' }, `«${txt}» è nuovo. Scrivi come si chiama nelle altre lingue (se non lo sai, lascia vuoto: verrà mostrato in italiano).`),
        h('div', { class: 'ml cols' }, LANGS.slice(1).map(([c, s, n]) => h('label', { class: 'lng' }, h('b', null, s), h('input', { class: 'in', placeholder: n, lang: c, oninput: e => { o[c] = e.target.value; } })))),
        h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn small primary', type: 'button', onclick: () => {
          let k = slug(txt) || 'ingrediente'; while (ing[k]) k += '-' + rid();
          LANGS.forEach(([c]) => { o[c] = (o[c] || '').trim(); }); ing[k] = o; it.ingredients.push(k); touch(); redraw();
        } }, 'Crea e aggiungi'), h('button', { class: 'btn small', type: 'button', onclick: () => { newBox.hidden = true; } }, 'Annulla')));
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    input.addEventListener('change', () => { if (Object.values(ing).some(v => v.it === input.value)) add(); });
    const prev = h('div', { class: 'preview' }, LANGS.map(([c, s]) => h('p', null, h('b', null, s), genDesc(it, c) || '–')));
    return h('div', null, chips, list, h('div', { class: 'row' }, input, h('button', { class: 'btn small', type: 'button', style: 'flex:0 0 auto', onclick: add }, 'Aggiungi')), newBox,
      h('div', { style: 'font-weight:700;font-size:14px;margin:12px 0 4px' }, 'Come si vedrà nel menù'), prev);
  }

  /* foto: anteprima quadrata (come nella galleria) + cursori di inquadratura */
  function photoEditor(owner, key, max, redraw) {
    owner[key] = owner[key] || [];
    const wrap = h('div');
    owner[key].forEach((ph, idx) => {
      const img = h('img', { src: thumbSrc(ph.file), alt: '' });
      const apply = () => { img.style.objectPosition = ph.pos; img.style.transformOrigin = ph.pos; img.style.transform = ph.zoom && ph.zoom !== 1 ? `scale(${ph.zoom})` : ''; };
      const [x0, y0] = String(ph.pos || '50% 50%').split(/\s+/).map(v => parseFloat(v) || 50);
      const px = { x: x0, y: y0 };
      const slider = (label, min, maxv, step, val, on) => h('label', null, label, h('input', { type: 'range', min, max: maxv, step, value: val, oninput: e => { on(parseFloat(e.target.value)); apply(); touch(); } }));
      apply();
      wrap.append(h('div', { class: 'photoedit' },
        h('div', { class: 'sq' }, img),
        h('div', { class: 'sliders' },
          h('small', null, ph.file),
          slider('Sinistra–destra', 0, 100, 1, px.x, v => { px.x = v; ph.pos = `${px.x}% ${px.y}%`; }),
          slider('Alto–basso', 0, 100, 1, px.y, v => { px.y = v; ph.pos = `${px.x}% ${px.y}%`; }),
          slider('Ingrandisci', 1, 2, 0.05, ph.zoom || 1, v => { ph.zoom = v; })),
        h('div', { class: 'pe-btns' },
          h('button', { class: 'btn small icon', type: 'button', 'aria-label': 'Sposta su', onclick: () => { if (swap(owner[key], idx, idx - 1)) { touch(); redraw(); } } }, '↑'),
          h('button', { class: 'btn small icon', type: 'button', 'aria-label': 'Sposta giù', onclick: () => { if (swap(owner[key], idx, idx + 1)) { touch(); redraw(); } } }, '↓'),
          h('button', { class: 'btn small danger', type: 'button', onclick: () => { owner[key].splice(idx, 1); touch(); redraw(); } }, 'Togli'))));
    });
    if (owner[key].length < max) wrap.append(h('button', { class: 'btn small', type: 'button', onclick: () => pickMedia(file => { owner[key].push({ file, pos: '50% 50%', zoom: 1 }); touch(); redraw(); }) }, '+ Aggiungi foto'));
    return wrap;
  }
  async function pickMedia(onPick) {
    if (!S.media.length) await loadMedia();
    const d = h('dialog', { 'aria-label': 'Scegli una foto' });
    const grid = h('div', { class: 'mediagrid' });
    const draw = () => grid.replaceChildren(...S.media.map(m => h('button', { class: 'mcard pick', type: 'button', onclick: () => { onPick(m.file); d.close(); } },
      h('div', { class: 'sq' }, h('img', { src: thumbSrc(m.file), alt: '', loading: 'lazy' })), h('small', null, m.file))));
    draw();
    const up = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async e => { await uploadFiles([...e.target.files]); draw(); e.target.value = ''; } });
    d.append(h('div', { class: 'dlg-h' }, h('h2', null, 'Scegli una foto'), h('button', { class: 'btn small primary', type: 'button', onclick: () => up.click() }, 'Carica una nuova foto'), up,
      h('button', { class: 'btn small', type: 'button', onclick: () => d.close() }, 'Chiudi')), h('div', { class: 'dlg-b' }, grid));
    d.addEventListener('close', () => d.remove()); document.body.append(d); d.showModal();
  }

  /* ---------- scheda "Ingredienti" ---------- */
  function tabIngredients(p) {
    const ing = S.menu.ingredients;
    const usage = {}; for (const { i } of allItems()) (i.ingredients || []).forEach(k => { usage[k] = (usage[k] || 0) + 1; });
    const filter = h('input', { class: 'in', type: 'search', placeholder: 'Filtra per nome…', 'aria-label': 'Filtra ingredienti' });
    const newIn = h('input', { class: 'in', placeholder: 'Nuovo ingrediente (in italiano)', 'aria-label': 'Nuovo ingrediente' });
    const tbody = h('tbody');
    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      tbody.replaceChildren(...Object.keys(ing).filter(k => !q || LANGS.some(([c]) => (ing[k][c] || '').toLowerCase().includes(q))).sort((a, b) => (ing[a].it || '').localeCompare(ing[b].it || '', 'it')).map(k =>
        h('tr', null, LANGS.map(([c]) => h('td', null, h('input', { class: 'in', value: ing[k][c] || '', lang: c, 'aria-label': k + ' ' + c, oninput: e => { ing[k][c] = e.target.value; touch(); } }))),
          h('td', null, usage[k] ? usage[k] + (usage[k] === 1 ? ' piatto' : ' piatti') : h('small', null, 'non usato')),
          h('td', null, h('button', { class: 'btn small danger', type: 'button', disabled: !!usage[k], title: usage[k] ? 'Si usa in ' + usage[k] + ' piatti: toglilo prima da lì' : '', onclick: async () => {
            if (await confirmBox(`Eliminare l’ingrediente «${ing[k].it}»?`, 'Elimina', true)) { delete ing[k]; touch(); draw(); }
          } }, 'Elimina')))));
    };
    filter.addEventListener('input', draw); draw();
    const addNew = () => {
      const t = newIn.value.trim(); if (!t) return;
      if (Object.values(ing).some(v => (v.it || '').toLowerCase() === t.toLowerCase())) return toast('Esiste già un ingrediente con questo nome.', true);
      let k = slug(t) || 'ingrediente'; while (ing[k]) k += '-' + rid();
      ing[k] = { it: t, en: '', de: '', sl: '' }; newIn.value = ''; filter.value = t; touch(); draw();
      toast('Aggiunto. Scrivi ora le traduzioni nella riga.');
    };
    newIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    p.append(h('div', { class: 'help' }, 'Gli ingredienti sono scritti una volta sola e tradotti nelle 4 lingue. Se correggi una traduzione qui, cambia in tutti i piatti che la usano.'),
      h('div', { class: 'row', style: 'margin-bottom:14px' }, filter, newIn, h('button', { class: 'btn small primary', type: 'button', style: 'flex:0 0 auto', onclick: addNew }, 'Aggiungi')),
      h('div', { class: 'tablewrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, LANGS.map(([, s, n]) => h('th', null, n)), h('th', null, 'Usato in'), h('th'))), tbody)));
  }

  /* ---------- scheda "Foto" ---------- */
  async function loadMedia() { try { S.media = (await api('media')).media; } catch (e) { if (!e.silent) toast(e.message, true); } }
  async function loadBitmap(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      return new Promise((ok, ko) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => ko(new Error('Immagine non leggibile')); im.src = u; });
    }
  }
  function toJpeg(src, w, h0, scale, q) {
    const s = Math.min(1, scale), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.drawImage(src, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', q);
  }
  /* come toJpeg, ma restituisce il file vero e proprio (serve al sito su Cloudflare, che riceve le foto senza convertirle) */
  function toJpegBlob(src, w, h0, scale, q) {
    const s = Math.min(1, scale), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch); x.drawImage(src, 0, 0, cw, ch);
    return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('Immagine non convertibile'))), 'image/jpeg', q));
  }
  async function uploadFiles(files) {
    for (const f of files) {
      if (!/^image\//.test(f.type)) { toast(f.name + ': non è un’immagine.', true); continue; }
      try {
        toast('Carico ' + f.name + '…');
        const bmp = await loadBitmap(f), w = bmp.width, hh = bmp.height;
        const nm = slug(f.name.replace(/\.[^.]+$/, '')) || 'foto';
        let r, small = null;
        if (S.binary) {
          const form = new FormData();
          form.append('name', nm);
          form.append('full', await toJpegBlob(bmp, w, hh, 1400 / Math.max(w, hh), 0.82), 'full.jpg');
          form.append('small', await toJpegBlob(bmp, w, hh, 640 / Math.min(w, hh), 0.78), 'small.jpg');
          r = await api('upload', { form });
        } else {
          const full = toJpeg(bmp, w, hh, 1400 / Math.max(w, hh), 0.82);
          small = toJpeg(bmp, w, hh, 640 / Math.min(w, hh), 0.78);
          r = await api('upload', { body: { name: nm, full, small } });
        }
        if (!S.binary && small) S.thumbs[r.file] = small; S.media.push({ file: r.file, used: false, small: true }); S.media.sort((a, b) => a.file.localeCompare(b.file));
        toast('Foto caricata.');
      } catch (e) { if (!e.silent) toast(f.name + ': ' + e.message, true); }
    }
  }
  async function tabMedia(p) {
    await loadMedia();
    const grid = h('div', { class: 'mediagrid' });
    const draw = () => grid.replaceChildren(...S.media.map(m => h('div', { class: 'mcard' },
      h('div', { class: 'sq' }, h('img', { src: thumbSrc(m.file), alt: '', loading: 'lazy' })),
      h('small', null, m.file), h('div', { style: 'margin:6px 0' }, m.used ? h('span', { class: 'chip' }, 'In uso') : h('span', { class: 'chip off' }, 'Non usata')),
      h('button', { class: 'btn small danger', type: 'button', disabled: m.used, title: m.used ? 'La foto è usata nel menù: toglila prima dal piatto e salva.' : '', onclick: async () => {
        if (!(await confirmBox(`Eliminare la foto «${m.file}» dal sito?`, 'Elimina', true))) return;
        try { await api('deleteMedia', { body: { file: m.file } }); S.media = S.media.filter(x => x !== m); draw(); toast('Foto eliminata.'); } catch (e) { if (!e.silent) toast(e.message, true); }
      } }, 'Elimina'))));
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async e => { await uploadFiles([...e.target.files]); draw(); e.target.value = ''; } });
    const drop = h('div', { class: 'drop' }, h('b', null, 'Trascina qui le foto oppure'), h('button', { class: 'btn primary', type: 'button', onclick: () => input.click() }, 'Scegli le foto'), input,
      h('small', null, 'Vanno bene le foto del telefono: vengono ridimensionate da sole. Poi abbinale ai piatti da «Piatti» → Modifica → Foto.'));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', async e => { await uploadFiles([...e.dataTransfer.files]); draw(); });
    draw(); p.append(drop, grid);
  }

  /* ---------- scheda "Testi del sito" ---------- */
  function tabTexts(p) {
    const m = S.menu; m.meta = m.meta || {};
    p.append(h('div', { class: 'help' }, 'Qui cambi i testi che non sono piatti: frasi in cima alla pagina, titolo della galleria foto, etichette e nomi degli allergeni.'),
      h('fieldset', null, h('legend', null, 'Il locale'),
        h('div', { class: 'row' }, textField(m.meta, 'name', 'Nome del locale'), textField(m.meta, 'phone', 'Telefono (facoltativo)', { type: 'tel' })),
        h('div', { class: 'row', style: 'margin-top:12px' }, textField(m.meta, 'address', 'Indirizzo (facoltativo)'), textField(m.meta, 'menuDate', 'Menù in vigore dal', { type: 'date' }))),
      h('fieldset', null, h('legend', null, 'Frasi principali'),
        h('div', { style: 'display:grid;gap:18px' }, MAIN_UI.map(k => mlField(m.ui, k, UI_LABELS[k][0], { cols: true, hint: UI_LABELS[k][1] })))),
      h('details', { class: 'group' }, h('summary', { style: 'padding:12px 14px;font-weight:700;cursor:pointer' }, 'Etichette e pulsanti (di solito non servono modifiche)'),
        h('div', { style: 'padding:14px;display:grid;gap:18px' }, Object.keys(m.ui).filter(k => !MAIN_UI.includes(k)).map(k => mlField(m.ui, k, (UI_LABELS[k] || [k])[0], { cols: true, hint: (UI_LABELS[k] || [])[1] })))),
      h('details', { class: 'group', style: 'margin-top:16px' }, h('summary', { style: 'padding:12px 14px;font-weight:700;cursor:pointer' }, 'Nomi degli allergeni'),
        h('div', { style: 'padding:14px;display:grid;gap:16px' }, m.allergens.map(a => mlField(a, 'name', 'Lettera ' + a.id, { cols: true })))));
  }

  /* ---------- scheda "Versioni salvate" ---------- */
  async function tabVersions(p) {
    const box = h('div', null, 'Carico…'); p.append(h('div', { class: 'help' }, 'Ogni volta che premi «Salva» il sito conserva la versione precedente (ne tiene 40). Se qualcosa va storto puoi tornare indietro.'), box);
    try { S.backups = (await api('backups')).backups; } catch (e) { box.textContent = e.message; return; }
    if (!S.backups.length) { box.textContent = 'Non ci sono ancora versioni precedenti.'; return; }
    box.replaceChildren(h('ul', { class: 'items', style: 'border:2px solid var(--line);border-radius:12px' }, S.backups.map(b => h('li', { class: 'item', style: 'grid-template-columns:1fr auto' },
      h('div', { class: 'nm' }, new Date(b.time).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' }), b.size ? h('small', null, Math.round(b.size / 1024) + ' KB') : null),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        if (!(await confirmBox('Ripristinare questa versione? Quella attuale viene comunque conservata.', 'Ripristina'))) return;
        try { await api('restore', { body: { name: b.name } }); await loadMenu(); S.lastSaved = null; toast('Versione ripristinata.'); renderApp(); } catch (e) { if (!e.silent) toast(e.message, true); }
      } }, 'Ripristina')))));
  }

  /* ---------- scheda "Account" ---------- */
  function tabAccount(p) {
    const err = h('p', { class: 'err', role: 'alert' });
    p.append(h('div', { class: 'sec', style: 'max-width:420px' }, h('h2', null, 'Cambia password'), GH.on && h('p', { class: 'hint', style: 'margin:0 0 4px' }, 'Almeno 10 caratteri. Meglio una frase di tre parole a caso che ricordi: la password protegge la chiave che permette di modificare il sito.'), passwordForm(err, async () => { renderTab(); }, false), err));
  }

  /* ---------- avvio ---------- */
  async function loadMenu() {
    if (LOCAL.on || GH.on) { S.menu = await api('menu'); S.menu.meta = S.menu.meta || {}; S.saved = JSON.stringify(S.menu); return; }
    const r = await fetch('../api/?action=menu', { credentials: 'same-origin' });
    if (r.status === 401) { renderLogin(); throw Object.assign(new Error('unauthorized'), { silent: true }); }
    if (!r.ok) throw new Error('Non riesco a leggere il menù (errore ' + r.status + ').');
    S.menu = await r.json(); S.menu.meta = S.menu.meta || {}; S.saved = JSON.stringify(S.menu);
  }
  async function start() {
    if (LOCAL.on) {
      /* con il doppio clic i browser non caricano i font dai file: usiamo la copia incorporata */
      if (location.protocol === 'file:' && !document.getElementById('fonts-local')) document.head.append(h('link', { id: 'fonts-local', rel: 'stylesheet', href: '../assets/fonts-local.css' }));
      return renderLocalPicker();
    }
    try {
      const me = await api('me');
      if (!me.authenticated) return renderLogin();
      S.mustChange = me.mustChange; S.binary = !!me.binaryUpload;
      if (S.mustChange) return renderForcedPassword();
      await loadMenu(); renderApp();
    } catch (e) {
      if (e.silent) return;
      $app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'brand' }, 'La Caraffa'), h('p', { class: 'err' }, e.message), h('button', { class: 'btn', type: 'button', onclick: start }, 'Riprova')));
    }
  }
  GH.init().then(start);
})();
