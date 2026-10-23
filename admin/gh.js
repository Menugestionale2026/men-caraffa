/*
 * La Caraffa – collegamento a GitHub, usato dal pannello (admin.js) e da INSTALLA.html.
 *
 * Il sito vive su GitHub Pages: ogni salvataggio del pannello è un «commit» nel repository, e GitHub Pages
 * ripubblica il sito da solo. Per poter scrivere nel repository serve un «token» (una chiave): sta nel file
 * admin/vault.json, CIFRATO con la password del pannello (PBKDF2-SHA256 + AES-GCM). Senza la password il file è inutile.
 */
(() => {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const KDF_ITER = 600000;

  class GhError extends Error { constructor(message, code, extra) { super(message); this.code = code; Object.assign(this, extra || {}); } }
  const gherr = (m, c, x) => new GhError(m, c, x);

  /* ---------- base64 ---------- */
  const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = str => { const bin = atob(String(str).replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

  /* ---------- cassaforte: password → token ---------- */
  function needCrypto() {
    if (!(window.crypto && crypto.subtle)) throw gherr('Questo browser non permette la cifratura in questa pagina. Apri il pannello da un indirizzo https:// con un browser aggiornato.', 'crypto');
  }
  async function deriveKey(password, salt, iter) {
    needCrypto();
    const base = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function makeVault(token, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, KDF_ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ token })));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }
  async function openVault(vault, password) {
    if (!vault || vault.v !== 1 || !vault.ct) throw gherr('Il file della password (admin/vault.json) non è valido.', 'vault');
    let key;
    key = await deriveKey(password, fromB64(vault.salt), vault.iter);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.ct));
      const token = JSON.parse(dec.decode(pt)).token;
      if (!token) throw new Error('vuoto');
      return token;
    } catch (e) { throw gherr('Password errata.', 'password'); }
  }

  /* ---------- API di GitHub ---------- */
  const encPath = p => String(p).split('/').map(encodeURIComponent).join('/');
  function client(cfg, token) {
    const apiBase = (cfg.api || 'https://api.github.com').replace(/\/$/, '');
    const repo = `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function failure(res) {
      let msg = ''; try { msg = (await res.json()).message || ''; } catch (e) { /* senza corpo */ }
      if (res.status === 401) return gherr('GitHub non accetta più il collegamento: il token è scaduto o è stato revocato. Serve un nuovo token (vedi la guida, «Rinnovare il token»).', 'token');
      if (res.status === 403 || res.status === 429) {
        const wait = Number(res.headers.get('retry-after') || 0);
        if (wait || res.headers.get('x-ratelimit-remaining') === '0' || /rate limit|secondary|abuse/i.test(msg)) return gherr('GitHub chiede di aspettare un momento. Riprova tra un minuto.', 'rate', { wait });
        return gherr('Il token non ha il permesso di modificare questo sito: deve avere «Contents: Read and write» sul repository giusto.', 'perm');
      }
      if (res.status === 404) return gherr('GitHub non trova il repository, oppure il token non può vederlo. Controlla il nome del repository e che il token sia stato creato proprio per quello.', 'notfound');
      if (res.status === 409 || res.status === 422) return gherr(msg || 'Un’altra modifica è arrivata nello stesso momento.', 'conflict', { status: res.status, detail: msg });
      return gherr('GitHub ha risposto con un errore (' + res.status + '). ' + msg, 'http', { status: res.status });
    }
    async function send(method, path, { body, accept, anon } = {}) {
      const headers = { Accept: accept || 'application/vnd.github+json' };
      if (token && !anon) headers.Authorization = 'Bearer ' + token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      for (let attempt = 0; ; attempt++) {
        let res;
        try { res = await fetch(apiBase + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
        catch (e) { throw gherr('Non riesco a collegarmi a GitHub. Controlla la connessione.', 'network'); }
        if (res.ok) return res;
        const err = await failure(res);
        if (err.code === 'rate' && attempt < 2 && err.wait && err.wait <= 20) { await sleep(err.wait * 1000 + 300); continue; }
        throw err;
      }
    }
    const json = async (method, path, opts) => (await send(method, path, opts)).json();

    const c = {
      repoInfo: () => json('GET', repo),
      async head(branch) { return (await json('GET', `${repo}/git/ref/heads/${encPath(branch)}`)).object.sha; },
      async treeOf(commitSha) { return (await json('GET', `${repo}/git/commits/${commitSha}`)).tree.sha; },
      async blob(base64) { return (await json('POST', `${repo}/git/blobs`, { body: { content: base64, encoding: 'base64' } })).sha; },
      /* tutti i file del ramo, con percorso e dimensione */
      async files(branch) {
        const t = await json('GET', `${repo}/git/trees/${await c.treeOf(await c.head(branch))}?recursive=1`);
        return t.tree.filter(e => e.type === 'blob');
      },
      /* testo di un file (ramo o codice di una versione), sempre aggiornato; anon = senza token (repository pubblico) */
      async text(path, ref, anon) {
        return (await send('GET', `${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, { accept: 'application/vnd.github.raw+json', anon })).text();
      },
      /* ultime modifiche a un file */
      async history(path, branch, n) {
        return json('GET', `${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=${n || 30}`);
      },
      /*
       * Un solo commit con più file. changes: {path, text} | {path, base64} | {path, remove:true}
       */
      async commit(branch, changes, message) {
        for (let attempt = 0; ; attempt++) {
          const head = await c.head(branch);
          const baseTree = await c.treeOf(head);
          const entries = [];
          for (const ch of changes) {
            const e = { path: ch.path, mode: '100644', type: 'blob' };
            if (ch.remove) e.sha = null;
            else if (ch.base64 !== undefined) e.sha = ch.blobSha || (ch.blobSha = await c.blob(ch.base64));
            else if (ch.text.length > 200000) e.sha = ch.blobSha || (ch.blobSha = await c.blob(toB64(enc.encode(ch.text))));
            else e.content = ch.text;
            entries.push(e);
          }
          const tree = (await json('POST', `${repo}/git/trees`, { body: { base_tree: baseTree, tree: entries } })).sha;
          const commit = (await json('POST', `${repo}/git/commits`, { body: { message, tree, parents: [head] } })).sha;
          try { await json('PATCH', `${repo}/git/refs/heads/${encPath(branch)}`, { body: { sha: commit, force: false } }); return commit; }
          catch (e) { if (e.code === 'conflict' && attempt < 2) continue; throw e; }
        }
      },
      /* repository appena creato e vuoto: serve un primo file per far nascere il ramo */
      async initEmpty(branch) {
        await json('PUT', `${repo}/contents/.nojekyll`, { body: { message: 'Inizio', content: toB64(enc.encode('\n')), branch } });
      },
    };
    return c;
  }

  window.CaraffaGH = { makeVault, openVault, client, toB64, fromB64, GhError, KDF_ITER, MIN_PASSWORD: 10 };
})();
