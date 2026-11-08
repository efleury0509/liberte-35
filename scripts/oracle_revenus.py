"""Oracle indépendant pour l'étape 4 : calcule, avec le calendrier de Python,
des plans aléatoires (graine fixe) avec autres revenus (certains, incertains,
estimés, sans montant), dépenses fixes, enveloppes, dépenses ponctuelles
(datées ou rattachées à un cycle), suspensions et fins. Produit les cycles
attendus : lignes, revenus, sorties, disponible, estimation, non compté.

Usage : python3 scripts/oracle_revenus.py tests/noyau/oracle-revenus.json
"""
import calendar, json, random, sys
from datetime import date, timedelta

random.seed(404)
DEBUT, FIN = date(2027, 1, 1), date(2027, 9, 30)

def clamp(y, m, j): return date(y, m, min(j, calendar.monthrange(y, m)[1]))
def plus_mois(d, n, j):
    i = d.year * 12 + d.month - 1 + n
    return clamp(i // 12, i % 12 + 1, j)
def iso(d): return d.isoformat()
def jour_alea(a, b): return a + timedelta(random.randint(0, (b - a).days))

def origines(freq, jusqua):
    t, dep = freq["type"], date.fromisoformat(freq["depart"])
    out = []
    if t in ("hebdomadaire", "deuxSemaines"):
        d = dep
        while d <= jusqua: out.append(d); d += timedelta(7 if t == "hebdomadaire" else 14)
    elif t == "mensuelle":
        k = 0
        while (d := plus_mois(dep, k, dep.day)) <= jusqua: out.append(d); k += 1
    else:
        j1, j2 = freq["jours"]; y, m = dep.year, dep.month
        while date(y, m, 1) <= jusqua:
            for j in (j1, j2):
                d = clamp(y, m, j)
                if dep <= d <= jusqua: out.append(d)
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out

def montant_a(montants, d):
    m = None
    for x in sorted(montants, key=lambda x: x["aPartirDu"]):
        if date.fromisoformat(x["aPartirDu"]) <= d: m = x["montant"]
    return m

def actif(el, d):
    if el["fin"] and d > date.fromisoformat(el["fin"]): return False
    return not any(date.fromisoformat(s["debut"]) <= d <= date.fromisoformat(s["fin"]) for s in el["suspensions"])

def un_element(k, orig):
    nature = random.choice(["revenu", "depense", "depense"])
    sorte = random.choice(["mois", "semaines", "ponctuelle", "chaquePaie"] + (["rang", "cycle"] if nature == "depense" else []))
    debut = jour_alea(date(2026, 12, 1), date(2027, 6, 30))
    el = {"id": f"e{k}", "libelle": f"e{k}", "nature": nature, "genre": "fixe", "incertain": False,
          "estimation": random.random() < 0.3, "montants": [], "suspensions": [], "fin": None, "cyclePaie": None}
    if nature == "revenu": el["incertain"] = random.random() < 0.3
    if sorte == "mois":
        el["frequence"] = {"type": "mois", "n": random.choice([1, 1, 2, 3, 6]), "depart": iso(debut)}
    elif sorte == "semaines":
        el["frequence"] = {"type": "semaines", "n": random.choice([1, 2]), "depart": iso(debut)}
    elif sorte == "ponctuelle":
        el["frequence"] = {"type": "ponctuelle", "date": iso(jour_alea(DEBUT, FIN))}
    elif sorte == "chaquePaie":
        el["frequence"] = {"type": "chaquePaie"}
    elif sorte == "rang":
        el["frequence"] = {"type": "rangPaie", "rang": random.choice([1, 2])}; el["genre"] = "enveloppe"
    else:
        o = random.choice(orig); el["frequence"] = {"type": "ponctuelle", "date": iso(o)}; el["cyclePaie"] = iso(o)
    if nature == "depense" and sorte in ("chaquePaie", "mois", "semaines") and random.random() < 0.4: el["genre"] = "enveloppe"
    # Montants : parfois aucun (à compléter), parfois un changement daté.
    if random.random() >= 0.08:
        base = date(2026, 1, 1) if sorte in ("chaquePaie", "rang", "cycle") else date.fromisoformat(el["frequence"].get("depart") or el["frequence"]["date"])
        el["montants"].append({"aPartirDu": iso(base), "montant": random.randint(500, 90000)})
        if random.random() < 0.3:
            el["montants"].append({"aPartirDu": iso(jour_alea(date(2027, 2, 1), date(2027, 8, 31))), "montant": random.randint(500, 90000)})
    if sorte not in ("ponctuelle", "cycle"):
        if random.random() < 0.3:
            s = jour_alea(date(2027, 1, 15), date(2027, 7, 31))
            el["suspensions"].append({"debut": iso(s), "fin": iso(s + timedelta(random.randint(0, 60)))})
        if random.random() < 0.25: el["fin"] = iso(jour_alea(date(2027, 3, 1), date(2027, 9, 15)))
    return el

def un_cas():
    t = random.choice(["hebdomadaire", "deuxSemaines", "deuxFoisParMois", "mensuelle"])
    dep = date(2026, 11, 1) + timedelta(random.randint(0, 80))
    if t == "mensuelle" and dep.day > 28: dep = dep.replace(day=28)
    freq = {"type": t, "depart": iso(dep)}
    if t == "deuxFoisParMois": freq["jours"] = random.choice([[15, 31], [1, 15], [10, 25]])
    salaire = [{"aPartirDu": iso(dep), "montant": random.randint(80000, 300000)}]
    orig = origines(freq, FIN + timedelta(70))
    reel = {o: o for o in orig}; exceptions = []
    for i in random.sample(range(1, len(orig) - 1), k=min(3, len(orig) - 2)):
        o = orig[i]; nd = o + timedelta(random.choice([-3, -2, -1, 1, 2, 3]))
        if reel[orig[i - 1]] < nd < reel[orig[i + 1]]:
            reel[o] = nd; exceptions.append({"dateOrigine": iso(o), "dateReelle": iso(nd)})
    dans_periode = [o for o in orig if DEBUT <= o <= FIN]
    elements = [un_element(k, dans_periode) for k in range(random.randint(4, 9))]

    rang = {o: sum(1 for x in orig if (x.year, x.month) == (o.year, o.month) and x <= o) for o in orig}
    paies = sorted(orig, key=lambda o: reel[o])
    cycles = []
    for o in [o for o in paies if DEBUT <= reel[o] <= FIN]:
        nxt = paies[paies.index(o) + 1]
        cycles.append({"origine": o, "debut": reel[o], "fin": reel[nxt] - timedelta(1), "lignes": []})
    par_o = {c["origine"]: c for c in cycles}
    fin_periode = cycles[-1]["fin"]; premiere = reel[paies[0]]

    def ajoute(c, el, d, montant):
        c["lignes"].append({"cle": f"{el['id']}@{iso(d)}" if d else el["id"], "nature": el["nature"],
                            "compte": not el["incertain"], "estimation": el["estimation"], "montant": montant})
    for el in elements:
        f = el["frequence"]
        if el["cyclePaie"]:
            o = date.fromisoformat(el["cyclePaie"])
            if o in par_o: ajoute(par_o[o], el, None, montant_a(el["montants"], o))
            continue
        if f["type"] in ("chaquePaie", "rangPaie"):
            for c in cycles:
                o = c["origine"]
                if f["type"] == "rangPaie" and rang[o] != f["rang"]: continue
                if actif(el, o): ajoute(c, el, None, montant_a(el["montants"], o))
            continue
        dates = []
        if f["type"] == "ponctuelle":
            dates = [date.fromisoformat(f["date"])]
        elif f["type"] == "mois":
            d0 = date.fromisoformat(f["depart"]); k = 0
            while (d := plus_mois(d0, k * f["n"], d0.day)) <= fin_periode: dates.append(d); k += 1
        else:
            d = date.fromisoformat(f["depart"])
            while d <= fin_periode: dates.append(d); d += timedelta(7 * f["n"])
        for d in dates:
            if d < DEBUT or d > fin_periode or d < premiere or not actif(el, d): continue
            p = max((o for o in paies if reel[o] <= d), key=lambda o: reel[o])
            if p in par_o: ajoute(par_o[p], el, d, montant_a(el["montants"], d))

    def total(ms): return None if any(m is None for m in ms) else sum(ms)
    attendu = []
    for c in cycles:
        mp = montant_a(salaire, c["origine"]); comptees = [l for l in c["lignes"] if l["compte"]]
        sorties = total([l["montant"] for l in comptees if l["nature"] == "depense"])
        autres = total([l["montant"] for l in comptees if l["nature"] == "revenu"])
        revenus = None if mp is None or autres is None else mp + autres
        attendu.append({"origine": iso(c["origine"]), "lignes": sorted(l["cle"] for l in c["lignes"]),
                        "revenus": revenus, "sorties": sorties,
                        "disponible": None if revenus is None or sorties is None else revenus - sorties,
                        "estimation": any(l["estimation"] for l in comptees),
                        "nonComptes": sum(l["montant"] for l in c["lignes"] if not l["compte"] and l["montant"] is not None)})
    return {"profil": {"frequence": freq, "montants": salaire}, "exceptions": exceptions, "elements": elements, "attendu": attendu}

cas = [un_cas() for _ in range(300)]
json.dump(cas, open(sys.argv[1], "w"), ensure_ascii=False)
print(len(cas), "plans,", sum(len(c["attendu"]) for c in cas), "cycles,", sum(len(c["elements"]) for c in cas), "éléments")
