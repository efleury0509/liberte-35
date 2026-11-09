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
  import { reservesDe } from '../../actions/couvertures';
  import { LIBELLES_QUAND, type Quand } from '../../actions/elements';
  import { inverser } from '../../lib/appliquer';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme } from '../../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onchangement: () => void;
    onvoircompte: (id: string) => void;
  }
  let { plateforme, onchangement, onvoircompte }: Props = $props();

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
      class="formulaire encadre"
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
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'quand'}
    <form
      class="formulaire encadre"
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
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'fin'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-fin"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerFinDepense(donnees!, v.id, fDate, jour));
      }}
    >
      <p class="discret">Elle ne revient plus après cette date ; son historique reste.</p>
      <label>Dernière fois le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'note'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-note"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerNoteDepense(donnees!, v.id, fNom, fNote, jour));
      }}
    >
      <label>Nom <input bind:value={fNom} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'lien'}
    <form
      class="formulaire encadre"
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
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'suggestion'}
    <form
      class="formulaire encadre"
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
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
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
      {@render formulaires(v)}
    {/if}
  </article>
{/snippet}

<section aria-label="Dépenses à prévoir">
  {#if erreurChargement}
    <p role="alert" class="erreur">{erreurChargement}</p>
  {:else if donnees}
    <p class="discret intro">
      Les dépenses qui ne reviennent pas à chaque paie (pneus, immatriculation, cadeaux…). Elles apparaissent dans Mes paies, au bon cycle. Avec une réserve liée, seule la partie non couverte sort du disponible.
    </p>
    <div class="entete">
      <h2>Mes dépenses à prévoir</h2>
      <button type="button" class="principal" onclick={() => ouvrir('ajout')}>Ajouter une dépense</button>
    </div>

    {#if formulaire === 'ajout'}
      <form
        class="formulaire encadre"
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
        <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
      </form>
    {/if}

    {#if liste.length === 0 && formulaire !== 'ajout'}
      <p class="discret">Aucune dépense à prévoir pour l’instant.</p>
    {/if}
    {#each liste as v (v.id)}
      {@render carte(v)}
    {/each}

    {#if annee && annee.mois.length > 0}
      <h2 class="annee">Les 12 prochains mois</h2>
      <div data-testid="douze-mois">
        {#each annee.mois as m (m.mois)}
          <h4>{m.mois}</h4>
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
  .intro {
    max-width: 760px;
    margin: 0 0 var(--espace-6);
  }
  .carte {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-4) var(--espace-6);
    margin: 0 0 var(--espace-4);
  }
  .entete {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--espace-3);
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-2);
  }
  h2.annee {
    margin-top: var(--espace-8);
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
  .boutons,
  .formulaire {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: flex-end;
    margin-top: var(--espace-3);
  }
  .encadre {
    padding: var(--espace-3);
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
  }
  .encadre > p {
    flex-basis: 100%;
    margin: 0;
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
  label {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
  }
  label.en-ligne {
    flex-direction: row;
    align-items: center;
    color: inherit;
    font-size: var(--taille-texte);
  }
  .discret {
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  .attention {
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
  }
  .erreur {
    color: var(--couleur-erreur);
  }
  .fermer {
    min-width: 32px;
    padding: 0 var(--espace-2);
  }
  .enregistre {
    position: fixed;
    bottom: var(--espace-4);
    left: calc(50% + 120px);
    transform: translateX(-50%);
    z-index: 10;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.35);
    display: flex;
    gap: var(--espace-3);
    align-items: center;
    max-width: 1100px;
    padding: var(--espace-2) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-surface);
    border: 1px solid var(--couleur-bordure);
  }
</style>
