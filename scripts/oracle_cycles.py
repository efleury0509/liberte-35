"""Oracle indépendant pour les cycles de paie (étape 3) : calcule, avec le
calendrier de Python, des plans de paie aléatoires (graine fixe) et produit
les cycles attendus : dates, éléments rattachés et disponibles."""
import calendar, json, random, sys
from datetime import date, timedelta

random.seed(353)
DEBUT, FIN = date(2027, 1, 1), date(2027, 12, 31)

def clamp(y, m, j): return date(y, m, min(j, calendar.monthrange(y, m)[1]))
def plus_mois(d, n, j):
    i = d.year * 12 + d.month - 1 + n
    return clamp(i // 12, i % 12 + 1, j)

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

def un_cas():
    t = random.choice(["hebdomadaire", "deuxSemaines", "deuxFoisParMois", "mensuelle"])
    dep = date(2026, 11, 1) + timedelta(random.randint(0, 80))
    freq = {"type": t, "depart": dep.isoformat()}
    if t == "deuxFoisParMois": freq["jours"] = random.choice([[15, 31], [1, 15], [10, 25], [5, 20]])
    if t == "mensuelle" and dep.day > 28: dep = dep.replace(day=28); freq["depart"] = dep.isoformat()
    salaire = random.randint(80000, 300000)
    montants = [{"aPartirDu": dep.isoformat(), "montant": salaire}]
    hausse = date(2027, random.randint(2, 11), random.randint(1, 28))
    montants.append({"aPartirDu": hausse.isoformat(), "montant": salaire + random.randint(1000, 20000)})
    orig = origines(freq, FIN + timedelta(70))
    # Exceptions : déplacements valides et montants modifiés
    reel = {o: o for o in orig}; exceptions = []
    for i in random.sample(range(1, len(orig) - 1), k=min(4, len(orig) - 2)):
        o = orig[i]; nd = o + timedelta(random.choice([-3, -2, -1, 1, 2, 3]))
        if reel[orig[i - 1]] < nd < reel[orig[i + 1]]:
            reel[o] = nd; exceptions.append({"dateOrigine": o.isoformat(), "dateReelle": nd.isoformat()})
    for o in random.sample(orig, k=3):
        if any(e["dateOrigine"] == o.isoformat() for e in exceptions): continue
        exceptions.append({"dateOrigine": o.isoformat(), "montant": random.randint(50000, 300000)})
    elements = []
    for k in range(random.randint(2, 5)):
        j = random.choice([1, 5, 15, 28, 30, 31])
        elements.append({"id": f"fixe{k}", "type": "fixe", "jour": j, "montant": random.randint(1000, 150000)})
    elements.append({"id": "chaque", "type": "chaquePaie", "montant": random.randint(1000, 20000)})
    elements.append({"id": "rang1", "type": "rang", "rang": 1, "montant": random.randint(1000, 50000)})
    elements.append({"id": "rang2", "type": "rang", "rang": 2, "montant": random.randint(1000, 50000)})

    rang = {}
    for o in orig:
        rang[o] = sum(1 for x in orig if (x.year, x.month) == (o.year, o.month) and x <= o)
    def montant_paie(o):
        for e in exceptions:
            if e["dateOrigine"] == o.isoformat() and "montant" in e: return e["montant"]
        m = None
        for x in montants:
            if date.fromisoformat(x["aPartirDu"]) <= o: m = x["montant"]
        return m
    paies = sorted(orig, key=lambda o: reel[o])
    dans = [o for o in paies if DEBUT <= reel[o] <= FIN]
    cycles = []
    for o in dans:
        nxt = paies[paies.index(o) + 1]
        cycles.append({"origine": o, "debut": reel[o], "fin": reel[nxt] - timedelta(1), "lignes": []})
    par_o = {c["origine"]: c for c in cycles}
    fin_periode = cycles[-1]["fin"]
    premiere = reel[paies[0]]
    for el in elements:
        if el["type"] == "fixe":
            d0 = date(2026, 1, 1); k = 0
            while (d := plus_mois(d0, k, el["jour"])) <= fin_periode:
                k += 1
                if d < DEBUT: continue
                if d < premiere: continue
                p = max((o for o in paies if reel[o] <= d), key=lambda o: reel[o])
                if p in par_o: par_o[p]["lignes"].append((el["id"], d.isoformat(), el["montant"]))
        else:
            for c in cycles:
                if el["type"] == "chaquePaie" or rang[c["origine"]] == el["rang"]:
                    c["lignes"].append((el["id"], None, el["montant"]))
    attendu = []
    for c in cycles:
        mp = montant_paie(c["origine"]); sorties = sum(m for _, _, m in c["lignes"])
        attendu.append({"origine": c["origine"].isoformat(), "debut": c["debut"].isoformat(), "fin": c["fin"].isoformat(),
                        "paie": mp, "lignes": sorted(f"{i}@{d}" if d else i for i, d, _ in c["lignes"]),
                        "disponible": None if mp is None else mp - sorties})
    return {"profil": {"frequence": freq, "montants": montants}, "exceptions": exceptions, "elements": elements, "attendu": attendu}

cas = [un_cas() for _ in range(300)]
json.dump(cas, open(sys.argv[1], "w"), ensure_ascii=False)
print(len(cas), "plans,", sum(len(c["attendu"]) for c in cas), "cycles")
