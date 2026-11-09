<script lang="ts">
  // Étoile discrète à quatre branches (accent décoratif du thème).
  let { taille = 18, teinte = 'peche' }: { taille?: number; teinte?: 'peche' | 'beurre' | 'creme' | 'orange' } = $props();
</script>

<svg class="etoile {teinte}" width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 1.5 C13 8.5 15.5 11 22.5 12 C15.5 13 13 15.5 12 22.5 C11 15.5 8.5 13 1.5 12 C8.5 11 11 8.5 12 1.5 Z" />
</svg>

<style>
  .etoile {
    flex-shrink: 0;
  }
  .peche {
    fill: var(--sorbet-peche);
  }
  .beurre {
    fill: var(--sorbet-beurre);
  }
  .creme {
    fill: var(--creme-100);
  }
  .orange {
    fill: var(--sorbet-orange);
  }
</style>
