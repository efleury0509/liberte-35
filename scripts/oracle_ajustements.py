"""Oracle indépendant pour l'étape 4b : plans aléatoires (graine fixe) avec
ajustements d'occurrence (montant, date, autre paie, retrait, ajustements
orphelins sans effet) et changements de fréquence datés, en plus des
revenus et dépenses de l'étape 4. Calculé avec le calendrier de Python.

Usage : python3 scripts/oracle_ajustements.py tests/noyau/oracle-ajustements.json
"""
import calendar, json, random, sys
from datetime import date, timedelta

random.seed(4141)
DEBUT, FIN = date(2027, 1, 1), date(2027, 9, 30)

def clamp(y, m, j): return date(y, m, min(j, calendar.monthrange(y, m)[1]))
def plus_mois(d, n, j):
    i = d.year * 12 + d.month - 1 + n
    return clamp(i // 12, i % 12 + 1, j)
def iso(d): return d.isoformat()
def de(s): return date.fromisoformat(s)
def jour_alea(a, b): return a + timedelta(random.randint(0, (b - a).days))

def origines_profil(freq, jusqua):
    t, dep = freq["type"], de(freq["depart"])
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
        if de(x["aPartirDu"]) <= d: m = x["montant"]
    return m

def actif(el, d):
    if el["fin"] and d > de(el["fin"]): return False
    return not any(de(s["debut"]) <= d <= de(s["fin"]) for s in el["suspensions"])

def frequence_alea(nature, depart, liee_ok=True):
    choix = ["mois", "semaines"] + (["chaquePaie"] if liee_ok else []) + (["rang"] if nature == "depense" and liee_ok else [])
    s = random.choice(choix)
    if s == "mois": return {"type": "mois", "n": random.choice([1, 1, 2, 3]), "depart": iso(depart)}
    if s == "semaines": return {"type": "semaines", "n": random.choice([1, 2]), "depart": iso(depart)}
    f = {"type": "chaquePaie"} if s == "chaquePaie" else {"type": "rangPaie", "rang": random.choice([1, 2])}
    if random.random() < 0.5: f["depart"] = iso(depart)
    return f

def un_element(k, orig):
    nature = random.choice(["revenu", "depense", "depense"])
    debut = jour_alea(date(2026, 12, 1), date(2027, 5, 31))
    el = {"id": f"e{k}", "libelle": f"e{k}", "nature": nature, "genre": "fixe", "incertain": nature == "revenu" and random.random() < 0.3,
          "estimation": random.random() < 0.3, "montants": [], "suspensions": [], "fin": None, "cyclePaie": None, "changementsFrequence": []}
    sorte = random.random()
    if sorte < 0.12:
        el["frequence"] = {"type": "ponctuelle", "date": iso(jour_alea(DEBUT, FIN))}
    elif sorte < 0.2 and nature == "depense":
        o = random.choice(orig); el["frequence"] = {"type": "ponctuelle", "date": iso(o)}; el["cyclePaie"] = iso(o)
    else:
        el["frequence"] = frequence_alea(nature, debut)
        if random.random() < 0.45:
            ch = jour_alea(debut + timedelta(20), date(2027, 8, 31))
            nf = frequence_alea(nature, ch)
            nf.pop("depart", None) if nf["type"] in ("chaquePaie", "rangPaie") else None
            el["changementsFrequence"].append({"aPartirDu": iso(ch), "frequence": nf})
        if random.random() < 0.25:
            s = jour_alea(date(2027, 1, 15), date(2027, 7, 31))
            el["suspensions"].append({"debut": iso(s), "fin": iso(s + timedelta(random.randint(0, 50)))})
        if random.random() < 0.2: el["fin"] = iso(jour_alea(date(2027, 3, 1), date(2027, 9, 15)))
    if nature == "depense" and random.random() < 0.35 and el["frequence"]["type"] != "ponctuelle": el["genre"] = "enveloppe"
    if random.random() >= 0.06:
        el["montants"].append({"aPartirDu": "2026-01-01", "montant": random.randint(500, 90000)})
        if random.random() < 0.3:
            el["montants"].append({"aPartirDu": iso(jour_alea(date(2027, 2, 1), date(2027, 8, 31))), "montant": random.randint(500, 90000)})
    return el

def periodes(el):
    chs = sorted(el["changementsFrequence"], key=lambda p: p["aPartirDu"])
    out, debut, f = [], None, el["frequence"]
    for c in chs:
        out.append((f, debut, de(c["aPartirDu"]) - timedelta(1))); debut = de(c["aPartirDu"]); f = c["frequence"]
    out.append((f, debut, None))
    return out

def un_cas():
    t = random.choice(["hebdomadaire", "deuxSemaines", "deuxFoisParMois", "mensuelle"])
    dep = date(2026, 11, 1) + timedelta(random.randint(0, 80))
    if t == "mensuelle" and dep.day > 28: dep = dep.replace(day=28)
    freq = {"type": t, "depart": iso(dep)}
    if t == "deuxFoisParMois": freq["jours"] = random.choice([[15, 31], [1, 15], [10, 25]])
    salaire = [{"aPartirDu": iso(dep), "montant": random.randint(80000, 300000)}]
    orig = origines_profil(freq, FIN + timedelta(200))
    reel = {o: o for o in orig}; exceptions = []
    for i in random.sample(range(1, len(orig) - 1), k=min(3, len(orig) - 2)):
        o = orig[i]; nd = o + timedelta(random.choice([-2, -1, 1, 2]))
        if reel[orig[i - 1]] < nd < reel[orig[i + 1]]:
            reel[o] = nd; exceptions.append({"dateOrigine": iso(o), "dateReelle": iso(nd)})
    dans = [o for o in orig if DEBUT <= o <= FIN]
    elements = [un_element(k, dans) for k in range(random.randint(4, 8))]

    paies = sorted(orig, key=lambda o: reel[o])
    cycles = []
    for o in [o for o in paies if DEBUT <= reel[o] <= FIN]:
        nxt = paies[paies.index(o) + 1]
        cycles.append({"origine": o, "debut": reel[o], "fin": reel[nxt] - timedelta(1), "lignes": []})
    par_o = {c["origine"]: c for c in cycles}
    fin_periode = cycles[-1]["fin"]; fin_gen = fin_periode + timedelta(62); debut_gen = DEBUT - timedelta(62)
    premiere = reel[paies[0]]
    orig_connues = [o for o in orig if reel[o] <= fin_gen]
    rang = {o: sum(1 for x in orig_connues if (x.year, x.month) == (o.year, o.month) and x <= o) for o in orig_connues}

    def occurrences(el):
        if el["cyclePaie"]:
            o = de(el["cyclePaie"]); return [(o, None, montant_a(el["montants"], o), o)]
        out = []
        for f, p_deb, p_fin in periodes(el):
            def dans_periode(d): return (p_deb is None or d >= p_deb) and (p_fin is None or d <= p_fin)
            if f["type"] in ("chaquePaie", "rangPaie"):
                for o in orig_connues:
                    if not dans_periode(o) or ("depart" in f and o < de(f["depart"])): continue
                    if f["type"] == "rangPaie" and rang[o] != f["rang"]: continue
                    if actif(el, o): out.append((o, None, montant_a(el["montants"], o), o))
                continue
            dates = []
            if f["type"] == "ponctuelle": dates = [de(f["date"])]
            elif f["type"] == "mois":
                d0 = de(f["depart"]); k = 0
                while (d := plus_mois(d0, k * f["n"], d0.day)) <= fin_gen: dates.append(d); k += 1
            else:
                d = de(f["depart"])
                while d <= fin_gen: dates.append(d); d += timedelta(7 * f["n"])
            for d in dates:
                if d < debut_gen or d > fin_gen or not dans_periode(d) or not actif(el, d): continue
                out.append((d, d, montant_a(el["montants"], d), None))
        return out

    occ_par_el = {el["id"]: occurrences(el) for el in elements}
    # Ajustements : sur de vraies occurrences de la période, plus quelques orphelins.
    ajustements = []
    candidats = [(el, o) for el in elements for o in occ_par_el[el["id"]] if DEBUT <= o[0] <= FIN]
    for el, (origine, echeance, _, _) in random.sample(candidats, k=min(len(candidats), random.randint(0, 6))):
        a = {"elementId": el["id"], "origine": iso(origine), "montant": None, "date": None, "paieOrigine": None, "retire": False}
        genre = random.choice(["montant", "date", "paie", "retire", "mix"])
        if genre in ("montant", "mix"): a["montant"] = random.randint(100, 120000)
        if genre in ("date", "mix") and echeance is not None: a["date"] = iso(echeance + timedelta(random.choice([-9, -4, -1, 1, 3, 8, 15])))
        if genre == "paie": a["paieOrigine"] = iso(random.choice(dans))
        if genre == "retire": a["retire"] = True
        if a["montant"] is None and a["date"] is None and a["paieOrigine"] is None and not a["retire"]: a["montant"] = 1234
        if any(x["elementId"] == a["elementId"] and x["origine"] == a["origine"] for x in ajustements): continue
        ajustements.append(a)
    for _ in range(random.randint(0, 2)):
        el = random.choice(elements)
        o = jour_alea(DEBUT, FIN)
        if any(x[0] == o for x in occ_par_el[el["id"]]): continue
        ajustements.append({"elementId": el["id"], "origine": iso(o), "montant": 999, "date": None, "paieOrigine": None, "retire": False})
    adj = {(a["elementId"], a["origine"]): a for a in ajustements}

    for el in elements:
        for origine, echeance, montant, paie in occ_par_el[el["id"]]:
            a = adj.get((el["id"], iso(origine)))
            ech = de(a["date"]) if a and a["date"] and echeance is not None else echeance
            mt = a["montant"] if a and a["montant"] is not None else montant
            retire = bool(a and a["retire"])
            if a and a["paieOrigine"]: cible = par_o.get(de(a["paieOrigine"]))
            elif paie is not None: cible = par_o.get(paie)
            else:
                if ech < premiere: continue
                p = max((o for o in paies if reel[o] <= ech and reel[o] <= fin_gen), key=lambda o: reel[o])
                cible = par_o.get(p)
            if cible is None: continue
            cible["lignes"].append({"cle": f"{el['id']}|{iso(origine)}|{iso(ech) if ech else ''}|{'R' if retire else ''}", "nature": el["nature"],
                                    "compte": not el["incertain"] and not retire, "incertain": el["incertain"], "retire": retire,
                                    "estimation": el["estimation"], "montant": mt})

    def total(ms): return None if any(m is None for m in ms) else sum(ms)
    attendu = []
    for c in cycles:
        mp = montant_a(salaire, c["origine"]); comptees = [l for l in c["lignes"] if l["compte"]]
        sorties = total([l["montant"] for l in comptees if l["nature"] == "depense"])
        autres = total([l["montant"] for l in comptees if l["nature"] == "revenu"])
        revenus = None if mp is None or autres is None else mp + autres
        attendu.append({"origine": iso(c["origine"]), "lignes": sorted(l["cle"] for l in c["lignes"]), "revenus": revenus, "sorties": sorties,
                        "disponible": None if revenus is None or sorties is None else revenus - sorties,
                        "estimation": any(l["estimation"] for l in comptees),
                        "nonComptes": sum(l["montant"] for l in c["lignes"] if l["incertain"] and not l["retire"] and l["montant"] is not None)})
    return {"profil": {"frequence": freq, "montants": salaire}, "exceptions": exceptions, "elements": elements,
            "ajustements": ajustements, "attendu": attendu}

cas = [un_cas() for _ in range(300)]
json.dump(cas, open(sys.argv[1], "w"), ensure_ascii=False)
print(len(cas), "plans,", sum(len(c["attendu"]) for c in cas), "cycles,", sum(len(c["ajustements"]) for c in cas), "ajustements,",
      sum(len(e["changementsFrequence"]) for c in cas for e in c["elements"]), "changements de fréquence")
