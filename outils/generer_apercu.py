"""Génère l'image d'aperçu affichée par LinkedIn et les réseaux sociaux (1200 × 630 px).

L'image reprend la carte des temps d'accès du fichier de données de la carte :
relance ce script après avoir remplacé les données de démonstration, ou quand
ton nom et ton titre sont définitifs.

Usage, depuis la racine du site :
    pip install pillow
    python outils/generer_apercu.py --nom "Gora Ndoye" --url "ala-ji.github.io"
"""
import argparse
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L, H, S = 1200, 630, 2  # dessin à 2x puis réduction, pour des bords lissés

FOND = (15, 23, 42)  # bleu nuit, comme le thème sombre du site
CARTE_FOND = (30, 41, 59)
ENCRE = (241, 245, 249)
ENCRE_DOUCE = (203, 213, 225)
ENCRE_PALE = (148, 163, 184)
ACCENT = (45, 212, 191)  # menthe
NUL = (71, 85, 105)
FILET = (51, 65, 85)
RAMPE = [(253, 231, 200), (248, 189, 132), (238, 138, 85), (209, 84, 59), (155, 44, 44)]

POLICES = {
    "titre": ["georgiab.ttf", "Georgia Bold.ttf", "DejaVuSerif-Bold.ttf"],
    "titre_it": ["georgiaz.ttf", "Georgia Bold Italic.ttf", "DejaVuSerif-BoldItalic.ttf"],
    "italique": ["georgiai.ttf", "Georgia Italic.ttf", "DejaVuSerif-Italic.ttf"],
    "texte": ["seguisb.ttf", "segoeui.ttf", "Arial.ttf", "DejaVuSans.ttf"],
    "mono": ["consola.ttf", "Menlo.ttc", "DejaVuSansMono.ttf"],
}


def police(cle, taille):
    dossiers = [
        os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts"),
        "/Library/Fonts", "/System/Library/Fonts", "/System/Library/Fonts/Supplemental",
        "/usr/share/fonts/truetype/dejavu",
    ]
    for nom in POLICES[cle]:
        for d in dossiers:
            chemin = os.path.join(d, nom)
            if os.path.exists(chemin):
                return ImageFont.truetype(chemin, taille * S)
    try:
        return ImageFont.load_default(taille * S)
    except TypeError:
        return ImageFont.load_default()


def texte_espace(draw, xy, texte, fnt, fill, espacement):
    x, y = xy
    for c in texte:
        draw.text((x, y), c, font=fnt, fill=fill)
        x += fnt.getlength(c) + espacement * S


def couper(texte, fnt, largeur):
    lignes, ligne = [], ""
    for mot in texte.split():
        essai = f"{ligne} {mot}".strip()
        if fnt.getlength(essai) <= largeur * S or not ligne:
            ligne = essai
        else:
            lignes.append(ligne)
            ligne = mot
    if ligne:
        lignes.append(ligne)
    return lignes


