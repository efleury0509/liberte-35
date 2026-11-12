// Vérifie que rien dans le code de l'interface ne va chercher une
// ressource sur Internet (polices, images, scripts) : l'application doit
// fonctionner entièrement hors ligne (cahier 2, décision P6).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

describe('Fonctionnement hors ligne', () => {
  it('aucune adresse Internet dans le code de l’interface', () => {
    // Les images sont des données, pas du code : la loutre de bienvenue porte
    // ses métadonnées d'origine (adresses jamais contactées), gardées telles quelles.
    const sources = [...fichiers('src'), 'index.html'].filter((f) => !/\.(png|jpe?g|webp)$/i.test(f));
    const fautifs = sources.filter((f) => /https?:\/\//.test(readFileSync(f, 'utf8')));
    expect(fautifs).toEqual([]);
  });

  it('la politique de sécurité de l’application n’autorise aucun domaine extérieur', () => {
    const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
    const csp: string = conf.app.security.csp;
    const sansIpc = csp.replace('http://ipc.localhost', '');
    expect(sansIpc).not.toMatch(/https?:/);
  });
});
