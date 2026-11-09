// Application d'une liste de changements à des données de paie, en mémoire.
// Mêmes règles que le stockage (crates/stockage/src/paie.rs) : tout ou rien,
// une erreur est un texte prêt à afficher. Sert à l'aperçu dans un navigateur,
// au calcul des conséquences avant d'enregistrer et à « Annuler » (étape 4b).

import type { CarteStocke, ChangementPaie, DonneesPaie } from './plateforme';

export const donneesVides = (): DonneesPaie => ({
  profil: null,
  salaires: [],
  exceptions: [],
  seuil: null,
  elements: [],
  ajustements: [],
  confirmations: [],
  prets: [],
  cartes: [],
});

// Copie par sérialisation, comme le pont Tauri : les objets réactifs de
// l'interface ne peuvent pas être copiés autrement.
export const cloner = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const memeOccurrence = (a: { elementId: string | null; origine: string }, b: { elementId: string | null; origine: string }) =>
  a.elementId === b.elementId && a.origine === b.origine;

const parDate = <T>(cle: (x: T) => string) => (a: T, b: T) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0);

function appliquerUn(d: DonneesPaie, c: ChangementPaie): void {
  const refus = (m: string) => {
    throw `${m} Rien n’a été enregistré.`;
  };
  switch (c.type) {
    case 'definirProfil':
      d.profil = c.profil;
      break;
    case 'definirSalaire':
      if (c.salaire.montant < 0) refus('Un salaire ne peut pas être négatif.');
      d.salaires = [...d.salaires.filter((s) => s.aPartirDu !== c.salaire.aPartirDu), c.salaire].sort(parDate((s) => s.aPartirDu));
      break;
    case 'retirerSalaire':
      d.salaires = d.salaires.filter((s) => s.aPartirDu !== c.aPartirDu);
      break;
    case 'definirException':
      d.exceptions = [...d.exceptions.filter((e) => e.dateOrigine !== c.exception.dateOrigine), c.exception].sort(parDate((e) => e.dateOrigine));
      break;
    case 'retirerException':
      d.exceptions = d.exceptions.filter((e) => e.dateOrigine !== c.dateOrigine);
      break;
    case 'definirSeuil':
      d.seuil = c.seuil;
      break;
    case 'definirElement': {
      if (c.element.libelle.trim() === '') refus('Un revenu ou une dépense doit avoir un nom.');
      if (c.element.montants.some((m) => m.montant < 0)) refus('Un montant ne peut pas être négatif.');
      const element = { ...c.element, changementsFrequence: [...(c.element.changementsFrequence ?? [])].sort(parDate((p) => p.aPartirDu)) };
      const i = d.elements.findIndex((e) => e.id === element.id);
      // Remplacement sur place : l'élément garde sa place ; ses ajustements restent.
      if (i >= 0) d.elements[i] = element;
      else d.elements.push(element);
      break;
    }
    case 'supprimerElement':
      if (d.confirmations.some((f) => f.elementId === c.id)) {
        refus('Ce revenu ou cette dépense a des opérations confirmées : termine-le plutôt que de le supprimer.');
      }
      if (d.prets.some((p) => p.id === c.id)) refus('Ce versement appartient à un prêt : supprime le prêt depuis Mes dettes.');
      if (d.cartes.some((k) => k.id === c.id || k.supplements.includes(c.id))) refus('Ce paiement appartient à la carte : gère-le depuis Mes dettes.');
      d.elements = d.elements.filter((e) => e.id !== c.id);
      d.ajustements = d.ajustements.filter((a) => a.elementId !== c.id);
      break;
    case 'definirAjustement': {
      const a = c.ajustement;
      if (!d.elements.some((e) => e.id === a.elementId)) refus('Ce revenu ou cette dépense n’existe plus.');
      if (a.montant !== null && a.montant < 0) refus('Un montant ne peut pas être négatif.');
      if (a.montant === null && a.date === null && a.paieOrigine === null && !a.retire) refus('Un ajustement doit changer quelque chose.');
      d.ajustements = [...d.ajustements.filter((x) => !(x.elementId === a.elementId && x.origine === a.origine)), a].sort(
        parDate((x) => `${x.elementId}|${x.origine}`),
      );
      break;
    }
    case 'retirerAjustement':
      d.ajustements = d.ajustements.filter((x) => !(x.elementId === c.elementId && x.origine === c.origine));
      break;
    case 'definirConfirmation': {
      const f = c.confirmation;
      if (f.elementId !== null && !d.elements.some((e) => e.id === f.elementId)) refus('Ce revenu ou cette dépense n’existe plus.');
      if (f.montant < 0) refus('Un montant confirmé ne peut pas être négatif.');
      d.confirmations = [...d.confirmations.filter((x) => !memeOccurrence(x, f)), f].sort(parDate((x) => `${x.elementId ?? ''}|${x.origine}`));
      break;
    }
    case 'retirerConfirmation':
      d.confirmations = d.confirmations.filter((x) => !memeOccurrence(x, c));
      break;
    case 'definirPret': {
      const p = c.pret;
      const e = d.elements.find((x) => x.id === p.id);
      if (!e) refus('Le versement de ce prêt n’existe pas.');
      if (e && (e.nature !== 'depense' || e.genre !== 'fixe')) refus('Le versement d’un prêt doit être une dépense fixe.');
      if (p.minimum !== null && p.minimum < 0) refus('Le minimum d’un prêt ne peut pas être négatif.');
      if (p.taux !== null && !/^\d+(\.\d{1,3})?$/.test(p.taux)) refus(`Taux invalide : « ${p.taux} » (par exemple 9.90).`);
      if (p.soldes.some((x) => x.montant < 0)) refus('Un solde ne peut pas être négatif.');
      if (new Set(p.soldes.map((x) => x.date)).size !== p.soldes.length) refus('Deux soldes à la même date.');
      const pret = { ...p, soldes: [...p.soldes].sort(parDate((x) => x.date)) };
      const i = d.prets.findIndex((x) => x.id === p.id);
      if (i >= 0) d.prets[i] = pret;
      else d.prets = [...d.prets, pret].sort(parDate((x) => x.id));
      break;
    }
    case 'definirCarte': {
      const k = c.carte;
      const fixe = (id: string) => d.elements.some((e) => e.id === id && e.nature === 'depense' && e.genre === 'fixe');
      if (!fixe(k.id)) refus('L’échéance de la carte doit être une dépense fixe existante.');
      if (k.supplements.some((s) => !fixe(s) || s === k.id) || new Set(k.supplements).size !== k.supplements.length) {
        refus('Paiement supplémentaire invalide.');
      }
      if (d.cartes.some((x) => x.id !== k.id)) refus('Une seule carte pour l’instant.');
      if (k.limite !== null && k.limite < 0) refus('La limite d’une carte ne peut pas être négative.');
      if (k.taux !== null && !/^\d+(\.\d{1,3})?$/.test(k.taux)) refus(`Taux invalide : « ${k.taux} » (par exemple 20.99).`);
      if (new Set(k.releves.map((r) => r.date)).size !== k.releves.length) refus('Deux relevés à la même date.');
      if (new Set(k.soldes.map((r) => r.date)).size !== k.soldes.length) refus('Deux soldes à la même date.');
      if ([...k.releves.flatMap((r) => [r.solde, r.minimum ?? 0]), ...k.soldes.map((s) => s.montant), ...k.frais.map((f) => f.montant)].some((m) => m < 0)) {
        refus('Un montant ne peut pas être négatif.');
      }
      const carte: CarteStocke = {
        ...k,
        releves: [...k.releves].sort(parDate((r) => r.date)),
        soldes: [...k.soldes].sort(parDate((r) => r.date)),
        frais: [...k.frais].sort(parDate((f) => f.libelle)),
        supplements: [...k.supplements].sort(),
      };
      const i = d.cartes.findIndex((x) => x.id === k.id);
      if (i >= 0) d.cartes[i] = carte;
      else d.cartes = [...d.cartes, carte];
      break;
    }
    case 'supprimerCarte': {
      const k = d.cartes.find((x) => x.id === c.id);
      const ids = k ? [k.id, ...k.supplements] : [c.id];
      if (d.confirmations.some((f) => f.elementId !== null && ids.includes(f.elementId))) {
        refus('La carte a des paiements confirmés : elle ne peut pas être supprimée.');
      }
      d.cartes = d.cartes.filter((x) => x.id !== c.id);
      break;
    }
    case 'supprimerPret':
      if (d.confirmations.some((f) => f.elementId === c.id)) {
        refus('Ce prêt a des versements confirmés : marque-le comme remboursé plutôt que de le supprimer.');
      }
      d.prets = d.prets.filter((p) => p.id !== c.id);
      break;
  }
}

