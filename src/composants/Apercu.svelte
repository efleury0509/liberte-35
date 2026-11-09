<script lang="ts">
  // Fenêtre d'aperçu d'un changement important (cahier 14.2, étape 4b C ;
  // V1 lot 2) : anciennes et nouvelles valeurs, conséquences, puis
  // enregistrer, ajuster ou abandonner. N'apparaît que lorsqu'elle protège.
  // Variante « annulation » : plus sobre, pour revenir sur un paiement déjà
  // enregistré (« Conserver le paiement » / « Confirmer l'annulation »).
  // Abandonner une fenêtre ne change jamais rien.
  import { onMount, type Snippet } from 'svelte';
  import type { Proposition } from '../actions/paie';
  import Etoile from './base/Etoile.svelte';

  interface Props {
    proposition: Proposition;
    enCours: boolean;
    erreur: string | null;
    variante?: 'normale' | 'annulation';
    /** Choix affiché avant le tableau (ex. la source du paiement) ; il ne fait que recalculer l'aperçu. */
    choix?: Snippet;
    onconfirmer: () => void;
    onajuster: () => void;
    onannuler: () => void;
  }
  let { proposition, enCours, erreur, variante = 'normale', choix, onconfirmer, onajuster, onannuler }: Props = $props();
  let fenetre: HTMLDivElement | undefined = $state();

  onMount(() => {
    fenetre?.querySelector<HTMLButtonElement>('.boutons button')?.focus();
  });
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape' && !enCours) {
      e.preventDefault();
      onannuler();
    }
  }
</script>

<svelte:window onkeydown={touche} />

<div class="voile" aria-hidden="true"></div>
<div class="fenetre {variante}" role="dialog" aria-modal="true" aria-labelledby="titre-apercu" data-testid="apercu" data-variante={variante} bind:this={fenetre}>
  <header>
    <p class="avis">{variante === 'annulation' ? 'Revenir sur un paiement enregistré' : 'À vérifier avant d’enregistrer'}</p>
    <h2 id="titre-apercu">{proposition.titre}</h2>
    {#if variante === 'normale'}<span class="etoile"><Etoile taille={22} /></span>{/if}
  </header>
  <div class="corps">
    {#if choix}<div class="choix-apercu">{@render choix()}</div>{/if}
    <table>
      <thead>
        <tr><th scope="col"></th><th scope="col">{variante === 'annulation' ? 'Maintenant' : 'Avant'}</th><th scope="col">{variante === 'annulation' ? 'Après l’annulation' : 'Après'}</th></tr>
      </thead>
      <tbody>
        {#each proposition.lignes as l (l.libelle)}
          <tr>
            <th scope="row">{l.libelle}</th>
            <td>{l.avant}</td>
            <td class:change={l.avant !== l.apres}>{l.apres}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if proposition.consequences.length > 0}
      <h3>{variante === 'annulation' ? 'Effets sur les soldes' : 'Conséquences'}</h3>
      <ul data-testid="consequences">
        {#each proposition.consequences as c (c)}
          <li>{c}</li>
        {/each}
      </ul>
    {/if}
    {#if erreur}
      <p role="alert" class="erreur">{erreur}</p>
    {/if}
    <div class="boutons">
      {#if variante === 'annulation'}
        <button type="button" onclick={onannuler} disabled={enCours}>Conserver le paiement</button>
        <button type="button" class="confirmer-annulation" onclick={onconfirmer} disabled={enCours}>Confirmer l’annulation</button>
      {:else}
        <button type="button" class="principal" onclick={onconfirmer} disabled={enCours}>Enregistrer</button>
        <button type="button" onclick={onajuster} disabled={enCours}>Ajuster</button>
        <button type="button" onclick={onannuler} disabled={enCours}>Abandonner</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--voile);
  }
  .fenetre {
    position: fixed;
    z-index: 21;
    top: 50%;
    left: calc(50% + var(--largeur-barre) / 2);
    transform: translate(-50%, -50%);
    width: min(760px, calc(100vw - var(--largeur-barre) - 2 * var(--espace-8)));
    max-height: calc(100vh - 2 * var(--espace-8));
    display: flex;
    flex-direction: column;
    background: var(--couleur-surface);
    border: var(--bordure-structure);
    border-radius: var(--arrondi-grand);
    box-shadow: var(--ombre-flottante);
    overflow: hidden;
  }
  header {
    position: relative;
    background: var(--couleur-bandeau);
    color: var(--couleur-bandeau-texte);
    padding: var(--espace-4) var(--espace-8) var(--espace-4) var(--espace-6);
  }
  .annulation {
    border: var(--epaisseur-bordure) solid var(--couleur-bordure-forte);
  }
  .annulation header {
    background: var(--creme-200);
    color: var(--couleur-texte);
  }
  .avis {
    margin: 0;
    font-size: var(--texte-petit);
    font-weight: 700;
    opacity: 0.9;
  }
  h2 {
    margin: var(--espace-1) 0 0;
    font-size: 24px;
    color: inherit;
  }
  .etoile {
    position: absolute;
    top: var(--espace-3);
    right: var(--espace-4);
  }
  .corps {
    padding: var(--espace-4) var(--espace-6) var(--espace-5);
    overflow-y: auto;
  }
  .choix-apercu {
    margin-bottom: var(--espace-4);
  }
  h3 {
    font-size: var(--titre-bloc);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--texte-dense);
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-2) var(--espace-3) var(--espace-2) 0;
    vertical-align: top;
    border-bottom: 1px solid var(--couleur-bordure);
  }
  thead th,
  tbody th {
    color: var(--couleur-texte-discret);
    font-weight: 600;
  }
  .change {
    font-weight: 800;
  }
  ul {
    margin: 0;
    padding-left: var(--espace-6);
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    margin-top: var(--espace-5);
  }
  .confirmer-annulation {
    border: var(--bordure-structure);
  }
</style>
