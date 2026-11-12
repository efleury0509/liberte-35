import { describe, expect, it } from 'vitest';
import { SECTIONS, SECTION_PAR_DEFAUT, TOUTES_LES_SECTIONS, trouverSection } from '../src/lib/navigation';

describe('Navigation (cahier de conception V1, section 4)', () => {
  it('déclare tous les modules prévus, dans l’ordre des maquettes', () => {
    expect(TOUTES_LES_SECTIONS.map((s) => s.libelle)).toEqual([
      'Accueil',
      'Mes paies',
      'Dépenses',
      'Épargne',
      'Dettes',
      'Objectifs',
      'Scénarios (Et si…)',
      'Rapports',
      'Paramètres',
      'Aide',
    ]);
  });

  it('n’affiche que les sections développées ; les autres restent masquées', () => {
    expect(SECTIONS.map((s) => s.libelle)).toEqual(['Accueil', 'Mes paies', 'Dépenses', 'Épargne', 'Dettes', 'Paramètres']);
    for (const id of ['mes-objectifs', 'et-si', 'rapports', 'aide']) expect(trouverSection(id)).toBeUndefined();
  });

  it('Paramètres et Aide sont en pied de barre', () => {
    expect(TOUTES_LES_SECTIONS.filter((s) => s.zone === 'pied').map((s) => s.id)).toEqual(['parametres', 'aide']);
  });

  it('a des identifiants uniques, et chaque section a son étape et son sous-titre', () => {
    const ids = TOUTES_LES_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUTES_LES_SECTIONS) {
      expect(s.etape.trim()).not.toBe('');
      expect(s.sousTitre.trim()).not.toBe('');
    }
  });

  it('ouvre l’Accueil par défaut (0.16.0)', () => {
    expect(SECTION_PAR_DEFAUT).toBe('vue-ensemble');
    expect(trouverSection(SECTION_PAR_DEFAUT)?.disponible).toBe(true);
  });

  it('ne trouve pas une section inconnue', () => {
    expect(trouverSection('registre-de-transactions')).toBeUndefined();
  });
});
