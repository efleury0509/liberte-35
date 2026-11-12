<script lang="ts">
  // Configuration guidée (0.22.0, maquettes approuvées le 12 novembre) :
  // six écrans plein écran, sans barre latérale. Le guide ne crée aucun
  // second système : chaque ajout passe par la proposition existante
  // (proposerProfil, proposerAjout, proposerAjoutPret, proposerAjoutCarte,
  // proposerAjoutCompte), avec l'aperçu, le journal et « Annuler »
  // habituels. Il ajoute seulement : il ne modifie ni ne supprime rien.
  // Chaque ajout est enregistré dès sa validation ; quitter ne perd rien.
  import { onMount, tick } from 'svelte';
  import { ArrowLeft, ArrowRight, Check, Lock } from '@lucide/svelte';
  import Apercu from '../Apercu.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import Illustration from '../base/Illustration.svelte';
  import Icone from '../base/Icone.svelte';
  import GuidePaie from './GuidePaie.svelte';
  import {
    ETAPES_GUIDE,
    NOMBRE_ETAPES,
    RAISON_VERROU,
    SUGGESTIONS_DEPENSES,
    autresRevenus,
    depensesRegulieres,
    etapeAccessible,
    montantElement,
    nomElement,
    recapitulatif,
    sansMontant,
  } from '../../actions/guide';
  import { LIBELLES_QUAND, QUAND_DEPENSE, QUAND_REVENU, decrireQuand, proposerAjout, quandLieePaie, type Quand } from '../../actions/elements';
  import { LIBELLES_QUAND_PRET, proposerAjoutPret, type QuandPret } from '../../actions/prets';
  import { laCarte, proposerAjoutCarte } from '../../actions/cartes';
  import { LIBELLES_SORTE, nomCompte, proposerAjoutCompte, typeAffiche } from '../../actions/comptes';
  import { ErreurSaisie, type Proposition } from '../../actions/paie';
  import { inverser } from '../../lib/appliquer';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme, SorteCompte } from '../../lib/plateforme';
  import type { IdSection } from '../../lib/navigation';
  import { formaterDateCourte, type DateCivile } from '../../noyau/dates';

  interface Props {
    plateforme: Plateforme;
    jour: DateCivile;
    etapeInitiale: number;
    /** L'étape affichée change : on la retient pour la reprise. */
    onetape: (etape: number) => void;
    /** « Explorer l'application d'abord » ou « Faire une pause ». */
    onpause: () => void;
    onterminer: () => void;
    /** Un lien du récapitulatif : le guide se met en pause et la section s'ouvre. */
    onsection: (section: IdSection) => void;
    onchangement: () => void;
  }
  let { plateforme, jour, etapeInitiale, onetape, onpause, onterminer, onsection, onchangement }: Props = $props();

  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  // svelte-ignore state_referenced_locally
  let etape = $state(Math.min(Math.max(etapeInitiale, 1), NOMBRE_ETAPES));
  let messageVerrou: string | null = $state(null);
  let pause = $state(false);

  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);

  type Formulaire = 'depense' | 'revenu' | 'pret' | 'carte' | 'compte';
  let formulaire: Formulaire | null = $state(null);
  let fNom = $state('');
  let fMontant = $state('');
  let fQuand: Quand = $state('mois');
  let fDate = $state('');
  let fEstime = $state(false);
  let fIncertain = $state(false);
  let fQuandPret: QuandPret | '' = $state('');
  let fSorte: SorteCompte | '' = $state('');
  let fTypeLibre = $state('');

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
      // Une étape verrouillée (paie absente) ramène à la paie.
      if (!etapeAccessible(etape, donnees)) etape = 2;
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données.';
    }
  });

  async function aller(n: number) {
    if (!donnees) return;
    if (!etapeAccessible(n, donnees)) {
      messageVerrou = RAISON_VERROU;
      return;
    }
    messageVerrou = null;
    fermerFormulaire();
    dernier = null;
    messageAnnulation = null;
    etape = n;
    onetape(n);
    await tick();
    document.getElementById('titre-guide')?.focus();
    document.querySelector('.guide-corps')?.scrollTo?.({ top: 0 });
  }

  // ---- Propositions : le même circuit que dans les sections ----
  function proposer(fabrique: () => Proposition) {
    messageAnnulation = null;
    dernier = null;
    let p: Proposition;
    try {
      p = fabrique();
      erreurSaisie = null;
    } catch (e) {
      proposition = null;
      erreurSaisie = e instanceof ErreurSaisie || e instanceof Error ? e.message : String(e);
      return;
    }
    if (p.apercu) proposition = p;
    else void enregistrer(p);
  }

  async function enregistrer(p: Proposition) {
    if (!donnees) return;
    const avant = donnees;
    enCours = true;
    try {
      donnees = await plateforme.appliquerChangementsPaie(p.changements, p.journal);
      const inverse = inverser(avant, p.changements);
      dernier = inverse.length > 0 ? { titre: p.titre, inverse, journal: p.journal } : null;
      proposition = null;
      formulaire = null;
      erreurSaisie = null;
      if (donnees.profil) messageVerrou = null;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Enregistrement impossible.';
    } finally {
      enCours = false;
    }
  }

  async function annulerDernier() {
    if (!dernier) return;
    const d = dernier;
    enCours = true;
    try {
      donnees = await plateforme.appliquerChangementsPaie(
        d.inverse,
        d.journal.map((e) => ({ ...e, champ: `annulation — ${e.champ}`, ancienneValeur: e.nouvelleValeur, nouvelleValeur: e.ancienneValeur })),
      );
      dernier = null;
      messageAnnulation = `Annulé : ${d.titre.endsWith('.') ? d.titre : `${d.titre}.`}`;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : 'Annulation impossible.';
    } finally {
      enCours = false;
    }
  }

  function ouvrir(f: Formulaire, nom = '') {
    formulaire = f;
    erreurSaisie = null;
    proposition = null;
    dernier = null;
    messageAnnulation = null;
    fNom = nom;
    fMontant = fDate = fTypeLibre = '';
    fQuand = 'mois';
    fQuandPret = '';
    fSorte = '';
    fEstime = fIncertain = false;
    if (f === 'compte') fDate = jour;
  }
  function fermerFormulaire() {
    formulaire = null;
    erreurSaisie = null;
  }

  // ---- Ce qui est déjà enregistré ----
  const depenses = $derived(donnees ? depensesRegulieres(donnees) : []);
  const revenus = $derived(donnees ? autresRevenus(donnees) : []);
  const prets = $derived((donnees as DonneesPaie | null)?.prets ?? []);
  const carte = $derived(donnees ? laCarte(donnees) : null);
  const comptes = $derived(((donnees as DonneesPaie | null)?.comptes ?? []).filter((k) => k.fermeLe === null));
  const recap = $derived(donnees ? recapitulatif(donnees) : null);
  const suggestionUtilisee = (nom: string) => depenses.some((e) => e.libelle.trim().toLowerCase() === nom.toLowerCase());
  /** Récurrences seulement : une dépense régulière revient. */
  const quandDepense = QUAND_DEPENSE.filter((q) => q !== 'unique' && q !== 'cycle');
  const quandRevenu = QUAND_REVENU.filter((q) => q !== 'unique');
  const SORTES: SorteCompte[] = ['celi', 'reer', 'celiapp', 'epargne', 'autre'];
  const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;

  const etatEtape = $derived.by(() => {
    if (etape === 3) {
      const n = depenses.length + revenus.length;
      return n > 0 ? `${pluriel(n, 'élément enregistré', 'éléments enregistrés')}` : null;
    }
    if (etape === 4) {
      const n = prets.length + (carte ? 1 : 0);
      return n > 0 ? `${pluriel(n, 'dette enregistrée', 'dettes enregistrées')}` : null;
    }
    if (etape === 5) return comptes.length > 0 ? `${pluriel(comptes.length, 'compte enregistré', 'comptes enregistrés')}` : null;
    return null;
  });

  /** Ce qui est conservé, pour la fenêtre « Faire une pause ». */
  const conserve = $derived.by(() => {
    if (!donnees) return [];
    const l: string[] = [];
    if (donnees.profil) l.push('ton calendrier de paie');
    if (depenses.length > 0) l.push(pluriel(depenses.length, 'dépense régulière', 'dépenses régulières'));
    if (revenus.length > 0) l.push(pluriel(revenus.length, 'autre revenu', 'autres revenus'));
    if (prets.length > 0) l.push(pluriel(prets.length, 'prêt', 'prêts'));
    if (carte) l.push('ta carte de crédit');
    if (comptes.length > 0) l.push(pluriel(comptes.length, 'compte d’épargne', 'comptes d’épargne'));
    return l;
  });

  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape' && pause) {
      e.preventDefault();
      pause = false;
    }
  }
