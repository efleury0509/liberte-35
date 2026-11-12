<script lang="ts">
  // Étape 9 : Mon épargne — les comptes. On configure et on consulte ici ;
  // les contributions se planifient, s'ajustent et se confirment dans Mes
  // paies. La valeur suivie ne bouge qu'avec ce qui est réel (A4, Q72).
  import { onMount, tick } from 'svelte';
  import Apercu from '../Apercu.svelte';
  import ReservesCompte from './ReservesCompte.svelte';
  import Illustration from '../base/Illustration.svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import BarreProgression from '../base/BarreProgression.svelte';
  import LigneMontant from '../base/LigneMontant.svelte';
  import Pastille from '../base/Pastille.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import Icone from '../base/Icone.svelte';
  import type { Teinte } from '../base/TitrePastille.svelte';
  import { PiggyBank, ArrowLeftRight } from '@lucide/svelte';
  import { proposerDeplacement, syntheseEpargne, texteMontant } from '../../actions/epargneV1';
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
  type Formulaire = 'ajout' | 'renseignements' | 'contribution' | 'fluctuation' | 'correction' | 'retrait' | 'transfert' | 'fermeture' | 'reouverture' | 'montant' | 'arret' | 'reprise' | 'deplacer';
  const TITRES: Record<Formulaire, string> = {
    ajout: 'Ajouter un compte',
    renseignements: 'Nom, vocation, institution',
    contribution: 'Ajouter une contribution récurrente',
    fluctuation: 'Fluctuation',
    correction: 'Solde du compte',
    retrait: 'Retrait',
    transfert: 'Transfert',
    fermeture: 'Fermer le compte',
    reouverture: 'Rouvrir le compte',
    montant: 'Changer le montant de la contribution',
    arret: 'Dernière contribution',
    reprise: 'Reprendre la contribution',
    deplacer: 'Déplacer de l’argent',
  };
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
  let fSource = $state('');
  let fCible = $state('');
  /** Un formulaire de réserve est ouvert dans ReservesCompte (sa fenêtre affiche l'erreur). */
  let formulaireReserve = $state(false);
  let compteFormulaire: string | null = $state(null);

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
    fSource = f === 'deplacer' ? 'non-reserve' : '';
    fCible = '';
    if (f === 'ajout') fiche = null;
    compteFormulaire = v?.id ?? null;
    if (f === 'renseignements' && v) {
      fNom = donnees ? (comptesDe(donnees).find((k) => k.id === v.id)?.nom ?? '') : '';
      fVocation = v.vocation ?? '';
      fInstitution = v.institution ?? '';
    }
    if (f === 'contribution') fDate = '';
  }

  function basculer(id: string) {
    fiche = fiche === id ? null : id;
    formulaire = null;
    proposition = null;
    erreurSaisie = null;
  }

  /** Réserves actives avec un solde, pour « Pris sur » et la fermeture. */
  const reservesAvecSolde = (id: string) => (donnees ? vueReserves(donnees, id, jour).actives.filter((r) => r.solde > 0) : []);
  const synthese = $derived(donnees ? syntheseEpargne(donnees) : null);
  const TEINTES: Teinte[] = ['sauge', 'peche', 'lilas', 'rose', 'beurre'];
  const reservesDuCompte = (id: string) => (donnees ? vueReserves(donnees, id, jour) : null);
  const contexte = (v: VueCompte) => `${v.nom} · valeur suivie ${v.valeur}`;
  const autresOuverts = (id: string) => (donnees ? comptesDe(donnees).filter((k) => k.id !== id && k.fermeLe === null) : []);
</script>

