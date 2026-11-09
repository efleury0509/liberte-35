<script lang="ts">
  // En-tête de section V1 : grand titre expressif, éclats, sous-titre, et
  // un espace d'illustration à droite qui ne repousse jamais le contenu.
  import Eclats from './Eclats.svelte';
  import Illustration from './Illustration.svelte';
  import Etoile from './Etoile.svelte';
  import FormeOrganique from './FormeOrganique.svelte';
  import type { NomIllustration } from '../../lib/illustrations';

  interface Props {
    titre: string;
    sousTitre?: string;
    illustration?: NomIllustration;
    /** Montrer l'emplacement vide (galerie, mise au point). */
    reserver?: boolean;
    id?: string;
  }
  let { titre, sousTitre, illustration, reserver = false, id }: Props = $props();
</script>

<header class="en-tete-section">
  <div class="textes">
    <div class="ligne-titre">
      <h1 {id}>{titre}</h1>
      <Eclats />
    </div>
    {#if sousTitre}<p class="sous-titre">{sousTitre}</p>{/if}
  </div>
  {#if illustration}
    <div class="zone-illustration">
      <span class="soleil"><FormeOrganique forme="soleil" teinte="peche" /></span>
      <span class="etoile"><Etoile taille={18} teinte="orange" /></span>
      <span class="ill"><Illustration nom={illustration} {reserver} /></span>
    </div>
  {/if}
</header>

<style>
  .en-tete-section {
    display: flex;
    align-items: stretch;
    gap: var(--espace-6);
    min-height: 96px;
    margin-bottom: var(--espace-5);
  }
  .textes {
    flex: 1;
    min-width: 0;
    align-self: center;
  }
  .ligne-titre {
    display: flex;
    align-items: flex-start;
    gap: var(--espace-2);
  }
  h1 {
    margin: 0;
    font-size: var(--titre-page);
    line-height: 1.05;
  }
  .sous-titre {
    margin: var(--espace-2) 0 0;
    font-size: var(--sous-titre-page);
  }
  .zone-illustration {
    position: relative;
    width: 34%;
    max-width: 440px;
    min-height: 96px;
    display: flex;
    margin-top: calc(-1 * var(--espace-4));
  }
  .soleil {
    position: absolute;
    right: 8%;
    top: -18px;
    width: 150px;
    height: 120px;
    z-index: 0;
  }
  .etoile {
    position: absolute;
    right: calc(8% + 160px);
    top: 4px;
    z-index: 1;
  }
  .ill {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
  }
</style>
