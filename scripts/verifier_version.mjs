// Vérifie le numéro de version avant de publier les installateurs
// (étape 4, cas U1 et U2). Utilisé par la fabrication sur GitHub.
//
// - Le numéro doit être identique dans package.json, tauri.conf.json et
//   Cargo.toml : sinon, échec.
// - S'il a déjà été publié (étiquette git « vX.Y.Z » sur un autre commit),
//   les installateurs ne sont PAS publiés : un installateur portant un
//   numéro déjà utilisé serait vu par Windows comme « déjà installé ».
//
// Écrit « publier=true|false » et « version=X.Y.Z » pour la suite.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const lire = (f) => readFileSync(f, 'utf8');
const versions = {
  'package.json': JSON.parse(lire('package.json')).version,
  'src-tauri/tauri.conf.json': JSON.parse(lire('src-tauri/tauri.conf.json')).version,
  'Cargo.toml': /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/.exec(lire('Cargo.toml'))?.[1],
};
const uniques = new Set(Object.values(versions));
if (uniques.size !== 1) {
  console.error('::error::Numéro de version différent d’un fichier à l’autre :', versions);
  process.exit(1);
}
const version = [...uniques][0];
const etiquette = `v${version}`;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let publier = true;
let message;
let commitEtiquette = '';
try {
  commitEtiquette = git('rev-list', '-n', '1', etiquette);
} catch {
  commitEtiquette = '';
}
const ici = git('rev-parse', 'HEAD');
if (commitEtiquette && commitEtiquette !== ici) {
  publier = false;
  message = `La version ${version} est déjà publiée. Aucun installateur n’est publié : augmenter le numéro de version pour publier.`;
  console.log(`::warning::${message}`);
} else {
  message = `Version ${version} : installateurs publiés.`;
  console.log(message);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `publier=${publier}\nversion=${version}\netiquette_existe=${commitEtiquette === ici}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Liberté 35 — version ${version}\n\n${message}\n`);
}
