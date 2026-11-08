"""Oracle indépendant : calcule des fréquences avec le calendrier de Python
(datetime), pour contre-vérifier le noyau TypeScript. Génère un fichier JSON
de cas reproductibles (graine fixe)."""
import calendar, json, random, sys
from datetime import date, timedelta

random.seed(35)

def fin_de_mois(y, m, j):
    return date(y, m, min(j, calendar.monthrange(y, m)[1]))

def plus_mois(d, n, j):
    i = d.year * 12 + d.month - 1 + n
    return fin_de_mois(i // 12, i % 12 + 1, j)

def dates(f, debut, fin):
    out = []
    if f["type"] in ("jours", "semaines"):
        pas = f["n"] * (7 if f["type"] == "semaines" else 1)
        d = date.fromisoformat(f["depart"])
        while d <= fin:
            if d >= debut: out.append(d)
            d += timedelta(pas)
    else:
        pas = f["n"] * (12 if f["type"] == "annees" else 1)
        dep = date.fromisoformat(f["depart"]); k = 0
        while True:
            d = plus_mois(dep, k * pas, dep.day)
            if d > fin: break
            if d >= debut: out.append(d)
            k += 1
    return [x.isoformat() for x in out]

def date_hasard(a, b):
    return date.fromordinal(random.randint(date(a, 1, 1).toordinal(), date(b, 12, 31).toordinal()))

cas = []
for _ in range(600):
    t = random.choice(["jours", "semaines", "mois", "annees"])
    n = random.choice({"jours": [1, 3, 10, 45], "semaines": [1, 2, 4, 10], "mois": [1, 2, 3, 6, 7], "annees": [1, 2, 5]}[t])
    dep = date_hasard(2024, 2030)
    if t in ("mois", "annees") and random.random() < 0.5:
        dep = fin_de_mois(dep.year, dep.month, random.choice([29, 30, 31]))
    debut = date_hasard(2024, 2034)
    fin = debut + timedelta(random.randint(0, 900))
    f = {"type": t, "n": n, "depart": dep.isoformat()}
    cas.append({"frequence": f, "debut": debut.isoformat(), "fin": fin.isoformat(), "attendu": dates(f, debut, fin)})

json.dump(cas, open(sys.argv[1], "w"), ensure_ascii=False, indent=0)
print(len(cas), "cas,", sum(len(c["attendu"]) for c in cas), "dates")