/** Nouvelles données après les changements ; les données reçues ne sont pas modifiées. */
export function appliquerChangements(d: DonneesPaie, changements: readonly ChangementPaie[]): DonneesPaie {
  const copie = cloner({ ...donneesVides(), ...d });
  for (const c of cloner(changements)) appliquerUn(copie, c);
  return copie;
}

/**
 * Changements qui défont exactement `changements` appliqués à `d` (C,
 * « Annuler »). Un seul niveau : on annule le dernier enregistrement, rien
 * de plus. Seule la création du profil de paie n'a pas d'inverse ; elle
 * passe toujours par un aperçu.
 */
export function inverser(d: DonneesPaie, changements: readonly ChangementPaie[]): ChangementPaie[] {
  let etat = cloner({ ...donneesVides(), ...d });
  const inverses: ChangementPaie[][] = [];
  for (const c of changements) {
    inverses.push(inverseUn(etat, c));
    etat = appliquerChangements(etat, [c]);
  }
  return inverses.reverse().flat();
}

function inverseUn(d: DonneesPaie, c: ChangementPaie): ChangementPaie[] {
  switch (c.type) {
    case 'definirProfil':
      return d.profil ? [{ type: 'definirProfil', profil: d.profil }] : [];
    case 'definirSalaire': {
      const avant = d.salaires.find((s) => s.aPartirDu === c.salaire.aPartirDu);
      return [avant ? { type: 'definirSalaire', salaire: avant } : { type: 'retirerSalaire', aPartirDu: c.salaire.aPartirDu }];
    }
    case 'retirerSalaire': {
      const avant = d.salaires.find((s) => s.aPartirDu === c.aPartirDu);
      return avant ? [{ type: 'definirSalaire', salaire: avant }] : [];
    }
    case 'definirException': {
      const avant = d.exceptions.find((e) => e.dateOrigine === c.exception.dateOrigine);
      return [avant ? { type: 'definirException', exception: avant } : { type: 'retirerException', dateOrigine: c.exception.dateOrigine }];
    }
    case 'retirerException': {
      const avant = d.exceptions.find((e) => e.dateOrigine === c.dateOrigine);
      return avant ? [{ type: 'definirException', exception: avant }] : [];
    }
    case 'definirSeuil':
      return [{ type: 'definirSeuil', seuil: d.seuil }];
    case 'definirElement': {
      const avant = d.elements.find((e) => e.id === c.element.id);
      return [avant ? { type: 'definirElement', element: avant } : { type: 'supprimerElement', id: c.element.id }];
    }
    case 'supprimerElement': {
      const avant = d.elements.find((e) => e.id === c.id);
      if (!avant) return [];
      return [
        { type: 'definirElement', element: avant },
        ...d.ajustements.filter((a) => a.elementId === c.id).map((a): ChangementPaie => ({ type: 'definirAjustement', ajustement: a })),
      ];
    }
    case 'definirAjustement': {
      const a = c.ajustement;
      const avant = d.ajustements.find((x) => x.elementId === a.elementId && x.origine === a.origine);
      return [avant ? { type: 'definirAjustement', ajustement: avant } : { type: 'retirerAjustement', elementId: a.elementId, origine: a.origine }];
    }
    case 'definirConfirmation': {
      const avant = d.confirmations.find((x) => memeOccurrence(x, c.confirmation));
      return [
        avant
          ? { type: 'definirConfirmation', confirmation: avant }
          : { type: 'retirerConfirmation', elementId: c.confirmation.elementId, origine: c.confirmation.origine },
      ];
    }
    case 'retirerConfirmation': {
      const avant = d.confirmations.find((x) => memeOccurrence(x, c));
      return avant ? [{ type: 'definirConfirmation', confirmation: avant }] : [];
    }
    case 'retirerAjustement': {
      const avant = d.ajustements.find((x) => x.elementId === c.elementId && x.origine === c.origine);
      return avant ? [{ type: 'definirAjustement', ajustement: avant }] : [];
    }
    case 'definirPret': {
      const avant = d.prets.find((p) => p.id === c.pret.id);
      return [avant ? { type: 'definirPret', pret: avant } : { type: 'supprimerPret', id: c.pret.id }];
    }
    case 'supprimerPret': {
      const avant = d.prets.find((p) => p.id === c.id);
      return avant ? [{ type: 'definirPret', pret: avant }] : [];
    }
    case 'definirCarte': {
      const avant = d.cartes.find((k) => k.id === c.carte.id);
      return [avant ? { type: 'definirCarte', carte: avant } : { type: 'supprimerCarte', id: c.carte.id }];
    }
    case 'supprimerCarte': {
      const avant = d.cartes.find((k) => k.id === c.id);
      return avant ? [{ type: 'definirCarte', carte: avant }] : [];
    }
  }
}
