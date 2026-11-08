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
