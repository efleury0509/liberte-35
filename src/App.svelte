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
  import Accueil from './composants/accueil/Accueil.svelte';
  import Illustration from './composants/base/Illustration.svelte';
  import ConfigurationGuidee from './composants/guide/ConfigurationGuidee.svelte';
  import { invitationAccueil, ouvrirAuDemarrage } from './actions/guide';
  import type { CibleMesPaies } from './actions/accueil';
  import { SECTION_PAR_DEFAUT, trouverSection, type IdSection } from './lib/navigation';
  import { obtenirPlateforme, type ConfigurationGuidee as EtatGuide, type EtatApplication } from './lib/plateforme';
  import { aujourdhui } from './lib/aujourdhui';
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
  /** 0.16.0 : un lien de l'Accueil vers Mes paies (une paie, une opération, les paies à vérifier). */
  let ciblePaies: CibleMesPaies | null = $state(null);
  /** Chaque lien ouvre Mes paies à neuf, même deux fois de suite. */
  let ouverturePaies = $state(0);
  function ouvrirPaies(cible: CibleMesPaies | null) {
    ciblePaies = cible;
    ouverturePaies += 1;
    sectionActive = 'mes-paies';
  }
  /** 0.16.0 : « Voir le journal » ouvre Paramètres sur l'onglet Journal. */
  let ongletParametres: 'sauvegardes' | 'journal' = $state('sauvegardes');
  function voirJournal() {
    ongletParametres = 'journal';
    sectionActive = 'parametres';
  }
  function choisir(id: IdSection) {
    pretOuvert = null;
    compteOuvert = null;
    depenseAGerer = null;
    ciblePaies = null;
    ongletParametres = 'sauvegardes';
    sectionActive = id;
  }
  function voirCompte(id: string) {
    compteOuvert = id;
    sectionActive = 'mon-epargne';
  }

  // 0.22.0 : configuration guidée. Elle ne s'ouvre seule qu'une fois, sur une
  // installation réellement vierge ; ensuite, l'Accueil invite à la reprendre
  // et Paramètres permet de la rouvrir. Son état n'est qu'un réglage
  // d'affichage : un échec d'écriture ne bloque rien.
  let guide: EtatGuide | null = $state(null);
  let guideOuvert = $state(false);
  let etapeGuide = $state(1);
  const invitation = $derived(invitationAccueil(guide));
  async function retenirGuide(g: EtatGuide) {
    guide = g;
    try {
      await plateforme.definirConfigurationGuidee(g);
    } catch {
      // L'état reste en mémoire pour cette session ; les données ne sont pas concernées.
    }
  }
  function ouvrirGuide(etape: number) {
    etapeGuide = etape;
    guideOuvert = true;
    void retenirGuide({ statut: 'enCours', etape });
  }
  function fermerGuide(section: IdSection = 'vue-ensemble') {
    guideOuvert = false;
    choisir(section);
    void chargerEtat();
  }
  /** Une restauration remplace aussi l'état du guide : on le relit, sans ouverture automatique. */
  async function rechargerApresRestauration() {
    await chargerEtat();
    try {
      guide = await plateforme.lireConfigurationGuidee();
    } catch {
      // On garde l'état connu.
    }
  }
  async function verifierPremiereUtilisation() {
    try {
      const [config, donnees] = await Promise.all([plateforme.lireConfigurationGuidee(), plateforme.lirePaie()]);
      guide = config;
      if (etat && ouvrirAuDemarrage(config, donnees, etat.nombreEntreesJournal)) {
        // La bienvenue s'affiche sans rien écrire : tant que rien n'est fait,
        // l'installation reste vierge.
        etapeGuide = 1;
        guideOuvert = true;
      }
    } catch {
      guide = null;
    }
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
    void chargerEtat().then(() => {
      if (!erreur) void verifierPremiereUtilisation();
    });
    return plateforme.surAvisCopie((a) => {
      if (a.reussie) avisCopie = null;
      else if (a.nouvelAvis) avisCopie = a.erreur;
    });
  });
</script>

{#if guideOuvert}
  <ConfigurationGuidee
    {plateforme}
    jour={aujourdhui()}
    etapeInitiale={etapeGuide}
    onetape={(n) => void retenirGuide({ statut: 'enCours', etape: n })}
    onpause={() => {
      // « Explorer d'abord » depuis la bienvenue : le guide reste à reprendre.
      if (guide?.statut !== 'enCours') void retenirGuide({ statut: 'enCours', etape: 1 });
      fermerGuide();
    }}
    onterminer={() => {
      void retenirGuide({ statut: 'terminee', etape: 6 });
      fermerGuide();
    }}
    onsection={(s) => fermerGuide(s)}
    onchangement={chargerEtat}
  />
{:else}
<div class="application">
  <BarreLaterale active={sectionActive} profil={etat?.profil} version={etat?.versionApplication} onchoisir={choisir} />

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
      {#if section.id === 'mes-paies'}
        <!-- Illustrations (maquette A approuvée) : la loutre organisatrice flotte à
             droite du titre et des boutons de Mes paies, sur le fond crème. -->
        <div class="loutre-paies" data-testid="illustration-paies"><Illustration nom="loutre-paies" largeur={1672} hauteur={941} /></div>
      {:else if section.id === 'mes-dettes'}
        <!-- Illustrations (maquette A approuvée) : le paysage « Liberté financière »
             à droite du titre de Dettes, entier, 540 × 180 au plus. -->
        <div class="paysage-dettes" data-testid="illustration-dettes"><Illustration nom="paysage-dettes" largeur={2172} hauteur={724} /></div>
      {/if}
      {#if section.id !== 'vue-ensemble'}
        <EnTeteSection id="titre-section" titre={section.libelle} sousTitre={section.sousTitre} illustration={section.illustration} />
      {/if}
      {#if section.id === 'vue-ensemble'}
        {#if !erreur}
          <Accueil
            {plateforme}
            onouvrirpaies={ouvrirPaies}
            onjournal={voirJournal}
            {invitation}
            onreprendre={() => ouvrirGuide(invitation?.etape ?? 1)}
            onmasquer={() => void retenirGuide({ statut: 'masquee', etape: guide?.etape ?? 1 })}
          />
        {:else}
          <h1 id="titre-section" class="visuellement-cache">Accueil</h1>
        {/if}
      {:else if section.id === 'parametres'}
        {#key ongletParametres}
          <Parametres {etat} {erreur} {plateforme} onrestauration={rechargerApresRestauration} ongletInitial={ongletParametres} onguide={() => ouvrirGuide(guide?.statut === 'enCours' ? guide.etape : 1)} />
        {/key}
      {:else if section.id === 'mes-paies' && !erreur}
        {#key ouverturePaies}
          <MesPaies {plateforme} profilInstallation={etat?.profil} onchangement={chargerEtat} onvoirpret={voirPret} onvoircarte={voirCarte} onvoircompte={voirCompte} onvoirdepenses={voirDepenses} cible={ciblePaies} />
        {/key}
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
{/if}

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

  /* La loutre de Mes paies flotte à droite : le titre, le sous-titre et les
     boutons se rangent à sa gauche ; les paies passent dessous (clear). */
  .loutre-paies {
    float: right;
    width: min(360px, 38%);
    margin: 0 0 var(--espace-4) var(--espace-6);
  }
  .loutre-paies :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1672 / 941;
    object-fit: contain;
  }
  .paysage-dettes {
    float: right;
    width: min(540px, 58%);
    margin: 0 0 var(--espace-5) var(--espace-6);
  }
  .paysage-dettes :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 2172 / 724;
    object-fit: contain;
    border-radius: 16px;
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
