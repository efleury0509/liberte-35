<script lang="ts">
  import type { Cycle } from '../../noyau/cycles';
  import { formaterDateCourte, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';

  interface Props {
    cycles: readonly Cycle[];
    choisi: DateCivile | null;
    courant: DateCivile | null;
    onchoisir: (dateOrigine: DateCivile) => void;
  }
  let { cycles, choisi, courant, onchoisir }: Props = $props();

  const montant = (c: number | null) => (c === null ? 'À compléter' : formaterMontant(c));
  const annee = (d: DateCivile) => d.slice(0, 4);
</script>

<table data-testid="cycles">
  <caption>Cycles de paie : tous les montants sont prévus.</caption>
  <thead>
    <tr>
      <th scope="col">Paie du</th>
      <th scope="col">Cycle</th>
      <th scope="col" class="montant">Paie</th>
      <th scope="col" class="montant">Autres revenus</th>
      <th scope="col" class="montant">Sorties</th>
      <th scope="col" class="montant">Disponible planifié</th>
      <th scope="col">Statut</th>
      <th scope="col"><span class="visuellement-cache">Détails</span></th>
    </tr>
  </thead>
  <tbody>
    {#each cycles as c (c.paie.dateOrigine)}
      <tr class:choisi={choisi === c.paie.dateOrigine} class:courant={courant === c.paie.dateOrigine} data-cycle={c.debut}>
        <th scope="row">
          {formaterDateCourte(c.paie.date)} {annee(c.paie.date)}
          {#if c.paie.deplacee}<span class="note" title="Date de versement modifiée">déplacée</span>{/if}
          {#if courant === c.paie.dateOrigine}<span class="note">cycle actuel</span>{/if}
        </th>
        <td>{formaterDateCourte(c.debut)} au {formaterDateCourte(c.fin)}</td>
        <td class="montant">
          {montant(c.paie.montant)}
          {#if c.paie.montantModifie}<span class="note">modifiée</span>{/if}
        </td>
        <td class="montant">
          {c.lignes.some((l) => l.nature === 'revenu') ? montant(c.autresRevenus) : '—'}
          {#if c.nonComptes > 0}<span class="note">+ {formaterMontant(c.nonComptes)} non compté</span>{/if}
        </td>
        <td class="montant">{montant(c.sorties)}</td>
        <td class="montant" data-testid="disponible">
          {montant(c.disponible)}
          {#if c.estimation && c.disponible !== null}<span class="note" data-testid="estimation">Estimation</span>{/if}
        </td>
        <td>
          Prévu
          {#if c.signal}
            <span class="signal" data-testid="signal" title={c.signal === 'negatif' ? 'Disponible planifié négatif' : 'Disponible planifié sous ton seuil d’attention'}>
              À anticiper
            </span>
          {/if}
        </td>
        <td><button type="button" onclick={() => onchoisir(c.paie.dateOrigine)}>Détails</button></td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 1100px;
  }
  caption {
    text-align: left;
    color: var(--couleur-texte-discret);
    padding-bottom: var(--espace-2);
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-2) var(--espace-3);
    border-bottom: 1px solid var(--couleur-bordure);
  }
  thead th {
    color: var(--couleur-texte-discret);
    font-weight: 400;
  }
  tbody th {
    font-weight: 400;
    white-space: nowrap;
  }
  .montant {
    text-align: right;
  }
  tr.choisi {
    background: var(--couleur-surface-active);
  }
  tr.courant th {
    font-weight: 600;
  }
  .note {
    display: block;
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
  }
  .signal {
    display: inline-block;
    margin-left: var(--espace-2);
    padding: 0 var(--espace-2);
    border-radius: var(--arrondi);
    background: var(--couleur-attention-fond);
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
  }
  .visuellement-cache {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
