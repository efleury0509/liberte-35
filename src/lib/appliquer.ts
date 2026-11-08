// Application d'une liste de changements à des données de paie, en mémoire.
// Mêmes règles que le stockage (crates/stockage/src/paie.rs) : tout ou rien,
// une erreur est un texte prêt à afficher. Sert à l'aperçu dans un navigateur,
// au calcul des conséquences avant d'enregistrer et à « Annuler » (étape 4b).

import type { ChangementPaie, DonneesPaie } from './plateforme';

export const donneesVides = (): DonneesPaie => ({
  profil: null,
  salaires: [],
  exceptions: [],
  seuil: null,
  elements: [],
  ajustements: [],
  confirmations: [],
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
  }
}
