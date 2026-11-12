<script lang="ts">
  // Étape A : les dépenses à prévoir (fixes, irrégulières). Chacune est une
  // dépense de Mes paies avec une fiche : son estimation, sa date et sa
  // fréquence sont la seule source (B1). Une réserve liée peut la couvrir.
  import { onMount, tick } from 'svelte';
  import Apercu from '../Apercu.svelte';
  import { ErreurSaisie, type Proposition } from '../../actions/paie';
  import {
    QUAND_DEPENSE,
    douzeMois,
    proposerAjoutDepense,
    proposerDateFrequence,
    proposerEstimation,
    proposerFinDepense,
    proposerLienReserve,
    proposerModeOccurrence,
    proposerNoteDepense,
    proposerSuggestion,
    proposerSuppressionDepense,
    vueDepenses,
    type VueDepense,
  } from '../../actions/depenses';
  import { comptesDe, nomCompte } from '../../actions/comptes';
  import { estDepenseAPrevoir } from '../../actions/depenses';
  import { reservesDe } from '../../actions/couvertures';
  import { LIBELLES_QUAND, NOMBRE_CYCLES, cyclesAffiches, type Quand } from '../../actions/elements';
  import { versNoyau } from '../../actions/paie';
  import { estPret } from '../../actions/prets';
  import { estPaiementCarte } from '../../actions/cartes';
  import { estContribution } from '../../actions/comptes';
  import RevenusDepenses from '../paies/RevenusDepenses.svelte';
  import Illustration from '../base/Illustration.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import { CalendarClock } from '@lucide/svelte';
  import { inverser } from '../../lib/appliquer';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme } from '../../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onchangement: () => void;
    onvoircompte: (id: string) => void;
    /** Dépense régulière à ouvrir (« Modifier la règle… » depuis Mes paies). */
    gerer?: string | null;
  }
  let { plateforme, onchangement, onvoircompte, gerer = null }: Props = $props();
  /** V1 lot 5 : filtres de la section Dépenses (dépenses régulières, enveloppes, à prévoir). */
  type Filtre = 'toutes' | 'regulieres' | 'enveloppes' | 'aPrevoir';
  let filtre: Filtre = $state('toutes');
  let remise = $state(0);
  let formulaireRegle = $state(false);

  const jour = aujourdhui();
  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let fiche: string | null = $state(null);
  type Formulaire = 'ajout' | 'estimation' | 'quand' | 'fin' | 'note' | 'lien' | 'suggestion';
  let formulaire: Formulaire | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);

  let fNom = $state('');
  let fMontant = $state('');
  let fQuand: Quand | '' = $state('');
  let fDate = $state('');
  let fNote = $state('');
  let fCompte = $state('');
  let fLien = $state('');
  let fChoix: 'redistribuer' | 'augmenter' | 'creer' = $state('redistribuer');
  let fContribution = $state('');

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données.';
    }
  });

  const liste = $derived(donnees ? vueDepenses(donnees, jour) : []);
  const annee = $derived(donnees ? douzeMois(donnees, jour) : null);
  const comptesOuverts = $derived(donnees ? comptesDe(donnees).filter((k) => k.fermeLe === null) : []);
  const reservesLibres = $derived(
    donnees
      ? comptesDe(donnees)
          .filter((k) => k.fermeLe === null)
          .flatMap((k) => reservesDe(k).filter((r) => r.arreteeLe === null && r.depenseId === null).map((r) => ({ id: `${k.id}:${r.id}`, texte: `« ${r.nom} » — ${nomCompte(donnees!, k)}` })))
      : [],
  );
  const TITRES: Record<Formulaire, string> = {
    ajout: 'Ajouter une dépense à prévoir',
    estimation: 'Changer l’estimation',
    quand: 'Date et fréquence',
    fin: 'Dernière fois le…',
    note: 'Nom et note',
    lien: 'Réserve liée',
    suggestion: 'Appliquer la suggestion',
  };
  /** Dépenses régulières (fixes et enveloppes) : sans les prêts, la carte, les contributions ni les dépenses à prévoir. */
  const reguliers = $derived.by(() => {
    const d = donnees as DonneesPaie | null;
    return d ? d.elements.filter((e) => e.nature === 'depense' && !estPret(d, e.id) && !estPaiementCarte(d, e.id) && !estContribution(d, e.id) && !estDepenseAPrevoir(d, e.id)) : [];
  });
  const cyclesRegles = $derived.by(() => {
    if (!donnees?.profil) return [];
    try {
      const n = versNoyau(donnees);
      return cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, seuil: n.seuil, couvertures: n.couvertures }, jour, NOMBRE_CYCLES, 0).cycles;
    } catch {
      return [];
    }
  });
  const compte = (f: Filtre) =>
    f === 'regulieres' ? reguliers.filter((e) => e.genre === 'fixe').length : f === 'enveloppes' ? reguliers.filter((e) => e.genre === 'enveloppe').length : f === 'aPrevoir' ? liste.length : reguliers.length + liste.length;
  const FILTRES: { id: Filtre; libelle: string }[] = [
    { id: 'toutes', libelle: 'Toutes' },
    { id: 'regulieres', libelle: 'Régulières' },
    { id: 'enveloppes', libelle: 'Enveloppes' },
    { id: 'aPrevoir', libelle: 'À prévoir' },
  ];
  const finPhrase = (t: string) => (t.endsWith('.') ? t : `${t}.`);

  async function montrer(testid: string) {
    await tick();
    document.querySelector(`[data-testid="${testid}"]`)?.scrollIntoView?.({ block: 'center' });
  }

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
      void montrer('erreur-saisie');
      return;
    }
    if (p.apercu) {
      proposition = p;
      void montrer('apercu');
    } else void enregistrer(p);
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
      const nouvelle = (donnees.depenses ?? []).find((x) => !(avant.depenses ?? []).some((y) => y.id === x.id));
      if (nouvelle) fiche = nouvelle.id;
      if (fiche && !(donnees.depenses ?? []).some((x) => x.id === fiche)) fiche = null;
      remise += 1;
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
      messageAnnulation = `Annulé : ${finPhrase(d.titre)}`;
      setTimeout(() => (messageAnnulation = null), 5000);
      if (fiche && !(donnees.depenses ?? []).some((x) => x.id === fiche)) fiche = null;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : 'Annulation impossible.';
    } finally {
      enCours = false;
    }
  }

  function ouvrir(f: Formulaire, v: VueDepense | null = null) {
    formulaire = f;
    erreurSaisie = null;
    proposition = null;
    fNom = fMontant = fNote = fCompte = fLien = fContribution = '';
    fQuand = '';
    fDate = f === 'ajout' ? '' : jour;
    fChoix = 'redistribuer';
    if (f === 'ajout') fiche = null;
    if (v && f === 'note') {
      fNom = v.nom;
      fNote = v.note ?? '';
    }
    if (v && f === 'lien') fLien = v.reserve ? `${v.reserve.compteId}:${v.reserve.reserveId}` : '';
    if (v && f === 'suggestion') {
      fContribution = v.contributions[0]?.id ?? '';
      fChoix = v.contributions.length === 0 ? 'creer' : 'redistribuer';
    }
    void montrer(`formulaire-${f}`);
  }

  function basculer(id: string) {
    fiche = fiche === id ? null : id;
    formulaire = null;
    proposition = null;
    erreurSaisie = null;
  }
