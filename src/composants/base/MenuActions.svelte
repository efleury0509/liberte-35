<script lang="ts">
  // Menu « Actions » : regroupe les actions secondaires d'un élément derrière
  // un bouton clairement identifié. Se ferme après un choix, avec Échap ou
  // en cliquant ailleurs.
  // 0.21.1 : la liste est positionnée par rapport à la fenêtre (position
  // fixe), au-dessus de tout : une carte aux coins arrondis (qui coupe ce qui
  // dépasse) ou une carte voisine ne peut plus la cacher. Elle s'ouvre vers
  // le bas, ou vers le haut quand la place manque, et reste dans la fenêtre.
  import { tick, type Snippet } from 'svelte';

  let { libelle = 'Actions', nom, children }: { libelle?: string; nom: string; children: Snippet } = $props();
  let ouvert = $state(false);
  let racine: HTMLDivElement | undefined = $state();
  let declencheur: HTMLButtonElement | undefined = $state();
  let liste: HTMLDivElement | undefined = $state();
  let position = $state({ haut: 0, gauche: 0, largeurMin: 220, hauteurMax: 0 });
  const MARGE = 8;
  const ECART = 4;

  function placer() {
    if (!declencheur || !liste) return;
    const b = declencheur.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const largeur = liste.offsetWidth;
    const hauteur = liste.scrollHeight;
    const dessous = vh - b.bottom - ECART - MARGE;
    const dessus = b.top - ECART - MARGE;
    // Vers le bas si ça tient (ou si c'est le côté le plus grand), sinon vers le haut.
    const versLeBas = hauteur <= dessous || dessous >= dessus;
    const place = versLeBas ? dessous : dessus;
    const h = Math.min(hauteur, place);
    const haut = versLeBas ? b.bottom + ECART : b.top - ECART - h;
    const gauche = Math.max(MARGE, Math.min(b.left, vw - largeur - MARGE));
    position = { haut, gauche, largeurMin: 220, hauteurMax: Math.max(place, 0) };
  }

  async function basculer() {
    ouvert = !ouvert;
    if (ouvert) {
      await tick();
      placer();
    }
  }

  function dehors(e: MouseEvent) {
    if (ouvert && racine && !racine.contains(e.target as Node)) ouvert = false;
  }
  function touche(e: KeyboardEvent) {
    if (ouvert && e.key === 'Escape') {
      e.stopPropagation();
      ouvert = false;
      declencheur?.focus();
    }
  }
  // Défilement ou redimensionnement : la liste suit son bouton.
  function suivre() {
    if (ouvert) placer();
  }
</script>

<svelte:window onclick={dehors} onresize={suivre} />
<svelte:document onscrollcapture={suivre} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="menu-actions" bind:this={racine} onkeydown={touche}>
  <button
    type="button"
    class="declencheur petit"
    bind:this={declencheur}
    aria-haspopup="true"
    aria-expanded={ouvert}
    aria-label={`${libelle} — ${nom}`}
    onclick={basculer}
  >
    {libelle} <span aria-hidden="true">▾</span>
  </button>
  {#if ouvert}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div
      class="liste"
      role="group"
      aria-label={`${libelle} — ${nom}`}
      bind:this={liste}
      style:top={`${position.haut}px`}
      style:left={`${position.gauche}px`}
      style:max-height={position.hauteurMax > 0 ? `${position.hauteurMax}px` : null}
      onclick={(e) => (e.target as HTMLElement).closest('button') && (ouvert = false)}
    >
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
    position: fixed;
    z-index: 40;
    min-width: 220px;
    max-width: min(320px, calc(100vw - 16px));
    overflow-y: auto;
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
