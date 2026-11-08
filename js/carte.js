/* ==========================================================================
   Portfolio · carte interactive du projet phare
   Carte choroplèthe Leaflet, chiffres clés et tableau, tous calculés à partir
   d'un seul fichier GeoJSON (une entité par commune, EPSG:4326).

   Pour brancher tes résultats : exporte ta couche depuis QGIS en GeoJSON,
   place-la dans data/ et indique son nom dans CONFIG.donnees. Garde les noms
   de champs ci-dessous, ou adapte CONFIG.champs et CONFIG.modes.
   ========================================================================== */
(() => {
  'use strict';

  const CONFIG = {
    donnees: 'data/communes-cvl-demo.geojson',
    champs: { code: 'code', nom: 'nom', dep: 'dep', population: 'population' },
    modes: {
      voiture: { libelle: 'voiture', champ: 't_voiture', seuils: [5, 10, 15, 20], libelleNul: 'Non calculé' },
      tc: { libelle: 'transports en commun', champ: 't_tc', seuils: [15, 30, 45, 60], libelleNul: 'Sans desserte' },
    },
    // Seuils utilisés par les chiffres clés (garde-les cohérents avec les textes du HTML)
    kpi: { voiture: 10, tc: 45 },
    couleurs: ['#fde7c8', '#f8bd84', '#ee8a55', '#d1543b', '#9b2c2c'],
    sourceParDefaut: 'Calculs : Gora Ndoye · openrouteservice, OpenTripPlanner',
    leaflet: {
      css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      cssIntegrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
      js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      jsIntegrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
    },
    // Fonds Esri « Canvas » gris clair / gris foncé, gratuits et sans clé
    // (les fonds CARTO exigent désormais une clé dès que le site est en ligne)
    fonds: {
      light: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
      dark: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
    },
    attribution: 'Fond de carte &copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  };

  const section = document.getElementById('projet');
  const mapEl = document.getElementById('carte');
  if (!section || !mapEl) return;

  const $ = (id) => document.getElementById(id);
  const NB = ' ';
  const fmt = new Intl.NumberFormat('fr-FR');
  const fmt1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    mode: 'voiture',
    data: null,
    map: null,
    layer: null,
    tiles: [],
    layers: new Map(),   // « Nom (dép.) » -> couche Leaflet
    noms: new Map(),     // nom normalisé -> clés
    colors: {},
  };

  /* ---------- Outils ---------- */
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalise = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const theme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  function valeur(props, champ) {
    const v = props[champ];
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function classe(v, seuils) {
    if (v === null) return -1;
    for (let i = 0; i < seuils.length; i++) if (v <= seuils[i]) return i;
    return seuils.length;
  }

  function libellesClasses(seuils) {
    const out = [`≤${NB}${seuils[0]}${NB}min`];
    for (let i = 1; i < seuils.length; i++) out.push(`${seuils[i - 1]}${NB}–${NB}${seuils[i]}${NB}min`);
    out.push(`>${NB}${seuils[seuils.length - 1]}${NB}min`);
    return out;
  }

  const cle = (p) => `${p[CONFIG.champs.nom]} (${p[CONFIG.champs.dep]})`;
  const population = (p) => Number(p[CONFIG.champs.population]) || 0;
  const pct = (part, tout) => (tout > 0 ? (100 * part) / tout : null);

  function lireCouleurs() {
    const cs = getComputedStyle(document.documentElement);
    state.colors = {
      nul: cs.getPropertyValue('--map-null').trim() || '#b4b8b0',
      trait: cs.getPropertyValue('--map-stroke').trim() || '#ffffff',
      encre: cs.getPropertyValue('--ink').trim() || '#1b2a2f',
    };
  }

  /* ---------- Lancement différé : rien n'est chargé avant l'approche de la section ---------- */
  let started = false;
  function lancer() {
    if (started) return;
    started = true;
    demarrer();
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); lancer(); }
    }, { rootMargin: '600px 0px' });
    io.observe(section);
  } else {
    lancer();
  }

  // Trois tentatives : une requête peut être interrompue (onglet mis en veille, réseau instable)
  async function chargerDonnees() {
    let erreur;
    for (const attente of [0, 1500, 4000]) {
      if (attente) await new Promise((r) => setTimeout(r, attente));
      try {
        const r = await fetch(CONFIG.donnees);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        erreur = e;
      }
    }
    throw erreur;
  }

  async function demarrer() {
    const leafletPret = chargerLeaflet().catch(() => null);
    let data;
    try {
      data = await chargerDonnees();
    } catch (e) {
      console.warn('Carte : les données n’ont pas pu être chargées.', e);
      message('Les données de la carte n’ont pas pu être chargées.', () => { started = false; lancer(); });
      $('viz-source').textContent = 'Données indisponibles.';
      if ($('tableau-corps')) $('tableau-corps').innerHTML = '<tr><td colspan="5">Données indisponibles.</td></tr>';
      return;
    }
    state.data = data;
    lireCouleurs();
    afficherSource();
    afficherTerritoire();
    afficherChiffresCles();
    afficherLegende();
    afficherTableau();
    preparerRecherche();

    const L = await leafletPret;
    if (!L) {
      message('La carte n’a pas pu s’afficher (connexion ?). Les chiffres restent valables.');
      return;
    }
    initialiserCarte(L);
  }

  function chargerLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = CONFIG.leaflet.css;
      css.integrity = CONFIG.leaflet.cssIntegrity;
      css.crossOrigin = '';
      // Avant notre feuille de style, pour que nos réglages l'emportent
      const notreCss = document.querySelector('link[href$="css/style.css"]');
      document.head.insertBefore(css, notreCss);
      const js = document.createElement('script');
      js.src = CONFIG.leaflet.js;
      js.integrity = CONFIG.leaflet.jsIntegrity;
      js.crossOrigin = '';
      js.async = true;
      js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet absent')));
      js.onerror = reject;
      document.head.appendChild(js);
    });
  }

  function message(texte, reessayer) {
    mapEl.innerHTML = `<div class="map-message"><p>${escapeHtml(texte)}</p></div>`;
    if (reessayer) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small btn-ghost';
      btn.textContent = 'Réessayer';
      btn.addEventListener('click', () => { message('La carte se charge…'); reessayer(); });
      mapEl.querySelector('.map-message').appendChild(btn);
    }
  }

  /* ---------- Textes calculés ---------- */
  function afficherSource() {
    const meta = state.data.metadata || {};
    $('viz-source').textContent = meta.source || CONFIG.sourceParDefaut;
    $('badge-demo').hidden = !meta.demo;
  }

  function afficherTerritoire() {
    const feats = state.data.features;
    const pop = feats.reduce((s, f) => s + population(f.properties), 0);
    document.querySelectorAll('[data-stat="communes"]').forEach((el) => { el.textContent = fmt.format(feats.length); });
    document.querySelectorAll('[data-stat="population"]').forEach((el) => {
      el.textContent = pop >= 1e6 ? `${fmt2.format(pop / 1e6)}${NB}millions` : fmt.format(pop);
    });
  }

  /* ---------- Chiffres clés (avec compteur animé) ---------- */
  function calculerChiffres() {
    const champV = CONFIG.modes.voiture.champ;
    const champT = CONFIG.modes.tc.champ;
    let pop = 0, popV = 0, sommeV = 0, popRapide = 0, popTcLoin = 0, sansTc = 0;
    for (const f of state.data.features) {
      const p = f.properties;
      const w = population(p);
      const tv = valeur(p, champV);
      const tc = valeur(p, champT);
      pop += w;
      if (tv !== null) {
        popV += w;
        sommeV += tv * w;
        if (tv <= CONFIG.kpi.voiture) popRapide += w;
      }
      if (tc === null || tc > CONFIG.kpi.tc) popTcLoin += w;
      if (tc === null) sansTc++;
    }
    return {
      pop10: pct(popRapide, pop),
      moyVoiture: popV > 0 ? sommeV / popV : null,
      popTc45: pct(popTcLoin, pop),
      sansTc,
    };
  }

  const formats = {
    pop10: (v) => `${fmt.format(Math.round(v))}${NB}%`,
    moyVoiture: (v) => `${fmt1.format(v)}${NB}min`,
    popTc45: (v) => `${fmt.format(Math.round(v))}${NB}%`,
    sansTc: (v) => fmt.format(Math.round(v)),
  };

  function animer(el, cible, format) {
    if (cible === null || cible === undefined) { el.textContent = '—'; return; }
    if (reduceMotion) { el.textContent = format(cible); return; }
    const t0 = performance.now();
    const duree = 1100;
    const pas = (now) => {
      const p = Math.min(1, (now - t0) / duree);
      el.textContent = format(cible * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }

  // Chiffres clés et tableau calculés depuis les données : facultatifs (absents de la page
  // quand la carte n'est qu'une démonstration)
  function afficherChiffresCles() {
    const bloc = $('kpis');
    if (!bloc) return;
    const chiffres = calculerChiffres();
    const go = () => {
      bloc.querySelectorAll('[data-kpi]').forEach((el) => {
        const k = el.dataset.kpi;
        animer(el, chiffres[k], formats[k] || ((v) => fmt.format(v)));
      });
    };
    if ('IntersectionObserver' in window && !reduceMotion) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); go(); }
      }, { threshold: 0.4 });
      io.observe(bloc);
    } else {
      go();
    }
  }

  /* ---------- Légende et tableau ---------- */
  function repartition() {
    const m = CONFIG.modes[state.mode];
    const n = m.seuils.length + 1;
    const lignes = Array.from({ length: n }, () => ({ communes: 0, pop: 0 }));
    const nul = { communes: 0, pop: 0 };
    let total = 0, totalPop = 0;
    for (const f of state.data.features) {
      const p = f.properties;
      const c = classe(valeur(p, m.champ), m.seuils);
      const ligne = c < 0 ? nul : lignes[c];
      ligne.communes++;
      ligne.pop += population(p);
      total++;
      totalPop += population(p);
    }
    return { m, lignes, nul, total, totalPop };
  }

  function afficherLegende() {
    const { m, nul } = repartition();
    const libelles = libellesClasses(m.seuils);
    const items = libelles.map((lib, i) => `<li><span class="swatch" style="background:${CONFIG.couleurs[i]}"></span>${lib}</li>`);
    if (nul.communes > 0) items.push(`<li><span class="swatch" style="background:${state.colors.nul}"></span>${escapeHtml(m.libelleNul)}</li>`);
    $('legende').innerHTML = `<p class="legend-title">Temps d’accès en ${escapeHtml(m.libelle)}</p><ul class="legend-list">${items.join('')}</ul>`;
  }

  function afficherTableau() {
    if (!$('tableau-corps')) return;
    const { m, lignes, nul, total, totalPop } = repartition();
    const libelles = libellesClasses(m.seuils);
    const ligne = (couleur, libelle, d) => {
      const pc = pct(d.communes, total) || 0;
      const pp = pct(d.pop, totalPop) || 0;
      return `<tr>
        <td><span class="cell-class"><span class="swatch" style="background:${couleur}"></span>${libelle}</span></td>
        <td>${fmt.format(d.communes)}</td>
        <td>${fmt1.format(pc)}${NB}%</td>
        <td>${fmt.format(d.pop)}</td>
        <td>${fmt1.format(pp)}${NB}%<span class="bar" aria-hidden="true"><span style="width:${pp.toFixed(1)}%;background:${couleur}"></span></span></td>
      </tr>`;
    };
    const rows = lignes.map((d, i) => ligne(CONFIG.couleurs[i], libelles[i], d));
    if (nul.communes > 0) rows.push(ligne(state.colors.nul, escapeHtml(m.libelleNul), nul));
    rows.push(`<tr class="row-total"><td>Total</td><td>${fmt.format(total)}</td><td>100${NB}%</td><td>${fmt.format(totalPop)}</td><td>100${NB}%</td></tr>`);
    $('tableau-corps').innerHTML = rows.join('');
    $('tableau-titre').textContent = `Répartition par classe de temps · ${m.libelle}`;
  }

  /* ---------- Changement de mode ---------- */
  const boutonsMode = [...document.querySelectorAll('.seg-btn[data-mode]')];
  boutonsMode.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!CONFIG.modes[btn.dataset.mode]) return;
      state.mode = btn.dataset.mode;
      boutonsMode.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      if (!state.data) return;
      afficherLegende();
      afficherTableau();
      if (state.layer) state.layer.setStyle(style);
    });
  });

  /* ---------- Recherche d'une commune ---------- */
  function preparerRecherche() {
    const input = $('recherche-commune');
    const liste = $('liste-communes');
    const cles = [];
    for (const f of state.data.features) {
      const p = f.properties;
      const k = cle(p);
      cles.push(k);
      const n = normalise(p[CONFIG.champs.nom]);
      if (!state.noms.has(n)) state.noms.set(n, []);
      state.noms.get(n).push({ k, pop: population(p) });
    }
    cles.sort((a, b) => a.localeCompare(b, 'fr'));
    const frag = document.createDocumentFragment();
    cles.forEach((k) => { const o = document.createElement('option'); o.value = k; frag.appendChild(o); });
    liste.appendChild(frag);

    const chercher = () => {
      const saisie = input.value.trim();
      if (!saisie || !state.map) return;
      let k = state.layers.has(saisie) ? saisie : null;
      if (!k) {
        const candidats = state.noms.get(normalise(saisie.replace(/\s*\(\d+\)\s*$/, '')));
        if (candidats) k = candidats.slice().sort((a, b) => b.pop - a.pop)[0].k;
      }
      const couche = k && state.layers.get(k);
      if (!couche) return;
      state.map.fitBounds(couche.getBounds(), { maxZoom: 11, padding: [40, 40] });
      couche.openPopup(couche.getBounds().getCenter());
    };
    input.addEventListener('change', chercher);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chercher(); } });
  }

  /* ---------- Carte Leaflet ---------- */
  function style(feature) {
    const m = CONFIG.modes[state.mode];
    const c = classe(valeur(feature.properties, m.champ), m.seuils);
    return {
      fillColor: c < 0 ? state.colors.nul : CONFIG.couleurs[c],
      fillOpacity: c < 0 ? 0.6 : 0.86,
      color: state.colors.trait,
      weight: 0.5,
      opacity: 1,
    };
  }

  function texteTemps(v, mode) {
    if (v === null) return mode === 'tc' ? 'pas de desserte exploitable' : 'non calculé';
    return `${fmt.format(Math.round(v))}${NB}min`;
  }

  function infobulle(p) {
    const m = CONFIG.modes[state.mode];
    const v = valeur(p, m.champ);
    return `<strong>${escapeHtml(p[CONFIG.champs.nom])}</strong> <span class="tt-dep">${escapeHtml(p[CONFIG.champs.dep])}</span><br>${texteTemps(v, state.mode)}${v !== null ? ` en ${escapeHtml(m.libelle)}` : ''}`;
  }

  function fenetre(p) {
    const demo = state.data.metadata && state.data.metadata.demo;
    return `<p class="popup-title">${escapeHtml(p[CONFIG.champs.nom])}</p>
      <table class="popup-table">
        <tr><th>Département</th><td>${escapeHtml(p[CONFIG.champs.dep])}</td></tr>
        <tr><th>Population</th><td>${fmt.format(population(p))}</td></tr>
        <tr><th>Voiture</th><td>${texteTemps(valeur(p, CONFIG.modes.voiture.champ), 'voiture')}</td></tr>
        <tr><th>Transports</th><td>${texteTemps(valeur(p, CONFIG.modes.tc.champ), 'tc')}</td></tr>
      </table>${demo ? '<p class="popup-note">Temps simulés (démonstration)</p>' : ''}`;
  }

  // Fonds de carte du thème courant. On recrée les couches plutôt que d'appeler setUrl :
  // setUrl redessine au niveau de zoom fractionnaire courant (7,5…) et le serveur de tuiles
  // renvoie alors une autre région du monde.
  function poserFonds(L, map) {
    state.tiles.forEach((t) => map.removeLayer(t));
    const [urlFond, urlEtiquettes] = CONFIG.fonds[theme()];
    state.tiles = [
      L.tileLayer(urlFond, { maxNativeZoom: 16, maxZoom: 19, attribution: CONFIG.attribution }).addTo(map),
      L.tileLayer(urlEtiquettes, { maxNativeZoom: 16, maxZoom: 19, pane: 'etiquettes' }).addTo(map),
    ];
  }

  function initialiserCarte(L) {
    mapEl.innerHTML = '';
    const map = L.map(mapEl, {
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: 6,
      maxZoom: 12,
      scrollWheelZoom: false,
    });
    map.createPane('etiquettes');
    map.getPane('etiquettes').style.zIndex = 650;
    map.getPane('etiquettes').style.pointerEvents = 'none';

    state.L = L;
    poserFonds(L, map);

    // Une seule commune survolée à la fois : si un « mouseout » se perd (page qui défile
    // sous la souris, réordonnancement du SVG), la précédente est refermée quand même.
    let survolee = null;
    const quitter = (couche) => {
      if (!couche) return;
      state.layer.resetStyle(couche);
      couche.closeTooltip();
      if (survolee === couche) survolee = null;
    };

    state.layer = L.geoJSON(state.data, {
      style,
      onEachFeature: (feature, couche) => {
        couche.bindTooltip(() => infobulle(feature.properties), { sticky: true, className: 'tt', direction: 'top', offset: [0, -8] });
        couche.bindPopup(() => fenetre(feature.properties), { maxWidth: 280 });
        couche.on({
          mouseover: (e) => {
            if (survolee && survolee !== e.target) quitter(survolee);
            survolee = e.target;
            e.target.setStyle({ weight: 2.2, color: state.colors.encre });
            e.target.bringToFront();
          },
          mouseout: (e) => quitter(e.target),
        });
        state.layers.set(cle(feature.properties), couche);
      },
    }).addTo(map);
    window.addEventListener('scroll', () => quitter(survolee), { passive: true });

    const limites = state.layer.getBounds();
    map.fitBounds(limites, { padding: [12, 12] });
    map.setMaxBounds(limites.pad(0.4));

    // Molette activée seulement après un clic : la page défile normalement
    map.on('click focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    mapEl.addEventListener('mouseleave', () => { map.scrollWheelZoom.disable(); quitter(survolee); });

    if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize()).observe(mapEl);
    $('recherche-commune').disabled = false;
    state.map = map;
  }

  document.addEventListener('themechange', () => {
    if (!state.data) return;
    lireCouleurs();
    afficherLegende();
    afficherTableau();
    if (state.map) {
      poserFonds(state.L, state.map);
      state.layer.setStyle(style);
    }
  });
})();
