<script lang="ts">
  // Titre en pastille colorée (« Paie actuelle », « Troisième paie »…).
  import type { Snippet } from 'svelte';
  export type Teinte = 'sauge' | 'peche' | 'rose' | 'lilas' | 'beurre';
  let { teinte = 'sauge', niveau = 3, children }: { teinte?: Teinte; niveau?: 2 | 3 | 4; children: Snippet } = $props();
</script>

<svelte:element this={`h${niveau}`} class="titre-pastille {teinte}">{@render children()}</svelte:element>

<style>
  .titre-pastille {
    display: inline-block;
    margin: 0;
    padding: 3px var(--espace-5) 5px;
    font-family: var(--police-titre);
    font-variation-settings: 'SOFT' 100;
    font-weight: 750;
    font-size: var(--titre-carte);
    line-height: 1.2;
    color: var(--couleur-titre);
    /* 0.19.1 : un nom long passe à la ligne au lieu d'être coupé. Sur une
       ligne, l'arrondi donne la même pilule qu'avant ; sur deux, un
       rectangle aux coins arrondis. */
    border-radius: 20px;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .sauge {
    background: var(--sorbet-sauge-moyen);
  }
  .peche {
    background: var(--sorbet-peche-moyen);
  }
  .rose {
    background: var(--sorbet-rose-moyen);
  }
  .lilas {
    background: var(--sorbet-lilas-moyen);
  }
  .beurre {
    background: var(--sorbet-beurre-pale);
  }
</style>
