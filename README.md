# Liberté 35

Outil personnel de planification financière, organisé autour des cycles de paie.
Application de bureau Windows, locale et hors ligne. Aucune connexion bancaire,
aucun serveur, aucun abonnement.

> La simplicité et la liberté d'une feuille Excel, avec juste assez
> d'automatisation pour enlever les tâches répétitives.

Les décisions fonctionnelles et techniques sont dans le document
« Liberté 35 — Audit et plan de développement » (architecture version 4)
et dans le cahier fonctionnel de référence.

## État

- Étape 1 (validée) : fondations. Les huit sections existent dans la barre
  latérale ; elles prendront vie aux étapes suivantes du plan.
- Étape 2 : socle de calcul (`src/noyau/`) — montants en cents exacts,
  dates civiles sans heure, toutes les fréquences du cahier, dates d'effet,
  suspensions et fin. Aucun nouvel écran.

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/` | Interface (Svelte + TypeScript). Ne calcule rien. |
| `src/noyau/` | Calculs purs : montants, dates, fréquences, règles. Aucun écran, aucun stockage. |
| `src/lib/textes.fr.ts` | Tous les libellés, pour ajuster le ton sans toucher au code. |
| `src/styles/jetons.css` | Apparence provisoire ; sera remplacée par la direction artistique. |
| `crates/stockage/` | Fichier SQLite, versions du schéma, journal des changements. Testé seul. |
| `src-tauri/` | Coquille de l'application de bureau, qui relie l'interface au stockage. |
| `tests/`, `e2e/` | Tests de l'interface (Vitest) et parcours dans un navigateur (Playwright). |
| `docs/` | Reconstruction à long terme et règles de sécurité. |

## Deux installations séparées

| Installation | Identifiant | Usage |
| --- | --- | --- |
| Liberté 35 Essai | `ca.liberte35.essai` | Développement et tests, données fictives seulement |
| Liberté 35 | `ca.liberte35.officiel` | Vraies données, après le lancement officiel |

Chacune a son propre dossier de données. Le stockage refuse d'ouvrir un
fichier qui appartient à l'autre installation.

## Fabrication

Chaque envoi sur la branche `main` déclenche GitHub Actions
(`.github/workflows/fabrication.yml`) : tous les tests, puis les deux
installateurs Windows, disponibles dans l'onglet Actions sous « Artifacts ».

Pour reconstruire l'application sans GitHub ni Claude, voir
[docs/RECONSTRUIRE.md](docs/RECONSTRUIRE.md).
