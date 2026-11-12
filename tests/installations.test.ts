// Les deux installations (essai et officielle) doivent avoir des
// identifiants distincts : sous Windows, chacune a alors son propre
// dossier de données, et les données fictives ne peuvent pas atteindre
// l'installation officielle (décision P7).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const officielle = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const essai = JSON.parse(readFileSync('src-tauri/tauri.essai.conf.json', 'utf8'));

describe('Deux installations séparées', () => {
  it('ont des identifiants différents', () => {
    expect(essai.identifier).not.toBe(officielle.identifier);
  });

  it('seule l’installation d’essai se termine par « .essai »', () => {
    expect(essai.identifier.endsWith('.essai')).toBe(true);
    expect(officielle.identifier.endsWith('.essai')).toBe(false);
  });

  it('ont des noms visibles différents', () => {
    expect(essai.productName).not.toBe(officielle.productName);
    expect(essai.productName).toContain('Essai');
  });

  it('ne fabriquent qu’un installateur NSIS, sans mise à jour automatique', () => {
    expect(officielle.bundle.targets).toEqual(['nsis']);
    expect(officielle.plugins?.updater).toBeUndefined();
  });

  it('ont la même version que le paquet', () => {
    const paquet = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(officielle.version).toBe(paquet.version);
  });
});

// 0.22.0 : une troisième installation, « Essai vierge », pour répéter la
// toute première utilisation sans jamais toucher à l'Essai habituel ni à
// l'officielle. Sous Windows, l'installateur range le programme, son
// raccourci et sa désinstallation sous son nom visible, et ses données
// sous son identifiant : les deux doivent être uniques.
const vierge = JSON.parse(readFileSync('src-tauri/tauri.essai-vierge.conf.json', 'utf8'));
const flux = readFileSync('.github/workflows/fabrication.yml', 'utf8');

describe('Essai vierge : une installation entièrement séparée', () => {
  it('a son propre identifiant (donc son propre dossier de données), traité comme un essai', () => {
    const identifiants = [officielle.identifier, essai.identifier, vierge.identifier];
    expect(new Set(identifiants).size).toBe(3);
    expect(vierge.identifier.endsWith('.essai')).toBe(true);
    // Aucun dossier de données n'en contient un autre.
    for (const a of identifiants) for (const b of identifiants) if (a !== b) expect(b.startsWith(`${a}/`)).toBe(false);
  });

  it('a son propre nom visible (programme, raccourci, désinstallation) et son propre titre', () => {
    const noms = [officielle.productName, essai.productName, vierge.productName];
    expect(new Set(noms).size).toBe(3);
    expect(vierge.productName).toContain('Essai vierge');
    expect(vierge.app.windows[0].title).toContain('données fictives');
    expect(vierge.app.windows[0].title).not.toBe(essai.app.windows[0].title);
  });

  it('n’ajoute rien d’autre : ni version propre, ni mise à jour automatique', () => {
    expect(vierge.version).toBeUndefined();
    expect(vierge.plugins).toBeUndefined();
    expect(vierge.bundle).toBeUndefined();
  });

  it('chaque installateur publié ne contient que le sien', () => {
    expect(flux).toContain('path: target/release/bundle/nsis/*Essai_*-setup.exe');
    expect(flux).toContain('path: target/release/bundle/nsis/*Essai vierge_*-setup.exe');
    expect(flux).toContain('!target/release/bundle/nsis/*Essai*-setup.exe');
    // « Essai_ » ne désigne pas « Essai vierge_ » : les deux fichiers restent distincts.
    expect(`${vierge.productName}_0.22.0_x64-setup.exe`.includes('Essai_')).toBe(false);
    expect(`${essai.productName}_0.22.0_x64-setup.exe`.includes('Essai_')).toBe(true);
  });
});
