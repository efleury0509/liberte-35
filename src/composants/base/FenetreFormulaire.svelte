<script lang="ts">
  // Fenêtre centrée pour un formulaire de création ou de modification (V1) :
  // le contexte de l'élément en tête, les champs, des actions claires, et
  // « Abandonner » (ou Échap) qui ferme sans rien enregistrer.
  //
  // V1 lot 6b : jamais une fenêtre par-dessus une autre. Une fenêtre ouverte
  // à l'intérieur d'une autre (ex. « Ajuster » dans le détail d'une paie)
  // prend la place du contenu, avec « ← Retour » ; Échap la referme seule.
  import { getContext, onDestroy, onMount, setContext, type Snippet } from 'svelte';

  interface Props {
    titre: string;
    /** L'élément concerné (ex. « CELI urgence · valeur suivie 2 000,00 $ »). */
    contexte?: string | null;
    erreur?: string | null;
    onabandonner: () => void;
    /** Grande fenêtre (détail d'une paie). */
    large?: boolean;
    /** Libellé du retour quand la fenêtre est incrustée dans une autre. */
    retour?: string;
    /** Libellé du retour proposé aux fenêtres ouvertes à l'intérieur de celle-ci. */
    retourEnfants?: string;
    children: Snippet;
  }
  let { titre, contexte = null, erreur = null, onabandonner, large = false, retour, retourEnfants = '← Retour', children }: Props = $props();
  let fenetre: HTMLDivElement | undefined = $state();
  const id = `titre-fenetre-${Math.random().toString(36).slice(2, 8)}`;

  interface Hote {
    enfants: number;
    retour: string;
    rendreFocus: () => void;
  }
  const CLE = 'fenetre-formulaire-hote';
  const hote = getContext<Hote | undefined>(CLE);
  /** Incrustée : ouverte à l'intérieur d'une autre fenêtre. */
  const incrustee = hote !== undefined;
  const moi: Hote = $state({ enfants: 0, retour: '← Retour', rendreFocus: () => premierChamp() });
  $effect(() => {
    moi.retour = retourEnfants;
  });
  setContext(CLE, moi);
  const libelleRetour = $derived(retour ?? hote?.retour ?? '← Retour');

  function premierChamp() {
    fenetre?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button:not(.retour):not(.fermer-x)')?.focus();
  }
  onMount(() => {
    if (hote) hote.enfants += 1;
    premierChamp();
  });
  onDestroy(() => {
    if (hote) {
      hote.enfants -= 1;
      queueMicrotask(() => hote.rendreFocus());
    }
  });
  function touche(e: KeyboardEvent) {
    // L'aperçu, s'il est ouvert par-dessus, gère sa propre touche Échap ;
    // une fenêtre incrustée se referme avant celle qui la contient.
    if (e.key !== 'Escape' || document.querySelector('[data-testid="apercu"]') || moi.enfants > 0) return;
    e.preventDefault();
    onabandonner();
  }
</script>

<svelte:window onkeydown={touche} />

{#if incrustee}
  <div class="incrustee" role="group" aria-labelledby={id} data-testid="fenetre-incrustee" bind:this={fenetre}>
    <p class="ligne-retour"><button type="button" class="lien retour" onclick={onabandonner}>{libelleRetour}</button></p>
    <h3 {id}>{titre}</h3>
    {#if contexte}<p class="contexte-incruste">{contexte}</p>{/if}
    {@render children()}
    {#if erreur}<p role="alert" class="erreur" data-testid="erreur-saisie">{erreur}</p>{/if}
  </div>
{:else}
  <div class="voile" aria-hidden="true" onclick={onabandonner}></div>
  <div class="fenetre-formulaire" class:large role="dialog" aria-modal="true" aria-labelledby={id} data-testid="fenetre-formulaire" bind:this={fenetre} tabindex="-1">
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
{/if}

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
  .fenetre-formulaire.large {
    width: min(1100px, calc(100vw - var(--largeur-barre) - 2 * var(--espace-8)));
  }
  .fenetre-formulaire:focus {
    outline: none;
  }
  .incrustee :global(form) {
    margin-top: 0;
  }
  .incrustee :global(form.formulaire > p),
  .incrustee :global(form.formulaire > details) {
    flex-basis: 100%;
    margin: 0;
  }
  .ligne-retour {
    margin: 0 0 var(--espace-3);
  }
  .incrustee h3 {
    margin: 0;
    font-size: var(--titre-bloc);
  }
  .contexte-incruste {
    margin: var(--espace-1) 0 var(--espace-4);
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
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
  /* V1 lot 5 : une explication occupe toute la largeur, au-dessus des champs. */
  .corps :global(form.formulaire > p),
  .corps :global(form.formulaire > details) {
    flex-basis: 100%;
    margin: 0;
  }
  .erreur {
    margin: var(--espace-3) 0 0;
    font-weight: 700;
  }
</style>
