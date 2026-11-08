# Portfolio · Gora Ndoye

Site personnel de Gora Ndoye, géographe de la santé : une seule page en HTML, CSS et JavaScript, sans framework ni étape de compilation, hébergée gratuitement sur GitHub Pages.

## Voir le site en local

```bash
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. Un double-clic sur `index.html` ne suffit pas : la carte a besoin d'un petit serveur pour lire ses données.

## Structure

```
index.html                       la page (textes à personnaliser : chercher « À MODIFIER »)
css/style.css                    le design (couleurs et polices en tête de fichier)
js/main.js                       thème, menu, animation d'accueil, galerie, documents
js/carte.js                      carte interactive (démonstration) du projet phare
data/communes-cvl-demo.geojson   données de démonstration de la carte (à remplacer)
assets/cartes/                   cartes de la galerie (WebP et vignettes)
assets/img/                      favicon, aperçu LinkedIn
assets/originaux/                tes exports en pleine résolution (non publiés)
docs/                            PDF : CV, rapports, note méthodologique, mémoires, procès-verbal
outils/                          scripts Python : images allégées, aperçu LinkedIn
```

## Personnaliser

1. Ouvre `index.html` et cherche `À MODIFIER` : nom, titre, présentation, compétences, parcours, contact.
2. Dépose dans `docs/` les PDF à publier, sous ces noms : `cv.pdf`, `creuse-sante-mobilite.pdf`, `teleconsultation-saint-etienne.pdf`, `pollution-vieillissement-lyon.pdf`, `verderet-changement-climatique.pdf`, `note-methodologique.pdf`, `memoire-m1-urps-ml.pdf`, `memoire-m2-version-publique.pdf`, `pv-soutenance-m1.pdf`, `pv-soutenance-m2.pdf`, et les attestations de formation `certificat-openlearn-m150.pdf`, `certificat-openlearn-k102.pdf`, `certificat-oms-sante-digitale.pdf`. Les boutons s'activent tout seuls ; tant qu'un fichier manque, son bouton reste grisé avec la mention « bientôt ». Les PDF laissés à la racine du dossier ne sont jamais publiés (règle dans `.gitignore`) : c'est là que restent les originaux privés (procès-verbal signé, mémoire complet). Seules leurs versions publiques vont dans `docs/` : les procès-verbaux sans signatures, numéro étudiant ni date de naissance, le mémoire de M2 sans les cartes ni les listes qui localisent des assurés.

## Brancher tes résultats sur la carte

Les chiffres du bloc « Résultats de l'étude » sont écrits directement dans `index.html`, d'après la note méthodologique. La carte interactive, elle, est calculée à partir d'un seul fichier GeoJSON, une entité par commune :

| Champ        | Contenu                                                        |
|--------------|----------------------------------------------------------------|
| `code`       | code INSEE                                                     |
| `nom`        | nom de la commune                                              |
| `dep`        | numéro du département                                          |
| `population` | population de la commune                                       |
| `t_voiture`  | minutes jusqu'au cabinet le plus rapide, en voiture            |
| `t_tc`       | minutes en transports en commun (vide si aucune desserte)      |

Dans QGIS : clic droit sur la couche → *Exporter* → *Sauvegarder les entités sous…* → format **GeoJSON**, SCR **EPSG:4326**, option `COORDINATE_PRECISION` = 5. Au-delà de 3 Mo, simplifie d'abord les géométries (*Vecteur → Outils de géométrie → Simplifier*, tolérance d'environ 0,0005°). Indique ensuite le nom du fichier dans `js/carte.js` (`CONFIG.donnees`). Les seuils des classes se règlent au même endroit.

La mention « Données de démonstration » disparaît d'elle-même : elle ne s'affiche que si le fichier contient `"metadata": {"demo": true}`.

**Confidentialité.** Le site est public. N'y publie que des résultats agrégés (commune, IRIS…), jamais de données individuelles ni de trajets partant d'un domicile. Masque les effectifs inférieurs à 11 (secret statistique) et vérifie avec ta structure que les résultats peuvent être diffusés. Pour la version publique, calculer les temps depuis chaque commune plutôt que depuis les patients donne une carte complète sans aucune donnée personnelle.

## Images allégées

```bash
pip install pillow
python outils/optimiser_images.py
```

Dépose tes exports QGIS (PNG, JPG…) dans `assets/originaux/`. Pour chaque carte, le script crée dans `assets/cartes/` une version WebP pour la visionneuse et une vignette pour la galerie, puis affiche le code HTML à coller dans `index.html`. Les originaux ne sont jamais publiés (dossier ignoré par git).

Pour la photo de portrait :

```bash
python outils/optimiser_images.py --source assets/originaux/photo --cible assets/img --largeur 960 --largeur-mini 480
```

puis ajoute dans la section « À propos » de `index.html` une figure `<img src="assets/img/portrait.webp" alt="Portrait de Gora Ndoye">` (l’emplacement est signalé par un commentaire « À MODIFIER »).

## Aperçu LinkedIn

```bash
python outils/generer_apercu.py --nom "Gora Ndoye" --url "ala-ji.github.io"
```

Le script régénère `assets/img/apercu-linkedin.png` (1200 × 630 px) à partir des données de la carte : relance-le après avoir branché tes résultats. Une fois le site en ligne, vérifie le rendu avec le [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/).

## Mise en ligne sur GitHub Pages

1. Sur GitHub, crée un dépôt public nommé exactement `ala-ji.github.io`.
2. Envoie le dossier (une fenêtre de connexion GitHub s'ouvre au premier envoi) :

   ```bash
   git add .
   git commit -m "Premier jet du portfolio"
   git remote add origin https://github.com/Ala-ji/ala-ji.github.io.git
   git push -u origin main
   ```

3. Dans le dépôt : *Settings → Pages → Source : Deploy from a branch*, branche `main`, dossier `/ (root)`. Le site est en ligne quelques minutes plus tard à l'adresse `https://ala-ji.github.io`.

## Crédits

Fond de carte © Esri, HERE, Garmin, contributeurs OpenStreetMap. Contours communaux : IGN Admin Express (via API Géo). Population : INSEE. Carte web : [Leaflet](https://leafletjs.com) (licence BSD-2). Polices : Fraunces et Inter (SIL Open Font License).
