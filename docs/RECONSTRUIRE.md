# Reconstruire Liberté 35 à long terme

Ce document permet à n'importe quelle personne à l'aise avec un ordinateur
de refabriquer l'application à partir de ce code, sans Claude. Toutes les
versions d'outils sont figées dans le dépôt, pour obtenir le même résultat
dans plusieurs années.

## Où sont les versions figées

| Outil | Fichier | Version |
| --- | --- | --- |
| Rust | `rust-toolchain.toml` | 1.97.0 |
| Bibliothèques Rust | `Cargo.lock` | toutes fixées |
| Node.js | `package.json` (`engines`) | 22 ou plus récent |
| Bibliothèques JavaScript | `package-lock.json` | toutes fixées |

## Option A — GitHub Actions (le plus simple)

1. Ouvrir le dépôt sur github.com, onglet **Actions**.
2. Choisir **Fabrication**, puis **Run workflow** sur la branche `main`.
3. À la fin (environ 15 à 25 minutes), ouvrir l'exécution : les installateurs
   sont dans **Artifacts** (`liberte-35-officiel-X.Y.Z`, `liberte-35-essai-X.Y.Z`).

### Numéro de version

Chaque version publiée porte un numéro unique, identique dans `package.json`,
`src-tauri/tauri.conf.json` et `Cargo.toml` (section `[workspace.package]`).
Pour publier une nouvelle version, augmenter ce numéro dans les trois fichiers.
Si le numéro n'a pas changé depuis la dernière publication (étiquette git
`vX.Y.Z`), la fabrication vérifie et compile tout, mais ne publie aucun
installateur : Windows verrait sinon un « même numéro, déjà installé » et la
mise à jour par-dessus ne se ferait pas proprement.

Une nouvelle version s'installe par-dessus l'ancienne, sans désinstaller ;
le fichier de données est mis à niveau après une copie de précaution.

Les textes français de l'installateur sont dans `src-tauri/windows/French.nsh`.
Un test (`tests/installateur.test.ts`) vérifie qu'ils couvrent exactement les
textes attendus par la version de Tauri utilisée : après une mise à jour de
Tauri, ce test signale tout texte ajouté ou retiré.

## Option B — Sur un ordinateur Windows, sans GitHub

À faire une seule fois :

1. Installer **Node.js 22** (nodejs.org, version LTS).
2. Installer **Rust** avec `rustup` (rustup.rs). La bonne version sera
   choisie automatiquement grâce à `rust-toolchain.toml`.
3. Installer les **Microsoft C++ Build Tools** (gratuits) avec la charge de
   travail « Développement Desktop en C++ ».
4. WebView2 est déjà présent sur Windows 10 et 11.

Puis, dans un terminal ouvert dans le dossier du projet :

```
npm ci
npm test
cargo test -p l35-stockage --locked
npm run fabriquer:officielle
```

L'installateur se trouve dans `target\release\bundle\nsis\`.
`npm run fabriquer:essai` fabrique la version d'essai.

## Si un outil a disparu

- Les données ne dépendent pas de l'application : le fichier
  `liberte-35.sqlite` est au format SQLite, ouvert et documenté, lisible par
  de nombreux logiciels gratuits (par exemple « DB Browser for SQLite »).
- Le fichier se trouve dans `%APPDATA%\ca.liberte35.officiel\`.
- Copies automatiques (étape 6) : `copies\jour-AAAA-MM-JJ.sqlite` (trois
  journées d'utilisation) et `precaution\avant-….sqlite` (cinq au plus), à
  côté du fichier de données. Ce sont des fichiers SQLite complets : une
  copie peut être ouverte telle quelle, ou restaurée depuis Paramètres.
- Export portable (Paramètres → « Exporter mes données… ») : un .zip avec
  `donnees.json` (toutes les tables, montants en cents), un CSV par type
  (UTF-8, point-virgule, virgule décimale, dates AAAA-MM-JJ) et un
  `LISEZMOI.txt` qui décrit chaque colonne. Il ne se réimporte pas.
