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
- Étape 2 (validée) : socle de calcul (`src/noyau/`) — montants en cents
  exacts, dates civiles sans heure, toutes les fréquences du cahier, dates
  d'effet, suspensions et fin. Aucun nouvel écran.
- Étape 3 (validée) : cycles de paie et disponible planifié. Section « Mes paies » :
  profil de paie (4 fréquences), changements de salaire datés, paie déplacée
  ou modifiée une seule fois, seuil d'attention, aperçu avant chaque
  enregistrement et journal. Base de données en version 2 (copie de
  précaution avant la mise à niveau). Exemple fictif visible seulement dans
  l'installation d'essai.
- Étape 4 (validée fonctionnellement, version 0.4.0) : autres revenus (certains, incertains, estimés),
  dépenses fixes et enveloppes variables en deux panneaux, dépenses
  ponctuelles ; modifier à partir d'une date, suspendre, terminer, supprimer.
  Un revenu incertain reste hors du disponible. Base de données en version 3.
  Chaque version publiée porte son propre numéro (voir docs/RECONSTRUIRE.md).
- Étape 4b (version 0.4.3) : « Enregistrer » direct avec « Annuler », aperçu
  seulement quand il protège ; ajustements d'une occurrence (montant, date,
  autre paie, retrait) depuis le détail d'un cycle, sans toucher la règle ;
  changement de fréquence daté ; « Voir les paies suivantes ». Textes clairs
  de l'installateur Windows (installation, mise à jour, réinstallation) et
  version visible dans la barre latérale. Base de données en version 4.
  0.4.3 : modifier une paie est replié dans le détail du cycle et passe
  toujours par un aperçu (durées des cycles en clair) ; une paie déplacée
  affiche sa date prévue ; la première paie versée plus tôt reste affichée.
- Étape 5 (version 0.5.0) : confirmations. Statuts « À venir », « À vérifier »
  (jamais « impayé ») et « Confirmé » ; confirmer d'un clic, autrement,
  corriger, annuler ; « Tout confirmer » avec aperçu ; revenu incertain compté
  une fois reçu ; enveloppes jamais réconciliées ; aucune modification de règle
  ne fait disparaître une opération confirmée. Tableau des cycles sous « Ma
  paie », paies précédentes consultables. Base de données en version 5.
- Étape 6 (version 0.6.0) : sauvegarde locale et export. Copie du jour
  vérifiée, quelques secondes après le dernier changement et à la fermeture
  (trois journées d'utilisation) ; cinq copies de précaution ; restauration
  depuis Paramètres (copie quotidienne, de précaution ou fichier choisi
  ailleurs) avec aperçu ; export .zip (JSON, CSV pour LibreOffice Calc,
  LISEZMOI) à l'emplacement choisi. « Salaire net en vigueur » affiche
  « à partir du… » quand le premier salaire est à venir. Structure inchangée (5).
- Étape 7a (version 0.7.0) : Mes dettes, les prêts au quotidien. Un prêt se crée
  avec son nom, son versement, sa fréquence et sa prochaine échéance ; minimum,
  taux, solde et échéance finale se complètent plus tard. Le versement est une
  dépense fixe placée dans les cycles (groupe « Dettes »), confirmée comme le
  reste ; l'historique en découle (obligatoire, supplémentaire). Aucune méthode
  d'intérêts supposée : intérêts, capital et solde estimé restent « À compléter ».
  Mise à jour du solde datée (nouvelle référence, rien de réécrit), « Marquer
  comme remboursé » avec aperçu, dettes libérées. Base de données en version 6.
- Étape 7b-1 (version 0.7.1) : dans la fiche d'un prêt, les 6 prochains
  versements planifiés, la somme des versements prévus jusqu'à l'échéance
  finale (si elle est indiquée ; ni un solde ni un coût total) et ce qui manque
  pour projeter. Aucun calcul d'intérêts. Les confirmations de versements
  s'inscrivent au journal sous « Prêt « … » ». Structure inchangée (6).
- Étape 8 (version 0.8.0) : la carte Visa. Une seule carte, avec une échéance
  mensuelle à date fixe sans montant (« À compléter », jamais 0 $ ; la raison
  s'affiche sous le disponible). Le montant d'une échéance se choisit avec
  « Ajuster » (choix rapides : minimum ou solde du dernier relevé) ; des
  paiements supplémentaires ponctuels s'ajoutent depuis le groupe « Visa » d'un
  cycle. Dans Mes dettes : limite, taux, frais (fiche seulement), relevés
  recopiés tels quels et jamais modifiés, solde actuel manuel (jamais diminué
  automatiquement), utilisation datée, « Mon objectif » informatif, et le suivi
  de chaque relevé (confirmés, planifiés, ce qui resterait), sans intérêts et
  sans conclure qu'un paiement a été reçu à temps. Base de données en version 7.
- Correction 0.8.1 : une seule phrase quand l'échéance du relevé diffère de la
  date prévue (avec le montant si le paiement est prévu après) ; « ce qui
  resterait » est précisé « à la date d'échéance du relevé » ; le bandeau d'un
  paiement supplémentaire montre son montant et sa date ; un paiement
  supplémentaire non confirmé se supprime (« Annuler » le rétablit).
  Aucun calcul ni structure changés (7).

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