{#snippet formulaires(v: VueCompte)}
  {#if formulaire === 'deplacer'}
    {@const vr = reservesDuCompte(v.id)}
    <form
      class="formulaire"
      data-testid="formulaire-deplacer"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerDeplacement(donnees!, v.id, fSource, fCible, { montant: fMontant, date: fDate, note: fNote }, jour));
      }}
    >
      <p class="discret">Entre les réserves de ce compte et son non réservé. La valeur du compte ne change pas.</p>
      <label
        >De
        <select bind:value={fSource}>
          <option value="non-reserve">Non réservé ({vr?.nonReserve})</option>
          {#each vr?.actives ?? [] as r (r.id)}<option value={r.id}>Réserve « {r.nom} » ({r.soldeTexte})</option>{/each}
        </select>
      </label>
      <label
        >Vers
        <select bind:value={fCible}>
          <option value="" disabled>Choisir…</option>
          <option value="non-reserve">Non réservé</option>
          {#each (vr?.actives ?? []).filter((r) => r.etat === 'active') as r (r.id)}<option value={r.id}>Réserve « {r.nom} »</option>{/each}
        </select>
      </label>
      <label>Montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>Date <input type="date" bind:value={fDate} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'fluctuation'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'correction'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'retrait'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'transfert'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'contribution'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'montant' && cibleContribution}
    <form
      class="formulaire"
      data-testid="formulaire-montant"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerMontantContribution(donnees!, cibleContribution!, fDate, fMontant, jour));
      }}
    >
      <label>À partir du <input type="date" bind:value={fDate} /></label>
      <label>Nouveau montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'arret' && cibleContribution}
    <form
      class="formulaire"
      data-testid="formulaire-arret"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerArretContribution(donnees!, cibleContribution!, fDate, jour));
      }}
    >
      <label>Dernière contribution le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'reprise' && cibleContribution}
    <form
      class="formulaire"
      data-testid="formulaire-reprise"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRepriseContribution(donnees!, cibleContribution!, fDate, jour));
      }}
    >
      <label>Reprendre à partir du <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'renseignements'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'fermeture'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
    </form>
  {:else if formulaire === 'reouverture'}
    <form
      class="formulaire"
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
      <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
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

  <ReservesCompte
    donnees={donnees!}
    compteId={v.id}
    ferme={v.fermeLe !== null}
    contributions={v.contributions}
    {jour}
    {proposer}
    erreur={proposition ? null : erreurSaisie}
    contexteCompte={contexte(v)}
    onformulaire={(ouvert) => {
      formulaireReserve = ouvert;
      if (ouvert) erreurSaisie = null;
    }}
  />

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

