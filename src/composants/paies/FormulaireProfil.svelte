<script lang="ts">
  // V1 lot 1 : formulaire du calendrier de paie, sorti de MesPaies sans
  // changement de comportement (création et modification).
  import { untrack } from 'svelte';
  import { LIBELLES_FREQUENCE, proposerProfil, type Proposition } from '../../actions/paie';
  import type { DonneesPaie, FrequenceStockee } from '../../lib/plateforme';
  import type { DateCivile } from '../../noyau/dates';

  interface Props {
    donnees: DonneesPaie;
    jour: DateCivile;
    /** Création : montant habituel demandé, pas de bouton « Abandonner ». */
    creation: boolean;
    proposer: (fabrique: () => Proposition) => void;
    onabandonner?: () => void;
  }
  let { donnees, jour, creation, proposer, onabandonner }: Props = $props();

  // En modification, les champs partent du calendrier enregistré.
  const depart = untrack(() => (creation ? null : donnees.profil));
  let fFrequence: FrequenceStockee = $state(depart?.frequence ?? 'deuxSemaines');
  let fDepart = $state(depart?.depart ?? '');
  let fJour1 = $state(depart?.jours?.[0] ?? 15);
  let fJour2 = $state(depart?.jours?.[1] ?? 31);
  let fMontant = $state('');
</script>

<form
  class="formulaire"
  onsubmit={(e) => {
    e.preventDefault();
    proposer(() =>
      proposerProfil(donnees, {
        frequence: fFrequence,
        depart: fDepart,
        ...(fFrequence === 'deuxFoisParMois' ? { jours: [Number(fJour1), Number(fJour2)] as [number, number] } : {}),
        ...(creation ? { montant: fMontant } : {}),
      }, jour),
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
  {#if !creation}<button type="button" onclick={() => onabandonner?.()}>Abandonner</button>{/if}
</form>
