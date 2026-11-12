<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { CibleMesPaies } from '../../actions/accueil';
  import {
    A_COMPLETER,
    ErreurSaisie,
    proposerException,
    salaireAffiche,
    versNoyau,
    type Proposition,
  } from '../../actions/paie';
  import { cyclesAffiches, NOMBRE_CYCLES } from '../../actions/elements';
  import { aVerifierAvant, paiesTerminees } from '../../actions/analyse';
  import HistoriquePaies from './HistoriquePaies.svelte';
  import BilanPaie from './BilanPaie.svelte';
  import { anneeParDefaut, anneesHistorique } from '../../lib/historique';
  import {
    lireOccurrence,
    proposerAjustement,
    proposerRetourRegle,
    proposerRetrait,
    type CibleOccurrence,
  } from '../../actions/occurrences';
  import { inverser } from '../../lib/appliquer';
  import { versElementStocke } from '../../actions/elementsStockes';
  import { ELEMENTS_ETAPE4, PERIODE_ETAPE4, PROFIL_ETAPE4 } from '../../exemple/scenarioEtape4';
  import { aujourdhui } from '../../lib/aujourdhui';
  import { exempleAutorise } from '../../lib/exemple';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme, ProfilPaieStocke, Profil } from '../../lib/plateforme';
  import { planifier, type Cycle, type FaitConfirme, type Ligne, type Plan } from '../../noyau/cycles';
  import { formaterDateCourte, formaterDateLongue, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import Apercu from '../Apercu.svelte';
  import {
    proposerAnnulationConfirmation,
    proposerConfirmation,
    proposerCorrection,
    proposerToutConfirmer,
    type CibleConfirmation,
  } from '../../actions/confirmations';
  import { estPret } from '../../actions/prets';
  import { comptesDe, estContribution, nomCompte, proposerContributionPonctuelle } from '../../actions/comptes';
  import { estDepenseAPrevoir } from '../../actions/depenses';
  import { modeOccurrence, reserveDeDepense } from '../../actions/couvertures';
  import { choixRapides, estPaiementCarte, estSupplement, laCarte, libelleLigne, proposerSupplement, proposerSuppressionSupplement, raisonsACompleter } from '../../actions/cartes';
  import RevenusDepenses from './RevenusDepenses.svelte';
  import MaPaie from './MaPaie.svelte';
  import FormulaireProfil from './FormulaireProfil.svelte';
  import QuatrePaies from './QuatrePaies.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import TableauCycles from './TableauCycles.svelte';

  interface Props {
    plateforme: Plateforme;
    profilInstallation: Profil | undefined;
    onchangement: () => void;
    /** Étape 7a : ouvrir un prêt dans Mes dettes. */
    onvoirpret?: (id: string) => void;
    /** Étape 8 : ouvrir la carte dans Mes dettes. */
    onvoircarte?: () => void;
    /** Étape A : ouvrir Dépenses à prévoir. */
    onvoirdepenses?: (elementId?: string) => void;
    /** Étape 9 : ouvrir un compte dans Mon épargne. */
    onvoircompte?: (id: string) => void;
    /** 0.16.0 : ce que l'Accueil demande d'ouvrir en arrivant. */
    cible?: CibleMesPaies | null;
  }
  let { plateforme, profilInstallation, onchangement, onvoirpret, onvoircarte, onvoircompte, onvoirdepenses, cible = null }: Props = $props();

  const jour = aujourdhui();
  const ELEMENTS_EXEMPLE = ELEMENTS_ETAPE4.map(versElementStocke);

  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let exemple = $state(false);
  /** V1 lot 1 : une fenêtre de « Ma paie » est ouverte. */
  let formulaireMaPaie = $state(false);
  let choisi: DateCivile | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let remise = $state(0);
  let nombreCycles = $state(NOMBRE_CYCLES);
  /** Dernier enregistrement direct, qu'on peut annuler (C). */
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);
  /** Occurrence en cours d'ajustement, dans le détail d'un cycle (A). */
  let occurrence: CibleOccurrence | null = $state(null);
  // 0.4.3 : la modification de la paie elle-même est repliée par défaut,
  // pour ne jamais la confondre avec l'ajustement d'un revenu ou d'une dépense.
  let modifPaie = $state(false);
  // Étape 5 : « Confirmer autrement… » ou « Corriger » une confirmation.
  let formConfirmation: { cible: CibleConfirmation; mode: 'confirmer' | 'corriger' } | null = $state(null);
  let fConfMontant = $state('');
  let fConfDate = $state('');
  let fConfSansReserve = $state(false);
  /** V1 lot 2 : présentation de la fenêtre (annulation sobre, choix de la source). */
  let varianteApercu: 'normale' | 'annulation' = $state('normale');
  let source: { cible: CibleConfirmation; saisie: { montant: string; date: string } | null; reserve: string; sansReserve: boolean } | null = $state(null);
  let minuterieAnnulation: ReturnType<typeof setTimeout> | undefined;
  let fOccMontant = $state('');
  let fOccDate = $state('');
  let fOccPaie = $state('');
  /** Élément à ouvrir dans les listes (« Modifier la règle… »). */
  let aGerer: string | null = $state(null);
  /** Étape 8 : « + Paiement supplémentaire », ouvert dans le cycle de cette paie. */
  let formSupplement: string | null = $state(null);
  let fSupMontant = $state('');
  let fSupDate = $state('');

  // Champs des formulaires
  let fDateReelle = $state('');
  let fMontantPaie = $state('');

  const exempleDisponible = $derived(exempleAutorise(profilInstallation));

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données de paie.';
    }
  });

  const noyau = $derived(donnees ? versNoyau(donnees) : null);

  interface Vue {
    plan: Plan;
    cycles: Cycle[];
    courant: DateCivile | null;
    /** Éléments à vérifier dans les cycles non affichés d’avant. */
    aVerifierAvant: number;
  }

  const calcul: { vue: Vue | null; erreur: string | null } = $derived.by(() => {
    try {
      return { vue: calculerVue(), erreur: null };
    } catch (e) {
      return { vue: null, erreur: e instanceof Error ? e.message : String(e) };
    }
  });
  const vue = $derived(calcul.vue);

  function calculerVue(): Vue | null {
    if (exemple) {
      const plan = planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4 }, PERIODE_ETAPE4.debut, PERIODE_ETAPE4.fin);
      return { plan, cycles: plan.cycles, courant: null, aVerifierAvant: 0 };
    }
    if (!noyau?.profil) return null;
    const entree = { exceptions: noyau.exceptions, elements: noyau.elements, ajustements: noyau.ajustements, confirmations: noyau.confirmations, seuil: noyau.seuil, couvertures: noyau.couvertures };
    const v = cyclesAffiches(noyau.profil, entree, jour, nombreCycles);
    // H1 : le rappel compte tout l'historique, quelle que soit son ancienneté.
    return { ...v, aVerifierAvant: v.cycles[0] ? aVerifierAvant(noyau.profil, entree, jour, v.cycles[0].debut) : 0 };
  }

  const salaireActuel = $derived(noyau?.profil ? salaireAffiche(noyau.profil.montants, jour) : A_COMPLETER);

  /**
   * Étape 4b, C : l'action prépare sa proposition ; si l'aperçu protège
   * vraiment (effet de bord, passé, suppression…), on le montre ; sinon on
   * enregistre tout de suite et on offre « Annuler ».
   */
  function proposer(fabrique: () => Proposition, options: { variante?: 'normale' | 'annulation'; garderSource?: boolean; toujours?: boolean } = {}) {
    messageAnnulation = null;
    dernier = null;
    varianteApercu = options.variante ?? 'normale';
    if (!options.garderSource) source = null;
    let p: Proposition;
    try {
      p = fabrique();
      erreurSaisie = null;
    } catch (e) {
      proposition = null;
      erreurSaisie = e instanceof ErreurSaisie || e instanceof Error ? e.message : String(e);
      void montrer('erreur-saisie');
      return;
    }
    if (p.apercu || options.toujours) {
      proposition = p;
      void montrer('apercu');
    } else void enregistrer(p, true);
  }

  /** Revenir sur un paiement enregistré : toujours dans la fenêtre sobre (cahier V1, 5.4). */
  function proposerAnnulation(cible: CibleConfirmation) {
    proposer(() => proposerAnnulationConfirmation(donnees!, cible, jour), { variante: 'annulation', toujours: true });
  }

  /**
   * Confirmer une dépense qui a une réserve liée : la fenêtre propose
   * explicitement la source (réserve ou paie). Changer la source ne fait que
   * recalculer l'aperçu ; rien ne bouge avant « Enregistrer ».
   */
  function confirmerAvecSource(cible: CibleConfirmation, saisieDonnee: { montant: string; date: string } | null, sansReserve: boolean, prevu: number | null = null) {
    // « Confirmer » rapide : le montant prévu, à la date du jour (comme avant).
    const saisie = saisieDonnee ?? (prevu === null ? null : { montant: enTexte(prevu), date: jour as string });
    const lien = cible.elementId && donnees ? reserveDeDepense(donnees, cible.elementId) : null;
    if (!lien || !cible.elementId || modeOccurrence(donnees!, cible.elementId, cible.origine) !== 'reserve') {
      proposer(() => proposerConfirmation(donnees!, cible, saisieDonnee === null ? null : { ...saisieDonnee, sansReserve }, jour));
      return;
    }
    source = { cible, saisie, reserve: lien.reserve.nom, sansReserve };
    proposer(() => proposerConfirmation(donnees!, cible, saisie === null ? null : { ...saisie, sansReserve }, jour), {
      garderSource: true,
      toujours: true,
    });
  }

  // L'aperçu et les messages sont au-dessus du tableau : quand on agit depuis
  // le détail d'un cycle, on les amène à l'écran.
  async function montrer(testid: string) {
    await tick();
    document.querySelector(`[data-testid="${testid}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  async function enregistrer(p: Proposition, direct: boolean) {
    if (!donnees) return;
    const avant = donnees;
    enCours = true;
    try {
      donnees = await plateforme.appliquerChangementsPaie(p.changements, p.journal);
      const inverse = inverser(avant, p.changements);
      dernier = direct && inverse.length > 0 ? { titre: p.titre, inverse, journal: p.journal } : null;
      proposition = null;
      erreurSaisie = null;
      occurrence = null;
      modifPaie = false;
      formConfirmation = null;
      formSupplement = null;
      formContribution = null;
      remise += 1;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Enregistrement impossible.';
    } finally {
      enCours = false;
    }
  }

  async function confirmer() {
    if (proposition) await enregistrer(proposition, false);
  }

  /** « Annuler » : un seul niveau, le dernier enregistrement direct. */
  async function annulerDernier() {
    if (!dernier) return;
    const d = dernier;
    enCours = true;
    try {
      donnees = await plateforme.appliquerChangementsPaie(
        d.inverse,
        d.journal.map((e) => ({ ...e, champ: `annulation — ${e.champ}`, ancienneValeur: e.nouvelleValeur, nouvelleValeur: e.ancienneValeur })),
      );
      dernier = null;
      messageAnnulation = `Annulé : ${finPhrase(d.titre)}`;
      // 0.4.3 : la confirmation d'annulation disparaît d'elle-même.
      clearTimeout(minuterieAnnulation);
      minuterieAnnulation = setTimeout(() => (messageAnnulation = null), 5000);
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : 'Annulation impossible.';
    } finally {
      enCours = false;
    }
  }

  function ouvrirOccurrence(c: Cycle, elementId: string, origine: DateCivile) {
    if (!donnees) return;
    occurrence = { elementId, origine };
    modifPaie = false;
    formConfirmation = null;
    erreurSaisie = null;
    const etat = lireOccurrence(donnees, occurrence);
    fOccMontant = etat.ligne?.montant !== null && etat.ligne?.montant !== undefined ? (etat.ligne.montant / 100).toFixed(2).replace('.', ',') : '';
    fOccDate = etat.ligne?.echeance ?? '';
    fOccPaie = c.paie.dateOrigine;
  }

  function annuler() {
    proposition = null;
    erreurSaisie = null;
    remise += 1;
  }

  // Un titre qui finit par une abréviation (« 7 janv. ») ne reçoit pas un second point.
  const finPhrase = (t: string) => (t.endsWith('.') ? t : `${t}.`);
  const enTexte = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));

  function ouvrirConfirmation(cible: CibleConfirmation, mode: 'confirmer' | 'corriger', prevu: number | null, confirmation: FaitConfirme | null) {
    occurrence = null;
    modifPaie = false;
    erreurSaisie = null;
    formConfirmation = { cible, mode };
    // Q20 : la date du jour par défaut ; pour corriger, la date déjà confirmée.
    fConfMontant = enTexte(mode === 'corriger' && confirmation ? confirmation.montant : prevu);
    fConfDate = mode === 'corriger' && confirmation ? confirmation.date : jour;
    fConfSansReserve = false;
  }

  const contexteCycle = (c: Cycle) => `Paie du ${formaterDateCourte(c.paie.date)} · cycle du ${formaterDateCourte(c.debut)} au ${formaterDateCourte(c.fin)}`;

  /** « Voir le détail complet » depuis les cartes : la paie dans une grande fenêtre (V1 lot 6b). */
  function voirCycle(dateOrigine: DateCivile) {
    ouvrirFenetre(dateOrigine);
  }

  function choisirCycle(dateOrigine: DateCivile) {
    choisi = choisi === dateOrigine ? null : dateOrigine;
    occurrence = null;
    modifPaie = false;
    formConfirmation = null;
    proposition = null;
    erreurSaisie = null;
    const c = vue?.cycles.find((x) => x.paie.dateOrigine === dateOrigine);
    fDateReelle = c?.paie.date ?? '';
    fMontantPaie = '';
  }

  function basculerExemple() {
    exemple = !exemple;
    choisi = null;
    fenetre = null;
    proposition = null;
    formulaireMaPaie = false;
  }

  /** Étape 7a : versements de prêts du cycle, groupés sous « Dettes ». */
  const dettesDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => l.nature === 'depense' && estPret(donnees!, l.elementId)) : []);
  /** Étape 8 (Q65) : paiements de la carte du cycle, dans un seul groupe « Visa ». */
  const carteDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => estPaiementCarte(donnees!, l.elementId)) : []);
  const estDette = (id: string) => !!donnees && !exemple && (estPret(donnees, id) || estPaiementCarte(donnees, id) || estContribution(donnees, id) || estDepenseAPrevoir(donnees, id));
  /** Étape A : dépenses à prévoir du cycle, avec leur couverture par la réserve liée. */
  const aPrevoirDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => estDepenseAPrevoir(donnees!, l.elementId)) : []);
  const couvertureDe = (l: Ligne): string | null => {
    if (!donnees || !reserveDeDepense(donnees, l.elementId)) return null;
    if (l.statut === 'confirme') return l.couvert ? `payée avec la réserve : ${formaterMontant(l.couvert)}` : 'payée depuis le disponible';
    if (l.montant === null || l.couvert === null) return 'couverture à compléter';
    if (l.couvert === 0) return 'depuis le disponible';
    if (l.couvert >= l.montant) return 'couverte par la réserve';
    return `réserve ${formaterMontant(l.couvert)} + disponible ${formaterMontant(l.montant - l.couvert)}`;
  };
  /** Étape 9 : contributions du cycle, groupées sous « Épargne ». */
  const epargneDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => estContribution(donnees!, l.elementId)) : []);
  const comptesOuverts = $derived(donnees && !exemple ? comptesDe(donnees).filter((k) => k.fermeLe === null) : []);
  const compteDeLigne = (id: string) => (donnees ? comptesDe(donnees).find((k) => k.contributions.includes(id)) : undefined);
  let formContribution: string | null = $state(null);
  let formulaireRegle = $state(false);
  const formulaireOuvert = $derived(formulaireRegle || formulaireMaPaie || occurrence !== null || formConfirmation !== null || formContribution !== null || formSupplement !== null || modifPaie);
  /** V1 lot 6b : un formulaire d'action du détail d'un cycle est ouvert. */
  const sousFormulaireOuvert = $derived(occurrence !== null || formConfirmation !== null || formContribution !== null || formSupplement !== null || modifPaie);

  // V1 lot 6b : deux onglets, et le détail d'une paie (ou d'une opération)
  // dans une grande fenêtre, sans quitter l'aperçu des paies.
  type OngletPaies = 'prochaines' | 'toutes';
  const ONGLETS_PAIES: { id: OngletPaies; libelle: string }[] = [
    { id: 'prochaines', libelle: 'Mes prochaines paies' },
    { id: 'toutes', libelle: 'Toutes mes paies' },
  ];
  let ongletPaies: OngletPaies = $state('prochaines');
  // H2 : « Toutes mes paies » montre soit les paies en cours et à venir, soit
  // les paies terminées (par année et par mois).
  let vueToutes: 'avenir' | 'terminees' = $state('avenir');
  let anneeHistorique: number | null = $state(null);
  let filtreAVerifier = $state(false);
  const terminees: Cycle[] = $derived.by(() => {
    if (exemple || !noyau?.profil) return [];
    try {
      const n = noyau;
      return paiesTerminees(
        n.profil!,
        { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, seuil: n.seuil, couvertures: n.couvertures },
        jour,
      );
    } catch {
      return [];
    }
  });
  /** Le rappel « à vérifier » mène aux paies terminées concernées, même anciennes. */
  function voirAVerifier() {
    ongletPaies = 'toutes';
    fenetre = null;
    vueToutes = 'terminees';
    filtreAVerifier = true;
    anneeHistorique = anneeParDefaut(anneesHistorique(terminees), true);
  }
  interface CibleFenetre {
    cycle: DateCivile;
    ligne: { elementId: string; origine: DateCivile } | null;
  }
  let fenetre = $state(null) as CibleFenetre | null;
  const cycleFenetre: Cycle | null = $derived.by(() => {
    const f = fenetre as CibleFenetre | null;
    if (!f) return null;
    return vue?.cycles.find((x) => x.paie.dateOrigine === f.cycle) ?? terminees.find((x) => x.paie.dateOrigine === f.cycle) ?? null;
  });
  const ligneFenetre: Ligne | null = $derived.by(() => {
    const cible = (fenetre as CibleFenetre | null)?.ligne;
    return cible && cycleFenetre ? (cycleFenetre.lignes.find((l) => l.elementId === cible.elementId && l.origine === cible.origine) ?? null) : null;
  });

  function fermerSousFormulaires() {
    occurrence = null;
    formConfirmation = null;
    formContribution = null;
    formSupplement = null;
    modifPaie = false;
    erreurSaisie = null;
  }
  function ouvrirFenetre(cycle: DateCivile, ligne: Ligne | null = null) {
    fermerSousFormulaires();
    proposition = null;
    fenetre = { cycle, ligne: ligne ? { elementId: ligne.elementId, origine: ligne.origine } : null };
  }
  // 0.16.0 : un lien de l'Accueil ouvre directement la paie, l'opération ou
  // les paies passées à vérifier, une seule fois, une fois les données lues.
  let cibleAppliquee = false;
  $effect(() => {
    if (cibleAppliquee || !cible || !donnees || !vue) return;
    cibleAppliquee = true;
    const c = cible;
    untrack(() => {
      if (c.type === 'aVerifierPassees') voirAVerifier();
      else {
        fermerSousFormulaires();
        fenetre = { cycle: c.date, ligne: c.ligne ?? null };
      }
    });
  });
  function fermerFenetre() {
    fermerSousFormulaires();
    fenetre = null;
  }
  function choisirOnglet(id: OngletPaies) {
    ongletPaies = id;
    fenetre = null;
  }
  function clavierOnglets(e: KeyboardEvent, i: number) {
    let j = i;
    if (e.key === 'ArrowRight') j = (i + 1) % ONGLETS_PAIES.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + ONGLETS_PAIES.length) % ONGLETS_PAIES.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ONGLETS_PAIES.length - 1;
    else return;
    e.preventDefault();
    choisirOnglet(ONGLETS_PAIES[j]!.id);
    document.getElementById(`onglet-paies-${ongletPaies}`)?.focus();
  }
  /** La nature d'une opération, en mots (détail d'une opération). */
  function typeLigne(l: Ligne): string {
    if (l.nature === 'revenu') return 'Revenu';
    if (donnees && !exemple) {
      if (estPret(donnees, l.elementId)) return 'Paiement de prêt';
      if (estPaiementCarte(donnees, l.elementId)) return 'Paiement de la carte de crédit';
      if (estContribution(donnees, l.elementId)) return 'Contribution d’épargne';
      if (estDepenseAPrevoir(donnees, l.elementId)) return 'Dépense à prévoir';
    }
    return l.genre === 'enveloppe' ? 'Enveloppe variable' : 'Dépense';
  }
  let fConCompte = $state('');
  let fConMontant = $state('');
  let fConDate = $state('');
  function ouvrirContribution(c: Cycle) {
    formContribution = c.paie.dateOrigine;
    fConCompte = comptesOuverts.length === 1 ? comptesOuverts[0]!.id : '';
    fConMontant = '';
    fConDate = jour >= c.debut && jour <= c.fin ? jour : c.debut;
  }
  const carte = $derived(donnees && !exemple ? laCarte(donnees) : null);

  function ouvrirSupplement(c: Cycle) {
    formSupplement = c.paie.dateOrigine;
    fSupMontant = '';
    // Aujourd'hui par défaut ; depuis un autre cycle, le premier jour de ce cycle.
    fSupDate = jour >= c.debut && jour <= c.fin ? jour : c.debut;
  }
</script>

{#if erreurChargement}
  <p role="alert" class="erreur">{erreurChargement}</p>
{/if}
{#if calcul.erreur}
  <p role="alert" class="erreur">{calcul.erreur}</p>
{/if}

{#if exempleDisponible}
  <p class="outil-exemple">
    <button type="button" onclick={basculerExemple} data-testid="bouton-exemple">
      {exemple ? 'Revenir à mes données d’essai' : 'Voir l’exemple fictif'}
    </button>
  </p>
{/if}

{#if exemple}
  <p class="bandeau-exemple" role="note" data-testid="bandeau-exemple">
    Exemple fictif des cas témoins de l’étape 4 (cycles M1 à M4) : paie de 2 100 $ aux deux semaines, autres revenus dont un
    incertain, dépenses fixes, enveloppes et dépenses ponctuelles. Rien n’est enregistré.
  </p>
{:else if donnees && !donnees.profil}
  <section aria-labelledby="titre-config">
    <h2 id="titre-config">Configurer ma paie</h2>
    <p class="discret">Indique comment et quand tu es payée. Le montant peut attendre : il restera « À compléter ».</p>
    <FormulaireProfil donnees={donnees} {jour} creation={true} {proposer} />
  </section>
{/if}

{#if vue}
  <div class="onglets" role="tablist" aria-label="Affichage de mes paies">
    {#each ONGLETS_PAIES as o, i (o.id)}
      <button
        type="button"
        role="tab"
        id={`onglet-paies-${o.id}`}
        aria-selected={ongletPaies === o.id}
        aria-controls={`panneau-paies-${o.id}`}
        tabindex={ongletPaies === o.id ? 0 : -1}
        class:actif={ongletPaies === o.id}
        onclick={() => choisirOnglet(o.id)}
        onkeydown={(e) => clavierOnglets(e, i)}>{o.libelle}</button
      >
    {/each}
  </div>
{/if}

{#if vue && ongletPaies === 'prochaines'}
  <div role="tabpanel" class="sous-loutre" id="panneau-paies-prochaines" aria-labelledby="onglet-paies-prochaines">
  {#if !exemple && vue.aVerifierAvant > 0}
    <p class="rappel-passees" data-testid="a-verifier-avant">
      {vue.aVerifierAvant === 1 ? '1 élément à vérifier' : `${vue.aVerifierAvant} éléments à vérifier`} dans les paies précédentes.
      <button type="button" class="petit" onclick={voirAVerifier}>Les retrouver dans les paies terminées</button>
    </p>
  {/if}
  <QuatrePaies
    cycles={vue.cycles}
    courant={vue.courant}
    libelle={(l) => (donnees && !exemple ? libelleLigne(donnees, l) : l.libelle)}
    onvoir={voirCycle}
    onligne={(cycle, l) => ouvrirFenetre(cycle, l)}
  />
  <p class="discret">Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.</p>
  </div>
{/if}

{#if vue && ongletPaies === 'toutes'}
  <div role="tabpanel" class="sous-loutre" id="panneau-paies-toutes" aria-labelledby="onglet-paies-toutes">
  <h2 class="titre-tableau">Toutes mes paies</h2>
  {#if !exemple}
    <div class="choix-vue" role="group" aria-label="Paies à afficher">
      <button type="button" aria-pressed={vueToutes === 'avenir'} onclick={() => (vueToutes = 'avenir')}>En cours et à venir</button>
      <button type="button" aria-pressed={vueToutes === 'terminees'} onclick={() => (vueToutes = 'terminees')}>Terminées</button>
    </div>
  {/if}
  {#if !exemple && vueToutes === 'terminees'}
    <HistoriquePaies cycles={terminees} bind:annee={anneeHistorique} bind:seulementAVerifier={filtreAVerifier} onouvrir={(c) => ouvrirFenetre(c.paie.dateOrigine)} />
  {:else}
  {#if vue.plan.avantPremierCycle.length > 0}
    <p class="discret" data-testid="avant-premier-cycle">
      Avant le premier cycle (non compté) :
      {vue.plan.avantPremierCycle.map((l) => `${l.libelle} du ${formaterDateCourte(l.echeance ?? jour)}`).join(', ')}
    </p>
  {/if}
  {#each vue.plan.reglesSansOccurrence as id (id)}
    <p class="discret">La règle « {id} » ne s’applique à aucune paie de cette période.</p>
  {/each}

  {#if !exemple && vue.aVerifierAvant > 0}
    <p class="discret" data-testid="a-verifier-avant">
      {vue.aVerifierAvant === 1 ? '1 élément à vérifier' : `${vue.aVerifierAvant} éléments à vérifier`} dans les paies terminées.
      <button type="button" class="petit" onclick={voirAVerifier}>Les retrouver</button>
    </p>
  {/if}
  <TableauCycles cycles={vue.cycles} {choisi} courant={vue.courant} onchoisir={choisirCycle} {detail} />
  {#if !exemple}
    <p class="boutons">
      <button type="button" onclick={() => (nombreCycles += NOMBRE_CYCLES)}>Voir les paies suivantes</button>
      {#if nombreCycles > NOMBRE_CYCLES}
        <button type="button" onclick={() => (nombreCycles = NOMBRE_CYCLES)}>Revenir au cycle actuel</button>
      {/if}
    </p>
  {/if}
  {/if}
  <p class="discret">
    Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.
  </p>
  </div>
{/if}

{#if !exemple && donnees?.profil && ongletPaies === 'prochaines'}
  <MaPaie
    donnees={donnees as DonneesPaie & { profil: ProfilPaieStocke }}
    {jour}
    {salaireActuel}
    {remise}
    {proposer}
    erreur={proposition ? null : erreurSaisie}
    onabandonner={annuler}
    onformulaire={(ouvert) => {
      formulaireMaPaie = ouvert;
      if (ouvert) {
        proposition = null;
        erreurSaisie = null;
      }
    }}
  />
{/if}

{#if (exemple || donnees?.profil) && ongletPaies === 'prochaines'}
  <RevenusDepenses
    elements={exemple ? ELEMENTS_EXEMPLE : (donnees?.elements ?? []).filter((e) => !estDette(e.id))}
    {donnees}
    modifiable={!exemple}
    cycles={vue?.cycles ?? []}
    {jour}
    {remise}
    {proposer}
    {aGerer}
    mode={exemple ? 'tout' : 'revenus'}
    erreur={proposition ? null : erreurSaisie}
    onformulaire={(ouvert) => {
      formulaireRegle = ouvert;
      if (ouvert) erreurSaisie = null;
    }}
  />
{/if}

{#if erreurSaisie && !proposition && !formulaireOuvert}
  <p role="alert" class="erreur" data-testid="erreur-saisie">{erreurSaisie}</p>
{/if}
{#if dernier}
  <p class="enregistre" role="status" data-testid="enregistre">
    Enregistré : {finPhrase(dernier.titre)}
    <button type="button" onclick={annulerDernier} disabled={enCours}>Annuler</button>
    <button type="button" class="fermer" onclick={() => (dernier = null)} aria-label="Fermer">×</button>
  </p>
{:else if messageAnnulation}
  <p class="enregistre" role="status" data-testid="annule">{messageAnnulation}</p>
{/if}
{#if fenetre && cycleFenetre}
  {@const c = cycleFenetre}
  <FenetreFormulaire
    large
    titre={ligneFenetre ? `« ${donnees && !exemple ? libelleLigne(donnees, ligneFenetre) : ligneFenetre.libelle} »` : `Paie du ${formaterDateLongue(c.paie.date)}`}
    contexte={contexteCycle(c)}
    erreur={proposition || sousFormulaireOuvert ? null : erreurSaisie}
    retourEnfants={ligneFenetre ? '← Retour au détail de l’opération' : '← Retour au détail de la paie'}
    onabandonner={fermerFenetre}
  >
    {#if ligneFenetre && !sousFormulaireOuvert}
      {@render detailOperation(c, ligneFenetre)}
    {:else}
      {@render corpsDetail(c, true)}
    {/if}
  </FenetreFormulaire>
{/if}

{#if proposition}
  <Apercu
    {proposition}
    {enCours}
    erreur={erreurSaisie}
    variante={varianteApercu}
    choix={source ? choixSource : undefined}
    onconfirmer={confirmer}
    onajuster={() => (proposition = null)}
    onannuler={annuler}
  />
{/if}


{#snippet choixSource()}
  {#if source}
    {@const s = source}
    <fieldset class="source" data-testid="choix-source">
      <legend>Source du paiement</legend>
      <label class="en-ligne"
        ><input type="radio" name="source" checked={!s.sansReserve} data-testid="source-reserve" onchange={() => confirmerAvecSource(s.cible, s.saisie, false)} /> Payer avec la réserve « {s.reserve} »</label
      >
      <label class="en-ligne"
        ><input type="radio" name="source" checked={s.sansReserve} data-testid="source-paie" onchange={() => confirmerAvecSource(s.cible, s.saisie, true)} /> Payer depuis ma paie (dépense planifiée)</label
      >
      <p class="discret">Choisir la source ne déplace rien : l’aperçu se met à jour, et rien n’est enregistré avant ta confirmation.</p>
    </fieldset>
  {/if}
{/snippet}

{#snippet marques(l: Ligne)}
  {#if l.ajuste}<span class="marque" data-testid="ajuste">ajusté</span>{/if}
  {#if l.manuel}<span class="marque">payée avec cette paie</span>{/if}
{/snippet}

{#snippet boutonAjuster(c: Cycle, l: Ligne)}
  {#if !exemple}
    <button type="button" class="action-secondaire" onclick={() => ouvrirOccurrence(c, l.elementId, l.origine)} aria-label={`Ajuster ${l.libelle} pour cette fois`}>
      Ajuster
    </button>
  {/if}
{/snippet}

{#snippet formulaireOccurrence(c: Cycle)}
  {@const cible = occurrence!}
  {@const ligne = c.lignes.find((l) => l.elementId === cible.elementId && l.origine === cible.origine)!}
  {@const rapides = donnees ? choixRapides(donnees, cible.elementId, ligne.echeance ?? c.paie.date) : []}
  <form
    class="formulaire occurrence"
    data-testid="formulaire-occurrence"
    onsubmit={(e) => {
      e.preventDefault();
      proposer(() => proposerAjustement(donnees!, cible, { montant: fOccMontant, date: fOccDate, paie: fOccPaie }, jour));
    }}
  >
    <p class="discret">« {ligne.libelle} », cette fois seulement : la règle ne change pas.</p>
    {#if rapides.length > 0}
      <p class="choix-rapides" data-testid="choix-rapides">
        Selon le dernier relevé :
        {#each rapides as r (r.libelle)}
          <button type="button" class="petit" onclick={() => (fOccMontant = (r.montant / 100).toFixed(2).replace('.', ','))}>{r.libelle} : {formaterMontant(r.montant)}</button>
        {/each}
      </p>
    {/if}
    <label>Montant cette fois ($) <input inputmode="decimal" bind:value={fOccMontant} /></label>
    {#if ligne.echeance !== null}
      <label>Date prévue <input type="date" bind:value={fOccDate} /></label>
    {/if}
    <label
      >Payée avec la paie du
      <select bind:value={fOccPaie}>
        {#each vue?.cycles ?? [] as autre (autre.paie.dateOrigine)}
          <option value={autre.paie.dateOrigine}>{formaterDateCourte(autre.paie.date)} {autre.paie.date.slice(0, 4)}</option>
        {/each}
      </select>
    </label>
    <button type="submit" class="principal">Enregistrer</button>
    <button type="button" onclick={() => proposer(() => proposerRetrait(donnees!, cible, !ligne.retiree, jour))}>
      {ligne.retiree ? 'Remettre cette fois' : 'Retirer cette fois'}
    </button>
    {#if ligne.ajuste}
      <button type="button" onclick={() => proposer(() => proposerRetourRegle(donnees!, cible, jour))}>Revenir à la règle</button>
    {/if}
    {#if donnees && estPret(donnees, cible.elementId)}
      <button type="button" onclick={() => onvoirpret?.(cible.elementId)}>Voir le prêt</button>
    {:else if donnees && estPaiementCarte(donnees, cible.elementId)}
      {#if estSupplement(donnees, cible.elementId) && ligne.statut !== 'confirme'}
        <button type="button" onclick={() => proposer(() => proposerSuppressionSupplement(donnees!, cible.elementId, jour))}>Supprimer ce paiement…</button>
      {/if}
      <button type="button" onclick={() => onvoircarte?.()}>Voir la carte</button>
    {:else if donnees && estContribution(donnees, cible.elementId)}
      <button type="button" onclick={() => onvoircompte?.(compteDeLigne(cible.elementId)?.id ?? '')}>Voir le compte</button>
    {:else if donnees && estDepenseAPrevoir(donnees, cible.elementId)}
      <button type="button" onclick={() => onvoirdepenses?.()}>Voir dans Dépenses</button>
    {:else}
      <button
        type="button"
        onclick={() => {
          // L'identifiant est lu avant de fermer la fenêtre : `cible` en dépend.
          const id = cible.elementId;
          occurrence = null;
          // V1 : les dépenses régulières se gèrent dans Dépenses ; les revenus restent ici.
          if (donnees?.elements.find((e) => e.id === id)?.nature === 'depense') {
            onvoirdepenses?.(id);
            return;
          }
          // V1 lot 6b : les revenus se gèrent sous « Mes prochaines paies ».
          fenetre = null;
          ongletPaies = 'prochaines';
          aGerer = null;
          queueMicrotask(() => (aGerer = id));
        }}>Modifier la règle…</button
      >
    {/if}
    <button type="button" onclick={() => (occurrence = null)}>Abandonner</button>
  </form>
{/snippet}

{#snippet statutLigne(l: Ligne)}
  {#if l.statut === 'confirme' && l.confirmation}
    <span class="statut confirme" data-testid="statut">Confirmé le {formaterDateCourte(l.confirmation.date)}</span>
    {#if l.montantPrevu !== null && l.montantPrevu !== l.confirmation.montant}<span class="note">prévu {formaterMontant(l.montantPrevu)}</span>{/if}
  {:else if l.statut === 'retiree'}
    <span class="statut" data-testid="statut">retirée cette fois</span>
  {:else if l.statut === 'enveloppe'}
    <span class="statut" data-testid="statut">Enveloppe</span>
  {:else}
    <span class="statut" class:a-verifier={l.statut === 'aVerifier'} data-testid="statut">{l.statut === 'aVerifier' ? 'À vérifier' : 'À venir'}</span>
    {#if l.incertain && !l.compte}<span class="note">non compté (incertain)</span>{/if}
  {/if}
{/snippet}

{#snippet actionsLigne(c: Cycle, l: Ligne)}
  {#if !exemple}
    {@const cible = { elementId: l.elementId, origine: l.origine }}
    <span class="actions-ligne">
      {#if l.statut === 'confirme'}
        <button type="button" class="action-secondaire" onclick={() => ouvrirConfirmation(cible, 'corriger', l.montantPrevu, l.confirmation)}>Corriger</button>
        <button type="button" class="action-secondaire" onclick={() => proposerAnnulation(cible)}>Annuler la confirmation</button>
      {:else if l.statut === 'aVenir' || l.statut === 'aVerifier'}
        <button type="button" class="petit principal" onclick={() => confirmerAvecSource(cible, null, false, l.montantPrevu)} aria-label={`Confirmer ${l.libelle}`}>Confirmer</button>
        <button type="button" class="action-secondaire" onclick={() => ouvrirConfirmation(cible, 'confirmer', l.montantPrevu, null)}>Confirmer autrement…</button>
        {#if l.statut === 'aVerifier'}
          <button type="button" class="action-secondaire" onclick={() => proposer(() => proposerRetrait(donnees!, cible, true, jour))}>N’a pas eu lieu</button>
        {/if}
        {@render boutonAjuster(c, l)}
      {:else}
        {@render boutonAjuster(c, l)}
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet formulaireConfirmation()}
  {@const f = formConfirmation!}
  <form
    class="formulaire occurrence"
    data-testid="formulaire-confirmation"
    onsubmit={(e) => {
      e.preventDefault();
      const saisie = { montant: fConfMontant, date: fConfDate, sansReserve: fConfSansReserve };
      if (f.mode === 'corriger') proposer(() => proposerCorrection(donnees!, f.cible, saisie, jour));
      else confirmerAvecSource(f.cible, { montant: fConfMontant, date: fConfDate }, fConfSansReserve);
    }}
  >
    <p class="discret">
      {f.mode === 'corriger' ? 'Corriger la confirmation' : 'Confirmer avec le montant et la date réels'} : la date est une information, elle ne
      change pas le cycle.
    </p>
    <label>Montant reçu ou payé ($) <input inputmode="decimal" bind:value={fConfMontant} /></label>
    <label>Date <input type="date" bind:value={fConfDate} /></label>
    {#if f.mode === 'confirmer' && f.cible.elementId && donnees && reserveDeDepense(donnees, f.cible.elementId)}
      {@const lien = reserveDeDepense(donnees, f.cible.elementId)!}
      <fieldset class="source">
        <legend>Source du paiement</legend>
        <label class="en-ligne"><input type="radio" name="source-formulaire" bind:group={fConfSansReserve} value={false} data-testid="source-reserve" /> Payer avec la réserve « {lien.reserve.nom} »</label>
        <label class="en-ligne"><input type="radio" name="source-formulaire" bind:group={fConfSansReserve} value={true} data-testid="source-paie" /> Payer depuis ma paie (dépense planifiée)</label>
      </fieldset>
    {/if}
    <button type="submit" class="principal">Enregistrer</button>
    <button type="button" onclick={() => (formConfirmation = null)}>Abandonner</button>
  </form>
{/snippet}

{#snippet detailOperation(c: Cycle, l: Ligne)}
  {@const couv = couvertureDe(l)}
  {@const sortie = l.nature === 'depense'}
  <section class="operation" data-testid="detail-operation">
    <dl class="cles-operation">
      <div>
        <dt>Montant</dt>
        <dd class="montant-operation" class:inconnu={l.montant === null}>{sortie && l.montant !== null ? '−' : ''}{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</dd>
      </div>
      <div>
        <dt>Date prévue</dt>
        <dd>{l.echeance ? formaterDateLongue(l.echeance) : `Dans le cycle du ${formaterDateCourte(c.debut)} au ${formaterDateCourte(c.fin)}`}</dd>
      </div>
      <div>
        <dt>Statut</dt>
        <dd>{@render statutLigne(l)}</dd>
      </div>
      <div>
        <dt>Nature</dt>
        <dd>{typeLigne(l)}{l.estimation ? ' — estimation' : ''}</dd>
      </div>
    </dl>
    {#if l.ajuste || l.manuel || couv}
      <p class="notes-operation">{@render marques(l)}{#if couv}<span class="note" data-testid="couverture-ligne">{couv}</span>{/if}</p>
    {/if}
    {#if exemple}
      <p class="discret">Exemple fictif : rien ne peut être confirmé ni modifié ici.</p>
    {:else}
      <div class="actions-operation">
        {@render actionsLigne(c, l)}
      </div>
      <p class="liens-operation">
        {#if donnees && estPret(donnees, l.elementId)}
          <button type="button" class="lien" onclick={() => onvoirpret?.(l.elementId)}>Voir le prêt</button>
        {:else if donnees && estPaiementCarte(donnees, l.elementId)}
          <button type="button" class="lien" onclick={() => onvoircarte?.()}>Voir la carte</button>
        {:else if donnees && estContribution(donnees, l.elementId)}
          <button type="button" class="lien" onclick={() => onvoircompte?.(compteDeLigne(l.elementId)?.id ?? '')}>Voir le compte</button>
        {:else if l.nature === 'depense'}
          <button type="button" class="lien" onclick={() => onvoirdepenses?.(estDepenseAPrevoir(donnees!, l.elementId) ? undefined : l.elementId)}>Voir dans Dépenses</button>
        {/if}
      </p>
    {/if}
    <p class="tout-le-detail">
      <button type="button" class="lien" data-testid="voir-toute-la-paie" onclick={() => ouvrirFenetre(c.paie.dateOrigine)}>Voir tout le détail de cette paie →</button>
    </p>
  </section>
{/snippet}

{#snippet detail(c: Cycle)}
  {@render corpsDetail(c, false)}
{/snippet}

<!-- V1 lot 6b : le même détail sert au tableau « Toutes mes paies » et à la
     grande fenêtre ; dans la fenêtre, un formulaire ouvert prend la place du
     tableau (« ← Retour au détail de la paie »), sans fenêtre superposée. -->
{#snippet corpsDetail(c: Cycle, enFenetre: boolean)}
  {@const confirmables = (c.paieStatut !== 'confirme' ? 1 : 0) + c.lignes.filter((l) => (l.statut === 'aVenir' || l.statut === 'aVerifier') && !l.incertain).length}
  {@const tableauVisible = !(enFenetre && sousFormulaireOuvert)}
  <section class="carte" class:en-fenetre={enFenetre} aria-labelledby={enFenetre ? undefined : 'titre-detail'} aria-label={enFenetre ? `Cycle du ${formaterDateLongue(c.debut)} au ${formaterDateLongue(c.fin)}` : undefined} data-testid="detail-cycle">
    {#if tableauVisible}
    {#if enFenetre && !exemple && donnees && c.fin < jour}
      <!-- H3 : une paie terminée commence par son mini-bilan. -->
      <BilanPaie cycle={c} libelle={(l) => libelleLigne(donnees!, l)} />
    {/if}
    <div class="entete-detail">
      {#if !enFenetre}<h2 id="titre-detail">Cycle du {formaterDateLongue(c.debut)} au {formaterDateLongue(c.fin)}</h2>{/if}
      {#if !exemple && confirmables > 0}
        <button type="button" onclick={() => proposer(() => proposerToutConfirmer(donnees!, c.paie.dateOrigine, jour))}>Tout confirmer…</button>
      {/if}
    </div>
    <table>
      <tbody>
        <tr class="groupe"><th scope="rowgroup" colspan="4">Revenus</th></tr>
        <tr data-testid="ligne-paie">
          <th scope="row">Paie du {formaterDateCourte(c.paie.date)}{c.paie.deplacee ? ` (prévue le ${formaterDateCourte(c.paie.dateOrigine)})` : ''}</th>
          <td class="montant">
            {#if c.paieConfirmation}{formaterMontant(c.paieConfirmation.montant)}{:else}{c.paie.montant === null ? 'À compléter' : formaterMontant(c.paie.montant)}{/if}
          </td>
          <td>
            {#if c.paieConfirmation}
              <span class="statut confirme" data-testid="statut">Confirmée le {formaterDateCourte(c.paieConfirmation.date)}</span>
              {#if c.paie.montant !== null && c.paie.montant !== c.paieConfirmation.montant}<span class="note">prévue {formaterMontant(c.paie.montant)}</span>{/if}
            {:else}
              <span class="statut" class:a-verifier={c.paieStatut === 'aVerifier'} data-testid="statut">{c.paieStatut === 'aVerifier' ? 'À vérifier' : 'À venir'}</span>
            {/if}
          </td>
          <td>
            {#if !exemple}
              {@const cible = { elementId: null, origine: c.paie.dateOrigine }}
              <span class="actions-ligne">
                {#if c.paieConfirmation}
                  <button type="button" class="action-secondaire" onclick={() => ouvrirConfirmation(cible, 'corriger', c.paie.montant, c.paieConfirmation)}>Corriger</button>
                  <button type="button" class="action-secondaire" onclick={() => proposerAnnulation(cible)}>Annuler la confirmation</button>
                {:else}
                  <button type="button" class="petit principal" onclick={() => proposer(() => proposerConfirmation(donnees!, cible, null, jour))} aria-label="Confirmer la paie">Confirmer</button>
                  <button type="button" class="action-secondaire" onclick={() => ouvrirConfirmation(cible, 'confirmer', c.paie.montant, null)}>Confirmer autrement…</button>
                {/if}
              </span>
            {/if}
          </td>
        </tr>
        {#each c.lignes.filter((l) => l.nature === 'revenu') as l (`${l.elementId}|${l.origine}`)}
          <tr class:non-compte={!l.compte} class:retiree={l.retiree} data-ligne={l.elementId}>
            <th scope="row">
              {l.libelle}{l.echeance ? ` (le ${formaterDateCourte(l.echeance)})` : ''}{l.estimation ? ' — estimation' : ''}
              {@render marques(l)}
            </th>
            <td class="montant">{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
            <td>{@render statutLigne(l)}</td>
            <td>{@render actionsLigne(c, l)}</td>
          </tr>
        {/each}
        <tr class="groupe"><th scope="rowgroup" colspan="4">Sorties</th></tr>
        {#each c.lignes.filter((l) => l.nature === 'depense' && !estDette(l.elementId)) as l (`${l.elementId}|${l.origine}`)}
          <tr class:retiree={l.retiree} data-ligne={l.elementId}>
            <th scope="row">
              {l.libelle}{l.echeance ? ` (dû le ${formaterDateCourte(l.echeance)})` : ''}{l.genre === 'enveloppe' ? ' — enveloppe' : ''}{l.estimation
                ? ' — estimation'
                : ''}
              {@render marques(l)}
            </th>
            <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
            <td>{@render statutLigne(l)}</td>
            <td>{@render actionsLigne(c, l)}</td>
          </tr>
        {:else}
          <tr><td colspan="4" class="discret">Aucune sortie prévue dans ce cycle.</td></tr>
        {/each}
        {#if dettesDe(c).length > 0}
          <tr class="groupe"><th scope="rowgroup" colspan="4">Dettes</th></tr>
          {#each dettesDe(c) as l (`${l.elementId}|${l.origine}`)}
            <tr class:retiree={l.retiree} data-ligne={l.elementId} data-dette="oui">
              <th scope="row">
                Paiement — {l.libelle}{l.echeance ? ` (dû le ${formaterDateCourte(l.echeance)})` : ''}
                {@render marques(l)}
                <button type="button" class="lien" onclick={() => onvoirpret?.(l.elementId)}>Voir le prêt</button>
              </th>
              <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
              <td>{@render statutLigne(l)}</td>
              <td>{@render actionsLigne(c, l)}</td>
            </tr>
          {/each}
        {/if}
        {#if carte}
          <tr class="groupe"><th scope="rowgroup" colspan="4">Visa</th></tr>
          {#each carteDe(c) as l (`${l.elementId}|${l.origine}`)}
            <tr class:retiree={l.retiree} data-ligne={l.elementId} data-dette="carte">
              <th scope="row">
                {libelleLigne(donnees!, l)}{l.echeance ? ` (dû le ${formaterDateCourte(l.echeance)})` : ''}
                {@render marques(l)}
              </th>
              <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
              <td>{@render statutLigne(l)}</td>
              <td>{@render actionsLigne(c, l)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="discret">Aucun paiement de la carte dans ce cycle.</td></tr>
          {/each}
          <tr>
            <td colspan="4">
              <span class="actions-ligne">
                <button type="button" class="petit" onclick={() => ouvrirSupplement(c)}>+ Paiement supplémentaire</button>
                <button type="button" class="lien" onclick={() => onvoircarte?.()}>Voir la carte</button>
              </span>
            </td>
          </tr>
        {/if}
        {#if aPrevoirDe(c).length > 0}
          <tr class="groupe"><th scope="rowgroup" colspan="4">Dépenses à prévoir</th></tr>
          {#each aPrevoirDe(c) as l (`${l.elementId}|${l.origine}`)}
            {@const couv = couvertureDe(l)}
            <tr class:retiree={l.retiree} data-ligne={l.elementId} data-a-prevoir="oui">
              <th scope="row">
                {l.libelle}{l.echeance ? ` (le ${formaterDateCourte(l.echeance)})` : ''}{l.estimation ? ' — estimation' : ''}
                {@render marques(l)}
                {#if couv}<span class="note" data-testid="couverture-ligne">{couv}</span>{/if}
              </th>
              <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
              <td>{@render statutLigne(l)}</td>
              <td>{@render actionsLigne(c, l)}</td>
            </tr>
          {/each}
        {/if}
        {#if comptesOuverts.length > 0 || epargneDe(c).length > 0}
          <tr class="groupe"><th scope="rowgroup" colspan="4">Épargne</th></tr>
          {#each epargneDe(c) as l (`${l.elementId}|${l.origine}`)}
            <tr class:retiree={l.retiree} data-ligne={l.elementId} data-epargne="contribution">
              <th scope="row">
                {libelleLigne(donnees!, l)}{l.echeance ? ` (le ${formaterDateCourte(l.echeance)})` : ''}
                {@render marques(l)}
              </th>
              <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
              <td>{@render statutLigne(l)}</td>
              <td>{@render actionsLigne(c, l)}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="discret">Aucune contribution dans ce cycle.</td></tr>
          {/each}
          {#if comptesOuverts.length > 0}
            <tr>
              <td colspan="4">
                <span class="actions-ligne">
                  <button type="button" class="petit" onclick={() => ouvrirContribution(c)}>+ Contribution ponctuelle</button>
                </span>
              </td>
            </tr>
          {/if}
        {/if}
        <tr class="total">
          <th scope="row">Disponible planifié</th>
          <td class="montant">{c.disponible === null ? 'À compléter' : formaterMontant(c.disponible)}</td>
          <td>{c.estimation ? 'Estimation' : ''}</td>
          <td></td>
        </tr>
        {#if donnees && !exemple && raisonsACompleter(donnees, c)}
          <tr><td colspan="4" class="discret" data-testid="raison-a-completer">{raisonsACompleter(donnees, c)}</td></tr>
        {/if}
      </tbody>
    </table>
    {/if}
    {#if formContribution === c.paie.dateOrigine}
      <FenetreFormulaire titre="Contribution ponctuelle" contexte={contexteCycle(c)} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formContribution = null)}>
      <form
        class="formulaire occurrence"
        data-testid="formulaire-contribution-ponctuelle"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerContributionPonctuelle(donnees!, { compteId: fConCompte, montant: fConMontant, date: fConDate }, jour));
        }}
      >
        <p class="discret">Une contribution de plus, une seule fois : les contributions récurrentes ne changent pas.</p>
        <label
          >Compte
          <select bind:value={fConCompte}>
            <option value="" disabled>Choisir…</option>
            {#each comptesOuverts as k (k.id)}<option value={k.id}>{nomCompte(donnees!, k)}</option>{/each}
          </select>
        </label>
        <label>Montant ($) <input inputmode="decimal" bind:value={fConMontant} /></label>
        <label>Date <input type="date" bind:value={fConDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formContribution = null)}>Abandonner</button>
      </form>
      </FenetreFormulaire>
    {/if}
    {#if formSupplement === c.paie.dateOrigine}
      <FenetreFormulaire titre="Paiement supplémentaire sur la carte" contexte={contexteCycle(c)} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formSupplement = null)}>
      <form
        class="formulaire occurrence"
        data-testid="formulaire-supplement"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerSupplement(donnees!, { montant: fSupMontant, date: fSupDate }, jour));
        }}
      >
        <p class="discret">Un paiement de plus sur la carte, une seule fois : les échéances ne changent pas.</p>
        <label>Montant ($) <input inputmode="decimal" bind:value={fSupMontant} /></label>
        <label>Date <input type="date" bind:value={fSupDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formSupplement = null)}>Abandonner</button>
      </form>
      </FenetreFormulaire>
    {/if}
    {#if occurrence && c.lignes.some((l) => l.elementId === occurrence?.elementId && l.origine === occurrence?.origine)}
      {@const lo = c.lignes.find((l) => l.elementId === occurrence?.elementId && l.origine === occurrence?.origine)!}
      <FenetreFormulaire titre={`Ajuster « ${libelleLigne(donnees!, lo)} » pour cette fois`} contexte={contexteCycle(c)} erreur={proposition ? null : erreurSaisie} onabandonner={() => (occurrence = null)}>
        {@render formulaireOccurrence(c)}
      </FenetreFormulaire>
    {/if}
    {#if formConfirmation && (formConfirmation.cible.elementId === null ? formConfirmation.cible.origine === c.paie.dateOrigine : c.lignes.some((l) => l.elementId === formConfirmation?.cible.elementId && l.origine === formConfirmation?.cible.origine))}
      {@const fc = formConfirmation}
      {@const lc = fc.cible.elementId === null ? null : c.lignes.find((l) => l.elementId === fc.cible.elementId && l.origine === fc.cible.origine)}
      <FenetreFormulaire
        titre={`${fc.mode === 'corriger' ? 'Corriger' : 'Confirmer'} ${lc ? `« ${libelleLigne(donnees!, lc)} »` : `la paie du ${formaterDateCourte(c.paie.date)}`}`}
        contexte={contexteCycle(c)}
        erreur={proposition ? null : erreurSaisie}
        onabandonner={() => (formConfirmation = null)}
      >
        {@render formulaireConfirmation()}
      </FenetreFormulaire>
    {/if}
    {#if c.nonComptes > 0 && tableauVisible}
      <p class="discret">Non compté : {formaterMontant(c.nonComptes)} de revenus incertains, en attente de confirmation.</p>
    {/if}

    {#if !exemple}
      {#if !modifPaie}
        {#if tableauVisible}
        <p>
          <button
            type="button"
            onclick={() => {
              modifPaie = true;
              occurrence = null;
              formConfirmation = null;
              fDateReelle = c.paie.date;
              fMontantPaie = '';
            }}>Modifier la date ou le montant de cette paie…</button
          >
        </p>
        {/if}
      {:else}
        <FenetreFormulaire titre="Modifier cette paie seulement" contexte={contexteCycle(c)} erreur={proposition ? null : erreurSaisie} onabandonner={() => (modifPaie = false)}>
        <div class="modif-paie">
          <p class="discret">
            Il s’agit de la paie elle-même (prévue le {formaterDateLongue(c.paie.dateOrigine)}), pas d’un revenu ou d’une dépense
            du cycle. Le calendrier de paie ne change pas.
          </p>
          <form
            class="formulaire"
            onsubmit={(e) => {
              e.preventDefault();
              proposer(() => proposerException(donnees!, c.paie, { dateReelle: fDateReelle, montant: fMontantPaie }, undefined, jour));
            }}
          >
            <label>Date réelle de versement <input type="date" bind:value={fDateReelle} /></label>
            <label>Montant de cette paie ($, vide = habituel) <input inputmode="decimal" bind:value={fMontantPaie} /></label>
            <button type="submit" class="principal">Enregistrer</button>
            <button type="button" onclick={() => (modifPaie = false)}>Abandonner</button>
          </form>
        </div>
        </FenetreFormulaire>
      {/if}
    {/if}
  </section>
{/snippet}

<style>
  .carte {
    margin: 0 0 var(--espace-6);
    max-width: var(--largeur-contenu);
  }
  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
    margin: 0 0 var(--espace-5);
  }
  .onglets button {
    border: 2px solid var(--couleur-bordure-forte);
    background: var(--couleur-surface);
    color: var(--couleur-texte);
    font-weight: 700;
  }
  .onglets button.actif {
    background: var(--prune-700);
    border-color: var(--prune-700);
    color: var(--creme-50);
  }
  .choix-vue {
    display: inline-flex;
    gap: var(--espace-2);
    margin: 0 0 var(--espace-4);
  }
  .choix-vue button {
    border: 2px solid var(--couleur-bordure-forte);
    background: var(--couleur-surface);
    color: var(--couleur-texte);
    font-weight: 700;
  }
  .choix-vue button[aria-pressed='true'] {
    background: var(--couleur-panneau);
    border-color: var(--prune-600);
  }
  .rappel-passees {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--espace-3);
    margin: 0 0 var(--espace-4);
    padding: var(--espace-2) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-attention-fond);
    color: var(--couleur-attention);
    font-weight: 700;
    max-width: var(--largeur-contenu);
  }
  .carte.en-fenetre {
    border: 0;
    box-shadow: none;
    padding: 0;
    margin: 0;
    background: transparent;
  }
  .cles-operation {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--espace-3) var(--espace-6);
    margin: 0 0 var(--espace-4);
  }
  .cles-operation dt {
    font-size: var(--texte-petit);
    font-weight: 700;
    color: var(--couleur-texte-discret);
  }
  .cles-operation dd {
    margin: var(--espace-1) 0 0;
  }
  .montant-operation {
    font-family: var(--police-titre);
    font-size: var(--titre-carte);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
  .notes-operation {
    margin: 0 0 var(--espace-4);
  }
  .actions-operation :global(.actions-ligne) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: center;
  }
  .liens-operation,
  .tout-le-detail {
    margin: var(--espace-4) 0 0;
  }
  .tout-le-detail {
    padding-top: var(--espace-3);
    border-top: 1px solid var(--couleur-bordure);
  }
  .titre-tableau {
    margin: 0 0 var(--espace-2);
    font-size: var(--titre-carte);
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-3);
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: flex-end;
    margin-top: var(--espace-3);
  }
  .outil-exemple {
    margin: 0 0 var(--espace-4);
  }
  /* À côté de la loutre (flottante, à droite) : ces blocs se rangent à sa
     gauche sans passer dessous ; les paies commencent sous elle. */
  .bandeau-exemple,
  section[aria-labelledby='titre-config'] {
    display: flow-root;
  }
  .sous-loutre {
    clear: both;
  }
  .bandeau-exemple {
    padding: var(--espace-2) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-attention-fond);
    color: var(--couleur-attention);
    max-width: 1100px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 960px;
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-1) var(--espace-3) var(--espace-1) 0;
    font-weight: 400;
  }
  .groupe th {
    padding-top: var(--espace-3);
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  .non-compte th,
  .non-compte td {
    color: var(--couleur-texte-discret);
    font-style: italic;
  }
  .retiree th,
  .retiree td {
    color: var(--couleur-texte-discret);
    text-decoration: line-through;
  }
  .marque {
    display: inline-block;
    margin-left: var(--espace-2);
    padding: 0 var(--espace-2);
    border-radius: var(--arrondi);
    background: var(--couleur-surface-active);
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
    text-decoration: none;
  }
  .occurrence {
    margin-top: 0;
  }
  .occurrence p {
    flex-basis: 100%;
    margin: 0;
  }
  .entete-detail {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--espace-3);
  }
  .actions-ligne {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
  }
  .statut {
    color: var(--couleur-texte-discret);
    white-space: nowrap;
  }
  .statut.a-verifier {
    color: var(--couleur-attention);
  }
  .statut.confirme {
    color: var(--couleur-texte);
  }
  .modif-paie {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-3) var(--espace-4);
    margin-top: var(--espace-3);
  }
  .lien {
    margin-left: var(--espace-2);
    font-size: var(--taille-petit);
  }
  .total th,
  .total td {
    border-top: 1px solid var(--couleur-bordure);
    font-weight: 600;
  }
  .source {
    flex-basis: 100%;
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-2) var(--espace-4) var(--espace-3);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-2);
  }
  .source legend {
    font-weight: 700;
    padding: 0 var(--espace-1);
  }
  .source .discret {
    margin: 0;
  }
</style>
