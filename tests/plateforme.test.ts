import { describe, expect, it } from 'vitest';
import { obtenirPlateforme, plateformeApercu } from '../src/lib/plateforme';
import { TEXTES } from '../src/lib/textes.fr';

describe('Plateforme', () => {
  it('utilise l’aperçu en mémoire hors de l’application installée', () => {
    expect(obtenirPlateforme()).toBe(plateformeApercu);
  });

  it('l’aperçu se présente clairement comme un aperçu, jamais comme l’installation officielle', async () => {
    const etat = await plateformeApercu.etat();
    expect(etat.profil).toBe('apercu');
    expect(etat.versionSchema).toBe(7);
  });

  it('a un libellé pour chaque type d’installation', () => {
    for (const profil of ['essai', 'officiel', 'apercu'] as const) {
      expect(TEXTES.profil[profil].length).toBeGreaterThan(0);
    }
  });
});

import { exempleAutorise } from '../src/lib/exemple';

describe('Exemple fictif (Q10)', () => {
  it('jamais dans l’installation officielle', () => {
    expect(exempleAutorise('officiel')).toBe(false);
    expect(exempleAutorise(undefined)).toBe(false);
    expect(exempleAutorise('essai')).toBe(true);
    expect(exempleAutorise('apercu')).toBe(true);
  });
});
