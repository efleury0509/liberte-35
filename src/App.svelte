<script lang="ts">
  import { onMount } from 'svelte';
  import BarreLaterale from './composants/BarreLaterale.svelte';
  import SectionAVenir from './composants/SectionAVenir.svelte';
  import Parametres from './composants/Parametres.svelte';
  import { SECTION_PAR_DEFAUT, trouverSection, type IdSection } from './lib/navigation';
  import { obtenirPlateforme, type EtatApplication } from './lib/plateforme';
  import { TEXTES } from './lib/textes.fr';

  const plateforme = obtenirPlateforme();

  let sectionActive: IdSection = $state(SECTION_PAR_DEFAUT);
  let etat: EtatApplication | null = $state(null);
  let erreur: string | null = $state(null);

  const section = $derived(trouverSection(sectionActive));

  onMount(async () => {
    try {
      etat = await plateforme.etat();
    } catch (e) {
      erreur = typeof e === 'string' ? e : TEXTES.parametres.erreur;
    }
  });
</script>

<div class="application">
  <BarreLaterale active={sectionActive} profil={etat?.profil} onchoisir={(id) => (sectionActive = id)} />

  <main id="contenu" tabindex="-1" aria-labelledby="titre-section">
    {#if erreur}
      <p class="bandeau probleme" role="alert" data-testid="bandeau-erreur">{erreur}</p>
    {/if}
    {#if etat && etat.profil !== 'officiel'}
      <p class="bandeau" role="note" data-testid="bandeau-profil">{TEXTES.profil[etat.profil]}</p>
    {/if}

    {#if section}
      <h1 id="titre-section">{section.libelle}</h1>
      {#if section.id === 'parametres'}
        <Parametres {etat} {erreur} />
      {:else}
        <SectionAVenir etape={section.etape} />
      {/if}
    {/if}
  </main>
</div>

<style>
  .application {
    display: grid;
    grid-template-columns: var(--largeur-barre) 1fr;
    height: 100%;
  }

  main {
    padding: var(--espace-8);
    overflow-y: auto;
  }

  main:focus {
    outline: none;
  }

  h1 {
    font-size: var(--taille-titre);
    margin: 0 0 var(--espace-6);
  }

  .bandeau {
    margin: 0 0 var(--espace-6);
    padding: var(--espace-2) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-attention-fond);
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
    display: inline-block;
  }

  .bandeau.probleme {
    color: var(--couleur-erreur);
    display: block;
    max-width: 760px;
  }
</style>
