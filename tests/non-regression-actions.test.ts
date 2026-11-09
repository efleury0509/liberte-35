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
import { proposerAnnulationConfirmation, proposerConfirmation, proposerCorrection, proposerToutConfirmer } from '../src/actions/confirmations';
import { ajustementsOrphelins } from '../src/noyau/cycles';
import { paiesEntre } from '../src/noyau/paie';
import { appliquerChangements, inverser, donneesVides } from '../src/lib/appliquer';
import { dateCivile as d, ajouterJours } from '../src/noyau/dates';
import type { DonneesPaie } from '../src/lib/plateforme';
import { estPret, proposerAjoutPret, proposerMiseAJourSolde, proposerRemboursement, proposerRenseignements, proposerSuppressionPret, proposerVersement, type QuandPret } from '../src/actions/prets';

const JOUR = d('2026-11-08');
let graine = 7;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const choisir = <T,>(t: readonly T[]) => t[Math.floor(hasard() * t.length)]!;
const dateAlea = (a: string, jours: number) => ajouterJours(d(a), Math.floor(hasard() * jours));
const ATTENDUES = Array.from({ length: 13 }, (_, i) => ajouterJours(d('2027-01-07'), 14 * i));

it('200 suites de 30 actions réelles : les 13 paies restent affichées et aucune confirmation ne disparaît, après chaque action', () => {
  let trouve = 0;
  for (let essai = 0; essai < 200 && trouve < 1; essai++) {
    let donnees: DonneesPaie = { ...donneesVides(), profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null }, salaires: [{ aPartirDu: '2027-01-07', montant: 210000 }] };
    const histo: string[] = [];
    let dernier: { inv: any[] } | null = null;
    for (let pas = 0; pas < 30; pas++) {
      const n = versNoyau(donnees);
      const vue = cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil }, JOUR);
      // Comme dans l'interface : un versement de prêt se gère depuis Mes dettes.
      const els = donnees.elements.filter((e) => !estPret(donnees, e.id));
      const prets = donnees.prets;
      const action = choisir(['ajout', 'ajout', 'ajust', 'ajust', 'retrait', 'retour', 'freq', 'susp', 'fin', 'montant', 'exc', 'annuler', 'suppr', 'conf', 'conf', 'confAutre', 'corr', 'annConf', 'tout', 'pret', 'pret', 'pretInfo', 'pretSolde', 'pretVersement', 'pretRembourse', 'pretSuppr']);
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
        } else if (['conf', 'confAutre', 'corr', 'annConf'].includes(action)) {
          const c = choisir(vue.cycles);
          const lignes = c.lignes.filter((l) => l.genre !== 'enveloppe');
          const cible = hasard() < 0.3 || !lignes.length ? { elementId: null, origine: c.paie.dateOrigine } : (() => { const l = choisir(lignes); return { elementId: l.elementId, origine: l.origine }; })();
          desc += ` ${cible.elementId ?? 'paie'}@${cible.origine}`;
          const saisie = { montant: String(Math.floor(hasard() * 900)), date: dateAlea('2027-01-01', 200) };
          if (action === 'conf') p = proposerConfirmation(donnees, cible, null, JOUR);
          if (action === 'confAutre') p = proposerConfirmation(donnees, cible, saisie, JOUR);
          if (action === 'corr') p = proposerCorrection(donnees, cible, saisie, JOUR);
          if (action === 'annConf') p = proposerAnnulationConfirmation(donnees, cible, JOUR);
        } else if (action === 'pret') {
          const quand = choisir(['semaine', 'deuxSemaines', 'mois', 'chaquePaie'] as QuandPret[]);
          const prochaine = dateAlea('2027-01-01', 120);
          const avecSolde = hasard() < 0.5;
          desc += ` ${quand} ${prochaine}`;
          p = proposerAjoutPret(donnees, {
            nom: 'pret' + pas, versement: String(50 + Math.floor(hasard() * 400)), quand, prochaine,
            minimum: hasard() < 0.3 ? String(Math.floor(hasard() * 60)) : '',
            echeanceFinale: hasard() < 0.3 ? dateAlea('2027-03-01', 300) : '',
            solde: avecSolde ? String(Math.floor(hasard() * 20000)) : '', soldeLe: avecSolde ? dateAlea('2026-12-01', 60) : '',
            taux: hasard() < 0.5 ? '6,49' : '',
          }, JOUR);
        } else if (action.startsWith('pret')) {
          if (!prets.length) continue;
          const pr = choisir(prets);
          desc += ` ${pr.id.slice(0, 4)}`;
          if (action === 'pretInfo') p = proposerRenseignements(donnees, pr.id, { minimum: '', echeanceFinale: hasard() < 0.5 ? dateAlea('2027-02-01', 300) : '', taux: '9,90', solde: '5000', soldeLe: dateAlea('2027-01-01', 100) }, JOUR);
          if (action === 'pretSolde') p = proposerMiseAJourSolde(donnees, pr.id, dateAlea('2027-01-01', 200), String(Math.floor(hasard() * 9000)), 'relevé', JOUR);
          if (action === 'pretVersement') p = proposerVersement(donnees, pr.id, dateAlea('2027-01-01', 150), String(100 + Math.floor(hasard() * 400)), JOUR);
          if (action === 'pretRembourse') p = proposerRemboursement(donnees, pr.id, hasard() < 0.5 ? '' : dateAlea('2027-01-15', 200), JOUR);
          if (action === 'pretSuppr') p = proposerSuppressionPret(donnees, pr.id, JOUR);
        } else if (action === 'tout') {
          const c = choisir(vue.cycles);
          desc += ` cycle ${c.paie.dateOrigine}`;
          p = proposerToutConfirmer(donnees, c.paie.dateOrigine, JOUR);
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
      // Étape 5 (Q23) : aucune opération confirmée ne disparaît après une action acceptée.
      const perdues = donnees.confirmations.filter((f) => {
        if (f.elementId === null) return !paiesEntre(n2.profil!, n2.exceptions, ajouterJours(d(f.origine), -40), ajouterJours(d(f.origine), 40)).some((x) => x.dateOrigine === f.origine);
        return ajustementsOrphelins({ profil: n2.profil!, exceptions: n2.exceptions, elements: n2.elements, ajustements: [{ elementId: f.elementId, origine: d(f.origine) }] }).length > 0;
      });
      // Étape 7a : chaque prêt garde son versement (dépense fixe), et sa fin
      // vient seulement d'un remboursement marqué ou d'une échéance indiquée.
      const pretsIncoherents = donnees.prets.filter((pr) => {
        const e = donnees.elements.find((x) => x.id === pr.id);
        return !e || e.nature !== 'depense' || e.genre !== 'fixe' || e.fin !== (pr.rembourseLe ?? pr.echeanceFinale);
      });
      if (pretsIncoherents.length > 0) {
        console.log('=== PRÊT INCOHÉRENT, ESSAI', essai, '\n' + histo.join('\n') + '\n' + JSON.stringify(pretsIncoherents));
        trouve++; break;
      }
      if (perdues.length > 0) {
        console.log('=== CONFIRMATION PERDUE, ESSAI', essai, '\n' + histo.join('\n') + '\n' + JSON.stringify(perdues));
        trouve++; break;
      }
      if (JSON.stringify(origines) !== JSON.stringify(ATTENDUES)) {
        console.log('=== ESSAI', essai, '\n' + histo.join('\n') + '\n-> origines ' + origines.join(' '));
        console.log('exceptions', JSON.stringify(donnees.exceptions), 'profil', JSON.stringify(donnees.profil));
        trouve++; break;
      }
    }
  }
  expect(trouve).toBe(0);
}, 300_000);
