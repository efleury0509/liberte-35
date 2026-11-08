<script lang="ts">
  // Aperçu d'un changement important (cahier 14.2) : anciennes et nouvelles
  // valeurs, conséquences, puis confirmer, ajuster ou annuler.
  import type { Proposition } from '../actions/paie';

  interface Props {
    proposition: Proposition;
    enCours: boolean;
    erreur: string | null;
    onconfirmer: () => void;
    onajuster: () => void;
    onannuler: () => void;
  }
  let { proposition, enCours, erreur, onconfirmer, onajuster, onannuler }: Props = $props();
</script>

<div class="apercu" role="dialog" aria-modal="false" aria-labelledby="titre-apercu" data-testid="apercu">
  <h2 id="titre-apercu">{proposition.titre}</h2>
  <table>
    <thead>
      <tr><th scope="col"></th><th scope="col">Avant</th><th scope="col">Après</th></tr>
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
    <h3>Conséquences</h3>
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
    <button type="button" class="principal" onclick={onconfirmer} disabled={enCours}>Confirmer</button>
    <button type="button" onclick={onajuster} disabled={enCours}>Ajuster</button>
    <button type="button" onclick={onannuler} disabled={enCours}>Annuler</button>
  </div>
</div>

<style>
  .apercu {
    border: 1px solid var(--couleur-accent);
    border-radius: var(--arrondi);
    background: var(--couleur-surface);
    padding: var(--espace-4) var(--espace-6);
    margin: var(--espace-4) 0;
    max-width: 760px;
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-3);
  }
  h3 {
    font-size: var(--taille-texte);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-1) var(--espace-3) var(--espace-1) 0;
    vertical-align: top;
  }
  thead th,
  tbody th {
    color: var(--couleur-texte-discret);
    font-weight: 400;
  }
  .change {
    font-weight: 600;
  }
  ul {
    margin: 0;
    padding-left: var(--espace-6);
  }
  .erreur {
    color: var(--couleur-erreur);
  }
  .boutons {
    display: flex;
    gap: var(--espace-2);
    margin-top: var(--espace-4);
  }
</style>
