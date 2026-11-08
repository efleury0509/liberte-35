// Non-régression 0.4.3 : suites aléatoires (graine fixe) d'actions réelles
// de l'étape 4b — ajouts, ajustements, retraits, retours à la règle,
// changements de fréquence, suspensions, fins, montants, suppressions,
// paies déplacées (la première comprise) et « Annuler ». Après chaque
// action, toutes les paies prévues doivent rester affichées.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { it, expect } from 'vitest';
import { proposerAjout, proposerFrequence, proposerSuspension, proposerFin, proposerMontant, proposerSuppression, type Quand } from '../src/actions/elements';
import { proposerAjustement, proposerRetrait, proposerRetourRegle } from '../src/actions/occurrences';
import { proposerException, versNoyau, ErreurSaisie } from '../src/actions/paie';
import { cyclesAffiches } from '../src/actions/analyse';
import { appliquerChangements, inverser, donneesVides } from '../src/lib/appliquer';
import { dateCivile as d, ajouterJours } from '../src/noyau/dates';
import type { DonneesPaie } from '../src/lib/plateforme';

const JOUR = d('2026-11-08');
let graine = 7;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const choisir = <T,>(t: readonly T[]) => t[Math.floor(hasard() * t.length)]!;
const dateAlea = (a: string, jours: number) => ajouterJours(d(a), Math.floor(hasard() * jours));
const ATTENDUES = Array.from({ length: 13 }, (_, i) => ajouterJours(d('2027-01-07'), 14 * i));

it('200 suites de 30 actions réelles : les 13 paies restent affichées après chaque action, avril compris', () => {
  let trouve = 0;
  for (let essai = 0; essai < 200 && trouve < 1; essai++) {
    let donnees: DonneesPaie = { ...donneesVides(), profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null }, salaires: [{ aPartirDu: '2027-01-07', montant: 210000 }] };
    const histo: string[] = [];
    let dernier: { inv: any[] } | null = null;
    for (let pas = 0; pas < 30; pas++) {
      const n = versNoyau(donnees);
      const vue = cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil }, JOUR);
      const els = donnees.elements;
      const action = choisir(['ajout', 'ajout', 'ajust', 'ajust', 'retrait', 'retour', 'freq', 'susp', 'fin', 'montant', 'exc', 'annuler', 'suppr']);
      let p: any = null;
      let desc = action;
      try {
        if (action === 'ajout') {
          const nature = choisir(['depense', 'revenu'] as const);
          const quand = choisir((nature === 'revenu' ? ['unique', 'mois', 'deuxSemaines', 'semaine', 'chaquePaie'] : ['unique', 'mois', 'deuxSemaines', 'chaquePaie', 'paie1', 'paie2', 'cycle', 'troisMois']) as Quand[]);
          const date = dateAlea('2027-01-01', 200);
          const c = choisir(vue.cycles);
          desc += ` ${nature} ${quand} ${date}`;
          p = proposerAjout(donnees, { nature, libelle: 'x' + pas, genre: choisir(['fixe', 'enveloppe'] as const), montant: String(Math.floor(hasard() * 500)), estimation: false, incertain: hasard() < 0.2, quand, date, cyclePaie: c.paie.dateOrigine }, JOUR);
        } else if (['ajust', 'retrait', 'retour'].includes(action)) {
          const c = choisir(vue.cycles);
          if (!c.lignes.length) continue;
          const l = choisir(c.lignes);
          const cible = { elementId: l.elementId, origine: l.origine };
          desc += ` ${l.libelle}@${l.origine} cycle ${c.paie.dateOrigine}`;
          if (action === 'ajust') {
            const autre = choisir(vue.cycles);
            const s = { montant: hasard() < 0.5 ? String(Math.floor(hasard() * 900)) : '', date: l.echeance && hasard() < 0.4 ? dateAlea(l.echeance, 20) : (l.echeance ?? ''), paie: hasard() < 0.5 ? autre.paie.dateOrigine : c.paie.dateOrigine };
            desc += ` ${JSON.stringify(s)}`;
            p = proposerAjustement(donnees, cible, s as any, JOUR);
          } else if (action === 'retrait') p = proposerRetrait(donnees, cible, !l.retiree, JOUR);
          else p = proposerRetourRegle(donnees, cible, JOUR);
        } else if (action === 'annuler') {
          if (!dernier) continue;
          p = { changements: dernier.inv, journal: [] };
        } else if (action === 'exc') {
          const c = choisir(vue.cycles);
          const date = ajouterJours(c.paie.dateOrigine, Math.floor(hasard() * 25) - 12);
          desc += ` paie ${c.paie.dateOrigine} -> ${date}`;
          p = proposerException(donnees, c.paie, { dateReelle: date, montant: '' }, undefined, JOUR);
        } else {
          if (!els.length) continue;
          const e = choisir(els);
          desc += ` ${e.libelle}`;
          if (action === 'freq') p = proposerFrequence(donnees, e.id, choisir(['chaquePaie', 'paie1', 'mois', 'deuxSemaines'] as Quand[]), dateAlea('2027-02-01', 150), JOUR);
          if (action === 'susp') { const a = dateAlea('2027-02-01', 150); p = proposerSuspension(donnees, e.id, a, ajouterJours(a, Math.floor(hasard() * 40)), JOUR); }
          if (action === 'fin') p = proposerFin(donnees, e.id, dateAlea('2027-02-01', 150), JOUR);
          if (action === 'montant') p = proposerMontant(donnees, e.id, dateAlea('2027-01-01', 150), String(Math.floor(hasard() * 700)), JOUR);
          if (action === 'suppr') p = proposerSuppression(donnees, e.id, JOUR);
        }
      } catch (e) {
        if (e instanceof ErreurSaisie || String(e).includes('Rien')) continue;
        histo.push(`${desc} => EXCEPTION ${e}`);
        console.log(histo.join('\n')); trouve++; break;
      }
      if (!p) continue;
      try {
        const avant = donnees;
        donnees = appliquerChangements(donnees, p.changements);
        dernier = action === 'annuler' ? null : { inv: inverser(avant, p.changements) };
      } catch (e) { continue; }
      histo.push(desc);
      const n2 = versNoyau(donnees);
      let origines: string[];
      try {
        origines = cyclesAffiches(n2.profil!, { exceptions: n2.exceptions, elements: n2.elements, ajustements: n2.ajustements, seuil: n2.seuil }, JOUR).cycles.map((c) => c.paie.dateOrigine);
      } catch (e) { histo.push('PLAN EXCEPTION ' + e); console.log(histo.join('\n')); trouve++; break; }
      if (JSON.stringify(origines) !== JSON.stringify(ATTENDUES)) {
        console.log('=== ESSAI', essai, '\n' + histo.join('\n') + '\n-> origines ' + origines.join(' '));
        console.log('exceptions', JSON.stringify(donnees.exceptions), 'profil', JSON.stringify(donnees.profil));
        trouve++; break;
      }
    }
  }
  expect(trouve).toBe(0);
}, 300_000);
