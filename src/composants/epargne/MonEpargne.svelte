<script lang="ts">
  // Étape 9 : Mon épargne — les comptes. On configure et on consulte ici ;
  // les contributions se planifient, s'ajustent et se confirment dans Mes
  // paies. La valeur suivie ne bouge qu'avec ce qui est réel (A4, Q72).
  import { onMount, tick } from 'svelte';
  import Apercu from '../Apercu.svelte';
  import ReservesCompte from './ReservesCompte.svelte';
  import { comptesAdmissibles } from '../../actions/comptes';
  import { vueReserves } from '../../actions/reserves';
  import { ErreurSaisie, type Proposition } from '../../actions/paie';
  import {
    EXPLICATION_CORRECTION,
    EXPLICATION_FLUCTUATION,
    LIBELLES_SORTE,
    PHRASE_RETRAIT,
    QUAND_CONTRIBUTION,
    comptesDe,
    listeComptes,
    nomCompte,
    proposerAjoutCompte,
    proposerArretContribution,
    proposerContribution,
    proposerFermeture,
    proposerFluctuation,
    proposerMontantContribution,
    proposerReference,
    proposerRenseignementsCompte,
    proposerReouverture,
    proposerRepriseContribution,
    proposerRetraitCompte,
    proposerRetraitMouvement,
    proposerRetraitReference,
    proposerSuppressionCompte,
    proposerSuppressionContribution,
    proposerTransfert,
    totalEpargne,
    type VueCompte,
  } from '../../actions/comptes';
  import { LIBELLES_QUAND, type Quand } from '../../actions/elements';
  import { inverser } from '../../lib/appliquer';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme, SorteCompte } from '../../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onchangement: () => void;
    /** Compte à ouvrir (« Voir le compte » depuis Mes paies). */
    ouvert?: string | null;
  }
  let { plateforme, onchangement, ouvert = null }: Props = $props();

  const jour = aujourdhui();
  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let fiche: string | null = $state(null);
  type Formulaire = 'ajout' | 'renseignements' | 'contribution' | 'fluctuation' | 'correction' | 'retrait' | 'transfert' | 'fermeture' | 'reouverture' | 'montant' | 'arret' | 'reprise';
  let formulaire: Formulaire | null = $state(null);
  let cibleContribution: string | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);

  // Champs
  let fSorte: SorteCompte | '' = $state('');
  let fTypeLibre = $state('');
  let fNom = $state('');
  let fVocation = $state('');
  let fInstitution = $state('');
  let fMontant = $state('');
  let fDate = $state('');
  let fNote = $state('');
  let fQuand: Quand | '' = $state('');
  let fMode: 'montant' | 'valeur' = $state('montant');
  let fValeur = $state('');
  let fDestination = $state('');
  let fVers = $state('');
  let fReprendre: string[] = $state([]);
  let fPrisSur = $state('');
  let fComplement = $state('');
  let fChoix: Record<string, string> = $state({});

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
      if (ouvert && comptesDe(donnees).some((k) => k.id === ouvert)) {
        fiche = ouvert;
        await tick();
        document.querySelector(`[data-compte="${ouvert}"]`)?.scrollIntoView?.({ block: 'start' });
      }
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données.';
    }
  });

  const liste = $derived(donnees ? listeComptes(donnees, jour) : { ouverts: [], fermes: [] });
  const total = $derived(donnees ? totalEpargne(donnees) : null);
  const finPhrase = (t: string) => (t.endsWith('.') ? t : `${t}.`);
  const SORTES: SorteCompte[] = ['celi', 'reer', 'celiapp', 'epargne', 'autre'];

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
      const nouveau = comptesDe(donnees).find((x) => !comptesDe(avant).some((y) => y.id === x.id));
      if (nouveau) fiche = nouveau.id;
      if (fiche && !comptesDe(donnees).some((x) => x.id === fiche)) fiche = null;
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
      if (fiche && !comptesDe(donnees).some((x) => x.id === fiche)) fiche = null;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : 'Annulation impossible.';
    } finally {
      enCours = false;
    }
  }

  function ouvrir(f: Formulaire, v: VueCompte | null = null, contribution: string | null = null) {
    formulaire = f;
    cibleContribution = contribution;
    erreurSaisie = null;
    proposition = null;
    fSorte = '';
    fTypeLibre = fNom = fVocation = fInstitution = fMontant = fNote = fValeur = fDestination = fVers = '';
    fQuand = '';
    fMode = 'montant';
    // Date du jour proposée, modifiable (précision 2 de la validation).
    fDate = jour;
    fReprendre = [];
    fPrisSur = fComplement = '';
    fChoix = {};
    if (f === 'ajout') fiche = null;
    if (f === 'renseignements' && v) {
      fNom = donnees ? (comptesDe(donnees).find((k) => k.id === v.id)?.nom ?? '') : '';
      fVocation = v.vocation ?? '';
      fInstitution = v.institution ?? '';
    }
    if (f === 'contribution') fDate = '';
    void montrer(`formulaire-${f}`);
  }

  function basculer(id: string) {
    fiche = fiche === id ? null : id;
    formulaire = null;
    proposition = null;
    erreurSaisie = null;
  }

  /** Réserves actives avec un solde, pour « Pris sur » et la fermeture. */
  const reservesAvecSolde = (id: string) => (donnees ? vueReserves(donnees, id, jour).actives.filter((r) => r.solde > 0) : []);
  const autresOuverts = (id: string) => (donnees ? comptesDe(donnees).filter((k) => k.id !== id && k.fermeLe === null) : []);