{#snippet carte(v: VueCompte, i: number)}
  {@const vr = reservesDuCompte(v.id)}
  <div class="compte-v1" class:ouvert={fiche === v.id} data-compte={v.id} data-testid="compte">
    <CarteBandeau titre={`${v.nom}${v.vocation && !v.nom.includes(v.vocation) ? ` — ${v.vocation}` : ''}`} teinte={TEINTES[i % TEINTES.length]} icone={PiggyBank}>
      {#snippet badge()}<Pastille>{v.type}{v.fermeLe ? ` · fermé le ${v.fermeLe}` : ''}</Pastille>{/snippet}
      <div class="sommaire">
        <div class="valeur-compte">
          <span class="montant-grand" class:inconnu={v.valeurCents === null} data-testid="valeur">{v.valeur}</span>
          <span class="libelle-valeur">Valeur suivie</span>
        </div>
        <ul class="lignes">
          <LigneMontant libelle="Non réservé" montant={vr?.nonReserveCents ?? null} />
        </ul>
        {#if vr && vr.actives.length > 0}
          <div class="panneau-reserves">
            <h4>Réserves dans ce compte ({vr.actives.length})</h4>
            <ul>
              {#each vr.actives as r (r.id)}
                <li>
                  <span class="nom-reserve">{r.nom}{r.etat === 'suspendue' ? ' (suspendue)' : ''}</span>
                  <span class="chiffres-reserve">{r.soldeTexte}{r.cibleCents !== null ? ` / ${r.cible}` : ''}</span>
                  {#if r.cibleCents !== null}<span class="barre"><BarreProgression valeur={vr.valeurConnue ? r.solde : null} cible={r.cibleCents} libelle={r.nom} /></span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if vr?.depassement}<p class="attention">Les réserves dépassent la valeur de {vr.depassement}.</p>{/if}
        <p class="actions-carte">
          {#if !v.fermeLe && vr && vr.actives.length > 0}
            <button type="button" class="petit" onclick={() => ouvrir('deplacer', v)}><Icone icone={ArrowLeftRight} taille={16} /> Déplacer de l’argent…</button>
          {/if}
          <button type="button" class="lien" aria-expanded={fiche === v.id} onclick={() => basculer(v.id)}>{fiche === v.id ? 'Masquer' : 'Voir le détail'}</button>
        </p>
      </div>
      {#if fiche === v.id}
        <div class="detail-compte">
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
        </div>
      {/if}
    </CarteBandeau>
    {#if compteFormulaire === v.id && formulaire && formulaire !== 'ajout'}
      <FenetreFormulaire titre={TITRES[formulaire]} contexte={contexte(v)} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formulaire = null)}>
        {@render formulaires(v)}
      </FenetreFormulaire>
    {/if}
  </div>
{/snippet}

<section aria-label="Mes comptes d’épargne">
  {#if erreurChargement}
    <p role="alert" class="erreur">{erreurChargement}</p>
  {:else if donnees}
    <!-- Illustrations (maquette B approuvée) : la loutre jardinière à côté des totaux ;
         en fenêtre étroite, elle passe après les comptes. -->
    <div class="mise-en-page">
    <div class="loutre" data-testid="illustration-epargne"><Illustration nom="loutre-epargne" largeur={1672} hauteur={941} /></div>
    {#if total && synthese}
      <div class="synthese bandeau-prune" data-testid="total-epargne">
        <div class="kpi principal-kpi">
          <span class="etiquette">Total suivi</span>
          <span class="kpi-montant">{total.montant ?? 'À compléter'}</span>
          <span class="detail">Total suivi : {total.montant ?? '—'}{total.nombre > 0 ? ` — ${total.nombre} compte${total.nombre > 1 ? 's' : ''} · ${total.dates}` : ''}</span>
        </div>
        <div class="kpi">
          <span class="etiquette">dont réservé</span>
          <span class="kpi-montant petit-kpi" data-testid="total-reserve">{texteMontant(synthese.reserve)}</span>
        </div>
        <div class="kpi">
          <span class="etiquette">dont non réservé</span>
          <span class="kpi-montant petit-kpi" data-testid="total-non-reserve">{texteMontant(synthese.nonReserve)}</span>
        </div>
        <div class="notes">
          {#if total.exclus.length > 0}<p class="exclus" data-testid="total-exclus">Non compté : {total.exclus.join(', ')}.</p>{/if}
          <p>{total.phrase}</p>
        </div>
      </div>
    {/if}

    <div class="zone-comptes">
    <div class="entete">
      <h2>Mes comptes</h2>
      <button type="button" class="principal" onclick={() => ouvrir('ajout')}>Ajouter un compte</button>
    </div>

    {#if formulaire === 'ajout'}
      <FenetreFormulaire titre={TITRES.ajout} erreur={proposition ? null : erreurSaisie} onabandonner={() => (formulaire = null)}>
      <form
        class="formulaire"
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
        <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
      </form>
      </FenetreFormulaire>
    {/if}

    {#if liste.ouverts.length === 0 && formulaire !== 'ajout'}
      <p class="discret">Aucun compte pour l’instant.</p>
    {/if}
    <div class="grille-comptes">
      {#each liste.ouverts as v, i (v.id)}
        {@render carte(v, i)}
      {/each}
    </div>

    {#if liste.fermes.length > 0}
      <details class="fermes" open={liste.fermes.some((v) => v.id === fiche)}>
        <summary>Comptes fermés ({liste.fermes.length})</summary>
        <div class="grille-comptes">
          {#each liste.fermes as v, i (v.id)}
            {@render carte(v, i)}
          {/each}
        </div>
      </details>
    {/if}
    </div>
    </div>
  {/if}
</section>

{#if erreurSaisie && !proposition && formulaire === null && !formulaireReserve}
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
  /* Totaux à gauche, loutre à droite ; comptes en dessous, deux par ligne. */
  .mise-en-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    grid-template-areas: 'totaux loutre' 'comptes comptes';
    column-gap: var(--espace-6);
    align-items: start;
  }
  .zone-comptes {
    grid-area: comptes;
    min-width: 0;
  }
  .loutre {
    grid-area: loutre;
    margin-bottom: var(--espace-6);
  }
  /* L'illustration entière, jamais déformée ni recadrée. */
  .loutre :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1672 / 941;
    object-fit: contain;
    border-radius: 16px;
    box-shadow: var(--ombre-carte);
  }
  .synthese {
    grid-area: totaux;
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    row-gap: var(--espace-3);
    column-gap: var(--espace-6);
    align-items: center;
    align-self: stretch;
    align-content: center;
    margin: 0 0 var(--espace-6);
    padding: var(--espace-4) var(--espace-8);
  }
  .synthese .notes {
    grid-column: 1 / -1;
  }
  .synthese .kpi:nth-child(3) {
    border-right: none;
  }
  @media (max-width: 1180px) {
    .mise-en-page {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'totaux' 'comptes' 'loutre';
    }
    .loutre {
      max-width: 520px;
    }
    .synthese {
      grid-template-columns: 1.4fr 1fr 1fr 2fr;
    }
    .synthese .notes {
      grid-column: auto;
    }
    .synthese .kpi:nth-child(3) {
      border-right: 2px solid color-mix(in srgb, var(--couleur-bandeau-texte) 25%, transparent);
    }
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: var(--espace-4);
    border-right: 2px solid color-mix(in srgb, var(--couleur-bandeau-texte) 25%, transparent);
  }
  .etiquette {
    font-size: var(--texte-petit);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.85;
  }
  .kpi-montant {
    font-family: var(--police-titre);
    font-variation-settings: 'SOFT' 100;
    font-weight: 900;
    font-size: 34px;
    line-height: 1.1;
    color: var(--couleur-bandeau-texte);
  }
  .petit-kpi {
    font-size: 26px;
  }
  .detail {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .notes p {
    margin: 0;
    font-size: var(--texte-petit);
  }
  .notes .exclus {
    font-weight: 700;
    color: var(--sorbet-beurre);
  }
  .grille-comptes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--espace-6);
    align-items: start;
    margin-bottom: var(--espace-6);
  }
  .compte-v1.ouvert {
    grid-column: 1 / -1;
  }
  .sommaire {
    display: flex;
    flex-direction: column;
    gap: var(--espace-3);
  }
  .valeur-compte {
    display: flex;
    flex-direction: column;
  }
  .montant-grand.inconnu {
    font-size: 26px;
    color: var(--etat-a-completer-texte);
  }
  .libelle-valeur {
    font-size: var(--texte-courant);
  }
  .lignes {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .panneau-reserves {
    background: var(--couleur-panneau);
    border-radius: var(--arrondi-panneau);
    padding: var(--espace-3) var(--espace-4);
  }
  .panneau-reserves h4 {
    margin: 0 0 var(--espace-2);
    font-size: var(--texte-dense);
    color: var(--couleur-texte);
  }
  .panneau-reserves ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-2);
  }
  .panneau-reserves li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px var(--espace-3);
    font-size: var(--texte-dense);
  }
  .nom-reserve {
    font-weight: 700;
  }
  .chiffres-reserve {
    text-align: right;
    white-space: nowrap;
  }
  .barre {
    grid-column: 1 / -1;
  }
  .actions-carte {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-3);
    margin: 0;
  }
  .actions-carte button.petit {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-1);
  }
  .detail-compte {
    margin-top: var(--espace-4);
    padding-top: var(--espace-4);
    border-top: 2px dashed var(--couleur-bordure);
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-2);
  }
  h4 {
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
    margin: var(--espace-4) 0 var(--espace-2);
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