</script>

<svelte:window onkeydown={touche} />

{#snippet enregistres()}
  {#if erreurSaisie && !proposition && !formulaire}
    <p role="alert" class="erreur" data-testid="erreur-saisie">{erreurSaisie}</p>
  {/if}
  {#if dernier}
    <p class="enregistre" role="status" data-testid="enregistre">
      Enregistré : {dernier.titre.endsWith('.') ? dernier.titre : `${dernier.titre}.`}
      <button type="button" onclick={annulerDernier} disabled={enCours}>Annuler</button>
      <button type="button" class="fermer" onclick={() => (dernier = null)} aria-label="Fermer">×</button>
    </p>
  {:else if messageAnnulation}
    <p class="enregistre" role="status" data-testid="annule">{messageAnnulation}</p>
  {/if}
{/snippet}

<div class="guide" data-testid="guide" data-etape={etape}>
  {#if etape === 1}
    <!-- 1. Bienvenue : une page à elle seule, avec la loutre. -->
    <section class="bienvenue" aria-labelledby="titre-guide" data-testid="guide-bienvenue">
      <div class="carte-bienvenue">
        <div class="image"><Illustration nom="loutre-bienvenue" largeur={1671} hauteur={941} /></div>
        <div class="texte">
          <h1 id="titre-guide" tabindex="-1">Bienvenue dans Liberté 35 !</h1>
          <p class="chapeau">On va installer ton budget ensemble, une paie à la fois. Compte une dizaine de minutes ; tu peux t’arrêter quand tu veux et reprendre plus tard.</p>
          <ul class="promesses">
            <li><strong>Tout se complète plus tard</strong>Seul ton calendrier de paie est nécessaire pour commencer. Le reste peut attendre.</li>
            <li><strong>Inconnu n’est pas zéro</strong>Un montant que tu ne connais pas s’affiche « À compléter », jamais 0 $.</li>
            <li><strong>Rien sans ton accord</strong>Chaque ajout passe par toi. Rien n’est confirmé ni payé à ta place.</li>
          </ul>
          <button type="button" class="principal gros" onclick={() => aller(2)} disabled={!donnees} data-testid="commencer-configuration">Commencer ma configuration</button>
          <p class="sous-bouton">
            <button type="button" class="lien" onclick={onpause} data-testid="explorer-dabord">Explorer l’application d’abord</button> · tu retrouveras le guide dans l’Accueil et dans Paramètres.
          </p>
        </div>
      </div>
    </section>
  {:else}
    <header class="guide-tete">
      <p class="marque">Liberté 35 <span>Configuration guidée</span></p>
      <button type="button" class="quitter" onclick={() => (pause = true)} data-testid="quitter-guide">Quitter le guide</button>
    </header>
    <nav class="frise" aria-label="Étapes de la configuration guidée">
      <ol>
        {#each ETAPES_GUIDE as libelle, i (libelle)}
          {@const n = i + 1}
          {@const accessible = donnees ? etapeAccessible(n, donnees) : n <= 2}
          <li>
            <button
              type="button"
              class:fait={n < etape && accessible}
              class:courant={n === etape}
              class:verrou={!accessible}
              aria-current={n === etape ? 'step' : undefined}
              aria-disabled={!accessible}
              title={accessible ? undefined : RAISON_VERROU}
              onclick={() => aller(n)}
              data-testid={`frise-${n}`}
            >
              <span class="num" aria-hidden="true">
                {#if !accessible}<Icone icone={Lock} taille={13} />{:else if n < etape}<Icone icone={Check} taille={14} />{:else}{n}{/if}
              </span>
              {libelle}{#if !accessible}<span class="visuellement-cache"> (verrouillée)</span>{/if}
            </button>
          </li>
        {/each}
      </ol>
      {#if messageVerrou}<p class="raison-verrou" role="status" data-testid="raison-verrou"><Icone icone={Lock} taille={15} /> {messageVerrou}</p>{/if}
    </nav>

    <main class="guide-corps">
      <div class="contenu">
        {#if erreurChargement}
          <p role="alert" class="erreur">{erreurChargement}</p>
        {:else if !donnees}
          <p class="discret">Chargement…</p>
        {:else if etape === 2}
          <h1 id="titre-guide" tabindex="-1">Ma paie</h1>
          <p class="intro">Tout Liberté 35 s’organise autour de tes paies. C’est la seule étape obligatoire.</p>
          <GuidePaie {donnees} {jour} {proposer} />
          {@render enregistres()}
        {:else if etape === 3}
          <h1 id="titre-guide" tabindex="-1">Dépenses régulières et autres revenus</h1>
          <p class="intro">Ce qui revient souvent. Un montant inconnu peut rester vide : il sera « À compléter ».</p>
          <section class="bloc peche" aria-labelledby="titre-depenses" data-testid="guide-depenses">
            <h2 id="titre-depenses">Mes dépenses régulières</h2>
            <p class="discret">Clique une suggestion pour ouvrir le formulaire avec ce nom. Aucun montant n’est proposé ; rien n’est créé tant que tu n’enregistres pas.</p>
            <ul class="puces" aria-label="Suggestions de dépenses">
              {#each SUGGESTIONS_DEPENSES as s (s)}
                {@const utilisee = suggestionUtilisee(s)}
                <li><button type="button" class="puce" class:utilisee onclick={() => ouvrir('depense', s)} data-testid="suggestion">{#if utilisee}<Icone icone={Check} taille={14} />{:else}+{/if} {s}</button></li>
              {/each}
            </ul>
            {#if depenses.length > 0}
              <ul class="liste" data-testid="liste-depenses">
                {#each depenses as e (e.id)}
                  <li><span><span class="nom">{e.libelle}</span> <span class="quand">· {decrireQuand(e, jour)}</span></span>{#if sansMontant(e)}<span class="pastille a-completer">À compléter</span>{:else}<span class="montant">{montantElement(e)}</span>{/if}</li>
                {/each}
              </ul>
            {/if}
            <button type="button" onclick={() => ouvrir('depense')}>+ {depenses.length > 0 ? 'Ajouter une autre dépense' : 'Ajouter une dépense'}</button>
          </section>
          <section class="bloc lilas" aria-labelledby="titre-revenus" data-testid="guide-revenus">
            <h2 id="titre-revenus">Mes autres revenus</h2>
            <p class="discret">En plus de ta paie : allocation, travail autonome, pension… Section facultative : sans autre revenu, continue simplement.</p>
            {#if revenus.length > 0}
              <ul class="liste" data-testid="liste-revenus">
                {#each revenus as e (e.id)}
                  <li><span><span class="nom">{e.libelle}</span> <span class="quand">· {decrireQuand(e, jour)}</span></span>{#if sansMontant(e)}<span class="pastille a-completer">À compléter</span>{:else}<span class="montant">{montantElement(e)}</span>{/if}</li>
                {/each}
              </ul>
            {/if}
            <button type="button" onclick={() => ouvrir('revenu')}>+ Ajouter un revenu</button>
          </section>
          {@render enregistres()}
        {:else if etape === 4}
          <h1 id="titre-guide" tabindex="-1">Mes dettes</h1>
          <p class="intro">Les versements à prévoir dans tes paies. Le solde, le taux et l’échéance peuvent attendre.</p>
          <div class="deux-colonnes">
            <section class="bloc peche" aria-labelledby="titre-prets" data-testid="guide-prets">
              <h2 id="titre-prets">Mes prêts</h2>
              <p class="discret">Auto, études, marge… Seuls le nom, le versement, la fréquence et la prochaine date sont demandés.</p>
              {#if prets.length > 0}
                <ul class="liste">
                  {#each prets as p (p.id)}
                    {@const el = donnees.elements.find((e) => e.id === p.id)}
                    <li><span><span class="nom">{nomElement(donnees, p.id)}</span> {#if el}<span class="quand">· {decrireQuand(el, jour)}</span>{/if}</span>{#if el && !sansMontant(el)}<span class="montant">{montantElement(el)}</span>{/if}</li>
                  {/each}
                </ul>
              {/if}
              <button type="button" onclick={() => ouvrir('pret')}>+ Ajouter un prêt</button>
            </section>
            <section class="bloc lilas" aria-labelledby="titre-carte" data-testid="guide-carte">
              <h2 id="titre-carte">Ma carte de crédit</h2>
              <p class="discret">Le nom et la prochaine échéance suffisent. Le premier relevé s’ajoutera dans Dettes.</p>
              {#if carte}
                {@const el = donnees.elements.find((e) => e.id === carte.id)}
                <ul class="liste">
                  <li><span><span class="nom">{nomElement(donnees, carte.id)}</span> {#if el}<span class="quand">· {decrireQuand(el, jour)}</span>{/if}</span></li>
                </ul>
              {:else}
                <button type="button" onclick={() => ouvrir('carte')}>+ Ajouter ma carte</button>
              {/if}
            </section>
          </div>
          {#if prets.length === 0 && !carte}
            <p class="aucune"><button type="button" onclick={() => aller(5)} data-testid="pas-de-dette">Je n’ai pas de dette <Icone icone={ArrowRight} taille={16} /></button></p>
          {/if}
          {@render enregistres()}
        {:else if etape === 5}
          <h1 id="titre-guide" tabindex="-1">Mon épargne</h1>
          <p class="intro">Tes comptes d’épargne et de placement. Le type suffit ; le solde peut rester « À compléter ».</p>
          <section class="bloc peche" aria-labelledby="titre-comptes" data-testid="guide-comptes">
            <h2 id="titre-comptes">Mes comptes</h2>
            <p class="discret">Sans solde, la valeur reste « À compléter » (jamais 0 $). 0 $ est un vrai solde.</p>
            {#if comptes.length > 0}
              <ul class="liste">
                {#each comptes as k (k.id)}
                  <li><span><span class="nom">{nomCompte(donnees, k)}</span>{#if k.nom}<span class="quand"> · {typeAffiche(k)}</span>{/if}</span>{#if k.references.length === 0}<span class="pastille a-completer">Solde à compléter</span>{/if}</li>
                {/each}
              </ul>
            {/if}
            <button type="button" onclick={() => ouvrir('compte')}>+ Ajouter un compte</button>
            <p class="discret plus-loin">Les réserves, cotisations et contributions se règlent plus tard dans Épargne.</p>
          </section>
          {@render enregistres()}
        {:else if etape === 6 && recap}
          <h1 id="titre-guide" tabindex="-1">Récapitulatif</h1>
          <p class="intro">Voici ce qui est en place. Tout reste modifiable dans chaque section.</p>
          <div class="compteurs" data-testid="compteurs">
            <p class="c-ok"><span class="n" data-testid="nombre-enregistres">{recap.enregistres}</span>{recap.enregistres === 1 ? 'élément enregistré' : 'éléments enregistrés'}</p>
            <p class="c-comp"><span class="n" data-testid="nombre-a-completer">{recap.aCompleter}</span>{recap.aCompleter === 1 ? 'renseignement à compléter' : 'renseignements à compléter'}</p>
          </div>
          <div class="deux-colonnes recap">
            {#each recap.sections as s (s.titre)}
              <section aria-labelledby={`recap-${s.section}`} data-testid="recap-section">
                <h2 id={`recap-${s.section}`}>{s.titre} <button type="button" class="lien" onclick={() => onsection(s.section)}>{s.lien} <Icone icone={ArrowRight} taille={14} /></button></h2>
                <ul class="liste">
                  {#each s.lignes as l, i (i)}
                    <li data-etat={l.etat}>
                      <span class="nom">{l.libelle}</span>
                      <span class="fin">
                        <span class="pastille" class:ok={l.etat === 'enregistre'} class:a-completer={l.etat === 'aCompleter'}>{l.valeur}</span>
                        {#if l.etat === 'aCompleter'}<button type="button" class="lien" onclick={() => onsection(s.section)}>Compléter</button>{:else if l.etat === 'aucun'}<button type="button" class="lien" onclick={() => onsection(s.section)}>Ajouter</button>{/if}
                      </span>
                    </li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
          <div class="plus-tard">
            <h2>Plus tard, quand tu voudras</h2>
            <p>Dépenses à prévoir (cadeaux, réparations…), enveloppes variables (épicerie, sorties…), seuil d’attention et ordre de priorité des dettes.</p>
          </div>
          <p class="note-fin"><strong>Terminer le guide ne veut pas dire que tout est complet.</strong> Les renseignements « À compléter » restent signalés dans l’Accueil et dans chaque section.</p>
        {/if}
      </div>
    </main>

    <footer class="guide-pied">
      <button type="button" onclick={() => aller(etape - 1)} data-testid="guide-retour"><Icone icone={ArrowLeft} taille={16} /> {ETAPES_GUIDE[etape - 2]}</button>
      <div class="droite">
        {#if etape === 2 && donnees && !donnees.profil}
          <span class="discret" data-testid="raison-continuer">Enregistre ton calendrier de paie pour débloquer la suite.</span>
        {:else if etatEtape}
          <span class="etat"><Icone icone={Check} taille={15} /> {etatEtape}</span>
        {/if}
        {#if etape === 3 || etape === 4}
          <button type="button" class="lien" onclick={() => aller(etape + 1)} data-testid="passer-etape">Passer cette étape</button>
        {:else if etape === 5}
          <button type="button" class="lien" onclick={() => aller(6)} data-testid="passer-etape">Plus tard</button>
        {/if}
        {#if etape < 6}
          <button type="button" class="principal" onclick={() => aller(etape + 1)} disabled={!donnees || !etapeAccessible(etape + 1, donnees)} data-testid="guide-continuer">Continuer <Icone icone={ArrowRight} taille={16} /></button>
        {:else}
          <button type="button" class="principal terminer" onclick={onterminer} data-testid="terminer-guide">Terminer et aller à l’Accueil</button>
        {/if}
      </div>
    </footer>
  {/if}

  {#if formulaire === 'depense' || formulaire === 'revenu'}
    {@const revenu = formulaire === 'revenu'}
    <FenetreFormulaire titre={revenu ? 'Ajouter un revenu' : fNom ? `Ajouter une dépense — ${fNom}` : 'Ajouter une dépense'} erreur={proposition ? null : erreurSaisie} onabandonner={fermerFormulaire}>
      <form
        class="formulaire"
        data-testid="formulaire-element"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() =>
            proposerAjout(
              donnees!,
              { nature: revenu ? 'revenu' : 'depense', libelle: fNom, montant: fMontant, genre: 'fixe', quand: fQuand, date: fDate, cyclePaie: '', estimation: fEstime, incertain: revenu && fIncertain },
              jour,
            ),
          );
        }}
      >
        <label>Nom <input bind:value={fNom} /></label>
        <label>Montant ($, facultatif) <input inputmode="decimal" bind:value={fMontant} placeholder="Vide = À compléter" /></label>
        <label
          >Quand
          <select bind:value={fQuand}>
            {#each revenu ? quandRevenu : quandDepense as q (q)}<option value={q}>{LIBELLES_QUAND[q]}</option>{/each}
          </select>
        </label>
        {#if quandLieePaie(fQuand)}
          <label>Date de départ (facultatif : sinon, dès le cycle actuel) <input type="date" bind:value={fDate} /></label>
        {:else}
          <label>Date (la prochaine) <input type="date" bind:value={fDate} /></label>
        {/if}
        <label class="case"><input type="checkbox" bind:checked={fEstime} /> Montant estimé</label>
        {#if revenu}<label class="case"><input type="checkbox" bind:checked={fIncertain} /> Revenu incertain</label>{/if}
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </form>
    </FenetreFormulaire>
  {:else if formulaire === 'pret'}
    <FenetreFormulaire titre="Ajouter un prêt" contexte="Ces quatre renseignements suffisent pour commencer." erreur={proposition ? null : erreurSaisie} onabandonner={fermerFormulaire}>
      <form
        class="formulaire"
        data-testid="formulaire-pret"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutPret(donnees!, { nom: fNom, versement: fMontant, quand: fQuandPret, prochaine: fDate, minimum: '', echeanceFinale: '', solde: '', soldeLe: '', taux: '' }, jour));
        }}
      >
        <label>Nom du prêt <input bind:value={fNom} /></label>
        <label>Versement ($) <input inputmode="decimal" bind:value={fMontant} /></label>
        <label
          >Fréquence
          <select bind:value={fQuandPret}>
            <option value="">Choisir…</option>
            {#each Object.entries(LIBELLES_QUAND_PRET) as [valeur, libelle] (valeur)}<option value={valeur}>{libelle}</option>{/each}
          </select>
        </label>
        <label>Prochain versement <input type="date" bind:value={fDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </form>
    </FenetreFormulaire>
  {:else if formulaire === 'carte'}
    <FenetreFormulaire titre="Ajouter ma carte" contexte="Le nom et la prochaine échéance suffisent ; le reste se complète dans Dettes." erreur={proposition ? null : erreurSaisie} onabandonner={fermerFormulaire}>
      <form
        class="formulaire"
        data-testid="formulaire-carte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutCarte(donnees!, { nom: fNom, prochaine: fDate, limite: '', taux: '' }, jour));
        }}
      >
        <label>Nom de la carte <input bind:value={fNom} /></label>
        <label>Prochaine échéance <input type="date" bind:value={fDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </form>
    </FenetreFormulaire>
  {:else if formulaire === 'compte'}
    <FenetreFormulaire titre="Ajouter un compte" erreur={proposition ? null : erreurSaisie} onabandonner={fermerFormulaire}>
      <form
        class="formulaire"
        data-testid="formulaire-compte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutCompte(donnees!, { sorte: fSorte, typeLibre: fTypeLibre, nom: fNom, vocation: '', institution: '', solde: fMontant, soldeLe: fDate }, jour));
        }}
      >
        <p class="discret">Seul le type est obligatoire. Sans solde, la valeur reste « À compléter » (jamais 0 $) ; 0 $ est un vrai solde.</p>
        <label
          >Type
          <select bind:value={fSorte}>
            <option value="" disabled>Choisir…</option>
            {#each SORTES as s (s)}<option value={s}>{s === 'autre' ? 'Autre…' : LIBELLES_SORTE[s]}</option>{/each}
          </select>
        </label>
        {#if fSorte === 'autre'}<label>Nom du type <input bind:value={fTypeLibre} /></label>{/if}
        <label>Nom (facultatif) <input bind:value={fNom} /></label>
        <label>Solde de départ ($, facultatif) <input inputmode="decimal" bind:value={fMontant} placeholder="Vide = À compléter" /></label>
        <label>En date du <input type="date" bind:value={fDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </form>
    </FenetreFormulaire>
  {/if}

  {#if proposition}
    <Apercu
      {proposition}
      {enCours}
      erreur={erreurSaisie}
      onconfirmer={() => proposition && enregistrer(proposition)}
      onajuster={() => (proposition = null)}
      onannuler={() => {
        proposition = null;
        fermerFormulaire();
      }}
    />
  {/if}

  {#if pause}
    <div class="voile" aria-hidden="true" onclick={() => (pause = false)}></div>
    <div class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-pause" data-testid="fenetre-pause">
      <h2 id="titre-pause">Faire une pause ?</h2>
      {#if conserve.length > 0}
        <p>Tout ce que tu as enregistré est conservé :</p>
        <ul>{#each conserve as c (c)}<li>{c}</li>{/each}</ul>
      {:else}
        <p>Rien n’a encore été enregistré ; rien ne sera perdu.</p>
      {/if}
      <p class="discret">Un formulaire ouvert mais pas encore enregistré ne sera pas gardé. Tu pourras reprendre à l’étape {etape} depuis l’Accueil ou Paramètres.</p>
      <div class="boutons">
        <button type="button" onclick={() => (pause = false)}>Rester dans le guide</button>
        <button type="button" class="principal" onclick={onpause} data-testid="confirmer-pause">Faire une pause</button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Plein écran, sans barre latérale : les fenêtres partagées (aperçu,
     formulaires) se centrent sur toute la largeur. */
  .guide {
    --largeur-barre: 0px;
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--couleur-fond);
    overflow: hidden;
  }

  /* ---- 1. Bienvenue ---- */
  .bienvenue {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--espace-8) var(--espace-6);
  }
  .carte-bienvenue {
    width: min(980px, 100%);
    margin: auto 0;
    background: var(--couleur-surface);
    border: var(--bordure-structure);
    border-radius: var(--arrondi-grand);
    overflow: hidden;
    box-shadow: var(--ombre-carte);
  }
  .image {
    border-bottom: var(--bordure-structure);
    line-height: 0;
  }
  .image :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1671 / 941;
    object-fit: contain;
  }
  .texte {
    padding: var(--espace-8) var(--espace-10);
    text-align: center;
  }
  .texte h1 {
    font-size: var(--titre-page);
    margin: 0 0 var(--espace-2);
  }
  .texte h1:focus {
    outline: none;
  }
  .chapeau {
    font-size: var(--sous-titre-page);
    margin: 0 auto var(--espace-6);
    max-width: 46em;
  }
  .promesses {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-8);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
    gap: var(--espace-4);
    text-align: left;
    font-size: var(--texte-dense);
  }
  .promesses li {
    background: var(--couleur-panneau);
    border-radius: var(--arrondi-panneau);
    padding: var(--espace-4);
  }
  .promesses li:nth-child(2) {
    background: var(--sorbet-beurre-pale);
  }
  .promesses li:nth-child(3) {
    background: var(--sorbet-sauge-pale);
  }
  .promesses strong {
    display: block;
    font-family: var(--police-titre);
    font-size: var(--titre-bloc);
    margin-bottom: var(--espace-1);
  }
  .gros {
    font-size: 18px;
    padding: var(--espace-3) var(--espace-8);
    min-height: 52px;
  }
  .sous-bouton {
    margin: var(--espace-4) 0 0;
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
  }

  /* ---- Cadre des étapes 2 à 6 ---- */
  .guide-tete {
    background: var(--couleur-bandeau);
    color: var(--couleur-bandeau-texte);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-4);
    padding: var(--espace-3) var(--espace-8);
  }
  .marque {
    margin: 0;
    font-family: var(--police-titre);
    font-weight: 800;
    font-size: 20px;
  }
  .marque span {
    font-family: var(--police);
    font-weight: 600;
    font-size: var(--texte-dense);
    opacity: 0.85;
    margin-left: var(--espace-3);
  }
  .quitter {
    background: transparent;
    color: var(--creme-50);
    border-color: var(--prune-300);
  }
  .quitter:hover:not(:disabled) {
    background: var(--prune-600);
  }
  .frise {
    background: var(--creme-200);
    border-bottom: var(--epaisseur-bordure) solid var(--couleur-bordure);
    padding: var(--espace-3) var(--espace-8);
  }
  .frise ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
  }
  .frise button {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-2);
    padding: 4px 14px 4px 5px;
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
    background: var(--couleur-surface);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
  }
  .num {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    background: var(--creme-200);
    font-size: 13px;
  }
  .frise .fait {
    color: var(--couleur-texte);
    background: var(--sorbet-sauge-pale);
    border-color: var(--sorbet-sauge);
  }
  .frise .fait .num {
    background: var(--sorbet-vert);
    color: var(--creme-50);
  }
  .frise .courant {
    color: var(--couleur-texte);
    background: var(--sorbet-peche-pale);
    border: 2px solid var(--sorbet-orange);
  }
  .frise .courant .num {
    background: var(--sorbet-orange);
    color: var(--prune-900);
  }
  .frise .verrou {
    opacity: 0.7;
    cursor: help;
  }
  .raison-verrou {
    margin: var(--espace-2) 0 0;
    display: flex;
    align-items: center;
    gap: var(--espace-2);
    font-size: var(--texte-dense);
    font-weight: 700;
    color: var(--couleur-attention);
  }
  .guide-corps {
    flex: 1;
    overflow-y: auto;
  }
  .contenu {
    width: min(1060px, 100%);
    margin: 0 auto;
    padding: var(--espace-8) var(--espace-8) var(--espace-6);
  }
  .contenu h1 {
    font-size: 40px;
    margin: 0 0 var(--espace-1);
  }
  .contenu h1:focus {
    outline: none;
  }
  .intro {
    font-size: var(--sous-titre-page);
    margin: 0 0 var(--espace-6);
    color: var(--couleur-texte-discret);
  }
  .guide-pied {
    background: var(--couleur-surface);
    border-top: var(--epaisseur-bordure) solid var(--couleur-bordure);
    padding: var(--espace-3) var(--espace-8);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-4);
    flex-wrap: wrap;
  }
  .guide-pied button {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
  }
  .droite {
    display: flex;
    align-items: center;
    gap: var(--espace-4);
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-left: auto;
  }
  .etat {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
    font-size: var(--texte-dense);
    color: var(--couleur-succes);
    font-weight: 700;
  }
  .droite .discret {
    font-size: var(--texte-dense);
  }
  .terminer {
    font-size: 17px;
    min-height: 44px;
    padding: var(--espace-2) var(--espace-6);
  }

  /* L'avis « Enregistré : … Annuler » passe au-dessus du pied du guide. */
  .guide :global(.enregistre) {
    bottom: 88px;
  }

  /* ---- Blocs partagés (aussi dans GuidePaie) ---- */
  .guide :global(.bloc) {
    background: var(--couleur-surface);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
    border-radius: var(--arrondi-carte);
    padding: var(--espace-6);
    margin: 0 0 var(--espace-6);
  }
  .guide :global(.bloc > h2) {
    margin: 0 0 var(--espace-1);
    font-size: 24px;
  }
  .guide :global(.bloc > .discret) {
    margin: 0 0 var(--espace-4);
  }
  .guide :global(.bloc.peche) {
    border-top: 6px solid var(--sorbet-peche);
  }
  .guide :global(.bloc.lilas) {
    background: var(--sorbet-lilas-pale);
    border-color: var(--sorbet-lilas);
    border-top: 6px solid var(--sorbet-lilas);
  }
  .deux-colonnes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr));
    gap: var(--espace-6);
  }
  .deux-colonnes > .bloc {
    margin-bottom: 0;
  }
  .puces {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
  }
  .puce {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
    min-height: 32px;
    padding: 2px 14px;
    font-size: var(--texte-dense);
    border-style: dashed;
  }
  .puce.utilisee {
    border-style: solid;
    background: var(--sorbet-sauge-pale);
    border-color: var(--sorbet-sauge);
    color: var(--couleur-succes);
  }
  .liste {
    list-style: none;
    margin: 0 0 var(--espace-4);
    padding: 0;
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
    border-radius: var(--arrondi-panneau);
    overflow: hidden;
    background: var(--couleur-surface);
  }
  .liste li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-4);
    padding: var(--espace-3) var(--espace-4);
    border-top: 1px solid var(--creme-200);
  }
  .liste li:first-child {
    border-top: 0;
  }
  .nom {
    font-weight: 700;
  }
  .quand {
    color: var(--couleur-texte-discret);
    font-size: var(--texte-dense);
  }
  .montant {
    font-weight: 800;
    white-space: nowrap;
  }
  .pastille {
    display: inline-block;
    border-radius: var(--arrondi-pilule);
    padding: 2px 12px;
    font-weight: 800;
    font-size: var(--taille-petit);
    white-space: nowrap;
    color: var(--etat-neutre-texte);
    background: var(--etat-neutre-fond);
  }
  .pastille.ok {
    color: var(--etat-confirme-texte);
    background: var(--etat-confirme-fond);
  }
  .pastille.a-completer {
    color: var(--etat-a-completer-texte);
    background: var(--etat-a-completer-fond);
  }
  .plus-loin {
    margin: var(--espace-4) 0 0;
  }
  .aucune {
    margin: var(--espace-6) 0 0;
  }
  .aucune button {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
  }

  /* ---- 6. Récapitulatif ---- */
  .compteurs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--espace-4);
    margin-bottom: var(--espace-6);
  }
  .compteurs p {
    margin: 0;
    border-radius: var(--arrondi-carte);
    padding: var(--espace-4) var(--espace-5);
  }
  .compteurs .n {
    display: block;
    font-family: var(--police-titre);
    font-size: var(--montant-moyen);
    font-weight: 900;
    line-height: 1.1;
  }
  .c-ok {
    background: var(--sorbet-sauge-pale);
  }
  .c-comp {
    background: var(--sorbet-beurre-pale);
  }
  .recap {
    row-gap: var(--espace-4);
  }
  .recap h2 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--espace-3);
    font-size: var(--titre-bloc);
    margin: 0 0 var(--espace-2);
  }
  .recap h2 button {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-family: var(--police);
    font-size: var(--texte-dense);
  }
  .recap .liste {
    margin: 0;
  }
  .recap .liste li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .fin {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-3);
    margin-left: auto;
  }
  .fin .lien {
    font-size: var(--texte-dense);
  }
  .plus-tard {
    margin-top: var(--espace-6);
    border: var(--epaisseur-bordure) dashed var(--couleur-bordure-forte);
    border-radius: var(--arrondi-carte);
    padding: var(--espace-4) var(--espace-5);
  }
  .plus-tard h2 {
    margin: 0 0 var(--espace-1);
    font-size: var(--titre-bloc);
  }
  .plus-tard p {
    margin: 0;
    color: var(--couleur-texte-discret);
  }
  .note-fin {
    background: var(--couleur-panneau);
    border-radius: var(--arrondi-panneau);
    padding: var(--espace-4) var(--espace-5);
    margin: var(--espace-6) 0 0;
  }

  /* ---- Fenêtre « Faire une pause » ---- */
  .voile {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--voile);
  }
  .dialogue {
    position: fixed;
    z-index: 21;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 2 * var(--espace-6)));
    background: var(--couleur-surface);
    border: var(--bordure-structure);
    border-radius: var(--arrondi-grand);
    padding: var(--espace-6) var(--espace-8);
    box-shadow: var(--ombre-flottante);
  }
  .dialogue h2 {
    margin: 0 0 var(--espace-3);
  }
  .dialogue .boutons {
    display: flex;
    gap: var(--espace-3);
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: var(--espace-4);
  }

  @media (max-width: 1100px) {
    .guide-tete,
    .frise,
    .guide-pied {
      padding-left: var(--espace-5);
      padding-right: var(--espace-5);
    }
    .contenu {
      padding: var(--espace-6) var(--espace-5);
    }
  }
</style>
