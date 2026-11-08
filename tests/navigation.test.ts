import { describe, expect, it } from 'vitest';
import { SECTIONS, SECTION_PAR_DEFAUT, trouverSection } from '../src/lib/navigation';

describe('Navigation (cahier, section 3)', () => {
  it('comporte exactement les huit sections, dans l’ordre du cahier', () => {
    expect(SECTIONS.map((s) => s.libelle)).toEqual([
      "Vue d'ensemble",
      'Mes paies',
      'Mes dettes',
      'Mon épargne',
      'Dépenses à prévoir',
      'Mes objectifs',
      'Et si…',
      'Paramètres',
    ]);
  });

  it('a des identifiants uniques', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('indique pour chaque section l’étape du plan qui la construit', () => {
    for (const s of SECTIONS) {
      expect(s.etape.trim()).not.toBe('');
    }
  });

  it('ouvre la Vue d’ensemble par défaut', () => {
    expect(SECTION_PAR_DEFAUT).toBe('vue-ensemble');
    expect(trouverSection(SECTION_PAR_DEFAUT)?.libelle).toBe("Vue d'ensemble");
  });

  it('ne trouve pas une section inconnue', () => {
    expect(trouverSection('registre-de-transactions')).toBeUndefined();
  });
});
