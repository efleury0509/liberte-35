// Étape 4b : textes de l'installateur Windows. Notre fichier français doit
// définir exactement les textes attendus par la version de Tauri installée
// (sinon l'installateur afficherait des textes manquants), et distinguer
// clairement mise à jour, réinstallation et version plus ancienne.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const chemin = join('src-tauri', conf.bundle.windows.nsis.customLanguageFiles.French);
const nos = readFileSync(chemin, 'utf8');
const noms = (texte: string) => [...texte.matchAll(/LangString (\w+) \$\{LANG_FRENCH\}/g)].map((m) => m[1]).sort();
const texte = (nom: string) => new RegExp(`LangString ${nom} \\$\\{LANG_FRENCH\\} "([^"]*)"`).exec(nos)?.[1] ?? '';

/** Textes français intégrés à l'outil Tauri installé (Linux ou Windows). */
function textesDeTauri(): string {
  const dossier = readdirSync('node_modules/@tauri-apps').find((d) => d.startsWith('cli-') && existsSync(join('node_modules/@tauri-apps', d)));
  if (!dossier) throw new Error('Outil Tauri introuvable');
  const fichier = readdirSync(join('node_modules/@tauri-apps', dossier)).find((f) => f.endsWith('.node'));
  const binaire = readFileSync(join('node_modules/@tauri-apps', dossier, fichier!));
  const debut = binaire.indexOf('LangString addOrReinstall ${LANG_FRENCH}');
  const fin = binaire.indexOf('\n', binaire.indexOf('deleteAppData ${LANG_FRENCH}', debut));
  return binaire.subarray(debut, fin).toString('utf8');
}

describe('Installateur Windows : textes français', () => {
  it('la configuration utilise notre fichier, en français seulement', () => {
    expect(conf.bundle.windows.nsis.languages).toEqual(['French']);
    expect(existsSync(chemin)).toBe(true);
  });

  it('définit exactement les textes attendus par la version de Tauri utilisée', () => {
    expect(noms(nos)).toEqual(noms(textesDeTauri()));
  });

  it('distingue mise à jour, réinstallation et version plus ancienne', () => {
    expect(texte('olderOrUnknownVersionInstalled')).toContain('Mise à jour');
    expect(texte('olderOrUnknownVersionInstalled')).toContain('vos données sont conservées');
    expect(texte('dontUninstall')).toContain('Mettre à jour par-dessus');
    expect(texte('alreadyInstalledLong')).toContain('n\'apporte PAS de nouvelle version');
    expect(texte('newerVersionInstalled')).toContain('version plus ancienne');
    expect(texte('deleteAppData')).toContain('définitif');
  });

  it('aucun guillemet droit dans un texte (il couperait la chaîne NSIS)', () => {
    for (const l of nos.split('\n').filter((x) => x.startsWith('LangString'))) {
      expect(l.match(/"/g)).toHaveLength(2);
    }
  });
});