</script>

{#snippet formulaires(v: VueDepense)}
  {#if formulaire === 'estimation'}
    <form
      class="formulaire"
      data-testid="formulaire-estimation"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerEstimation(donnees!, v.id, fDate, fMontant, jour));
      }}
    >
      <p class="discret">La réserve liée suit ; la contribution planifiée ne change pas (la suggestion est recalculée).</p>
      <label>À partir du <input type="date" bind:value={fDate} /></label>
      <label>Nouvelle estimation ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'quand'}
    <form
      class="formulaire"
      data-testid="formulaire-quand"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerDateFrequence(donnees!, v.id, fQuand as Quand, fDate, jour));
      }}
    >
      <label
        >Fréquence
        <select bind:value={fQuand}>
          <option value="" disabled>Choisir…</option>
          {#each QUAND_DEPENSE as q (q)}<option value={q}>{LIBELLES_QUAND[q]}</option>{/each}
        </select>
      </label>
      <label>Prochaine date <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'fin'}
    <form
      class="formulaire"
      data-testid="formulaire-fin"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerFinDepense(donnees!, v.id, fDate, jour));
      }}
    >
      <p class="discret">Elle ne revient plus après cette date ; son historique reste.</p>
      <label>Dernière fois le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'note'}
    <form
      class="formulaire"
      data-testid="formulaire-note"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerNoteDepense(donnees!, v.id, fNom, fNote, jour));
      }}
    >
      <label>Nom <input bind:value={fNom} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'lien'}
    <form
      class="formulaire"
      data-testid="formulaire-lien"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerLienReserve(donnees!, v.id, fLien, jour));
      }}
    >
      <p class="discret">Une nouvelle réserve porte le nom de la dépense ; sa cible et sa date viennent de la dépense. Rien n’y est mis sans ton accord.</p>
      <label
        >Réserve
        <select bind:value={fLien}>
          <option value="">Aucune (payée depuis le disponible)</option>
          {#if v.reserve}<option value="{v.reserve.compteId}:{v.reserve.reserveId}">« {v.reserve.nom} » — {v.reserve.compte}</option>{/if}
          {#each reservesLibres as r (r.id)}<option value={r.id}>{r.texte}</option>{/each}
          {#each comptesOuverts as k (k.id)}<option value="nouvelle:{k.id}">Nouvelle réserve « {v.nom} » dans {nomCompte(donnees!, k)}</option>{/each}
        </select>
      </label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'suggestion'}
    <form
      class="formulaire"
      data-testid="formulaire-suggestion"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerSuggestion(donnees!, v.id, fChoix, fContribution, jour));
      }}
    >
      <p class="discret">Suggestion : {v.suggestion}. Rien ne s’applique sans ta confirmation.</p>
      <fieldset class="choix">
        {#if v.contributions.length > 0}
          <label class="en-ligne"><input type="radio" bind:group={fChoix} value="redistribuer" /> Redistribuer une contribution existante (le disponible ne change pas)</label>
          <label class="en-ligne"><input type="radio" bind:group={fChoix} value="augmenter" /> Augmenter une contribution (le disponible baisse)</label>
        {/if}
        <label class="en-ligne"><input type="radio" bind:group={fChoix} value="creer" /> Créer une contribution à chaque paie</label>
      </fieldset>
      {#if fChoix !== 'creer'}
        <label
          >Contribution
          <select bind:value={fContribution}>
            {#each v.contributions as c (c.id)}<option value={c.id}>{c.texte} (part actuelle : {c.part})</option>{/each}
          </select>
        </label>
      {/if}
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {/if}
{/snippet}

{#snippet carte(v: VueDepense)}
  <article class="carte" data-testid="depense" data-depense={v.nom}>
    <div class="entete">
      <h3>{v.nom}</h3>
      <button type="button" class="lien" aria-expanded={fiche === v.id} onclick={() => basculer(v.id)}>{fiche === v.id ? 'Masquer' : 'Voir le détail'}</button>
    </div>
    <p class="resume">
      <span>{v.quand} · estimation <strong>{v.estimation}</strong></span>
      {#if v.prochaine}
        <span>Prochaine : {v.prochaine.date} — <span data-testid="couverture">{v.prochaine.couverture}</span></span>
      {:else}
        <span class="discret">Aucune occurrence à venir.</span>
      {/if}
    </p>
    {#if v.reserve}
      <p class="discret">
        Réserve « {v.reserve.nom} » ({v.reserve.compte}) : {v.reserve.solde}
        {#if v.suggestion}· suggestion : <span data-testid="suggestion">{v.suggestion}</span>{/if}
      </p>
    {/if}
    {#if v.ecartHistorique}<p class="attention">{v.ecartHistorique}</p>{/if}
    {#if fiche === v.id}
      {#if v.note}<p class="discret">Note : {v.note}</p>{/if}
      {#if v.occurrences.length > 0}
        <h4>Prochaines occurrences</h4>
        <ul class="liste">
          {#each v.occurrences as o (o.origine)}
            <li>
              <span>{o.date}</span>
              <span class="discret">{o.mode === 'reserve' ? 'avec la réserve' : 'depuis le disponible'}</span>
              {#if v.reserve}
                <button type="button" class="petit" onclick={() => proposer(() => proposerModeOccurrence(donnees!, v.id, o.origine, o.mode === 'reserve' ? 'disponible' : 'reserve', jour))}>
                  {o.mode === 'reserve' ? 'Payer celle-ci depuis le disponible' : 'Payer celle-ci avec la réserve'}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      <h4>Historique</h4>
      {#if v.historique.length === 0}
        <p class="discret">Pas encore payée. Le montant réel se confirme dans Mes paies.</p>
      {:else}
        <ul class="liste" data-testid="historique-depense">
          {#each v.historique as h, i (i)}<li><span class="date">{h.date}</span> {h.montant}</li>{/each}
        </ul>
      {/if}
      <p class="boutons">
        <button type="button" onclick={() => ouvrir('estimation', v)}>Changer l’estimation…</button>
        <button type="button" onclick={() => ouvrir('quand', v)}>Date et fréquence…</button>
        <button type="button" onclick={() => ouvrir('note', v)}>Nom et note…</button>
        <button type="button" onclick={() => ouvrir('lien', v)}>{v.reserve ? 'Réserve liée…' : 'Lier une réserve…'}</button>
        {#if v.suggestion && v.suggestion !== 'Cible atteinte'}<button type="button" onclick={() => ouvrir('suggestion', v)}>Appliquer la suggestion…</button>{/if}
        {#if v.reserve}{@const cid = v.reserve.compteId}<button type="button" onclick={() => onvoircompte(cid)}>Voir le compte</button>{/if}
        <button type="button" onclick={() => ouvrir('fin', v)}>Dernière fois le…</button>
        <button type="button" onclick={() => proposer(() => proposerSuppressionDepense(donnees!, v.id, jour))}>Supprimer…</button>
      </p>
      {#if formulaire && formulaire !== 'ajout'}
        <FenetreFormulaire titre={TITRES[formulaire]} contexte={`Dépense à prévoir « ${v.nom} » · ${v.quand} · estimation ${v.estimation}`} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formulaire = null)}>
          {@render formulaires(v)}
        </FenetreFormulaire>
      {/if}
    {/if}
  </article>
{/snippet}

<section aria-label="Dépenses">
  {#if erreurChargement}
    <p role="alert" class="erreur">{erreurChargement}</p>
  {:else if donnees}
    <div class="barre-filtres">
      <div class="filtres" role="group" aria-label="Afficher">
        {#each FILTRES as f (f.id)}
          <button type="button" class="filtre" aria-pressed={filtre === f.id} onclick={() => (filtre = f.id)}>{f.libelle} ({compte(f.id)})</button>
        {/each}
      </div>
      <button type="button" class="principal" onclick={() => ouvrir('ajout')}>Ajouter une dépense à prévoir</button>
    </div>

    {#if formulaire === 'ajout'}
      <FenetreFormulaire titre={TITRES.ajout} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formulaire = null)}>
      <form
        class="formulaire"
        data-testid="formulaire-ajout"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutDepense(donnees!, { nom: fNom, montant: fMontant, quand: fQuand, date: fDate, note: fNote, reserveDansCompte: fCompte }, jour));
        }}
      >
        <p class="discret">Sans estimation, elle reste « À compléter » (jamais 0 $). Rien n’est réservé ni ajouté à une contribution sans ton accord.</p>
        <label>Nom <input bind:value={fNom} /></label>
        <label>Estimation ($, facultative) <input inputmode="decimal" bind:value={fMontant} /></label>
        <label
          >Fréquence
          <select bind:value={fQuand}>
            <option value="" disabled>Choisir…</option>
            {#each QUAND_DEPENSE as q (q)}<option value={q}>{LIBELLES_QUAND[q]}</option>{/each}
          </select>
        </label>
        <label>Prochaine date <input type="date" bind:value={fDate} /></label>
        <label>Note (facultative) <input bind:value={fNote} /></label>
        {#if comptesOuverts.length > 0}
          <label
            >Créer une réserve liée dans
            <select bind:value={fCompte}>
              <option value="">Non, payer depuis le disponible</option>
              {#each comptesOuverts as k (k.id)}<option value={k.id}>{nomCompte(donnees!, k)}</option>{/each}
            </select>
          </label>
        {/if}
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
      </form>
      </FenetreFormulaire>
    {/if}

    <div class="colonnes">
      <div class="principale">
        {#if filtre !== 'aPrevoir'}
          <RevenusDepenses
            elements={reguliers}
            {donnees}
            modifiable={true}
            cycles={cyclesRegles}
            {jour}
            {remise}
            {proposer}
            aGerer={gerer}
            mode={filtre === 'regulieres' ? 'fixes' : filtre === 'enveloppes' ? 'enveloppes' : 'depenses'}
            erreur={proposition ? null : erreurSaisie}
            onformulaire={(ouvert) => {
              formulaireRegle = ouvert;
              if (ouvert) erreurSaisie = null;
            }}
          />
        {/if}
        {#if filtre === 'toutes' || filtre === 'aPrevoir'}
          <h2 class="titre-a-prevoir">Mes dépenses à prévoir</h2>
          <p class="discret intro">
            Les dépenses qui ne reviennent pas à chaque paie (pneus, immatriculation, cadeaux…). Elles apparaissent dans Mes paies, au bon cycle. Avec une réserve liée, seule la partie non couverte sort du disponible.
          </p>
          {#if liste.length === 0}
            <p class="discret">Aucune dépense à prévoir pour l’instant.</p>
          {/if}
          {#each liste as v (v.id)}
            {@render carte(v)}
          {/each}
        {/if}
      </div>
      <aside class="contexte" aria-label="Les 12 prochains mois">
        <!-- Illustrations (maquette A approuvée) : la loutre gestionnaire en tête de la colonne. -->
        <div class="loutre" data-testid="illustration-depenses"><Illustration nom="loutre-depenses" largeur={1671} hauteur={941} /></div>
        <CarteBandeau titre="Les 12 prochains mois" teinte="beurre" icone={CalendarClock}>
          {#if annee && annee.mois.length > 0}
      <div data-testid="douze-mois">
        {#each annee.mois as m (m.mois)}
          <h3 class="mois">{m.mois}</h3>
          <ul class="liste">
            {#each m.lignes as l, i (i)}
              <li><span class="date">{l.date}</span> <strong>{l.nom}</strong> {l.montant} <span class="discret">— {l.couverture}</span></li>
            {/each}
          </ul>
        {/each}
        <p>
          Total estimé : <strong>{annee.total}</strong>
          {#if annee.aCompleter.length > 0}<span class="attention"> — dont à compléter : {annee.aCompleter.join(', ')}</span>{/if}
        </p>
      </div>
          {:else}
            <p class="discret">Aucune dépense à prévoir dans les 12 prochains mois.</p>
          {/if}
        </CarteBandeau>
      </aside>
    </div>
  {/if}
</section>

{#if erreurSaisie && !proposition && formulaire === null && !formulaireRegle}
  <p role="alert" class="erreur" data-testid="erreur-saisie">{erreurSaisie}</p>
{/if}
{#if dernier}
  <p class="enregistre" role="status" data-testid="enregistre">
    Enregistré : {finPhrase(dernier.titre)}
    <button type="button" onclick={annulerDernier} disabled={enCours}>Annuler</button>
    <button type="button" class="fermer" onclick={() => (dernier = null)} aria-label="Fermer">×</button>
  </p>
{:else if messageAnnulation}
  <p class="enregistre" role="status" data-testid="annule">{messageAnnulation}</p>
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
      erreurSaisie = null;
    }}
  />
{/if}

<style>
  section {
    max-width: var(--largeur-contenu);
    font-size: var(--texte-courant);
  }
  .intro {
    max-width: 760px;
    margin: 0 0 var(--espace-6);
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-2);
  }
  h3 {
    font-size: var(--taille-texte);
    margin: 0;
  }
  h4 {
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  .resume {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-6);
    margin: var(--espace-2) 0 0;
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-2);
  }
  .liste li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-4);
    align-items: baseline;
    padding: var(--espace-1) 0;
  }
  .date {
    min-width: 110px;
    color: var(--couleur-texte-discret);
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: flex-end;
    margin-top: var(--espace-3);
  }
  .choix {
    flex-basis: 100%;
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-2);
  }
  .barre-filtres {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-3);
    margin: 0 0 var(--espace-5);
  }
  .filtres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
  }
  .filtre[aria-pressed='true'] {
    background: var(--couleur-bandeau);
    border-color: var(--couleur-bandeau);
    color: var(--couleur-bandeau-texte);
  }
  .colonnes {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--espace-6);
    align-items: start;
  }
  .contexte {
    position: sticky;
    top: var(--espace-4);
    display: flex;
    flex-direction: column;
    gap: var(--espace-5);
  }
  /* L'illustration entière, jamais déformée ni recadrée. */
  .loutre :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1671 / 941;
    object-fit: contain;
    border-radius: 16px;
    box-shadow: var(--ombre-carte);
  }
  .principale {
    min-width: 0;
  }
  .mois {
    font-family: var(--police);
    font-size: var(--texte-dense);
    font-weight: 800;
    margin: var(--espace-3) 0 var(--espace-1);
    text-transform: capitalize;
  }
  .titre-a-prevoir {
    margin-top: var(--espace-4);
    font-size: var(--titre-carte);
  }
  @media (max-width: 1180px) {
    /* minmax(0, 1fr) : la colonne ne s'élargit plus au-delà de la fenêtre. */
    .colonnes {
      grid-template-columns: minmax(0, 1fr);
    }
    .contexte {
      position: static;
    }
    .loutre {
      max-width: 520px;
    }
  }
</style>
