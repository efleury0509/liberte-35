<script lang="ts">
  // V1 lot 1 : section « Ma paie » (salaire, calendrier, seuil), sortie de
  // MesPaies sans changement de comportement.
  import { untrack } from 'svelte';
  import { decrireFrequence, proposerSalaire, proposerSeuil, type Proposition } from '../../actions/paie';
  import type { DonneesPaie, ProfilPaieStocke } from '../../lib/plateforme';
  import { dateCivile, formaterDateLongue, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import FormulaireProfil from './FormulaireProfil.svelte';

  interface Props {
    donnees: DonneesPaie & { profil: ProfilPaieStocke };
    jour: DateCivile;
    /** Texte du salaire en vigueur, calculé par Mes paies. */
    salaireActuel: string;
    /** Augmente à chaque enregistrement ou abandon : la fenêtre se ferme. */
    remise: number;
    proposer: (fabrique: () => Proposition) => void;
    erreur: string | null;
    onabandonner: () => void;
    onformulaire: (ouvert: boolean) => void;
  }
  let { donnees, jour, salaireActuel, remise, proposer, erreur, onabandonner, onformulaire }: Props = $props();

  let edition: 'aucune' | 'profil' | 'salaire' | 'seuil' = $state('aucune');
  let fSalaireDate = $state('');
  let fSalaireMontant = $state('');
  let fSeuil = $state('');

  $effect(() => {
    void remise;
    edition = 'aucune';
  });

  let dernierEtat = false;
  $effect(() => {
    const ouvert = edition !== 'aucune';
    if (ouvert !== dernierEtat) {
      dernierEtat = ouvert;
      untrack(() => onformulaire(ouvert));
    }
  });
  // Section retirée (onglet, exemple) : la fenêtre ne compte plus comme ouverte.
  $effect(() => () => {
    if (dernierEtat) untrack(() => onformulaire(false));
  });

  function ouvrirEdition(mode: 'profil' | 'salaire' | 'seuil') {
    edition = mode;
    if (mode === 'seuil') fSeuil = donnees.seuil !== null && donnees.seuil !== undefined ? String(donnees.seuil / 100) : '';
  }

  const libelleSalaire = (d: string) => formaterDateLongue(dateCivile(d));
</script>

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

  {#if edition !== 'aucune'}
    <FenetreFormulaire
      titre={edition === 'profil' ? 'Modifier le calendrier de paie' : edition === 'salaire' ? 'Changer le salaire à partir d’une date' : 'Seuil d’attention'}
      contexte={`Ma paie · ${decrireFrequence(donnees.profil)}`}
      {erreur}
      onabandonner={onabandonner}
    >
      {#if edition === 'profil'}
        <FormulaireProfil {donnees} {jour} creation={false} {proposer} {onabandonner} />
      {:else if edition === 'salaire'}
        <form
          class="formulaire"
          onsubmit={(e) => {
            e.preventDefault();
            proposer(() => proposerSalaire(donnees, fSalaireDate, fSalaireMontant, jour));
          }}
        >
          <label>À partir du <input type="date" bind:value={fSalaireDate} required /></label>
          <label>Nouveau salaire net ($) <input inputmode="decimal" bind:value={fSalaireMontant} required /></label>
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={onabandonner}>Abandonner</button>
        </form>
      {:else if edition === 'seuil'}
        <form
          class="formulaire"
          onsubmit={(e) => {
            e.preventDefault();
            proposer(() => proposerSeuil(donnees, fSeuil));
          }}
        >
          <label>Seuil d’attention ($, vide pour aucun) <input inputmode="decimal" bind:value={fSeuil} /></label>
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={onabandonner}>Abandonner</button>
        </form>
      {/if}
    </FenetreFormulaire>
  {/if}
</section>

<style>
  /* Repris tels quels de Mes paies. */
  .carte {
    margin: 0 0 var(--espace-6);
    max-width: var(--largeur-contenu);
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
</style>
