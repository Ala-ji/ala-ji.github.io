"""Allège les images du site : convertit les originaux (PNG, JPG, TIFF…) en WebP.

Usage, depuis la racine du site :
    pip install pillow
    python outils/optimiser_images.py
        -> traite assets/originaux/ et écrit dans assets/cartes/
    python outils/optimiser_images.py --source assets/originaux/photo --cible assets/img --largeur 960 --largeur-mini 480
        -> pour une photo de portrait

Pour chaque image « Ma carte.png », le script produit :
    ma-carte.webp       grande image pour la visionneuse
    ma-carte-mini.webp  vignette pour la galerie
puis affiche le bloc HTML à coller dans la galerie de index.html.
Les originaux restent dans assets/originaux/ (ignoré par git : ils ne sont pas publiés).
"""
import argparse
import os
import re
import unicodedata

from PIL import Image, ImageOps

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def nom_web(nom):
    nom = unicodedata.normalize("NFD", nom).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", nom.lower()).strip("-") or "image"


def convertir(source, cible, largeur, qualite):
    with Image.open(source) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        if im.width > largeur:
            im = im.resize((largeur, round(im.height * largeur / im.width)), Image.LANCZOS)
        im.save(cible, "WEBP", quality=qualite, method=6)
        return im.size


def ko(chemin):
    return f"{os.path.getsize(chemin) / 1024:,.0f} Ko".replace(",", " ")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", default=os.path.join(RACINE, "assets", "originaux"))
    p.add_argument("--cible", default=os.path.join(RACINE, "assets", "cartes"))
    p.add_argument("--largeur", type=int, default=2000, help="largeur maximale de la grande image (px)")
    p.add_argument("--largeur-mini", type=int, default=800, help="largeur maximale de la vignette (px)")
    p.add_argument("--qualite", type=int, default=82)
    a = p.parse_args()

    if not os.path.isdir(a.source):
        os.makedirs(a.source, exist_ok=True)
        print(f"Dossier créé : {a.source}\nDépose-y tes exports (PNG, JPG…) puis relance le script.")
        return
    os.makedirs(a.cible, exist_ok=True)
    rel = os.path.relpath(a.cible, RACINE).replace(os.sep, "/")

    fichiers = sorted(f for f in os.listdir(a.source) if os.path.splitext(f)[1].lower() in EXTENSIONS)
    if not fichiers:
        print(f"Aucune image dans {a.source}.")
        return
    blocs = []
    for i, fichier in enumerate(fichiers, start=1):
        src = os.path.join(a.source, fichier)
        base = nom_web(os.path.splitext(fichier)[0])
        grande = os.path.join(a.cible, f"{base}.webp")
        mini = os.path.join(a.cible, f"{base}-mini.webp")
        convertir(src, grande, a.largeur, a.qualite)
        lm, hm = convertir(src, mini, a.largeur_mini, a.qualite - 4)
        print(f"{fichier} : {ko(src)} -> {ko(grande)} (vignette {ko(mini)})")
        blocs.append(
            f'<li class="gallery-item" data-reveal>\n'
            f'  <button type="button" class="gallery-btn" data-full="{rel}/{base}.webp" data-legende="Légende de la carte, source et date.">\n'
            f'    <img src="{rel}/{base}-mini.webp" alt="Description courte de la carte" width="{lm}" height="{hm}" loading="lazy">\n'
            f'    <span class="gallery-caption"><span class="gallery-num">{i:02d}</span>Titre de la carte</span>\n'
            f"  </button>\n</li>"
        )
    print("\nBlocs à coller dans la galerie de index.html (puis compléter titre, légende et texte alternatif) :\n")
    print("\n".join(blocs))


if __name__ == "__main__":
    main()
