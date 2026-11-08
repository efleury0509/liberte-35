// Contre-vérification : 600 situations tirées au hasard (graine fixe),
// calculées indépendamment par le calendrier de Python
// (scripts/oracle_frequences.py). Le noyau doit trouver exactement les mêmes dates.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dateCivile } from '../../src/noyau/dates';
import { datesDe, type Frequence } from '../../src/noyau/frequences';

interface Cas {
  frequence: { type: 'jours' | 'semaines' | 'mois' | 'annees'; n: number; depart: string };
  debut: string;
  fin: string;
  attendu: string[];
}

const cas: Cas[] = JSON.parse(readFileSync('tests/noyau/oracle-frequences.json', 'utf8'));

describe('Contre-vérification par un calendrier indépendant', () => {
  it('600 situations identiques au calendrier de Python', () => {
    expect(cas).toHaveLength(600);
    const ecarts = cas.filter((c) => {
      const f = { ...c.frequence, depart: dateCivile(c.frequence.depart) } as Frequence;
      const obtenu = datesDe(f, dateCivile(c.debut), dateCivile(c.fin));
      return JSON.stringify(obtenu) !== JSON.stringify(c.attendu);
    });
    expect(ecarts).toEqual([]);
  });
});
