<script lang="ts">
  import { TEXTES } from '../lib/textes.fr';

  let { etape }: { etape: string } = $props();
</script>

<div class="a-venir" data-testid="section-a-venir">
  <p class="titre">{TEXTES.sectionAVenir.titre}</p>
  <p>{TEXTES.sectionAVenir.corps(etape)}</p>
</div>

<style>
  .a-venir {
    border: 2px dashed var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-6);
    color: var(--couleur-texte-discret);
    max-width: 640px;
  }

  .titre {
    color: var(--couleur-texte);
    font-weight: 600;
    margin-top: 0;
  }
</style>
