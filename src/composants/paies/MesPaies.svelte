<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ErreurSaisie,
    LIBELLES_FREQUENCE,
    decrireFrequence,
    proposerException,
    proposerProfil,
    proposerSalaire,
    proposerSeuil,
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
  import { planifier, type Cycle, type Ligne, type Plan } from '../../noyau/cycles';
  import { dateCivile, formaterDateCourte, formaterDateLongue, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import { montantEnVigueur } from '../../noyau/regles';
  import Apercu from '../Apercu.svelte';
  import RevenusDepenses from './RevenusDepenses.svelte';
  import TableauCycles from './TableauCycles.svelte';

  interface Props {
    plateforme: Plateforme;
    profilInstallation: Profil | undefined;
    onchangement: () => void;
  }
  let { plateforme, profilInstallation, onchangement }: Props = $props();

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
  /** Dernier enregistrement direct, qu'on peut annuler (C). */
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);
  /** Occurrence en cours d'ajustement, dans le détail d'un cycle (A). */
  let occurrence: CibleOccurrence | null = $state(null);
  let fOccMontant = $state('');
  let fOccDate = $state('');
  let fOccPaie = $state('');
  /** Élément à ouvrir dans les listes (« Modifier la règle… »). */
  let aGerer: string | null = $state(null);

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
      return { plan, cycles: plan.cycles, courant: null };
    }
    if (!noyau?.profil) return null;
    return cyclesAffiches(
      noyau.profil,
      { exceptions: noyau.exceptions, elements: noyau.elements, ajustements: noyau.ajustements, seuil: noyau.seuil },
      jour,
      nombreCycles,
    );
  }

  const salaireActuel = $derived(noyau?.profil ? montantEnVigueur(noyau.profil.montants, jour) : null);

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
      messageAnnulation = `Annulé : ${d.titre}.`;
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

  function choisirCycle(dateOrigine: DateCivile) {
    choisi = choisi === dateOrigine ? null : dateOrigine;
    occurrence = null;
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
      Salaire net en vigueur : <strong data-testid="salaire-actuel">{salaireActuel === null ? 'À compléter' : formaterMontant(salaireActuel)}</strong>
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

{#if exemple || donnees?.profil}
  <RevenusDepenses
    elements={exemple ? ELEMENTS_EXEMPLE : (donnees?.elements ?? [])}
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
    Enregistré : {dernier.titre}.
    <button type="button" onclick={annulerDernier} disabled={enCours}>Annuler</button>
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

  <TableauCycles cycles={vue.cycles} {choisi} courant={vue.courant} onchoisir={choisirCycle} {detail} />
  {#if !exemple}
    <p class="boutons">
      <button type="button" onclick={() => (nombreCycles += NOMBRE_CYCLES)}>Voir les paies suivantes</button>
      {#if nombreCycles > NOMBRE_CYCLES}
        <button type="button" onclick={() => (nombreCycles = NOMBRE_CYCLES)}>Revenir au cycle actuel</button>
      {/if}
    </p>
  {/if}
  <p class="discret">
    Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.
  </p>
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
  <form
    class="formulaire occurrence"
    data-testid="formulaire-occurrence"
    onsubmit={(e) => {
      e.preventDefault();
      proposer(() => proposerAjustement(donnees!, cible, { montant: fOccMontant, date: fOccDate, paie: fOccPaie }, jour));
    }}
  >
    <p class="discret">« {ligne.libelle} », cette fois seulement : la règle ne change pas.</p>
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
    <button
      type="button"
      onclick={() => {
        aGerer = null;
        queueMicrotask(() => (aGerer = cible.elementId));
      }}>Modifier la règle…</button
    >
    <button type="button" onclick={() => (occurrence = null)}>Fermer</button>
  </form>
{/snippet}

{#snippet detail(c: Cycle)}
  <section class="carte" aria-labelledby="titre-detail" data-testid="detail-cycle">
    <h2 id="titre-detail">Cycle du {formaterDateLongue(c.debut)} au {formaterDateLongue(c.fin)}</h2>
    <table>
      <tbody>
        <tr class="groupe"><th scope="rowgroup" colspan="4">Revenus</th></tr>
        <tr>
          <th scope="row">Paie du {formaterDateCourte(c.paie.date)}{c.paie.deplacee ? ` (prévue le ${formaterDateCourte(c.paie.dateOrigine)})` : ''}</th>
          <td class="montant">{c.paie.montant === null ? 'À compléter' : formaterMontant(c.paie.montant)}</td>
          <td>Prévu</td>
          <td></td>
        </tr>
        {#each c.lignes.filter((l) => l.nature === 'revenu') as l (`${l.elementId}|${l.origine}`)}
          <tr class:non-compte={!l.compte} class:retiree={l.retiree}>
            <th scope="row">
              {l.libelle}{l.echeance ? ` (le ${formaterDateCourte(l.echeance)})` : ''}{l.estimation ? ' — estimation' : ''}
              {@render marques(l)}
            </th>
            <td class="montant">{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
            <td>{l.retiree ? 'retirée cette fois' : l.compte ? 'Prévu' : 'non compté (incertain)'}</td>
            <td>{@render boutonAjuster(c, l)}</td>
          </tr>
        {/each}
        <tr class="groupe"><th scope="rowgroup" colspan="4">Sorties</th></tr>
        {#each c.lignes.filter((l) => l.nature === 'depense') as l (`${l.elementId}|${l.origine}`)}
          <tr class:retiree={l.retiree}>
            <th scope="row">
              {l.libelle}{l.echeance ? ` (dû le ${formaterDateCourte(l.echeance)})` : ''}{l.genre === 'enveloppe' ? ' — enveloppe' : ''}{l.estimation
                ? ' — estimation'
                : ''}
              {@render marques(l)}
            </th>
            <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
            <td>{l.retiree ? 'retirée cette fois' : 'Prévu'}</td>
            <td>{@render boutonAjuster(c, l)}</td>
          </tr>
        {:else}
          <tr><td colspan="4" class="discret">Aucune sortie prévue dans ce cycle.</td></tr>
        {/each}
        <tr class="total">
          <th scope="row">Disponible planifié</th>
          <td class="montant">{c.disponible === null ? 'À compléter' : formaterMontant(c.disponible)}</td>
          <td>{c.estimation ? 'Estimation' : ''}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    {#if occurrence && c.lignes.some((l) => l.elementId === occurrence?.elementId && l.origine === occurrence?.origine)}
      {@render formulaireOccurrence(c)}
    {/if}
    {#if c.nonComptes > 0}
      <p class="discret">Non compté : {formaterMontant(c.nonComptes)} de revenus incertains, en attente de confirmation.</p>
    {/if}

    {#if !exemple}
      <h3>Modifier cette paie seulement</h3>
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
      </form>
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
