<script lang="ts">
  // Forme organique douce (accent décoratif du thème, derrière le contenu).
  // Purement décorative : jamais devant un chiffre ni un bouton.
  let { forme = 'soleil', teinte = 'peche' }: { forme?: 'soleil' | 'vague'; teinte?: 'peche' | 'rose' | 'lilas' | 'sauge' | 'beurre' } = $props();
</script>

<svg class="forme {forme} {teinte}" viewBox={forme === 'soleil' ? '0 0 200 200' : '0 0 240 120'} preserveAspectRatio="none" aria-hidden="true">
  {#if forme === 'soleil'}
    <path d="M100 8 C150 6 194 44 192 102 C190 156 146 194 96 192 C44 190 6 150 8 98 C10 46 50 10 100 8 Z" />
  {:else}
    <path d="M0 70 C40 30 80 30 120 60 C160 90 200 88 240 50 L240 120 L0 120 Z" />
    <path class="second" d="M0 95 C50 70 90 72 130 92 C170 112 205 108 240 85 L240 120 L0 120 Z" />
  {/if}
</svg>

<style>
  .forme {
    display: block;
    width: 100%;
    height: 100%;
  }
  .soleil.peche path {
    fill: var(--sorbet-peche-pale);
  }
  .soleil.rose path {
    fill: var(--sorbet-rose-pale);
  }
  .soleil.lilas path {
    fill: var(--sorbet-lilas-pale);
  }
  .soleil.sauge path {
    fill: var(--sorbet-sauge-pale);
  }
  .soleil.beurre path {
    fill: var(--sorbet-beurre-pale);
  }
  .vague path {
    fill: var(--sorbet-peche);
  }
  .vague .second {
    fill: var(--sorbet-rose);
  }
  .vague.lilas path {
    fill: var(--sorbet-lilas);
  }
</style>
