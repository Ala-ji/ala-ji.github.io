/* ==========================================================================
   Portfolio · scripts principaux
   Thème, navigation, apparition au défilement, animation d'accueil
   (isochrones), filtres de documents, visionneuse, fichiers à venir.
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

  /* ---------- Animation d'accueil : isochrones ----------
     Quelques « cabinets » (+) et leurs axes rapides. Pour chaque point de
     l'écran, on calcule le temps d'accès au cabinet le plus rapide, puis on
     trace les courbes d'égal temps (algorithme des carrés marchants).
     Les courbes avancent lentement, comme une onde d'accessibilité. */
  function initIsochrones() {
    const canvas = document.getElementById('iso-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const hero = canvas.closest('.hero') || canvas.parentElement;

    const STEP = 56;      // écart entre deux courbes
    const PERIOD = 9000;  // durée (ms) pour qu'une courbe avance d'un cran
    const V_FAST = 2.5;   // vitesse relative sur les axes rapides
    const seed = Math.floor(Math.random() * 1e9);

    let W = 0, H = 0, cell = 10, cols = 0, rows = 0, tMax = 0;
    let field = null, cmin = null, cmax = null, sources = [];
    let running = false, raf = 0, last = 0, onScreen = true;
    const colors = { ink: '#1b2a2f', accent: '#b5401f', bg: '#f6f3ec' };

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function readColors() {
      const cs = getComputedStyle(root);
      colors.ink = cs.getPropertyValue('--ink').trim() || colors.ink;
      colors.accent = cs.getPropertyValue('--accent').trim() || colors.accent;
      colors.bg = cs.getPropertyValue('--bg').trim() || colors.bg;
    }

    function setup() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = W < 700 ? 12 : 9;
      cols = Math.ceil(W / cell) + 1;
      rows = Math.ceil(H / cell) + 1;

      // Cabinets : bien répartis, surtout à droite sur grand écran (le texte est à gauche)
      const rnd = mulberry32(seed);
      const n = Math.max(4, Math.min(9, Math.round((W * H) / 150000)));
      const wide = W > 900;
      sources = [];
      for (let i = 0; i < n; i++) {
        const left = wide && i >= n - 2;
        const x0 = left ? 0.06 : (wide ? 0.42 : 0.06);
        const x1 = left ? 0.36 : 0.95;
        let best = null, bestD = -1;
        for (let k = 0; k < 14; k++) {
          const c = { x: (x0 + rnd() * (x1 - x0)) * W, y: (0.1 + rnd() * 0.8) * H };
          const d = sources.reduce((m, s) => Math.min(m, Math.hypot(s.x - c.x, s.y - c.y)), Infinity);
          if (d > bestD) { bestD = d; best = c; }
        }
        const nRoads = 3 + Math.floor(rnd() * 2);
        const a0 = rnd() * Math.PI * 2;
        best.roads = Array.from({ length: nRoads }, (_, j) => {
          const a = a0 + j * ((Math.PI * 2) / nRoads) + (rnd() - 0.5) * 0.9;
          return { ux: Math.cos(a), uy: Math.sin(a) };
        });
        best.offset = rnd() * STEP;
        sources.push(best);
      }

      // Champ de temps (minimum sur les cabinets, axes rapides compris)
      const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28;
      field = new Float32Array(cols * rows);
      tMax = 0;
      for (let j = 0; j < rows; j++) {
        const y = j * cell;
        for (let i = 0; i < cols; i++) {
          const x = i * cell;
          let t = Infinity;
          for (const s of sources) {
            const dx = x - s.x, dy = y - s.y;
            let ts = Math.hypot(dx, dy);
            for (const r of s.roads) {
              const proj = dx * r.ux + dy * r.uy;
              if (proj > 0) {
                const tr = proj / V_FAST + Math.abs(dx * r.uy - dy * r.ux);
                if (tr < ts) ts = tr;
              }
            }
            ts += s.offset;
            if (ts < t) t = ts;
          }
          const noise = Math.sin(x * 0.012 + p1) * Math.cos(y * 0.014 + p2) * 0.6 + Math.sin((x + y) * 0.0075 + p3) * 0.4;
          t *= 1 + 0.13 * noise;
          field[j * cols + i] = t;
          if (t > tMax) tMax = t;
        }
      }

      // Min / max par cellule pour ignorer vite les cellules non traversées
      const cw = cols - 1;
      cmin = new Float32Array(cw * (rows - 1));
      cmax = new Float32Array(cw * (rows - 1));
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cw; i++) {
          const a = field[j * cols + i], b = field[j * cols + i + 1];
          const c = field[(j + 1) * cols + i + 1], d = field[(j + 1) * cols + i];
          cmin[j * cw + i] = Math.min(a, b, c, d);
          cmax[j * cw + i] = Math.max(a, b, c, d);
        }
      }
    }

    function seg(ax, ay, bx, by) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }

    // Carrés marchants : ajoute au tracé courant la courbe de niveau L
    function contour(L) {
      const cw = cols - 1;
      for (let j = 0; j < rows - 1; j++) {
        const y0 = j * cell;
        for (let i = 0; i < cw; i++) {
          const k = j * cw + i;
          if (L <= cmin[k] || L >= cmax[k]) continue;
          const tl = field[j * cols + i], tr = field[j * cols + i + 1];
          const br = field[(j + 1) * cols + i + 1], bl = field[(j + 1) * cols + i];
          const x0 = i * cell;
          const idx = (tl > L ? 8 : 0) | (tr > L ? 4 : 0) | (br > L ? 2 : 0) | (bl > L ? 1 : 0);
          const tX = x0 + (cell * (L - tl)) / (tr - tl), tY = y0;
          const rX = x0 + cell, rY = y0 + (cell * (L - tr)) / (br - tr);
          const bX = x0 + (cell * (L - bl)) / (br - bl), bY = y0 + cell;
          const lX = x0, lY = y0 + (cell * (L - tl)) / (bl - tl);
          switch (idx) {
            case 1: case 14: seg(lX, lY, bX, bY); break;
            case 2: case 13: seg(bX, bY, rX, rY); break;
            case 3: case 12: seg(lX, lY, rX, rY); break;
            case 4: case 11: seg(tX, tY, rX, rY); break;
            case 6: case 9: seg(tX, tY, bX, bY); break;
            case 7: case 8: seg(lX, lY, tX, tY); break;
            case 5: seg(lX, lY, tX, tY); seg(bX, bY, rX, rY); break;
            case 10: seg(tX, tY, rX, rY); seg(lX, lY, bX, bY); break;
            default: break;
          }
        }
      }
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const s = now / PERIOD;
      const base = Math.floor(s);
      const frac = s - base;
      const maxL = tMax * 0.92;

      // Axes rapides
      ctx.save();
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      const reach = Math.hypot(W, H);
      for (const src of sources) {
        for (const r of src.roads) seg(src.x, src.y, src.x + r.ux * reach, src.y + r.uy * reach);
      }
      ctx.stroke();
      ctx.restore();

      // Isochrones : une courbe sur trois est « maîtresse », comme sur une carte topographique
      for (let k = 0; ; k++) {
        const L = (k + frac) * STEP;
        if (L > maxL) break;
        const id = k - base;
        const major = ((id % 3) + 3) % 3 === 0;
        let a = Math.pow(1 - L / maxL, 1.25);
        if (L < STEP) a *= L / STEP;
        ctx.globalAlpha = (major ? 0.5 : 0.2) * a;
        ctx.strokeStyle = major ? colors.accent : colors.ink;
        ctx.lineWidth = major ? 1.2 : 0.8;
        ctx.beginPath();
        contour(L);
        ctx.stroke();
      }

      // Cabinets : une croix au crayon rouge sur une pastille de papier, sans halo
      ctx.lineCap = 'round';
      for (const src of sources) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.bg;
        ctx.beginPath();
        ctx.arc(src.x, src.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        seg(src.x - 5, src.y, src.x + 5, src.y);
        seg(src.x, src.y - 5, src.x, src.y + 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // environ 30 images par seconde
      last = now;
      draw(now);
    }
    function play() {
      if (running || reduceMotion.matches) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function still() { draw(PERIOD * 0.4); }

    readColors();
    setup();
    still();

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
    } else {
      play();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(); else if (onScreen) play();
    });
    document.addEventListener('themechange', () => { readColors(); if (!running) still(); });
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) { pause(); still(); } else if (onScreen) play();
      });
    }
  }
  initIsochrones();

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
