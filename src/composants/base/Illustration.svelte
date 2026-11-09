<script lang="ts">
  // Emplacement d'illustration : taille fixe ou adaptée à son conteneur, jamais
  // au détriment des chiffres. Sans fichier fourni, rien n'est affiché, ou un
  // cadre discret « illustration à venir » si `reserver` (aucune version simplifiée).
  import { ILLUSTRATIONS, type NomIllustration } from '../../lib/illustrations';

  interface Props {
    nom: NomIllustration;
    /** En pixels ; sans valeur, l'emplacement remplit son conteneur. */
    largeur?: number;
    hauteur?: number;
    reserver?: boolean;
  }
  let { nom, largeur, hauteur, reserver = false }: Props = $props();
  const ill = $derived(ILLUSTRATIONS[nom]);
</script>

{#if ill.fichier}
  <img class="illustration" src={ill.fichier} alt={ill.alt} width={largeur} height={hauteur} data-illustration={nom} />
{:else if reserver}
  <span
    class="emplacement"
    class:remplir={largeur === undefined}
    style:width={largeur === undefined ? null : `${largeur}px`}
    style:height={hauteur === undefined ? null : `${hauteur}px`}
    data-illustration={nom}
    aria-hidden="true"><span class="nom">illustration : {nom}</span></span
  >
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
    border-radius: var(--arrondi-panneau);
    background: color-mix(in srgb, var(--couleur-surface) 40%, transparent);
  }
  .remplir {
    width: 100%;
    height: 100%;
  }
  .nom {
    font-size: 11px;
    color: var(--couleur-texte-discret);
    text-align: center;
    padding: var(--espace-1);
  }
</style>
