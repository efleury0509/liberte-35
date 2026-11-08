// Aucun secret ni donnée personnelle ne doit entrer dans le dépôt GitHub
// (décision P5 et exigence du 8 novembre). Ce test parcourt tous les
// fichiers suivis par Git et échoue s'il trouve :
// - une clé privée, un jeton Google ou GitHub, un secret client ;
// - un fichier de données de l'application (.sqlite) ou de sauvegarde.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MOTIFS: [string, RegExp][] = [
  ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jeton d’accès Google', /ya29\.[0-9A-Za-z_-]{20,}/],
  ['jeton de renouvellement Google', /\b1\/\/0[0-9A-Za-z_-]{20,}/],
  ['secret client Google', /GOCSPX-[0-9A-Za-z_-]{10,}/],
  ['clé d’API Google', /AIza[0-9A-Za-z_-]{30,}/],
  ['jeton GitHub', /\bgh[pousr]_[0-9A-Za-z]{30,}/],
];

const EXTENSIONS_INTERDITES = /\.(sqlite|sqlite3|db|l35sauvegarde)$/i;

function fichiersSuivis(): string[] {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

describe('Aucun secret dans le dépôt', () => {
  const fichiers = fichiersSuivis();

  it('aucun fichier de données ou de sauvegarde n’est suivi par Git', () => {
    expect(fichiers.filter((f) => EXTENSIONS_INTERDITES.test(f))).toEqual([]);
  });

  it('aucun motif de secret dans les fichiers suivis', () => {
    const trouves: string[] = [];
    for (const f of fichiers) {
      if (f.endsWith('.png') || f.endsWith('.ico') || f === 'package-lock.json' || f === 'Cargo.lock') continue;
      let contenu: string;
      try {
        contenu = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      for (const [nom, motif] of MOTIFS) {
        // Ce fichier-ci contient les motifs eux-mêmes, pas des secrets.
        if (f === 'tests/secrets.test.ts') continue;
        if (motif.test(contenu)) trouves.push(`${f} : ${nom}`);
      }
    }
    expect(trouves).toEqual([]);
  });

  it('le détecteur reconnaît bien un faux secret', () => {
    const faux = 'GOCSPX-' + 'x'.repeat(20);
    expect(MOTIFS.some(([, m]) => m.test(faux))).toBe(true);
  });
});
