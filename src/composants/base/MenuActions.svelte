<script lang="ts">
  // Menu « Actions » : regroupe les actions secondaires d'un élément derrière
  // un bouton clairement identifié. Se ferme après un choix, avec Échap ou
  // en cliquant ailleurs.
  import type { Snippet } from 'svelte';

  let { libelle = 'Actions', nom, children }: { libelle?: string; nom: string; children: Snippet } = $props();
  let ouvert = $state(false);
  let racine: HTMLDivElement | undefined = $state();

  function dehors(e: MouseEvent) {
    if (ouvert && racine && !racine.contains(e.target as Node)) ouvert = false;
  }
  function touche(e: KeyboardEvent) {
    if (ouvert && e.key === 'Escape') {
      e.stopPropagation();
      ouvert = false;
      racine?.querySelector<HTMLButtonElement>('.declencheur')?.focus();
    }
  }
</script>

<svelte:window onclick={dehors} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu-actions" bind:this={racine} onkeydown={touche}>
  <button type="button" class="declencheur petit" aria-haspopup="true" aria-expanded={ouvert} aria-label={`${libelle} — ${nom}`} onclick={() => (ouvert = !ouvert)}>
    {libelle} <span aria-hidden="true">▾</span>
  </button>
  {#if ouvert}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="liste" role="group" aria-label={`${libelle} — ${nom}`} onclick={(e) => (e.target as HTMLElement).closest('button') && (ouvert = false)}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .menu-actions {
    position: relative;
    display: inline-block;
  }
  .liste {
    position: absolute;
    z-index: 6;
    top: calc(100% + 4px);
    left: 0;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    padding: var(--espace-2);
    background: var(--couleur-surface);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure-forte);
    border-radius: var(--arrondi);
    box-shadow: var(--ombre-flottante);
  }
  .liste :global(button) {
    justify-content: flex-start;
    text-align: left;
    width: 100%;
    border: none;
    border-radius: var(--arrondi);
    background: none;
    font-weight: 600;
    min-height: 34px;
    padding: 0 var(--espace-3);
  }
  .liste :global(button:hover:not(:disabled)) {
    background: var(--couleur-surface-active);
  }
</style>