</script>

{#snippet formulaires(v: VueCompte)}
  {#if formulaire === 'fluctuation'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-fluctuation"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerFluctuation(donnees!, v.id, { mode: fMode, montant: fMontant, valeur: fValeur, date: fDate, note: fNote }, jour));
      }}
    >
      <p class="discret">{EXPLICATION_FLUCTUATION} Un aperçu suit toujours, avant d’enregistrer.</p>
      <fieldset class="choix">
        <label class="en-ligne"><input type="radio" bind:group={fMode} value="montant" /> J’entre le gain ou la perte</label>
        <label class="en-ligne"><input type="radio" bind:group={fMode} value="valeur" /> J’entre la valeur affichée en ligne</label>
      </fieldset>
      {#if fMode === 'montant'}
        <label>Gain (+) ou perte (−) ($) <input inputmode="decimal" bind:value={fMontant} placeholder="-80 ou 50" /></label>
      {:else}
        <label>Valeur affichée en ligne ($) <input inputmode="decimal" bind:value={fValeur} /></label>
      {/if}
      <label>Date <input type="date" bind:value={fDate} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'correction'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-correction"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerReference(donnees!, v.id, { montant: fMontant, date: fDate, note: fNote }, jour));
      }}
    >
      <p class="discret">{EXPLICATION_CORRECTION}</p>
      <label>Solde ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>En date du <input type="date" bind:value={fDate} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'retrait'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-retrait"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRetraitCompte(donnees!, v.id, { montant: fMontant, date: fDate, destination: fDestination, note: fNote, prisSur: fPrisSur, complement: fComplement }, jour));
      }}
    >
      <p class="discret">{PHRASE_RETRAIT}</p>
      <label>Montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>Date <input type="date" bind:value={fDate} /></label>
      <label>Destination (facultative) <input bind:value={fDestination} placeholder="compte courant" /></label>
      {@render prisSur(v)}
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'transfert'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-transfert"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerTransfert(donnees!, v.id, { vers: fVers, montant: fMontant, date: fDate, note: fNote, prisSur: fPrisSur, complement: fComplement }, jour));
      }}
    >
      <p class="discret">Vers un autre de tes comptes d’épargne. Ce n’est pas une contribution : Mes paies ne change pas.</p>
      <label
        >Vers le compte
        <select bind:value={fVers}>
          <option value="" disabled>Choisir…</option>
          {#each autresOuverts(v.id) as k (k.id)}
            <option value={k.id}>{nomCompte(donnees!, k)}</option>
          {/each}
        </select>
      </label>
      <label>Montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>Date <input type="date" bind:value={fDate} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      {@render prisSur(v)}
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'contribution'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-contribution"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerContribution(donnees!, v.id, { montant: fMontant, quand: fQuand, date: fDate }, jour));
      }}
    >
      <p class="discret">Elle sera planifiée dans Mes paies, où tu l’ajustes et la confirmes. Montant vide : « À compléter », jamais 0 $.</p>
      <label>Montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label
        >Fréquence
        <select bind:value={fQuand}>
          <option value="" disabled>Choisir…</option>
          {#each QUAND_CONTRIBUTION as q (q)}<option value={q}>{LIBELLES_QUAND[q]}</option>{/each}
        </select>
      </label>
      <label>Première contribution le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'montant' && cibleContribution}
    <form
      class="formulaire encadre"
      data-testid="formulaire-montant"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerMontantContribution(donnees!, cibleContribution!, fDate, fMontant, jour));
      }}
    >
      <label>À partir du <input type="date" bind:value={fDate} /></label>
      <label>Nouveau montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'arret' && cibleContribution}
    <form
      class="formulaire encadre"
      data-testid="formulaire-arret"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerArretContribution(donnees!, cibleContribution!, fDate, jour));
      }}
    >
      <label>Dernière contribution le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'reprise' && cibleContribution}
    <form
      class="formulaire encadre"
      data-testid="formulaire-reprise"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRepriseContribution(donnees!, cibleContribution!, fDate, jour));
      }}
    >
      <label>Reprendre à partir du <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'renseignements'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-renseignements"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRenseignementsCompte(donnees!, v.id, { nom: fNom, vocation: fVocation, institution: fInstitution }, jour));
      }}
    >
      <label>Nom (facultatif) <input bind:value={fNom} /></label>
      <label>Vocation (facultative) <input bind:value={fVocation} /></label>
      <label>Institution (facultative) <input bind:value={fInstitution} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'fermeture'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-fermeture"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerFermeture(donnees!, v.id, fDate, jour, fChoix));
      }}
    >
      <p class="discret">Ses contributions s’arrêtent à partir de cette date ; son historique reste consultable.</p>
      <label>Fermé le <input type="date" bind:value={fDate} /></label>
      {#each reservesAvecSolde(v.id) as r (r.id)}
        <label
          >Réserve « {r.nom} » ({r.soldeTexte})
          <select bind:value={fChoix[r.id]} data-testid="choix-fermeture">
            <option value={undefined} disabled selected>Choisir…</option>
            <option value="liberer">La libérer</option>
            {#each comptesAdmissibles(donnees!, v.id) as k (k.id)}<option value="vers:{k.id}">La transférer vers {nomCompte(donnees!, k)}</option>{/each}
          </select>
        </label>
      {/each}
      {#if reservesAvecSolde(v.id).length > 0 && comptesAdmissibles(donnees!, v.id).length === 0}
        <p class="discret">Aucun autre compte ouvert avec une valeur connue : les réserves ne peuvent qu’être libérées.</p>
      {/if}
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'reouverture'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-reouverture"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerReouverture(donnees!, v.id, fDate, fReprendre, jour));
      }}
    >
      <label>Rouvert le <input type="date" bind:value={fDate} /></label>
      {#if v.contributions.some((c) => c.arretee)}
        <fieldset class="choix">
          <legend class="discret">Contributions à reprendre à partir de cette date (aucune ne reprend toute seule)</legend>
          {#each v.contributions.filter((c) => c.arretee) as c (c.id)}
            <label class="en-ligne"><input type="checkbox" bind:group={fReprendre} value={c.id} /> {c.texte}</label>
          {/each}
        </fieldset>
      {/if}
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {/if}
{/snippet}

{#snippet prisSur(v: VueCompte)}
  {#if reservesAvecSolde(v.id).length > 0}
    <label
      >Pris sur
      <select bind:value={fPrisSur}>
        <option value="">Le non réservé ({vueReserves(donnees!, v.id, jour).nonReserve})</option>
        {#each reservesAvecSolde(v.id) as r (r.id)}<option value={r.id}>Réserve « {r.nom} » ({r.soldeTexte})</option>{/each}
      </select>
    </label>
    {#if fPrisSur === ''}
      <label
        >Si le non réservé ne suffit pas, le reste vient de
        <select bind:value={fComplement}>
          <option value="">Choisir au besoin…</option>
          {#each reservesAvecSolde(v.id) as r (r.id)}<option value={r.id}>« {r.nom} » ({r.soldeTexte})</option>{/each}
        </select>
      </label>
    {/if}
  {/if}
{/snippet}

{#snippet details(v: VueCompte)}
  <dl class="fiche">
    <dt>Valeur suivie</dt>
    <dd data-testid="valeur-detail">{v.detail ?? v.valeur}</dd>
    {#if v.confirmeesSansReference}
      <dt>Fait</dt>
      <dd data-testid="confirmees-sans-reference">{v.confirmeesSansReference}</dd>
    {/if}
    <dt>Type</dt>
    <dd>{v.type}</dd>
    <dt>Vocation</dt>
    <dd>{v.vocation ?? '—'}</dd>
    <dt>Institution</dt>
    <dd>{v.institution ?? '—'}</dd>
  </dl>

  <h4>Contributions</h4>
  {#if v.contributions.length === 0}
    <p class="discret">Aucune contribution récurrente.</p>
  {:else}
    <ul class="contributions" data-testid="contributions">
      {#each v.contributions as c (c.id)}
        <li>
          <span>{c.texte}{c.arretee ? ' — arrêtée' : ''}</span>
          {#if !v.fermeLe}
            <span class="boutons-ligne">
              {#if c.arretee}
                <button type="button" class="petit" onclick={() => ouvrir('reprise', v, c.id)}>Reprendre…</button>
              {:else}
                <button type="button" class="petit" onclick={() => ouvrir('montant', v, c.id)}>Changer le montant…</button>
                <button type="button" class="petit" onclick={() => ouvrir('arret', v, c.id)}>Dernière contribution le…</button>
              {/if}
              {#if !c.confirmee}
                <button type="button" class="petit" onclick={() => proposer(() => proposerSuppressionContribution(donnees!, c.id, jour))}>Supprimer</button>
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if v.aVenir.length > 0}
    <p class="discret" data-testid="a-venir">À venir, pas encore confirmé (jamais ajouté à la valeur) : {v.aVenir.join(' · ')}</p>
  {/if}

  <ReservesCompte donnees={donnees!} compteId={v.id} ferme={v.fermeLe !== null} contributions={v.contributions} {jour} {proposer} />

  <h4>Historique</h4>
  {#if v.historique.length === 0}
    <p class="discret">Aucun mouvement pour l’instant.</p>
  {:else}
    <ul class="historique" data-testid="historique">
      {#each v.historique as h, i (i)}
        <li>
          <span class="date">{h.date}</span>
          <span>{h.texte}</span>
          {#if h.mouvement}
            {@const m = h.mouvement}
            <button type="button" class="petit" onclick={() => proposer(() => proposerRetraitMouvement(donnees!, m.compteId, m.id, jour))}>Retirer…</button>
          {:else if h.reference}
            {@const r = h.reference}
            <button type="button" class="petit" onclick={() => proposer(() => proposerRetraitReference(donnees!, v.id, r, jour))}>Retirer…</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet carte(v: VueCompte)}
  <article class="carte" data-compte={v.id} data-testid="compte">
    <div class="entete">
      <h3>{v.nom}{v.vocation && !v.nom.includes(v.vocation) ? ` — ${v.vocation}` : ''}</h3>
      <button type="button" class="lien" aria-expanded={fiche === v.id} onclick={() => basculer(v.id)}>{fiche === v.id ? 'Masquer' : 'Voir le détail'}</button>
    </div>
    <p class="resume">
      <span>Valeur suivie : <strong data-testid="valeur">{v.valeur}</strong></span>
      <span class="discret">{v.type}{v.fermeLe ? ` · fermé le ${v.fermeLe}` : ''}</span>
    </p>
    {#if fiche === v.id}
      {@render details(v)}
      <p class="boutons">
        {#if v.fermeLe}
          <button type="button" class="principal" onclick={() => ouvrir('reouverture', v)}>Rouvrir…</button>
        {:else}
          <button type="button" onclick={() => ouvrir('fluctuation', v)} title={EXPLICATION_FLUCTUATION}>Fluctuation…</button>
          <button type="button" onclick={() => ouvrir('correction', v)} title={EXPLICATION_CORRECTION}>{v.derniereReference ? 'Corriger le solde…' : 'Indiquer le solde…'}</button>
          <button type="button" onclick={() => ouvrir('retrait', v)}>Retrait…</button>
          {#if autresOuverts(v.id).length > 0}<button type="button" onclick={() => ouvrir('transfert', v)}>Transfert…</button>{/if}
          <button type="button" onclick={() => ouvrir('contribution', v)}>Ajouter une contribution récurrente…</button>
          <button type="button" onclick={() => ouvrir('renseignements', v)}>Nom, vocation, institution…</button>
          <button type="button" onclick={() => ouvrir('fermeture', v)}>Fermer le compte…</button>
        {/if}
        <button type="button" onclick={() => proposer(() => proposerSuppressionCompte(donnees!, v.id, jour))}>Supprimer…</button>
      </p>
      <p class="discret aide">
        Fluctuation : {EXPLICATION_FLUCTUATION.toLowerCase()} Corriger le solde : {EXPLICATION_CORRECTION.toLowerCase()}
      </p>
      {@render formulaires(v)}
    {/if}
  </article>
{/snippet}

<section aria-label="Mes comptes d’épargne">
  {#if erreurChargement}
    <p role="alert" class="erreur">{erreurChargement}</p>
  {:else if donnees}
    {#if total}
      <div class="total" data-testid="total-epargne">
        <p class="montant-total">
          Total suivi : <strong>{total.montant ?? '—'}</strong>
          {#if total.nombre > 0}<span class="discret"> — {total.nombre} compte{total.nombre > 1 ? 's' : ''} · {total.dates}</span>{/if}
        </p>
        {#if total.exclus.length > 0}<p class="attention" data-testid="total-exclus">Non compté : {total.exclus.join(', ')}.</p>{/if}
        <p class="discret">{total.phrase}</p>
      </div>
    {/if}

    <div class="entete">
      <h2>Mes comptes</h2>
      <button type="button" class="principal" onclick={() => ouvrir('ajout')}>Ajouter un compte</button>
    </div>

    {#if formulaire === 'ajout'}
      <form
        class="formulaire encadre"
        data-testid="formulaire-ajout"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutCompte(donnees!, { sorte: fSorte, typeLibre: fTypeLibre, nom: fNom, vocation: fVocation, institution: fInstitution, solde: fMontant, soldeLe: fDate }, jour));
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
        {#if fSorte === 'autre'}<label>Nom du type <input bind:value={fTypeLibre} placeholder="CRI" /></label>{/if}
        <label>Nom (facultatif) <input bind:value={fNom} /></label>
        <label>Vocation (facultative) <input bind:value={fVocation} /></label>
        <label>Institution (facultative) <input bind:value={fInstitution} /></label>
        <label>Solde de départ ($, facultatif) <input inputmode="decimal" bind:value={fMontant} /></label>
        <label>En date du <input type="date" bind:value={fDate} /></label>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
      </form>
    {/if}

    {#if liste.ouverts.length === 0 && formulaire !== 'ajout'}
      <p class="discret">Aucun compte pour l’instant.</p>
    {/if}
    {#each liste.ouverts as v (v.id)}
      {@render carte(v)}
    {/each}

    {#if liste.fermes.length > 0}
      <details class="fermes" open={liste.fermes.some((v) => v.id === fiche)}>
        <summary>Comptes fermés ({liste.fermes.length})</summary>
        {#each liste.fermes as v (v.id)}
          {@render carte(v)}
        {/each}
      </details>
    {/if}
  {/if}
</section>

{#if erreurSaisie && !proposition}
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
    max-width: 1100px;
  }
  .total {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-3) var(--espace-6);
    margin: 0 0 var(--espace-6);
  }
  .total p {
    margin: var(--espace-1) 0;
  }
  .montant-total {
    font-size: 17px;
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
  .fiche {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--espace-1) var(--espace-6);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  dt {
    color: var(--couleur-texte-discret);
  }
  dd {
    margin: 0;
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
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-6);
  }
  .contributions,
  .historique {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-2);
  }
  .contributions li,
  .historique li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-4);
    align-items: baseline;
    padding: var(--espace-1) 0;
  }
  .historique .date {
    min-width: 110px;
    color: var(--couleur-texte-discret);
  }
  .boutons-ligne {
    display: inline-flex;
    gap: var(--espace-2);
  }
  .aide {
    margin: var(--espace-2) 0 0;
  }
  .fermes summary {
    cursor: pointer;
    margin: var(--espace-6) 0 var(--espace-3);
    font-weight: 600;
  }
</style>
