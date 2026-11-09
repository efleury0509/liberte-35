<script lang="ts">
  // Barre latérale V1 (présentation seulement) : logo, devise, entrées avec
  // icônes, entrée active en pastille pêche, entrées de pied. Prête à accueillir
  // de futurs modules : la liste est fournie par l'appelant.
  import type { Component } from 'svelte';
  import Icone from './Icone.svelte';
  import Illustration from './Illustration.svelte';
  import Etoile from './Etoile.svelte';
  import FormeOrganique from './FormeOrganique.svelte';
  import { ILLUSTRATIONS } from '../../lib/illustrations';

  export interface EntreeNavigation {
    id: string;
    libelle: string;
    icone: Component<{ size?: number; strokeWidth?: number }>;
  }
  interface Props {
    entrees: EntreeNavigation[];
    pied?: EntreeNavigation[];
    active: string;
    marque?: string | null;
    version?: string | null;
    reserver?: boolean;
    libelle?: string;
    onchoisir: (id: string) => void;
  }
  let { entrees, pied = [], active, marque = null, version = null, reserver = false, libelle = 'Navigation principale', onchoisir }: Props = $props();
</script>

{#snippet bouton(e: EntreeNavigation)}
  <li>
    <button type="button" aria-current={e.id === active ? 'page' : undefined} data-section={e.id} onclick={() => onchoisir(e.id)}>
      <Icone icone={e.icone} taille={24} />
      <span>{e.libelle}</span>
    </button>
  </li>
{/snippet}

<nav class="navigation-v1" aria-label={libelle}>
  <div class="logo">
    <span class="arc"><Illustration nom="arc-en-ciel" largeur={110} hauteur={44} {reserver} /></span>
    <p class="nom">Liberté 35</p>
    <p class="devise">Des rêves, mais<br />avec un budget.</p>
    {#if marque}<p class="marque">{marque}</p>{/if}
  </div>
  <ul>
    {#each entrees as e (e.id)}{@render bouton(e)}{/each}
  </ul>
  {#if pied.length > 0}
    <ul class="pied">
      {#each pied as e (e.id)}{@render bouton(e)}{/each}
    </ul>
  {/if}
  <div class="bas">
    {#if version}<p class="version" data-testid="version-barre">Version {version}</p>{/if}
    <span class="etoile-bas"><Etoile taille={20} teinte="beurre" /></span>
    {#if ILLUSTRATIONS.vagues.fichier || reserver}
      <span class="vagues"><Illustration nom="vagues" largeur={200} hauteur={90} {reserver} /></span>
    {:else}
      <span class="vagues decor"><FormeOrganique forme="vague" /></span>
    {/if}
  </div>
</nav>

<style>
  .navigation-v1 {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--couleur-barre);
    color: var(--couleur-barre-texte);
    padding: var(--espace-5) var(--espace-3) 0;
    overflow-y: auto;
  }
  .logo {
    text-align: center;
    margin-bottom: var(--espace-5);
  }
  .arc {
    display: inline-flex;
    margin-bottom: calc(-1 * var(--espace-2));
  }
  .nom {
    margin: 0;
    font-family: var(--police-titre);
    font-variation-settings: 'SOFT' 100;
    font-weight: 900;
    font-size: 30px;
    line-height: 1.1;
    color: var(--creme-50);
  }
  .devise {
    margin: var(--espace-1) 0 0;
    font-size: var(--texte-petit);
    line-height: 1.35;
  }
  .marque {
    display: inline-block;
    margin: var(--espace-2) 0 0;
    padding: 0 var(--espace-3);
    border-radius: var(--arrondi-pilule);
    background: var(--sorbet-beurre);
    color: var(--prune-900);
    font-size: var(--texte-petit);
    font-weight: 800;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pied {
    margin-top: var(--espace-4);
    padding-top: var(--espace-4);
    border-top: 1px solid color-mix(in srgb, var(--couleur-barre-texte) 30%, transparent);
  }
  button {
    display: flex;
    align-items: center;
    gap: var(--espace-3);
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--arrondi-pilule);
    color: inherit;
    font-size: 17px;
    font-weight: 700;
    padding: var(--espace-2) var(--espace-4);
    min-height: 44px;
  }
  button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--couleur-barre-texte) 12%, transparent);
    border-color: transparent;
  }
  button[aria-current='page'] {
    background: linear-gradient(90deg, var(--couleur-barre-actif), var(--sorbet-peche-moyen));
    color: var(--couleur-barre-actif-texte);
    font-weight: 800;
  }
  button[aria-current='page']:hover:not(:disabled) {
    background: linear-gradient(90deg, var(--couleur-barre-actif), var(--sorbet-peche-moyen));
  }
  .bas {
    margin-top: auto;
    padding-top: var(--espace-4);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .version {
    margin: 0 0 var(--espace-2);
    font-size: 12px;
    opacity: 0.85;
  }
  .vagues {
    display: flex;
    width: 100%;
    justify-content: center;
  }
  .decor {
    height: 72px;
    margin: 0 calc(-1 * var(--espace-3));
    width: calc(100% + 2 * var(--espace-3));
    opacity: 0.9;
  }
  .etoile-bas {
    align-self: flex-start;
    margin: 0 0 var(--espace-2) var(--espace-6);
  }
</style>
