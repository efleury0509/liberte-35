<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    A_COMPLETER,
    ErreurSaisie,
    LIBELLES_FREQUENCE,
    decrireFrequence,
    proposerException,
    proposerProfil,
    proposerSalaire,
    proposerSeuil,
    salaireAffiche,
    versNoyau,
    type Proposition,
  } from '../../actions/paie';
  import { cyclesAffiches, NOMBRE_CYCLES } from '../../actions/elements';
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
  import type { ChangementPaie, DonneesPaie, EntreeJournal, FrequenceStockee, Plateforme, Profil } from '../../lib/plateforme';
  import { planifier, type Cycle, type FaitConfirme, type Ligne, type Plan } from '../../noyau/cycles';
  import { dateCivile, formaterDateCourte, formaterDateLongue, type DateCivile } from '../../noyau/dates';
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
  import { choixRapides, estPaiementCarte, laCarte, libelleLigne, proposerSupplement, raisonsACompleter } from '../../actions/cartes';
  import RevenusDepenses from './RevenusDepenses.svelte';
  import TableauCycles from './TableauCycles.svelte';

  interface Props {
    plateforme: Plateforme;
    profilInstallation: Profil | undefined;
    onchangement: () => void;
    /** Étape 7a : ouvrir un prêt dans Mes dettes. */
    onvoirpret?: (id: string) => void;
    /** Étape 8 : ouvrir la carte dans Mes dettes. */
    onvoircarte?: () => void;
  }
  let { plateforme, profilInstallation, onchangement, onvoirpret, onvoircarte }: Props = $props();

  const jour = aujourdhui();
  const ELEMENTS_EXEMPLE = ELEMENTS_ETAPE4.map(versElementStocke);

  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let exemple = $state(false);
  let edition: 'aucune' | 'profil' | 'salaire' | 'seuil' = $state('aucune');
  let choisi: DateCivile | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let remise = $state(0);
  let nombreCycles = $state(NOMBRE_CYCLES);
  let nombrePrecedents = $state(0);
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
  let fFrequence: FrequenceStockee = $state('deuxSemaines');
  let fDepart = $state('');
  let fJour1 = $state(15);
  let fJour2 = $state(31);
  let fMontant = $state('');
  let fSalaireDate = $state('');
  let fSalaireMontant = $state('');
  let fSeuil = $state('');
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
    return cyclesAffiches(
      noyau.profil,
      { exceptions: noyau.exceptions, elements: noyau.elements, ajustements: noyau.ajustements, confirmations: noyau.confirmations, seuil: noyau.seuil },
      jour,
      nombreCycles,
      nombrePrecedents,
    );
  }

  const salaireActuel = $derived(noyau?.profil ? salaireAffiche(noyau.profil.montants, jour) : A_COMPLETER);

  /**
   * Étape 4b, C : l'action prépare sa proposition ; si l'aperçu protège
   * vraiment (effet de bord, passé, suppression…), on le montre ; sinon on
   * enregistre tout de suite et on offre « Annuler ».
   */
  function proposer(fabrique: () => Proposition) {
    messageAnnulation = null;
    dernier = null;
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
    if (p.apercu) {
      proposition = p;
      void montrer('apercu');
    } else void enregistrer(p, true);
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
      edition = 'aucune';
      erreurSaisie = null;
      occurrence = null;
      modifPaie = false;
      formConfirmation = null;
      formSupplement = null;
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
    edition = 'aucune';
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

  function ouvrirEdition(mode: 'profil' | 'salaire' | 'seuil') {
    edition = mode;
    proposition = null;
    erreurSaisie = null;
    if (mode === 'profil' && donnees?.profil) {
      fFrequence = donnees.profil.frequence;
      fDepart = donnees.profil.depart;
      [fJour1, fJour2] = donnees.profil.jours ?? [15, 31];
    }
    if (mode === 'seuil') fSeuil = donnees?.seuil !== null && donnees?.seuil !== undefined ? String(donnees.seuil / 100) : '';
  }

  function basculerExemple() {
    exemple = !exemple;
    choisi = null;
    proposition = null;
    edition = 'aucune';
  }

  const libelleSalaire = (d: string) => formaterDateLongue(dateCivile(d));
  /** Étape 7a : versements de prêts du cycle, groupés sous « Dettes ». */
  const dettesDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => l.nature === 'depense' && estPret(donnees!, l.elementId)) : []);
  /** Étape 8 (Q65) : paiements de la carte du cycle, dans un seul groupe « Visa ». */
  const carteDe = (c: Cycle) => (donnees && !exemple ? c.lignes.filter((l) => estPaiementCarte(donnees!, l.elementId)) : []);
  const estDette = (id: string) => !!donnees && !exemple && (estPret(donnees, id) || estPaiementCarte(donnees, id));
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
    {@render formulaireProfil(true)}
  </section>
{:else if donnees?.profil}
  <section class="carte" aria-labelledby="titre-paie">
    <h2 id="titre-paie">Ma paie</h2>
    <p data-testid="description-profil">{decrireFrequence(donnees.profil)}</p>
    <p>
      Salaire net en vigueur : <strong data-testid="salaire-actuel">{salaireActuel}</strong>
    </p>
    {#if donnees.salaires.length > 1}
      <ul class="discret">
        {#each donnees.salaires as s (s.aPartirDu)}
          <li>À partir du {libelleSalaire(s.aPartirDu)} : {formaterMontant(s.montant)}</li>
        {/each}
      </ul>
    {/if}
    <p>
      Seuil d’attention : <span data-testid="seuil">{donnees.seuil === null ? 'aucun' : formaterMontant(donnees.seuil)}</span>
    </p>
    <div class="boutons">
      <button type="button" onclick={() => ouvrirEdition('salaire')}>Changer le salaire à partir d’une date</button>
      <button type="button" onclick={() => ouvrirEdition('profil')}>Modifier le calendrier de paie</button>
      <button type="button" onclick={() => ouvrirEdition('seuil')}>Seuil d’attention</button>
    </div>

    {#if edition === 'profil'}
      {@render formulaireProfil(false)}
    {:else if edition === 'salaire'}
      <form
        class="formulaire"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerSalaire(donnees!, fSalaireDate, fSalaireMontant, jour));
        }}
      >
        <label>À partir du <input type="date" bind:value={fSalaireDate} required /></label>
        <label>Nouveau salaire net ($) <input inputmode="decimal" bind:value={fSalaireMontant} required /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={annuler}>Annuler</button>
      </form>
    {:else if edition === 'seuil'}
      <form
        class="formulaire"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerSeuil(donnees!, fSeuil));
        }}
      >
        <label>Seuil d’attention ($, vide pour aucun) <input inputmode="decimal" bind:value={fSeuil} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={annuler}>Annuler</button>
      </form>
    {/if}
  </section>
{/if}

