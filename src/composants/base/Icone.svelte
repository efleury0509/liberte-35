<script lang="ts">
  // Icônes embarquées (Lucide, licence ISC) : trait arrondi, décoratives par défaut.
  import type { Component } from 'svelte';

  interface Props {
    icone: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
    taille?: number;
  }
  let { icone: I, taille = 20 }: Props = $props();
</script>

<span class="icone"><I size={taille} strokeWidth={2} aria-hidden="true" /></span>

<style>
  .icone {
    display: inline-flex;
    flex-shrink: 0;
    line-height: 0;
  }
</style>
