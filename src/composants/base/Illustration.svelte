<script lang="ts">
  // Emplacement d'illustration : taille fixe, jamais au détriment des chiffres.
  // Sans fichier fourni, rien n'est affiché (ou un cadre en pointillé si `reserver`).
  import { ILLUSTRATIONS, type NomIllustration } from '../../lib/illustrations';

  interface Props {
    nom: NomIllustration;
    largeur: number;
    hauteur: number;
    /** Garder la place même sans fichier (galerie, mise en page). */
    reserver?: boolean;
  }
  let { nom, largeur, hauteur, reserver = false }: Props = $props();
  const ill = $derived(ILLUSTRATIONS[nom]);
</script>

{#if ill.fichier}
  <img class="illustration" src={ill.fichier} alt={ill.alt} width={largeur} height={hauteur} data-illustration={nom} />
{:else if reserver}
  <span class="emplacement" style:width="{largeur}px" style:height="{hauteur}px" data-illustration={nom} aria-hidden="true">{nom}</span>
{/if}

<style>
  .illustration {
    object-fit: contain;
    flex-shrink: 0;
    user-select: none;
    pointer-events: none;
  }
  .emplacement {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: var(--epaisseur-bordure) dashed var(--couleur-bordure-forte);
    border-radius: var(--arrondi);
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
</style>
