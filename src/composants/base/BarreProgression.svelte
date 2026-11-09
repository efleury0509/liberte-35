<script lang="ts">
  // Barre de progression : seulement quand la valeur et la cible sont connues.
  import { progression } from '../../lib/progression';
  import type { Cents } from '../../noyau/montants';

  interface Props {
    valeur: Cents | null;
    cible: Cents | null;
    /** Nom lisible par les lecteurs d'écran (ex. « Fonds d'urgence »). */
    libelle: string;
    teinte?: 'fraiche' | 'chaude';
  }
  let { valeur, cible, libelle, teinte = 'fraiche' }: Props = $props();
  const p = $derived(progression(valeur, cible));
</script>

{#if p.calculable}
  <div class="progression" data-testid="progression">
    <div class="piste" role="progressbar" aria-label={libelle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.largeur}>
      <div class="remplie {teinte}" style:width="{p.largeur}%"></div>
    </div>
    <span class="pourcentage">{p.pourcentage} %</span>
  </div>
{:else}
  <span class="a-completer" data-testid="progression-a-completer">Progression : à compléter</span>
{/if}

<style>
  .progression {
    display: flex;
    align-items: center;
    gap: var(--espace-2);
  }
  .piste {
    flex: 1;
    height: 10px;
    border-radius: var(--arrondi-pilule);
    background: var(--progression-fond);
    overflow: hidden;
  }
  .remplie {
    height: 100%;
    border-radius: var(--arrondi-pilule);
    background: var(--progression-remplie);
  }
  .remplie.chaude {
    background: var(--progression-chaude);
  }
  .pourcentage {
    font-size: var(--taille-petit);
    font-weight: 700;
    min-width: 3.5em;
    text-align: right;
  }
  .a-completer {
    font-size: var(--taille-petit);
    color: var(--etat-a-completer-texte);
  }
</style>
