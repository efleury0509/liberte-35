<script lang="ts">
  // Anatomie de carte V1 : bandeau prune (icône, titre en pastille, badge à
  // droite) puis corps crème. Variante « teintee » : carte compacte sur fond
  // pastel, sans bandeau (aperçus secondaires).
  import type { Component, Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  import TitrePastille, { type Teinte } from './TitrePastille.svelte';

  interface Props {
    titre: string;
    teinte?: Teinte;
    variante?: 'bandeau' | 'teintee';
    icone?: Component<{ size?: number; strokeWidth?: number }>;
    /** Variante teintée : fond pastel, s'il diffère de la teinte du titre. */
    fond?: Teinte;
    badge?: Snippet;
    children: Snippet;
  }
  let { titre, teinte = 'sauge', variante = 'bandeau', icone, fond, badge, children }: Props = $props();
</script>

<article class="carte-v1 {variante} fond-{fond ?? teinte}" data-variante={variante}>
  <header>
    <!-- 0.19.1 : l'icône reste collée au titre, même quand il passe à la ligne. -->
    <span class="tete">
      {#if icone}<span class="icone-entete"><Icone {icone} taille={variante === 'bandeau' ? 30 : 34} /></span>{/if}
      <TitrePastille {teinte}>{titre}</TitrePastille>
    </span>
    {#if badge}<span class="badge">{@render badge()}</span>{/if}
  </header>
  <div class="corps">{@render children()}</div>
</article>

<style>
  .carte-v1 {
    border-radius: var(--arrondi-grand);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .bandeau {
    border: var(--bordure-structure);
    background: var(--couleur-surface);
    box-shadow: var(--ombre-carte);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--espace-3);
  }
  /* 0.16.0 : fenêtre étroite, la pastille passe à la ligne au lieu d'être coupée. */
  .bandeau header {
    flex-wrap: wrap;
    row-gap: var(--espace-2);
    min-height: var(--hauteur-bandeau-carte);
    padding: var(--espace-2) var(--espace-4);
    background: var(--couleur-bandeau);
    color: var(--couleur-bandeau-texte);
  }
  /* Le titre peut rétrécir (et passer à la ligne) ; l'icône, jamais. */
  .tete {
    display: flex;
    align-items: center;
    gap: var(--espace-3);
    flex: 0 1 auto;
    min-width: 0;
  }
  .tete > :global(.titre-pastille) {
    min-width: 0;
  }
  .icone-entete {
    flex-shrink: 0;
  }
  .badge {
    margin-left: auto;
    flex-shrink: 0;
    max-width: 100%;
  }
  .bandeau .corps {
    padding: var(--espace-4) var(--espace-6) var(--espace-5);
    flex: 1;
  }
  /* Variante teintée : aperçu compact */
  .teintee {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    column-gap: var(--espace-4);
    padding: var(--espace-4) var(--espace-6);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
  }
  .teintee header,
  .teintee .tete {
    display: contents;
  }
  .teintee .icone-entete {
    grid-row: 1 / span 2;
    color: var(--couleur-texte);
  }
  .teintee .corps {
    grid-column: 2;
  }
  .teintee.fond-rose {
    background: var(--sorbet-rose-pale);
  }
  .teintee.fond-sauge {
    background: var(--sorbet-sauge-pale);
  }
  .teintee.fond-lilas {
    background: var(--sorbet-lilas-pale);
  }
  .teintee.fond-peche {
    background: var(--sorbet-peche-pale);
  }
  .teintee.fond-beurre {
    background: var(--sorbet-beurre-pale);
  }
  .teintee :global(.titre-pastille) {
    justify-self: start;
    font-size: var(--titre-bloc);
  }
</style>
