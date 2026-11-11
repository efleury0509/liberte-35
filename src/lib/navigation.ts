// Sections de la barre latérale (cahier de conception V1, section 4).
// Toutes les sections prévues sont déclarées ici ; seules celles qui sont
// développées (`disponible`) s'affichent. Un futur module s'ajoute en passant
// `disponible` à vrai, sans refonte de la navigation.
// « etape » indique l'étape du plan où la section prend (ou a pris) vie.
import type { NomIllustration } from './illustrations';

export type IdSection =
  | 'vue-ensemble'
  | 'mes-paies'
  | 'depenses-a-prevoir'
  | 'mon-epargne'
  | 'mes-dettes'
  | 'mes-objectifs'
  | 'et-si'
  | 'rapports'
  | 'parametres'
  | 'aide';

/** Nom d'icône (voir BarreLaterale) : la navigation reste indépendante de la bibliothèque d'icônes. */
export type IconeSection = 'accueil' | 'paies' | 'depenses' | 'epargne' | 'dettes' | 'objectifs' | 'scenarios' | 'rapports' | 'parametres' | 'aide';

export interface Section {
  id: IdSection;
  libelle: string;
  sousTitre: string;
  etape: string;
  icone: IconeSection;
  zone: 'principale' | 'pied';
  disponible: boolean;
  illustration?: NomIllustration;
}

export const TOUTES_LES_SECTIONS: readonly Section[] = [
  { id: 'vue-ensemble', libelle: 'Accueil', sousTitre: 'Ta situation financière et tes quatre prochaines paies.', etape: 'C', icone: 'accueil', zone: 'principale', disponible: false, illustration: 'cafe-glace' },
  { id: 'mes-paies', libelle: 'Mes paies', sousTitre: 'Planifie, répartis et confirme tes dépenses par paie.', etape: '3 à 5', icone: 'paies', zone: 'principale', disponible: true, illustration: 'cafe-glace' },
  { id: 'depenses-a-prevoir', libelle: 'Dépenses', sousTitre: 'Tes dépenses régulières, tes enveloppes et tes dépenses à prévoir.', etape: '4, A et V1', icone: 'depenses', zone: 'principale', disponible: true, illustration: 'livres-plante' },
  { id: 'mon-epargne', libelle: 'Épargne', sousTitre: 'Tes comptes, tes réserves et ce qui reste non réservé.', etape: '9 et A', icone: 'epargne', zone: 'principale', disponible: true, illustration: 'cafe-glace' },
  { id: 'mes-dettes', libelle: 'Dettes', sousTitre: 'Tes remboursements, tes progrès et ta carte de crédit.', etape: '7 et 8', icone: 'dettes', zone: 'principale', disponible: true, illustration: 'paysage-liberte' },
  { id: 'mes-objectifs', libelle: 'Objectifs', sousTitre: 'Tes projets, tes priorités et tes récompenses.', etape: 'B', icone: 'objectifs', zone: 'principale', disponible: false, illustration: 'popcorn' },
  { id: 'et-si', libelle: 'Scénarios (Et si…)', sousTitre: 'Explore des possibilités sans toucher à tes vrais chiffres.', etape: 'à venir', icone: 'scenarios', zone: 'principale', disponible: false, illustration: 'loutre-savante' },
  { id: 'rapports', libelle: 'Rapports', sousTitre: 'Tes bilans et le portrait de ta vie financière.', etape: 'à venir', icone: 'rapports', zone: 'principale', disponible: false, illustration: 'loutre' },
  { id: 'parametres', libelle: 'Paramètres', sousTitre: 'Ton installation, ta paie et tes sauvegardes locales.', etape: '6 et 15', icone: 'parametres', zone: 'pied', disponible: true },
  { id: 'aide', libelle: 'Aide', sousTitre: 'Comment utiliser Liberté 35.', etape: 'à venir', icone: 'aide', zone: 'pied', disponible: false },
] as const;

/** Les sections développées, dans l'ordre de la barre latérale. */
export const SECTIONS: readonly Section[] = TOUTES_LES_SECTIONS.filter((s) => s.disponible);

export const SECTION_PAR_DEFAUT: IdSection = 'mes-paies';

export function trouverSection(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}
