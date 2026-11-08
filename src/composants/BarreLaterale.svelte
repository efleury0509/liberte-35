<script lang="ts">
  import { SECTIONS, type IdSection } from '../lib/navigation';
  import type { Profil } from '../lib/plateforme';
  import { TEXTES } from '../lib/textes.fr';

  interface Props {
    active: IdSection;
    profil: Profil | undefined;
    onchoisir: (id: IdSection) => void;
  }

  let { active, profil, onchoisir }: Props = $props();
</script>

<!-- Barre latérale toujours visible (cahier 13.3). -->
<nav aria-label={TEXTES.navigation.titre}>
  <p class="nom">{TEXTES.application.nom}</p>
  {#if profil === 'essai'}
    <p class="marque-essai">Essai</p>
  {/if}
  <ul>
    {#each SECTIONS as s (s.id)}
      <li>
        <button
          type="button"
          aria-current={s.id === active ? 'page' : undefined}
          data-section={s.id}
          onclick={() => onchoisir(s.id)}
        >
          {s.libelle}
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  nav {
    background: var(--couleur-surface);
    border-right: 1px solid var(--couleur-bordure);
    padding: var(--espace-6) var(--espace-3);
    overflow-y: auto;
  }

  .nom {
    font-weight: 600;
    font-size: 18px;
    margin: 0 var(--espace-3) var(--espace-1);
  }

  .marque-essai {
    margin: 0 var(--espace-3) var(--espace-4);
    font-size: var(--taille-petit);
    color: var(--couleur-attention);
  }

  ul {
    list-style: none;
    margin: var(--espace-4) 0 0;
    padding: 0;
  }

  button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-radius: var(--arrondi);
    color: inherit;
    font: inherit;
    padding: var(--espace-2) var(--espace-3);
    min-height: 40px;
    cursor: pointer;
  }

  button:hover {
    background: var(--couleur-surface-active);
  }

  button[aria-current='page'] {
    background: var(--couleur-accent);
    color: var(--couleur-accent-texte);
    font-weight: 600;
  }
</style>
