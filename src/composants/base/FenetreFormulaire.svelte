<script lang="ts">
  // Fenêtre centrée pour un formulaire de création ou de modification (V1) :
  // le contexte de l'élément en tête, les champs, des actions claires, et
  // « Abandonner » (ou Échap) qui ferme sans rien enregistrer.
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    titre: string;
    /** L'élément concerné (ex. « CELI urgence · valeur suivie 2 000,00 $ »). */
    contexte?: string | null;
    erreur?: string | null;
    onabandonner: () => void;
    children: Snippet;
  }
  let { titre, contexte = null, erreur = null, onabandonner, children }: Props = $props();
  let fenetre: HTMLDivElement | undefined = $state();
  const id = `titre-fenetre-${Math.random().toString(36).slice(2, 8)}`;

  onMount(() => {
    fenetre?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button')?.focus();
  });
  function touche(e: KeyboardEvent) {
    // L'aperçu, s'il est ouvert par-dessus, gère sa propre touche Échap.
    if (e.key === 'Escape' && !document.querySelector('[data-testid="apercu"]')) {
      e.preventDefault();
      onabandonner();
    }
  }
</script>

<svelte:window onkeydown={touche} />

<div class="voile" aria-hidden="true" onclick={onabandonner}></div>
<div class="fenetre-formulaire" role="dialog" aria-modal="true" aria-labelledby={id} data-testid="fenetre-formulaire" bind:this={fenetre}>
  <header>
    <h2 {id}>{titre}</h2>
    {#if contexte}<p class="contexte">{contexte}</p>{/if}
    <button type="button" class="fermer-x" aria-label="Abandonner sans enregistrer" onclick={onabandonner}>×</button>
  </header>
  <div class="corps">
    {@render children()}
    {#if erreur}<p role="alert" class="erreur" data-testid="erreur-saisie">{erreur}</p>{/if}
  </div>
</div>

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 15;
    background: var(--voile);
  }
  .fenetre-formulaire {
    position: fixed;
    z-index: 16;
    top: 50%;
    left: calc(50% + var(--largeur-barre) / 2);
    transform: translate(-50%, -50%);
    width: min(720px, calc(100vw - var(--largeur-barre) - 2 * var(--espace-8)));
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
    padding: var(--espace-4) var(--espace-12) var(--espace-4) var(--espace-6);
  }
  h2 {
    margin: 0;
    font-size: 24px;
    color: inherit;
  }
  .contexte {
    margin: var(--espace-1) 0 0;
    font-size: var(--texte-petit);
    font-weight: 600;
    opacity: 0.9;
  }
  .fermer-x {
    position: absolute;
    top: var(--espace-3);
    right: var(--espace-3);
    min-height: 32px;
    min-width: 32px;
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font-size: 22px;
    line-height: 1;
  }
  .fermer-x:hover:not(:disabled) {
    background: color-mix(in srgb, var(--couleur-bandeau-texte) 15%, transparent);
  }
  .corps {
    padding: var(--espace-4) var(--espace-6) var(--espace-5);
    overflow-y: auto;
  }
  .corps :global(form) {
    margin-top: 0;
  }
  .erreur {
    margin: var(--espace-3) 0 0;
    font-weight: 700;
  }
</style>
