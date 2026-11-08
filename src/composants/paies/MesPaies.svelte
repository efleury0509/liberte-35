<script lang="ts">
  import { onMount } from 'svelte';
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
  import { ELEMENTS_FICTIFS, PERIODE_FICTIVE, PROFIL_FICTIF } from '../../exemple/scenarioFictif';
  import { aujourdhui } from '../../lib/aujourdhui';
  import { exempleAutorise } from '../../lib/exemple';
  import type { DonneesPaie, FrequenceStockee, Plateforme, Profil } from '../../lib/plateforme';
  import { planifier, type Cycle, type Plan } from '../../noyau/cycles';
  import { ajouterJours, dateCivile, formaterDateCourte, formaterDateLongue, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import { montantEnVigueur } from '../../noyau/regles';
  import Apercu from '../Apercu.svelte';
  import TableauCycles from './TableauCycles.svelte';

  interface Props {
    plateforme: Plateforme;
    profilInstallation: Profil | undefined;
    onchangement: () => void;
  }
  let { plateforme, profilInstallation, onchangement }: Props = $props();

  const NOMBRE_CYCLES = 13;
  const jour = aujourdhui();

  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let exemple = $state(false);
  let edition: 'aucune' | 'profil' | 'salaire' | 'seuil' = $state('aucune');
  let choisi: DateCivile | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);

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
      const plan = planifier({ profil: PROFIL_FICTIF, elements: ELEMENTS_FICTIFS }, PERIODE_FICTIVE.debut, PERIODE_FICTIVE.fin);
      return { plan, cycles: plan.cycles, courant: null };
    }
    if (!noyau?.profil) return null;
    const depart = noyau.profil.frequence.depart;
    const debut = depart > jour ? depart : ajouterJours(jour, -45);
    const plan = planifier(
      { profil: noyau.profil, exceptions: noyau.exceptions, seuil: noyau.seuil },
      debut,
      ajouterJours(debut, 260),
    );
    const i = plan.cycles.findIndex((c) => c.fin >= jour);
    const cycles = plan.cycles.slice(Math.max(0, i), Math.max(0, i) + NOMBRE_CYCLES);
    const actuel = plan.cycles.find((c) => c.debut <= jour && c.fin >= jour);
    return { plan, cycles, courant: actuel?.paie.dateOrigine ?? null };
  }

  const cycleChoisi = $derived(vue?.cycles.find((c) => c.paie.dateOrigine === choisi) ?? null);
  const salaireActuel = $derived(noyau?.profil ? montantEnVigueur(noyau.profil.montants, jour) : null);

  function proposer(fabrique: () => Proposition) {
    try {
      proposition = fabrique();
      erreurSaisie = null;
    } catch (e) {
      proposition = null;
      erreurSaisie = e instanceof ErreurSaisie || e instanceof Error ? e.message : String(e);
    }
  }

  async function confirmer() {
    if (!proposition) return;
    enCours = true;
    try {
      donnees = await plateforme.appliquerChangementsPaie(proposition.changements, proposition.journal);
      proposition = null;
      edition = 'aucune';
      erreurSaisie = null;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Enregistrement impossible.';
    } finally {
      enCours = false;
    }
  }

  function annuler() {
    proposition = null;
    edition = 'aucune';
    erreurSaisie = null;
  }

  function choisirCycle(dateOrigine: DateCivile) {
    choisi = choisi === dateOrigine ? null : dateOrigine;
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
    Exemple fictif des cas témoins de l’étape 3 : paie de 2 100 $ aux deux semaines, loyer, assurances, épicerie, essence et
    paiement supplémentaire de dette. Rien n’est enregistré.
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
          proposer(() => proposerSalaire(donnees!, fSalaireDate, fSalaireMontant));
        }}
      >
        <label>À partir du <input type="date" bind:value={fSalaireDate} required /></label>
        <label>Nouveau salaire net ($) <input inputmode="decimal" bind:value={fSalaireMontant} required /></label>
        <button type="submit" class="principal">Voir l’aperçu</button>
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
        <button type="submit" class="principal">Voir l’aperçu</button>
        <button type="button" onclick={annuler}>Annuler</button>
      </form>
    {/if}
  </section>
{/if}

{#if erreurSaisie && !proposition}
  <p role="alert" class="erreur" data-testid="erreur-saisie">{erreurSaisie}</p>
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

  <TableauCycles cycles={vue.cycles} {choisi} courant={vue.courant} onchoisir={choisirCycle} />
  <p class="discret">
    Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.
  </p>

  {#if cycleChoisi}
    {@render detail(cycleChoisi)}
  {/if}
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
    <button type="submit" class="principal">Voir l’aperçu</button>
    {#if !creation}<button type="button" onclick={annuler}>Annuler</button>{/if}
  </form>
{/snippet}

{#snippet detail(c: Cycle)}
  <section class="carte" aria-labelledby="titre-detail" data-testid="detail-cycle">
    <h2 id="titre-detail">Cycle du {formaterDateLongue(c.debut)} au {formaterDateLongue(c.fin)}</h2>
    <table>
      <tbody>
        <tr>
          <th scope="row">Paie du {formaterDateCourte(c.paie.date)}{c.paie.deplacee ? ` (prévue le ${formaterDateCourte(c.paie.dateOrigine)})` : ''}</th>
          <td class="montant">{c.paie.montant === null ? 'À compléter' : formaterMontant(c.paie.montant)}</td>
          <td>Prévu</td>
        </tr>
        {#each c.lignes as l (`${l.elementId}${l.echeance}`)}
          <tr>
            <th scope="row">
              {l.libelle}{l.echeance ? ` (dû le ${formaterDateCourte(l.echeance)})` : ''}{l.manuel ? ' — déplacé à la main' : ''}
            </th>
            <td class="montant">−{l.montant === null ? 'À compléter' : formaterMontant(l.montant)}</td>
            <td>Prévu</td>
          </tr>
        {/each}
        <tr class="total">
          <th scope="row">Disponible planifié</th>
          <td class="montant">{c.disponible === null ? 'À compléter' : formaterMontant(c.disponible)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    {#if c.lignes.length === 0 && !exemple}
      <p class="discret">Les dépenses régulières s’ajouteront à l’étape 4.</p>
    {/if}

    {#if !exemple}
      <h3>Modifier cette paie seulement</h3>
      <form
        class="formulaire"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerException(donnees!, c.paie, { dateReelle: fDateReelle, montant: fMontantPaie }));
        }}
      >
        <label>Date réelle de versement <input type="date" bind:value={fDateReelle} /></label>
        <label>Montant de cette paie ($, vide = habituel) <input inputmode="decimal" bind:value={fMontantPaie} /></label>
        <button type="submit" class="principal">Voir l’aperçu</button>
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
  .total th,
  .total td {
    border-top: 1px solid var(--couleur-bordure);
    font-weight: 600;
  }
</style>