{#if vue}
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
      {vue.aVerifierAvant === 1 ? '1 élément à vérifier' : `${vue.aVerifierAvant} éléments à vérifier`} dans les cycles précédents.
      <button type="button" class="petit" onclick={() => (nombrePrecedents += 2)}>Les afficher</button>
    </p>
  {/if}
  <TableauCycles cycles={vue.cycles} {choisi} courant={vue.courant} onchoisir={choisirCycle} {detail} />
  {#if !exemple}
    <p class="boutons">
      <button type="button" onclick={() => (nombrePrecedents += 2)}>Voir les paies précédentes</button>
      <button type="button" onclick={() => (nombreCycles += NOMBRE_CYCLES)}>Voir les paies suivantes</button>
      {#if nombreCycles > NOMBRE_CYCLES || nombrePrecedents > 0}
        <button
          type="button"
          onclick={() => {
            nombreCycles = NOMBRE_CYCLES;
            nombrePrecedents = 0;
          }}>Revenir au cycle actuel</button
        >
      {/if}
    </p>
  {/if}
  <p class="discret">
    Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.
  </p>
{/if}

{#if exemple || donnees?.profil}
  <RevenusDepenses
    elements={exemple ? ELEMENTS_EXEMPLE : (donnees?.elements ?? []).filter((e) => !estDette(e.id))}
    {donnees}
    modifiable={!exemple}
    cycles={vue?.cycles ?? []}
    {jour}
    {remise}
    {proposer}
    {aGerer}
  />
{/if}

{#if erreurSaisie && !proposition}
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
{#if proposition}
  <Apercu
    {proposition}
    {enCours}
    erreur={erreurSaisie}
    onconfirmer={confirmer}
    onajuster={() => (proposition = null)}
    onannuler={annuler}
  />
{/if}


{#snippet formulaireProfil(creation: boolean)}
  <form
    class="formulaire"
    onsubmit={(e) => {
      e.preventDefault();
      proposer(() =>
        proposerProfil(donnees!, {
          frequence: fFrequence,
          depart: fDepart,
          ...(fFrequence === 'deuxFoisParMois' ? { jours: [Number(fJour1), Number(fJour2)] as [number, number] } : {}),
          ...(creation ? { montant: fMontant } : {}),
        }),
      );
    }}
  >
    <label
      >Fréquence
      <select bind:value={fFrequence}>
        {#each Object.entries(LIBELLES_FREQUENCE) as [valeur, libelle] (valeur)}
          <option value={valeur}>{libelle}</option>
        {/each}
      </select>
    </label>
    <label>Date de la première paie <input type="date" bind:value={fDepart} required /></label>
    {#if fFrequence === 'deuxFoisParMois'}
      <label>Premier jour <input type="number" min="1" max="27" bind:value={fJour1} /></label>
      <label>Second jour (31 = dernier jour) <input type="number" min="2" max="31" bind:value={fJour2} /></label>
    {/if}
    {#if creation}
      <label>Montant net habituel ($, facultatif) <input inputmode="decimal" bind:value={fMontant} /></label>
    {/if}
    <button type="submit" class="principal">Enregistrer</button>
    {#if !creation}<button type="button" onclick={annuler}>Annuler</button>{/if}
  </form>
{/snippet}

{#snippet marques(l: Ligne)}
  {#if l.ajuste}<span class="marque" data-testid="ajuste">ajusté</span>{/if}
  {#if l.manuel}<span class="marque">payée avec cette paie</span>{/if}
{/snippet}

{#snippet boutonAjuster(c: Cycle, l: Ligne)}
  {#if !exemple}
    <button type="button" class="petit" onclick={() => ouvrirOccurrence(c, l.elementId, l.origine)} aria-label={`Ajuster ${l.libelle} pour cette fois`}>
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
      <button type="button" onclick={() => onvoircarte?.()}>Voir la carte</button>
    {:else}
      <button
        type="button"
        onclick={() => {
          aGerer = null;
          queueMicrotask(() => (aGerer = cible.elementId));
        }}>Modifier la règle…</button
      >
    {/if}
    <button type="button" onclick={() => (occurrence = null)}>Fermer</button>
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
        <button type="button" class="petit" onclick={() => ouvrirConfirmation(cible, 'corriger', l.montantPrevu, l.confirmation)}>Corriger</button>
        <button type="button" class="petit" onclick={() => proposer(() => proposerAnnulationConfirmation(donnees!, cible, jour))}>Annuler la confirmation</button>
      {:else if l.statut === 'aVenir' || l.statut === 'aVerifier'}
        <button type="button" class="petit principal" onclick={() => proposer(() => proposerConfirmation(donnees!, cible, null, jour))} aria-label={`Confirmer ${l.libelle}`}>Confirmer</button>
        <button type="button" class="petit" onclick={() => ouvrirConfirmation(cible, 'confirmer', l.montantPrevu, null)}>Confirmer autrement…</button>
        {#if l.statut === 'aVerifier'}
          <button type="button" class="petit" onclick={() => proposer(() => proposerRetrait(donnees!, cible, true, jour))}>N’a pas eu lieu</button>
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
      const saisie = { montant: fConfMontant, date: fConfDate };
      proposer(() => (f.mode === 'corriger' ? proposerCorrection(donnees!, f.cible, saisie, jour) : proposerConfirmation(donnees!, f.cible, saisie, jour)));
    }}
  >
    <p class="discret">
      {f.mode === 'corriger' ? 'Corriger la confirmation' : 'Confirmer avec le montant et la date réels'} : la date est une information, elle ne
      change pas le cycle.
    </p>
    <label>Montant reçu ou payé ($) <input inputmode="decimal" bind:value={fConfMontant} /></label>
    <label>Date <input type="date" bind:value={fConfDate} /></label>
    <button type="submit" class="principal">Enregistrer</button>
    <button type="button" onclick={() => (formConfirmation = null)}>Fermer</button>
  </form>
{/snippet}

{#snippet detail(c: Cycle)}
  {@const confirmables = (c.paieStatut !== 'confirme' ? 1 : 0) + c.lignes.filter((l) => (l.statut === 'aVenir' || l.statut === 'aVerifier') && !l.incertain).length}
  <section class="carte" aria-labelledby="titre-detail" data-testid="detail-cycle">
    <div class="entete-detail">
      <h2 id="titre-detail">Cycle du {formaterDateLongue(c.debut)} au {formaterDateLongue(c.fin)}</h2>
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
                  <button type="button" class="petit" onclick={() => ouvrirConfirmation(cible, 'corriger', c.paie.montant, c.paieConfirmation)}>Corriger</button>
                  <button type="button" class="petit" onclick={() => proposer(() => proposerAnnulationConfirmation(donnees!, cible, jour))}>Annuler la confirmation</button>
                {:else}
                  <button type="button" class="petit principal" onclick={() => proposer(() => proposerConfirmation(donnees!, cible, null, jour))} aria-label="Confirmer la paie">Confirmer</button>
                  <button type="button" class="petit" onclick={() => ouvrirConfirmation(cible, 'confirmer', c.paie.montant, null)}>Confirmer autrement…</button>
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
    {#if formSupplement === c.paie.dateOrigine}
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
        <button type="button" onclick={() => (formSupplement = null)}>Fermer</button>
      </form>
    {/if}
    {#if occurrence && c.lignes.some((l) => l.elementId === occurrence?.elementId && l.origine === occurrence?.origine)}
      {@render formulaireOccurrence(c)}
    {/if}
    {#if formConfirmation && (formConfirmation.cible.elementId === null ? formConfirmation.cible.origine === c.paie.dateOrigine : c.lignes.some((l) => l.elementId === formConfirmation?.cible.elementId && l.origine === formConfirmation?.cible.origine))}
      {@render formulaireConfirmation()}
    {/if}
    {#if c.nonComptes > 0}
      <p class="discret">Non compté : {formaterMontant(c.nonComptes)} de revenus incertains, en attente de confirmation.</p>
    {/if}

    {#if !exemple}
      {#if !modifPaie}
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
      {:else}
        <div class="modif-paie">
          <h3>Modifier cette paie seulement</h3>
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
            <button type="button" onclick={() => (modifPaie = false)}>Fermer</button>
          </form>
        </div>
      {/if}
    {/if}
  </section>
{/snippet}

<style>
  .carte {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-4) var(--espace-6);
    margin: 0 0 var(--espace-6);
    max-width: 1100px;
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-3);
  }
  h3 {
    font-size: var(--taille-texte);
    margin: var(--espace-6) 0 var(--espace-2);
  }
  .boutons,
  .formulaire {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: flex-end;
    margin-top: var(--espace-3);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
  }
  .discret {
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  .erreur {
    color: var(--couleur-erreur);
  }
  .outil-exemple {
    margin: 0 0 var(--espace-4);
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
    max-width: 640px;
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-1) var(--espace-3) var(--espace-1) 0;
    font-weight: 400;
  }
  .montant {
    text-align: right;
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
  .petit {
    min-height: 28px;
    padding: 0 var(--espace-3);
  }
  .occurrence {
    padding: var(--espace-3);
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
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
    color: var(--couleur-attention, #e0b45c);
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
    min-height: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--couleur-accent);
    text-decoration: underline;
    font-size: var(--taille-petit);
    cursor: pointer;
  }
  .fermer {
    min-width: 32px;
    padding: 0 var(--espace-2);
  }
  .enregistre {
    /* Toujours visible, même quand on agit depuis le bas de la page. */
    position: fixed;
    bottom: var(--espace-4);
    left: calc(50% + 120px);
    transform: translateX(-50%);
    z-index: 10;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
    display: flex;
    gap: var(--espace-3);
    align-items: center;
    max-width: 1100px;
    padding: var(--espace-2) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-surface);
    border: 1px solid var(--couleur-bordure);
  }
  .total th,
  .total td {
    border-top: 1px solid var(--couleur-bordure);
    font-weight: 600;
  }
</style>
