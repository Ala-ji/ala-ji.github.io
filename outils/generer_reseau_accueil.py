"""Prépare les points de l'animation d'accueil (réseau de télésanté).

Lit data/communes-cvl-demo.geojson et écrit data/accueil-reseau.json :
  - un point par commune (centre de son contour), projeté puis ramené à une
    boîte de 0 à 1000 sur le plus grand côté, avec une classe de taille tirée
    de la population (données publiques INSEE, aucune donnée individuelle) ;
  - les pôles de santé : CHU (Tours, Orléans), préfectures, sous-préfectures.

Usage : python outils/generer_reseau_accueil.py
"""
import json
import math
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(RACINE, "data", "communes-cvl-demo.geojson")
SORTIE = os.path.join(RACINE, "data", "accueil-reseau.json")

# rang 0 : CHU (pôles d'expertise) · 1 : préfecture · 2 : sous-préfecture
POLES = {
    "Tours": 0, "Orléans": 0,
    "Bourges": 1, "Chartres": 1, "Blois": 1, "Châteauroux": 1,
    "Saint-Amand-Montrond": 2, "Vierzon": 2, "Châteaudun": 2, "Dreux": 2, "Nogent-le-Rotrou": 2,
    "Le Blanc": 2, "La Châtre": 2, "Issoudun": 2, "Chinon": 2, "Loches": 2,
    "Romorantin-Lanthenay": 2, "Vendôme": 2, "Montargis": 2, "Pithiviers": 2,
}


def centre(anneau):
    """Centre de gravité d'un anneau (formule de l'aire signée)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(anneau, anneau[1:] + anneau[:1]):
        k = x0 * y1 - x1 * y0
        a += k
        cx += (x0 + x1) * k
        cy += (y0 + y1) * k
    if abs(a) < 1e-12:
        xs, ys = zip(*anneau)
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3 * a), cy / (3 * a)


def anneau_principal(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"][0]
    # MultiPolygon : on garde le plus grand morceau
    return max((p[0] for p in geom["coordinates"]), key=len)


def classe(pop):
    return 0 if pop < 500 else 1 if pop < 2000 else 2 if pop < 10000 else 3


def main():
    data = json.load(open(SOURCE, encoding="utf-8"))
    brut = []
    for ft in data["features"]:
        lon, lat = centre(anneau_principal(ft["geometry"]))
        p = ft["properties"]
        brut.append((lon, lat, int(p.get("population") or 0), p.get("nom", "")))

    lat0 = sum(b[1] for b in brut) / len(brut)
    k = math.cos(math.radians(lat0))
    xs = [b[0] * k for b in brut]
    ys = [-b[1] for b in brut]
    x0, y0 = min(xs), min(ys)
    etendue = max(max(xs) - x0, max(ys) - y0)

    def proj(i):
        return round((xs[i] - x0) / etendue * 1000), round((ys[i] - y0) / etendue * 1000)

    points, poles = [], []
    for i, (_, _, pop, nom) in enumerate(brut):
        x, y = proj(i)
        points += [x, y, classe(pop)]
        if nom in POLES:
            poles.append([x, y, POLES[nom]])
    largeur = round((max(xs) - x0) / etendue * 1000)
    hauteur = round((max(ys) - y0) / etendue * 1000)
    manquants = set(POLES) - {b[3] for b in brut}
    assert not manquants, f"pôles introuvables : {manquants}"

    sortie = {"largeur": largeur, "hauteur": hauteur, "points": points, "poles": poles}
    with open(SORTIE, "w", encoding="utf-8") as f:
        json.dump(sortie, f, separators=(",", ":"))
    print(f"{len(brut)} communes, {len(poles)} pôles, boîte {largeur} x {hauteur} : "
          f"{SORTIE} ({os.path.getsize(SORTIE) // 1024} Ko)")


if __name__ == "__main__":
    main()
