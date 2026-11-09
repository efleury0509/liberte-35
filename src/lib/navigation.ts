// Les huit sections de la barre latérale, dans l'ordre du cahier (section 3).
// « etape » indique l'étape du plan où la section prend vie.

export type IdSection =
  | 'vue-ensemble'
  | 'mes-paies'
  | 'mes-dettes'
  | 'mon-epargne'
  | 'depenses-a-prevoir'
  | 'mes-objectifs'
  | 'et-si'
  | 'parametres';

export interface Section {
  id: IdSection;
  libelle: string;
  etape: string;
}

export const SECTIONS: readonly Section[] = [
  { id: 'vue-ensemble', libelle: "Vue d'ensemble", etape: '13' },
  { id: 'mes-paies', libelle: 'Mes paies', etape: '3 à 5' },
  { id: 'mes-dettes', libelle: 'Mes dettes', etape: '7 et 8' },
  { id: 'mon-epargne', libelle: 'Mon épargne', etape: '9 et A' },
  { id: 'depenses-a-prevoir', libelle: 'Dépenses à prévoir', etape: 'A' },
  { id: 'mes-objectifs', libelle: 'Mes objectifs', etape: '12' },
  { id: 'et-si', libelle: 'Et si…', etape: '17' },
  { id: 'parametres', libelle: 'Paramètres', etape: '6 et 15' },
] as const;

export const SECTION_PAR_DEFAUT: IdSection = 'vue-ensemble';

export function trouverSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
