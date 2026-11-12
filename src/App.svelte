<script lang="ts">
  import { onMount } from 'svelte';
  import BarreLaterale from './composants/BarreLaterale.svelte';
  import SectionAVenir from './composants/SectionAVenir.svelte';
  import EnTeteSection from './composants/base/EnTeteSection.svelte';
  import Parametres from './composants/Parametres.svelte';
  import MesPaies from './composants/paies/MesPaies.svelte';
  import MesDettes from './composants/dettes/MesDettes.svelte';
  import MonEpargne from './composants/epargne/MonEpargne.svelte';
  import DepensesAPrevoir from './composants/depenses/DepensesAPrevoir.svelte';
  import { SECTION_PAR_DEFAUT, trouverSection, type IdSection } from './lib/navigation';
  import { obtenirPlateforme, type EtatApplication } from './lib/plateforme';
  import { TEXTES } from './lib/textes.fr';

  const plateforme = obtenirPlateforme();

  let sectionActive: IdSection = $state(SECTION_PAR_DEFAUT);
  let etat: EtatApplication | null = $state(null);
  let erreur: string | null = $state(null);

  const section = $derived(trouverSection(sectionActive));
  /** Étape 7a : prêt à ouvrir en arrivant dans Mes dettes (« Voir le prêt »). */
  let pretOuvert: string | null = $state(null);
  function voirPret(id: string) {
    pretOuvert = id;
    sectionActive = 'mes-dettes';
  }
  /** Étape 8 : « Voir la carte » depuis Mes paies. */
  function voirCarte() {
    voirPret('carte');
  }
  /** Étape 9 : « Voir le compte » depuis Mes paies. */
  let compteOuvert: string | null = $state(null);
  /** V1 lot 5 : dépense régulière à ouvrir dans Dépenses (« Modifier la règle… »). */
  let depenseAGerer: string | null = $state(null);
  function voirDepenses(id?: string) {
    depenseAGerer = id ?? null;
    sectionActive = 'depenses-a-prevoir';
  }
  function voirCompte(id: string) {
    compteOuvert = id;
    sectionActive = 'mon-epargne';
  }

  async function chargerEtat() {
    try {
      etat = await plateforme.etat();
      erreur = null;
    } catch (e) {
      erreur = typeof e === 'string' ? e : TEXTES.parametres.erreur;
    }
  }

  // R6 : un seul avis quand la copie automatique échoue ; il disparaît
  // à la prochaine copie réussie.
  let avisCopie: string | null = $state(null);

  onMount(() => {
    void chargerEtat();
    return plateforme.surAvisCopie((a) => {
      if (a.reussie) avisCopie = null;
      else if (a.nouvelAvis) avisCopie = a.erreur;
    });
  });
</script>

<div class="application">
  <BarreLaterale
    active={sectionActive}
    profil={etat?.profil}
    version={etat?.versionApplication}
    onchoisir={(id) => {
      pretOuvert = null;
      compteOuvert = null;
      depenseAGerer = null;
      sectionActive = id;
    }}
  />

  <main id="contenu" tabindex="-1" aria-labelledby="titre-section">
    {#if erreur}
      <p class="bandeau probleme" role="alert" data-testid="bandeau-erreur">{erreur}</p>
    {/if}
    {#if avisCopie}
      <p class="bandeau probleme avis-copie" role="alert" data-testid="avis-copie">
        {avisCopie} Détails dans Paramètres.
        <button type="button" class="fermer" aria-label="Fermer l’avis" onclick={() => (avisCopie = null)}>×</button>
      </p>
    {/if}
    {#if etat && etat.profil !== 'officiel'}
      <p class="bandeau" role="note" data-testid="bandeau-profil">{TEXTES.profil[etat.profil]}</p>
    {/if}

    {#if section}
      <EnTeteSection id="titre-section" titre={section.libelle} sousTitre={section.sousTitre} illustration={section.illustration} />
      {#if section.id === 'parametres'}
        <Parametres {etat} {erreur} {plateforme} onrestauration={chargerEtat} />
      {:else if section.id === 'mes-paies' && !erreur}
        <MesPaies {plateforme} profilInstallation={etat?.profil} onchangement={chargerEtat} onvoirpret={voirPret} onvoircarte={voirCarte} onvoircompte={voirCompte} onvoirdepenses={voirDepenses} />
      {:else if section.id === 'mes-dettes' && !erreur}
        {#key pretOuvert}
          <MesDettes {plateforme} onchangement={chargerEtat} ouvert={pretOuvert} />
        {/key}
      {:else if section.id === 'mon-epargne' && !erreur}
        {#key compteOuvert}
          <MonEpargne {plateforme} onchangement={chargerEtat} ouvert={compteOuvert} />
        {/key}
      {:else if section.id === 'depenses-a-prevoir' && !erreur}
        {#key depenseAGerer}
          <DepensesAPrevoir {plateforme} onchangement={chargerEtat} onvoircompte={voirCompte} gerer={depenseAGerer} />
        {/key}
      {:else}
        <SectionAVenir etape={section.etape} />
      {/if}
    {/if}
  </main>
</div>

<style>
  /* V1 lot 6a : exactement la hauteur de la fenêtre ; la barre reste fixe et
     seule la zone principale défile (elle contient tout son contenu). */
  .application {
    display: grid;
    grid-template-columns: var(--largeur-barre) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  main {
    position: relative;
    min-height: 0;
    min-width: 0;
    padding: var(--espace-6) var(--espace-10) var(--espace-8);
    overflow-y: auto;
  }

  main:focus {
    outline: none;
  }

  .bandeau {
    margin: 0 0 var(--espace-4);
    padding: var(--espace-1) var(--espace-4);
    border-radius: var(--arrondi-pilule);
    font-weight: 700;
    background: var(--couleur-attention-fond);
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
    display: inline-block;
  }

  .bandeau.avis-copie {
    display: flex;
    gap: var(--espace-4);
    align-items: flex-start;
  }

  .fermer {
    margin-left: auto;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .bandeau.probleme {
    color: var(--couleur-erreur);
    display: block;
    max-width: 760px;
  }
</style>
