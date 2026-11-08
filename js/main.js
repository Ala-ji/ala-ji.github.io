/* ==========================================================================
   Portfolio · scripts principaux
   Thème, navigation, apparition au défilement, animation d'accueil
   (réseau de télésanté), filtres de documents, visionneuse, fichiers à venir.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Thème clair / sombre ---------- */
  const themeBtn = document.getElementById('theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function storedTheme() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem('theme', theme); } catch (e) { /* stockage indisponible */ }
    }
    if (themeBtn) {
      themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
  }
  if (systemDark.addEventListener) {
    systemDark.addEventListener('change', (e) => {
      if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
    });
  }

  /* ---------- Navigation ---------- */
  const header = document.querySelector('.site-header');
  const navToggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('menu');

  function setMenu(open) {
    if (!navToggle || !menu) return;
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.classList.toggle('is-open', open);
  }

  if (navToggle && menu) {
    navToggle.addEventListener('click', () => setMenu(navToggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        navToggle.focus();
      }
    });
  }

  const onScroll = () => { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Lien actif selon la section affichée au milieu de l'écran
  const navLinks = new Map(
    [...document.querySelectorAll('.nav-list a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a])
  );
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.removeAttribute('aria-current'));
        const link = navLinks.get(entry.target.id);
        if (link) link.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section[id]').forEach((s) => spy.observe(s));
  }

  /* Une seule entrée au chargement : le texte de l'accueil (animation CSS). Le reste est statique. */

  /* ---------- Animation d'accueil : réseau de télésanté ----------
     Les 1 754 communes du Centre-Val de Loire en points (taille selon la
     population) et les pôles de santé (CHU, préfectures, sous-préfectures),
     tous réels (data/accueil-reseau.json). Par-dessus, des liens s'allument :
     des téléconsultations d'une commune éloignée vers le pôle principal le plus
     proche et, plus rarement, des téléexpertises d'un pôle vers un CHU (tirets).
     Les liens sont une illustration, pas des données. */
  function initReseau() {
    const canvas = document.getElementById('reseau-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const hero = canvas.closest('.hero') || canvas.parentElement;
    const fond = document.createElement('canvas'); // points des communes, redessinés au redimensionnement seulement
    const fctx = fond.getContext('2d');
    const colors = { ink: '#1e293b', accent: '#0d9488', bg: '#f8fafc' };

    let data = null;
    let W = 0, H = 0, scale = 1, wide = true;
    let pts = [], poles = [], eloignees = [], relais = [];
    let liens = [], echos = [];
    let running = false, raf = 0, onScreen = true, prochain = 0;
    let rnd = Math.random;

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const doux = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // départ et arrivée en douceur

    function readColors() {
      const cs = getComputedStyle(root);
      colors.ink = cs.getPropertyValue('--ink').trim() || colors.ink;
      colors.accent = cs.getPropertyValue('--accent').trim() || colors.accent;
      colors.bg = cs.getPropertyValue('--bg').trim() || colors.bg;
    }

    function plusProche(p, garder) {
      let best = null, bd = Infinity;
      for (const h of poles) {
        if (h === p || (garder && !garder(h))) continue;
        const d = Math.hypot(h.x - p.x, h.y - p.y);
        if (d < bd) { bd = d; best = h; }
      }
      return { h: best, d: bd };
    }
    const principal = (h) => h.rang <= 1; // CHU et préfectures

    function setup() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [canvas, fond]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!data) return;

      // La région à droite sur grand écran (le texte est à gauche), centrée sous le voile sinon
      wide = W > 900;
      const boxH = wide ? H * 0.84 : Math.min(H * 0.86, (W * 0.94 * data.hauteur) / data.largeur);
      scale = boxH / data.hauteur;
      const boxW = data.largeur * scale;
      const cx = Math.min(wide ? W * 0.7 : W / 2, W - boxW / 2 - 24);
      const ox = cx - boxW / 2, oy = (H - boxH) / 2;
      pts = [];
      for (let i = 0; i < data.points.length; i += 3) {
        pts.push({ x: ox + data.points[i] * scale, y: oy + data.points[i + 1] * scale, c: data.points[i + 2] });
      }
      poles = data.poles.map(([x, y, rang]) => ({ x: ox + x * scale, y: oy + y * scale, rang }));
      eloignees = pts.filter((p) => plusProche(p, principal).d > boxH * 0.12);
      relais = poles.filter((h) => h.rang > 0);
      liens = []; echos = [];
      dessinerFond();
    }

    function dessinerFond() {
      fctx.clearRect(0, 0, W, H);
      const k = Math.max(0.75, Math.min(1.25, scale * 1.4));
      const rayons = [0.8, 1.1, 1.5, 2.1].map((r) => r * k);
      fctx.fillStyle = colors.ink;
      fctx.globalAlpha = root.getAttribute('data-theme') === 'dark' ? 0.34 : 0.28;
      fctx.beginPath();
      for (const p of pts) {
        const r = rayons[p.c];
        fctx.moveTo(p.x + r, p.y);
        fctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      fctx.fill();
      fctx.globalAlpha = 1;
    }

    function dessinerPole(h) {
      ctx.globalAlpha = 1;
      if (h.rang === 2) { // sous-préfecture : point cerclé
        ctx.fillStyle = colors.bg;
        ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); ctx.arc(h.x, h.y, 2.2, 0, Math.PI * 2); ctx.fill();
        return;
      }
      const R = h.rang === 0 ? 8 : 6.5, b = h.rang === 0 ? 4.5 : 3.75;
      ctx.fillStyle = colors.bg;
      ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colors.accent;
      if (h.rang === 0) { // CHU : un anneau de plus
        ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(h.x, h.y, R + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 1.75; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h.x - b, h.y); ctx.lineTo(h.x + b, h.y);
      ctx.moveTo(h.x, h.y - b); ctx.lineTo(h.x, h.y + b);
      ctx.stroke();
    }

    function nouveauLien(t0) {
      const expertise = rnd() < 0.14;
      let a, b;
      if (expertise) {
        a = relais[Math.floor(rnd() * relais.length)];
        b = a && plusProche(a, (h) => h.rang === 0).h;
      } else {
        const pool = eloignees.length ? eloignees : pts;
        a = pool[Math.floor(rnd() * pool.length)];
        b = a && plusProche(a, principal).h;
      }
      if (!a || !b) return null;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; } // les arcs se bombent vers le haut
      const bombe = len * (expertise ? 0.16 : 0.26);
      const c = { x: (a.x + b.x) / 2 + nx * bombe, y: (a.y + b.y) / 2 + ny * bombe };
      const trajet = Math.min(2400, Math.max(1100, 700 + len * 6));
      return { a, b, c, expertise, t0, trajet, vie: trajet + 1300, echo: false };
    }

    // Trace l'arc de 0 à e (découpage de De Casteljau) ; renvoie la position de la tête
    function arc(L, e, alpha) {
      const q1x = L.a.x + (L.c.x - L.a.x) * e, q1y = L.a.y + (L.c.y - L.a.y) * e;
      const q2x = L.c.x + (L.b.x - L.c.x) * e, q2y = L.c.y + (L.b.y - L.c.y) * e;
      const px = q1x + (q2x - q1x) * e, py = q1y + (q2y - q1y) * e;
      ctx.globalAlpha = alpha * (L.expertise ? 0.8 : 1);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = L.expertise ? 1 : 1.25;
      ctx.setLineDash(L.expertise ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(L.a.x, L.a.y);
      ctx.quadraticCurveTo(q1x, q1y, px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!L.expertise) { // la commune d'origine s'allume
        ctx.globalAlpha = Math.min(1, alpha * 1.5);
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); ctx.arc(L.a.x, L.a.y, 2, 0, Math.PI * 2); ctx.fill();
      }
      return { px, py };
    }

    function rendu(now) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.drawImage(fond, 0, 0, W, H);
      liens = liens.filter((L) => now - L.t0 < L.vie);
      echos = echos.filter((E) => now - E.t0 < 800);
      for (const L of liens) {
        const t = now - L.t0;
        const p = Math.min(1, t / L.trajet);
        const fade = t <= L.trajet + 300 ? 1 : Math.max(0, 1 - (t - L.trajet - 300) / 1000);
        const { px, py } = arc(L, doux(p), 0.6 * fade);
        if (p < 1) { // l'impulsion, une perle cerclée de fond
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors.bg;
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = colors.accent;
          ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
        } else if (!L.echo) {
          L.echo = true;
          echos.push({ x: L.b.x, y: L.b.y, t0: now });
        }
      }
      for (const E of echos) { // arrivée : un anneau qui s'ouvre et s'efface
        const t = (now - E.t0) / 800;
        ctx.globalAlpha = 0.5 * (1 - t);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(E.x, E.y, 7 + 12 * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2); ctx.stroke();
      }
      for (const h of poles) dessinerPole(h);
      ctx.globalAlpha = 1;
    }

    // Image fixe (mouvement réduit, pause) : quelques liens complets, toujours les mêmes
    function still() {
      if (!data) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.drawImage(fond, 0, 0, W, H);
      const sauve = rnd;
      rnd = mulberry32(20261108);
      for (let i = 0; i < (wide ? 11 : 6); i++) {
        const L = nouveauLien(0);
        if (L) arc(L, 1, 0.45);
      }
      rnd = sauve;
      for (const h of poles) dessinerPole(h);
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now >= prochain && liens.length < (wide ? 9 : 5)) {
        const L = nouveauLien(now);
        if (L) liens.push(L);
        prochain = now + (wide ? 320 : 520) + rnd() * 360;
      }
      rendu(now);
    }
    function play() {
      if (running || !data || reduceMotion.matches) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      running = false;
      cancelAnimationFrame(raf);
    }

    readColors();
    setup();
    canvas.style.opacity = '0';
    fetch('data/accueil-reseau.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        data = d;
        setup();
        still();
        canvas.style.opacity = '';
        if (onScreen && !document.hidden) play();
      })
      .catch(() => { canvas.style.opacity = ''; }); // sans données, l'accueil reste lisible, simplement sans réseau

    let resizeTimer = 0;
    const onResize = () => {
      // Masque le dessin pendant le redimensionnement (sinon il apparaît étiré un instant)
      canvas.style.opacity = '0';
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setup();
        if (!running) still();
        canvas.style.opacity = '';
      }, 150);
    };
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero);
    else window.addEventListener('resize', onResize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen && !document.hidden) play(); else pause();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(); else if (onScreen) play();
    });
    document.addEventListener('themechange', () => { readColors(); dessinerFond(); if (!running) still(); });
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) { pause(); still(); } else if (onScreen) play();
      });
    }
  }

  initReseau();

  /* ---------- Filtres des documents ---------- */
  const filterBtns = [...document.querySelectorAll('.filter-btn')];
  const docCards = [...document.querySelectorAll('.doc-card')];
  const docsEmpty = document.getElementById('docs-vide');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filtre = btn.dataset.filtre;
      filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let visibles = 0;
      docCards.forEach((card) => {
        const show = filtre === 'tous' || card.dataset.cat === filtre;
        card.hidden = !show;
        if (show) visibles++;
      });
      if (docsEmpty) docsEmpty.hidden = visibles > 0;
    });
  });

  /* ---------- Visionneuse de la galerie ---------- */
  const dialog = document.getElementById('lightbox');
  const galleryBtns = [...document.querySelectorAll('.gallery-btn, .shot-btn')];
  if (dialog && galleryBtns.length) {
    const lbImg = document.getElementById('lb-img');
    const lbLegende = document.getElementById('lb-legende');
    const lbCompteur = document.getElementById('lb-compteur');
    const pad = (n) => String(n).padStart(2, '0');
    let current = 0;
    let opener = null;

    const show = (i) => {
      current = (i + galleryBtns.length) % galleryBtns.length;
      const btn = galleryBtns[current];
      const thumb = btn.querySelector('img');
      lbImg.src = btn.dataset.full || thumb.currentSrc || thumb.src;
      lbImg.alt = thumb.alt;
      lbLegende.textContent = btn.dataset.legende || thumb.alt;
      lbCompteur.textContent = `${pad(current + 1)} / ${pad(galleryBtns.length)}`;
    };

    galleryBtns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (typeof dialog.showModal !== 'function') {
          window.open(btn.dataset.full || btn.querySelector('img').src, '_blank', 'noopener');
          return;
        }
        opener = btn;
        show(i);
        dialog.showModal();
      });
    });

    dialog.addEventListener('click', (e) => {
      const action = e.target.closest('[data-lb]');
      if (action) {
        const a = action.dataset.lb;
        if (a === 'fermer') dialog.close();
        else if (a === 'prec') show(current - 1);
        else if (a === 'suiv') show(current + 1);
      } else if (e.target === dialog) {
        dialog.close(); // clic sur le fond
      }
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(current - 1);
      else if (e.key === 'ArrowRight') show(current + 1);
    });
    let touchX = null;
    dialog.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    dialog.addEventListener('close', () => { if (opener) opener.focus(); });
  }

  /* ---------- Fichiers pas encore déposés ----------
     Un lien marqué data-fichier (CV, PDF) est grisé tant que le fichier
     n'existe pas sur le site. Il s'active tout seul dès qu'il est déposé. */
  if (location.protocol !== 'file:') {
    const checks = new Map();
    document.querySelectorAll('a[data-fichier]').forEach((a) => {
      const url = a.getAttribute('href');
      if (!checks.has(url)) {
        checks.set(url, fetch(url, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok).catch(() => false));
      }
      checks.get(url).then((ok) => {
        if (ok) return;
        a.classList.add('is-missing');
        a.setAttribute('aria-disabled', 'true');
        a.setAttribute('title', 'Document bientôt disponible');
        a.removeAttribute('download');
        a.addEventListener('click', (e) => e.preventDefault());
      });
    });
  }

  /* ---------- Année du pied de page ---------- */
  const annee = document.getElementById('annee');
  if (annee) annee.textContent = String(new Date().getFullYear());
})();
