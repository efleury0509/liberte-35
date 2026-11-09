<script lang="ts">
  // Petits éclats décoratifs à côté d'un titre (élément graphique du thème,
  // pas une illustration). Purement décoratifs.
  let { taille = 28, teinte = 'orange' }: { taille?: number; teinte?: 'orange' | 'creme' } = $props();
</script>

<svg class="eclats {teinte}" width={taille} height={taille} viewBox="0 0 28 28" aria-hidden="true">
  <path d="M6 22 L13 15" />
  <path d="M10 25 L20 22" />
  <path d="M4 14 L8 6" />
</svg>

<style>
  .eclats {
    flex-shrink: 0;
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }
  .orange {
    stroke: var(--sorbet-orange);
  }
  .creme {
    stroke: var(--sorbet-peche);
  }
</style>
