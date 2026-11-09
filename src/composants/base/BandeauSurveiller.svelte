<script lang="ts">
  // Bandeau prune « À surveiller » : seulement les événements importants,
  // chacun avec son lien d'action. Emplacement d'illustration à gauche.
  import Illustration from './Illustration.svelte';
  import Icone from './Icone.svelte';
  import { ArrowRight } from '@lucide/svelte';

  export interface Evenement {
    texte: string;
    action: string;
    onaction?: () => void;
  }
  let { evenements, reserver = false }: { evenements: Evenement[]; reserver?: boolean } = $props();
</script>

<section class="surveiller" aria-labelledby="titre-surveiller">
  <div class="gauche">
    <span class="cloche"><Illustration nom="cloche" largeur={64} hauteur={64} {reserver} /></span>
    <h2 id="titre-surveiller"><span class="souligne">À surveiller</span></h2>
  </div>
  <ul>
    {#each evenements as e, i (i)}
      <li>
        <span class="point" aria-hidden="true"></span>
        <span>{e.texte}</span>
        <span aria-hidden="true">·</span>
        <button type="button" class="lien-creme" onclick={e.onaction}>{e.action} <Icone icone={ArrowRight} taille={16} /></button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .surveiller {
    display: flex;
    align-items: center;
    gap: var(--espace-6);
    background: var(--couleur-bandeau);
    color: var(--couleur-bandeau-texte);
    border-radius: var(--arrondi-grand);
    padding: var(--espace-4) var(--espace-8);
    min-height: 104px;
  }
  .gauche {
    display: flex;
    align-items: center;
    gap: var(--espace-3);
    padding-right: var(--espace-6);
    border-right: 2px solid var(--sorbet-peche);
    align-self: stretch;
  }
  h2 {
    margin: 0;
    font-size: 30px;
    color: var(--couleur-bandeau-texte);
  }
  .souligne {
    background: linear-gradient(var(--sorbet-orange), var(--sorbet-orange)) left bottom / 100% 3px no-repeat;
    padding-bottom: 4px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-2);
    font-size: var(--texte-courant);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--espace-2);
  }
  .point {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--sorbet-peche);
    flex-shrink: 0;
  }
  .lien-creme {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
    border: none;
    background: none;
    min-height: 0;
    padding: 0;
    color: var(--couleur-bandeau-texte);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .lien-creme:hover:not(:disabled) {
    background: none;
    color: var(--sorbet-peche);
  }
</style>
