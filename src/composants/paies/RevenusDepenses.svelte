<script lang="ts">
  // Autres revenus (bloc distinct) et dépenses régulières en deux panneaux :
  // « Dépenses fixes » et « Enveloppes variables » (cahier 4.6-a, Q13).
  // Ce composant ne calcule rien et n'enregistre rien : il prépare des
  // propositions, que Mes paies montre en aperçu avant toute confirmation.
  import {
    LIBELLES_QUAND,
    QUAND_DEPENSE,
    QUAND_REVENU,
    decrireQuand,
    proposerAjout,
    proposerCertitude,
    proposerFin,
    proposerFrequence,
    proposerMontant,
    proposerReprise,
    proposerSuppression,
    proposerSuspension,
    quandLieePaie,
    quandSansDate,
    type Quand,
  } from '../../actions/elements';
  import { versElementNoyau } from '../../actions/elementsStockes';
  import type { Proposition } from '../../actions/paie';
  import type { DonneesPaie, ElementStocke } from '../../lib/plateforme';
  import type { Cycle } from '../../noyau/cycles';
  import { formaterDateCourte, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import { montantEnVigueur } from '../../noyau/regles';
  import { untrack } from 'svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';

  interface Props {
    elements: readonly ElementStocke[];
    donnees: DonneesPaie | null;
    modifiable: boolean;
    cycles: readonly Cycle[];
    jour: DateCivile;
    /** Augmente à chaque confirmation ou annulation : les formulaires se ferment. */
    remise: number;
    proposer: (fabrique: () => Proposition) => void;
    /** Élément à ouvrir (« Modifier la règle… » depuis le détail d'un cycle). */
    aGerer?: string | null;
    /** V1 : « revenus » dans Mes paies, « depenses » dans Dépenses, « tout » pour l'exemple. */
    mode?: 'revenus' | 'depenses' | 'fixes' | 'enveloppes' | 'tout';
    /** Erreur de la dernière proposition, montrée dans la fenêtre ouverte. */
    erreur?: string | null;
    onformulaire?: (ouvert: boolean) => void;
  }
  let { elements, donnees, modifiable, cycles, jour, remise, proposer, aGerer = null, mode = 'tout', erreur = null, onformulaire }: Props = $props();

  let ajout = $state(false);
  let gere: string | null = $state(null);
  let action: 'montant' | 'frequence' | 'suspendre' | 'reprendre' | 'terminer' | null = $state(null);
  let fNouvelleFrequence = $state<Quand>('chaquePaie');

  // Champs de l'ajout
  let fNature = $state<'depense' | 'revenu'>('depense');
  let fNom = $state('');
  let fMontant = $state('');
  let fEstime = $state(false);
  let fIncertain = $state(false);
  let fGenre = $state<'fixe' | 'enveloppe'>('fixe');
  let fQuand = $state<Quand>('mois');
  let fDate = $state('');
  let fCycle = $state('');
  // Champs des actions
  let fA = $state('');
  let fB = $state('');

  $effect(() => {
    void remise;
    ajout = false;
    gere = null;
    action = null;
  });

  $effect(() => {
    if (!aGerer) return;
    gere = aGerer;
    action = null;
    ajout = false;
    const id = aGerer;
    queueMicrotask(() => document.getElementById(`element-${id}`)?.scrollIntoView?.({ block: 'center' }));
  });

  let dernierEtat = false;
  $effect(() => {
    const ouvert = ajout || gere !== null;
    if (ouvert !== dernierEtat) {
      dernierEtat = ouvert;
      untrack(() => onformulaire?.(ouvert));
    }
  });

  const choixQuand = $derived(fNature === 'revenu' ? QUAND_REVENU : QUAND_DEPENSE);
  const recurrences = (e: ElementStocke) => (e.nature === 'revenu' ? QUAND_REVENU : QUAND_DEPENSE).filter((q) => q !== 'unique' && q !== 'cycle');
  const nombreAjustements = (e: ElementStocke) => (donnees?.ajustements ?? []).filter((a) => a.elementId === e.id).length;
  $effect(() => {
    if (!choixQuand.includes(fQuand)) fQuand = 'mois';
  });

  const revenus = $derived(elements.filter((e) => e.nature === 'revenu'));
  const fixes = $derived(elements.filter((e) => e.nature === 'depense' && e.genre === 'fixe'));
  const enveloppes = $derived(elements.filter((e) => e.nature === 'depense' && e.genre === 'enveloppe'));

  function montantAffiche(e: ElementStocke): string {
    const montants = versElementNoyau(e).regle.montants;
    const m = montantEnVigueur(montants, jour) ?? montants[0]?.montant ?? null;
    return m === null ? 'À compléter' : formaterMontant(m);
  }

  function etiquettes(e: ElementStocke): string[] {
    const t: string[] = [];
    if (e.estimation) t.push('Estimation');
    if (e.incertain) t.push('Incertain');
    const s = e.suspensions.find((x) => x.fin >= jour);
    if (s) t.push(s.debut <= jour ? `Suspendu jusqu’au ${formaterDateCourte(s.fin as DateCivile)}` : `Suspension du ${formaterDateCourte(s.debut as DateCivile)} au ${formaterDateCourte(s.fin as DateCivile)}`);
    if (e.fin) t.push(e.fin < jour ? 'Terminé' : `Se termine après le ${formaterDateCourte(e.fin as DateCivile)}`);
    const n = nombreAjustements(e);
    if (n > 0) t.push(n === 1 ? '1 occurrence ajustée' : `${n} occurrences ajustées`);
    return t;
  }

  function ouvrirAjout() {
    ajout = true;
    gere = null;
    action = null;
  }

  function gerer(id: string) {
    gere = gere === id ? null : id;
    action = null;
    ajout = false;
  }

  function choisirAction(a: typeof action) {
    action = a;
    fA = '';
    fB = '';
  }

  function soumettreAjout(e: SubmitEvent) {
    e.preventDefault();
    proposer(() =>
      proposerAjout(
        donnees!,
        {
          nature: fNature,
          libelle: fNom,
          genre: fGenre,
          montant: fMontant,
          estimation: fEstime,
          incertain: fIncertain,
          quand: fQuand,
          date: fDate,
          cyclePaie: fCycle,
        },
        jour,
      ),
    );
  }

  function soumettreAction(e: SubmitEvent, el: ElementStocke) {
    e.preventDefault();
    const d = donnees!;
    if (action === 'montant') proposer(() => proposerMontant(d, el.id, fA, fB, jour));
    if (action === 'frequence') proposer(() => proposerFrequence(d, el.id, fNouvelleFrequence, fA, jour));
    if (action === 'suspendre') proposer(() => proposerSuspension(d, el.id, fA, fB, jour));
    if (action === 'reprendre') proposer(() => proposerReprise(d, el.id, fA, jour));
    if (action === 'terminer') proposer(() => proposerFin(d, el.id, fA, jour));
  }
</script>

{#if mode !== 'depenses'}
<section class="bloc" aria-labelledby="titre-revenus" data-testid="bloc-revenus">
  <h2 id="titre-revenus">Autres revenus</h2>
  {#if revenus.length === 0}
    <p class="discret">Aucun autre revenu. Un revenu incertain reste hors du disponible tant que sa réception n’est pas confirmée.</p>
  {:else}
    <ul>{#each revenus as e (e.id)}{@render item(e)}{/each}</ul>
  {/if}
</section>
{/if}

{#if mode !== 'revenus'}
<div class="panneaux">
  {#if mode !== 'enveloppes'}
  <section class="bloc" aria-labelledby="titre-fixes" data-testid="panneau-fixes">
    <h2 id="titre-fixes">Dépenses fixes</h2>
    {#if fixes.length === 0}
      <p class="discret">Aucune dépense fixe.</p>
    {:else}
      <ul>{#each fixes as e (e.id)}{@render item(e)}{/each}</ul>
    {/if}
  </section>
  {/if}
  {#if mode !== 'fixes'}
  <section class="bloc" aria-labelledby="titre-enveloppes" data-testid="panneau-enveloppes">
    <h2 id="titre-enveloppes">Enveloppes variables</h2>
    <p class="discret">Montant prévu par cycle, jamais réconcilié ; rien n’est reporté.</p>
    {#if enveloppes.length === 0}
      <p class="discret">Aucune enveloppe.</p>
    {:else}
      <ul>{#each enveloppes as e (e.id)}{@render item(e)}{/each}</ul>
    {/if}
  </section>
  {/if}
</div>
{/if}

{#if modifiable}
  <p><button type="button" onclick={ouvrirAjout}>Ajouter un revenu ou une dépense</button></p>
  {#if ajout}
    <FenetreFormulaire titre="Ajouter un revenu ou une dépense" {erreur} onabandonner={() => (ajout = false)}>
    <form class="formulaire" data-testid="formulaire-element" onsubmit={soumettreAjout}>
      <label
        >Nature
        <select bind:value={fNature}>
          <option value="depense">Dépense</option>
          <option value="revenu">Revenu</option>
        </select>
      </label>
      <label>Nom <input bind:value={fNom} /></label>
      <label>Montant ($, facultatif) <input inputmode="decimal" bind:value={fMontant} /></label>
      {#if fNature === 'depense'}
        <label
          >Genre
          <select bind:value={fGenre}>
            <option value="fixe">Fixe</option>
            <option value="enveloppe">Enveloppe variable</option>
          </select>
        </label>
      {/if}
      <label
        >Quand
        <select bind:value={fQuand}>
          {#each choixQuand as q (q)}
            <option value={q}>{LIBELLES_QUAND[q]}</option>
          {/each}
        </select>
      </label>
      {#if fQuand === 'cycle'}
        <label
          >Cycle
          <select bind:value={fCycle}>
            <option value="">—</option>
            {#each cycles as c (c.paie.dateOrigine)}
              <option value={c.paie.dateOrigine}>Paie du {formaterDateCourte(c.paie.date)}</option>
            {/each}
          </select>
        </label>
      {:else if quandLieePaie(fQuand)}
        <label>Date de départ (facultatif : sinon, dès le cycle actuel) <input type="date" bind:value={fDate} /></label>
      {:else if !quandSansDate(fQuand)}
        <label>Date <input type="date" bind:value={fDate} /></label>
      {/if}
      <label class="case"><input type="checkbox" bind:checked={fEstime} /> Montant estimé</label>
      {#if fNature === 'revenu'}
        <label class="case"><input type="checkbox" bind:checked={fIncertain} /> Revenu incertain</label>
      {/if}
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (ajout = false)}>Abandonner</button>
    </form>
    </FenetreFormulaire>
  {/if}
{/if}

{#snippet item(e: ElementStocke)}
  <li id={`element-${e.id}`}>
    <div class="ligne">
      <span class="nom">{e.libelle}</span>
      <span class="montant">{montantAffiche(e)}</span>
      <span class="discret">{decrireQuand(e, jour)}</span>
      {#each etiquettes(e) as t (t)}<span class="etiquette">{t}</span>{/each}
      {#if modifiable}
        <button type="button" class="petit" onclick={() => gerer(e.id)} aria-expanded={gere === e.id}>Gérer</button>
      {/if}
    </div>
    {#if gere === e.id}
      <FenetreFormulaire
        titre={`Gérer « ${e.libelle} »`}
        contexte={`${montantAffiche(e)} · ${decrireQuand(e, jour)}`}
        {erreur}
        onabandonner={() => {
          gere = null;
          action = null;
        }}
      >
      <div class="boutons">
        <button type="button" onclick={() => choisirAction('montant')}>Changer le montant à partir d’une date</button>
        {#if !e.cyclePaie && e.frequence.type !== 'ponctuelle'}
          <button type="button" onclick={() => choisirAction('frequence')}>Changer la fréquence à partir d’une date</button>
        {/if}
        <button type="button" onclick={() => choisirAction('suspendre')}>Suspendre</button>
        {#if e.suspensions.some((s) => s.fin >= jour)}
          <button type="button" onclick={() => choisirAction('reprendre')}>Reprendre plus tôt</button>
        {/if}
        <button type="button" onclick={() => choisirAction('terminer')}>Terminer</button>
        {#if e.nature === 'revenu'}
          <button type="button" onclick={() => proposer(() => proposerCertitude(donnees!, e.id, !e.incertain, jour))}>
            {e.incertain ? 'Rendre certain' : 'Rendre incertain'}
          </button>
        {/if}
        <button type="button" onclick={() => proposer(() => proposerSuppression(donnees!, e.id, jour))}>Supprimer</button>
      </div>
      {#if action}
        <form class="formulaire" onsubmit={(ev) => soumettreAction(ev, e)}>
          {#if action === 'montant'}
            <label>À partir du <input type="date" bind:value={fA} /></label>
            <label>Nouveau montant ($) <input inputmode="decimal" bind:value={fB} /></label>
          {:else if action === 'frequence'}
            <label
              >Nouvelle fréquence
              <select bind:value={fNouvelleFrequence}>
                {#each recurrences(e) as q (q)}
                  <option value={q}>{LIBELLES_QUAND[q]}</option>
                {/each}
              </select>
            </label>
            <label>À partir du <input type="date" bind:value={fA} /></label>
          {:else if action === 'suspendre'}
            <label>Du <input type="date" bind:value={fA} /></label>
            <label>Au (inclus) <input type="date" bind:value={fB} /></label>
          {:else if action === 'reprendre'}
            <label>Reprendre le <input type="date" bind:value={fA} /></label>
          {:else}
            <label>Dernière date incluse <input type="date" bind:value={fA} /></label>
          {/if}
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (action = null)}>Abandonner</button>
        </form>
      {/if}
      </FenetreFormulaire>
    {/if}
  </li>
{/snippet}

<style>
  .bloc {
    background: var(--couleur-surface);
    border: 2px solid var(--couleur-bordure);
    border-radius: var(--arrondi-carte);
    box-shadow: var(--ombre-carte);
    padding: var(--espace-4) var(--espace-6);
    margin: 0 0 var(--espace-4);
  }
  .panneaux {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: var(--espace-4);
    max-width: var(--largeur-contenu);
  }
  .bloc[data-testid='bloc-revenus'] {
    max-width: var(--largeur-contenu);
  }
  h2 {
    font-size: var(--titre-carte);
    margin: 0 0 var(--espace-2);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    padding: var(--espace-2) 0;
    border-bottom: 1px solid var(--couleur-bordure);
  }
  li:last-child {
    border-bottom: none;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--espace-2) var(--espace-3);
  }
  .nom {
    font-weight: 600;
  }
  .etiquette {
    font-size: var(--taille-petit);
    padding: 0 var(--espace-2);
    border-radius: var(--arrondi);
    background: var(--couleur-surface-active);
    color: var(--couleur-texte-discret);
  }
  .petit {
    min-height: 28px;
    margin-left: auto;
  }
  .boutons,
  .formulaire {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-3);
    align-items: flex-end;
    margin-top: var(--espace-2);
  }
  form[data-testid='formulaire-element'] {
    margin-bottom: var(--espace-6);
  }
  label.case {
    flex-direction: row;
    align-items: center;
    min-height: 36px;
  }
</style>