def classe(v, seuils):
    if v is None:
        return -1
    for i, s in enumerate(seuils):
        if v <= s:
            return i
    return len(seuils)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--nom", default="Gora Ndoye")
    p.add_argument("--surtitre", default="GÉOGRAPHIE DE LA SANTÉ · ACCÈS AUX SOINS")
    p.add_argument("--role", default="Géographe de la santé · territoires de santé et technologies de santé")
    p.add_argument("--accroche", default="Combien de minutes jusqu’au médecin ?")
    p.add_argument("--url", default="ala-ji.github.io")
    p.add_argument("--donnees", default=os.path.join(RACINE, "data", "communes-cvl-demo.geojson"))
    p.add_argument("--champ", default="t_voiture", help="champ de temps à cartographier")
    p.add_argument("--seuils", default="5,10,15,20", help="bornes des classes, en minutes")
    p.add_argument("--sortie", default=os.path.join(RACINE, "assets", "img", "apercu-linkedin.png"))
    a = p.parse_args()
    seuils = [float(s) for s in a.seuils.split(",")]

    with open(a.donnees, encoding="utf-8") as f:
        data = json.load(f)
    demo = bool((data.get("metadata") or {}).get("demo"))

    img = Image.new("RGB", (L * S, H * S), FOND)
    calque = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dc = ImageDraw.Draw(calque)
    for x in range(0, L, 60):
        dc.line([(x * S, 0), (x * S, H * S)], fill=ENCRE + (12,), width=1)
    for y in range(0, H, 60):
        dc.line([(0, y * S), (L * S, y * S)], fill=ENCRE + (12,), width=1)
    img = Image.alpha_composite(img.convert("RGBA"), calque).convert("RGB")
    d = ImageDraw.Draw(img)

    # Carte : cadre puis communes, projetées (longitude corrigée de la latitude moyenne)
    bx0, by0, bx1, by1 = 586, 26, 1174, 604
    d.rounded_rectangle([bx0 * S, by0 * S, bx1 * S, by1 * S], radius=18 * S, fill=CARTE_FOND, outline=FILET, width=S)
    anneaux = []
    lats = []
    for ft in data["features"]:
        g = ft["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        v = ft["properties"].get(a.champ)
        c = classe(v if isinstance(v, (int, float)) else None, seuils)
        for poly in polys:
            anneaux.append((poly[0], c))
            lats.extend(pt[1] for pt in poly[0])
    k = math.cos(math.radians(sum(lats) / len(lats)))
    xs = [pt[0] * k for r, _ in anneaux for pt in r]
    ys = [-pt[1] for r, _ in anneaux for pt in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    marge = 22
    echelle = min((bx1 - bx0 - 2 * marge) / (maxx - minx), (by1 - by0 - 2 * marge) / (maxy - miny))
    ox = bx0 + (bx1 - bx0 - (maxx - minx) * echelle) / 2
    oy = by0 + (by1 - by0 - (maxy - miny) * echelle) / 2

    def proj(pt):
        return ((ox + (pt[0] * k - minx) * echelle) * S, (oy + (-pt[1] - miny) * echelle) * S)

    def aire(r):
        return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2

    for r, c in sorted(anneaux, key=lambda t: -aire(t[0])):
        couleur = NUL if c < 0 else RAMPE[c]
        d.polygon([proj(pt) for pt in r], fill=couleur, outline=CARTE_FOND)

    # Textes
    x0 = 64
    texte_espace(d, (x0 * S, 62 * S), a.surtitre, police("mono", 19), ACCENT, 2.2)
    morceaux = a.nom.rsplit(" ", 1)
    f_titre, f_titre_it = police("titre", 74), police("titre_it", 74)
    if len(morceaux) == 2:
        d.text((x0 * S, 104 * S), morceaux[0], font=f_titre, fill=ENCRE)
        d.text((x0 * S, 186 * S), morceaux[1], font=f_titre_it, fill=ACCENT)
        y = 292
    else:
        d.text((x0 * S, 104 * S), a.nom, font=f_titre, fill=ENCRE)
        y = 210
    f_role = police("texte", 23)
    for ligne in couper(a.role, f_role, 470):
        d.text((x0 * S, y * S), ligne, font=f_role, fill=ENCRE_DOUCE)
        y += 33
    y += 18
    f_acc = police("italique", 27)
    for ligne in couper(a.accroche, f_acc, 480):
        d.text((x0 * S, y * S), ligne, font=f_acc, fill=ENCRE)
        y += 38

    # Légende
    ly = 486
    f_leg = police("mono", 15)
    legende = "Temps d’accès en voiture, par commune" + (" · démonstration" if demo else "")
    d.text((x0 * S, ly * S), legende, font=f_leg, fill=ENCRE_PALE)
    for i, couleur in enumerate(RAMPE):
        d.rectangle([(x0 + i * 62) * S, (ly + 28) * S, (x0 + i * 62 + 58) * S, (ly + 40) * S], fill=couleur)
    reperes = [f"≤{int(seuils[0])}"] + [str(int(s)) for s in seuils[1:]] + [f">{int(seuils[-1])} min"]
    for i, lab in enumerate(reperes):
        d.text(((x0 + i * 62) * S, (ly + 48) * S), lab, font=f_leg, fill=ENCRE_PALE)
    d.text((x0 * S, 574 * S), a.url, font=police("mono", 20), fill=ACCENT)

    img = img.resize((L, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(a.sortie), exist_ok=True)
    img.save(a.sortie, "PNG", optimize=True)
    print(f"Aperçu enregistré : {a.sortie} ({os.path.getsize(a.sortie) // 1024} Ko)")


if __name__ == "__main__":
    main()
