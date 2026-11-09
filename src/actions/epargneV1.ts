// V1 lot 3 (Épargne) : compositions d'opérations existantes, sans règle
// nouvelle. « Déplacer de l'argent » choisit entre affecter, réaffecter et
// libérer ; « Nouvelle réserve » peut proposer une première affectation dans
// le même aperçu. La synthèse ne fait qu'additionner ce que montrent les comptes.
import { ErreurSaisie, type Proposition } from './paie';
import { comptesDe, etatReserves, valeurDuCompte } from './comptes';
import { proposerAffectation, proposerLiberation, proposerReaffectation, proposerReserve, type SaisieReserve } from './reserves';
import { reservesDe } from './couvertures';
import { appliquerChangements } from '../lib/appliquer';
import { formaterMontant, type Cents } from '../noyau/montants';
import type { DonneesPaie } from '../lib/plateforme';
import type { DateCivile } from '../noyau/dates';

/** Une source ou une destination : « non-reserve » ou l'identifiant d'une réserve du compte. */
export type Poche = 'non-reserve' | string;

export function proposerDeplacement(
  d: DonneesPaie,
  compteId: string,
  source: Poche,
  destination: Poche,
  s: { montant: string; date: string; note: string },
  jour: DateCivile,
): Proposition {
  if (source === '' || destination === '') throw new ErreurSaisie('Choisis d’où vient l’argent et où il va.');
  if (source === destination) throw new ErreurSaisie('Choisis une source et une destination différentes.');
  if (source === 'non-reserve') return proposerAffectation(d, compteId, destination, s, jour);
  if (destination === 'non-reserve') return proposerLiberation(d, compteId, source, s, jour);
  return proposerReaffectation(d, compteId, source, destination, s, jour);
}

/**
 * Créer une réserve et, si un montant est indiqué, y affecter une première
 * somme : un seul aperçu, un seul enregistrement, une seule annulation.
 * Sans montant, c'est exactement « Nouvelle réserve ».
 */
export function proposerReserveAvecAffectation(d: DonneesPaie, compteId: string, s: SaisieReserve, premiere: string, jour: DateCivile): Proposition {
  const creation = proposerReserve(d, compteId, s, jour);
  if (premiere.trim() === '') return creation;
  const apres = appliquerChangements(d, creation.changements);
  const compte = comptesDe(apres).find((k) => k.id === compteId)!;
  const anciens = new Set(reservesDe(comptesDe(d).find((k) => k.id === compteId)!).map((r) => r.id));
  const nouvelle = reservesDe(compte).find((r) => !anciens.has(r.id))!;
  const affectation = proposerAffectation(apres, compteId, nouvelle.id, { montant: premiere, date: jour, note: '' }, jour);
  return {
    titre: `${creation.titre}, avec une première affectation`,
    lignes: [...creation.lignes, ...affectation.lignes],
    consequences: [...creation.consequences, ...affectation.consequences],
    // L'affectation redéfinit le compte entier, réserve neuve comprise : un seul changement suffit.
    changements: affectation.changements,
    journal: [...creation.journal, ...affectation.journal],
    apercu: true,
  };
}

export interface SyntheseEpargne {
  /** Comptes ouverts dont la valeur est connue. */
  total: Cents | null;
  reserve: Cents | null;
  nonReserve: Cents | null;
  comptes: number;
  aCompleter: number;
}

/** Réservé + non réservé = total : les réserves sont des portions des comptes, jamais ajoutées en plus. */
export function syntheseEpargne(d: DonneesPaie): SyntheseEpargne {
  let total = 0;
  let reserve = 0;
  let connus = 0;
  let aCompleter = 0;
  for (const k of comptesDe(d).filter((x) => x.fermeLe === null)) {
    const v = valeurDuCompte(d, k);
    if (!v) {
      aCompleter += 1;
      continue;
    }
    connus += 1;
    total += v.montant;
    reserve += etatReserves(d, k).totalReserves;
  }
  if (connus === 0) return { total: null, reserve: null, nonReserve: null, comptes: 0, aCompleter };
  return { total, reserve, nonReserve: total - reserve, comptes: connus, aCompleter };
}

export const texteMontant = (m: Cents | null) => (m === null ? 'À compléter' : formaterMontant(m));
