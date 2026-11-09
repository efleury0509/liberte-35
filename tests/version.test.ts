// Numéro de version (cas U1 et U2, étape 4) : un seul numéro, identique
// partout. L'installateur, l'application et Paramètres l'affichent ; la
// fabrication refuse de publier un numéro déjà publié (voir
// scripts/verifier_version.mjs et .github/workflows/fabrication.yml).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plateformeApercu } from '../src/lib/plateforme';

const lire = (f: string) => readFileSync(f, 'utf8');
const paquet = JSON.parse(lire('package.json')).version as string;
const tauri = JSON.parse(lire('src-tauri/tauri.conf.json')).version as string;
const cargo = /\[workspace\.package\][^[]*?version\s*=\s*"([^"]+)"/.exec(lire('Cargo.toml'))?.[1];

describe('Numéro de version', () => {
  it('a la forme MAJEUR.MINEUR.CORRECTIF', () => {
    expect(paquet).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('est identique dans l’interface, l’application et l’installateur', () => {
    expect(tauri).toBe(paquet);
    expect(cargo).toBe(paquet);
  });

  it('la configuration d’essai ne le remplace pas', () => {
    expect(JSON.parse(lire('src-tauri/tauri.essai.conf.json')).version).toBeUndefined();
  });

  it('est celui de l’étape A : 0.10.0', () => {
    expect(paquet).toBe('0.10.0');
  });

  it('la fabrication vérifie le numéro avant de publier (U2)', () => {
    const fabrication = lire('.github/workflows/fabrication.yml');
    expect(fabrication).toContain('node scripts/verifier_version.mjs');
    expect(fabrication.match(/if: steps\.version\.outputs\.publier == 'true'/g)).toHaveLength(3);
    expect(fabrication).toContain('name: liberte-35-essai-${{ steps.version.outputs.version }}');
  });

  it('l’aperçu affiche le même numéro que l’application', async () => {
    expect((await plateformeApercu.etat()).versionApplication).toBe(paquet);
  });
});
