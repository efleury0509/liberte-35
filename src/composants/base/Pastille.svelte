<script lang="ts">
  // Pastille d'état : confirmé, prévu, à compléter, alerte ou neutre.
  // « À compléter » a son propre style : une donnée inconnue n'est jamais un 0.
  import type { Snippet } from 'svelte';

  export type EtatPastille = 'confirme' | 'prevu' | 'a-completer' | 'alerte' | 'neutre';
  interface Props {
    etat?: EtatPastille;
    children: Snippet;
  }
  let { etat = 'neutre', children }: Props = $props();
</script>

<span class="pastille {etat}" data-etat={etat}>{@render children()}</span>

<style>
  .pastille {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
    padding: 1px var(--espace-3);
    border-radius: var(--arrondi-pilule);
    font-size: var(--taille-petit);
    font-weight: 700;
    white-space: nowrap;
    color: var(--etat-neutre-texte);
    background: var(--etat-neutre-fond);
  }
  .confirme {
    color: var(--etat-confirme-texte);
    background: var(--etat-confirme-fond);
  }
  .prevu {
    color: var(--etat-prevu-texte);
    background: var(--etat-prevu-fond);
  }
  .a-completer {
    color: var(--etat-a-completer-texte);
    background: var(--etat-a-completer-fond);
    outline: var(--epaisseur-bordure) dashed var(--etat-a-completer-texte);
    outline-offset: -1.5px;
  }
  .alerte {
    color: var(--etat-alerte-texte);
    background: var(--etat-alerte-fond);
  }
</style>
