<script lang="ts">
  // Étape 7a : Mes dettes — les prêts au quotidien. On commence avec ce qu'on
  // sait (nom, versement, fréquence, prochaine échéance) ; le reste se
  // complète plus tard. Le versement vit dans les cycles de Mes paies, où on
  // le confirme comme le reste : l'historique en découle.
  import { onMount, tick } from 'svelte';
  import Apercu from '../Apercu.svelte';
  import { ErreurSaisie, type Proposition } from '../../actions/paie';
  import {
    LIBELLES_QUAND_PRET,
    listePrets,
    proposerAjoutPret,
    proposerMiseAJourSolde,
    proposerRemboursement,
    proposerRenseignements,
    proposerSuppressionPret,
    proposerVersement,
    type QuandPret,
    type VuePret,
  } from '../../actions/prets';
  import { inverser } from '../../lib/appliquer';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme } from '../../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onchangement: () => void;
    /** Prêt à ouvrir (lien « Voir le prêt » depuis Mes paies). */
    ouvert?: string | null;
  }
  let { plateforme, onchangement, ouvert = null }: Props = $props();

  const jour = aujourdhui();
  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let fiche: string | null = $state(null);
  let formulaire: 'ajout' | 'renseignements' | 'versement' | 'solde' | 'remboursement' | null = $state(null);
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);

  // Champs
  let fNom = $state('');
  let fVersement = $state('');
  let fQuand: QuandPret | '' = $state('');
  let fProchaine = $state('');
  let fMinimum = $state('');
  let fEcheance = $state('');
  let fSolde = $state('');
  let fSoldeLe = $state('');
  let fTaux = $state('');
  let fDate = $state('');
  let fMontant = $state('');
  let fNote = $state('');

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
      if (ouvert && donnees.prets.some((p) => p.id === ouvert)) {
        fiche = ouvert;
        await tick();
        document.querySelector(`[data-pret="${ouvert}"]`)?.scrollIntoView?.({ block: 'start' });
      }
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données.';
    }
  });

  const liste = $derived(donnees ? listePrets(donnees, jour) : { actifs: [], liberes: [] });
  const enTexte = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));
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
      // L3 : ici, chaque enregistrement peut être annulé, aperçu ou non.
      dernier = inverse.length > 0 ? { titre: p.titre, inverse, journal: p.journal } : null;
      proposition = null;
      formulaire = null;
      erreurSaisie = null;
      // Un prêt qui vient d'être ajouté s'ouvre ; un prêt supprimé se ferme.
      const nouveau = donnees.prets.find((x) => !avant.prets.some((y) => y.id === x.id));
      if (nouveau) fiche = nouveau.id;
      if (fiche && !donnees.prets.some((x) => x.id === fiche)) fiche = null;
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
      if (fiche && !donnees.prets.some((x) => x.id === fiche)) fiche = null;
      onchangement();
    } catch (e) {
      erreurSaisie = typeof e === 'string' ? e : 'Annulation impossible.';
    } finally {
      enCours = false;
    }
  }

  function ouvrirAjout() {
    formulaire = 'ajout';
    fiche = null;
    erreurSaisie = null;
    proposition = null;
    fNom = fVersement = fProchaine = fMinimum = fEcheance = fSolde = fSoldeLe = fTaux = '';
    fQuand = '';
  }

  function ouvrirFormulaire(v: VuePret, f: 'renseignements' | 'versement' | 'solde' | 'remboursement') {
    formulaire = f;
    erreurSaisie = null;
    proposition = null;
    const p = v.brut;
    if (f === 'renseignements') {
      fMinimum = enTexte(p.minimum);
      fEcheance = p.echeanceFinale ?? '';
      fTaux = p.taux === null ? '' : p.taux.replace('.', ',');
      fSolde = '';
      fSoldeLe = '';
    } else {
      fDate = f === 'remboursement' ? '' : jour;
      fMontant = '';
      fNote = '';
    }
  }

  function basculer(id: string) {
    fiche = fiche === id ? null : id;
    formulaire = null;
    proposition = null;
    erreurSaisie = null;
  }
</script>

{#snippet details(v: VuePret)}
  <div data-testid="fiche-pret">
  <dl class="fiche">
    <dt>Statut</dt>
    <dd data-testid="statut-pret">{v.statut}</dd>
    <dt>Versement</dt>
    <dd data-testid="versement">{v.versement}</dd>
    {#if v.prochainVersement}
      <dt>Prochain versement</dt>
      <dd data-testid="prochain-versement">{v.prochainVersement}</dd>
    {/if}
    <dt>Minimum</dt>
    <dd data-testid="minimum">{v.minimum}</dd>
    <dt>Taux annuel</dt>
    <dd data-testid="taux">{v.taux}</dd>
    <dt>Méthode d’intérêts</dt>
    <dd data-testid="methode">{v.methode}</dd>
    <dt>Échéance finale</dt>
    <dd data-testid="echeance-finale">{v.echeanceFinale}</dd>
    <dt>Solde initial</dt>
    <dd data-testid="solde-initial">{v.soldeInitial}</dd>
    <dt>Capital remboursé</dt>
    <dd data-testid="capital-rembourse">{v.capitalRembourse}</dd>
    <dt>Solde actuel</dt>
    <dd data-testid="solde-actuel">{v.soldeActuel}</dd>
  </dl>
  <p class="discret" data-testid="paye-depuis-ajout">{v.payeDepuisAjout}</p>
  {#if v.note}<p class="attention" data-testid="note-echeance">{v.note}</p>{/if}

  {#if !v.rembourse}
    <h4>Prochains versements</h4>
    {#if v.aVenir.length === 0}
      <p class="discret">Aucun versement planifié à venir.</p>
    {:else}
      <ul class="a-venir" data-testid="a-venir">
        {#each v.aVenir as x, i (i)}
          <li>
            <span>{x.date}</span>
            <span class="montant">{x.montant}</span>
            {#if x.ajuste}<span class="discret">ajusté cette fois</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if v.totalPrevu}<p data-testid="total-prevu">{v.totalPrevu}</p>{/if}
    {#if v.manque}<p class="discret" data-testid="manque">{v.manque}</p>{/if}
  {/if}

  <h4>Historique</h4>
  {#if v.historique.length === 0}
    <p class="discret">Aucun versement confirmé pour l’instant. Les versements se confirment dans Mes paies, dans le détail de leur cycle.</p>
  {:else}
    <div class="defilement">
      <table data-testid="historique">
        <thead>
          <tr>
            <th scope="col">Versement du</th>
            <th scope="col" class="montant">Payé</th>
            <th scope="col" class="montant">Obligatoire</th>
            <th scope="col" class="montant">Supplémentaire</th>
            <th scope="col" class="montant">Intérêts</th>
            <th scope="col" class="montant">Capital</th>
            <th scope="col" class="montant">Nouveau solde</th>
          </tr>
        </thead>
        <tbody>
          {#each v.historique as l, i (i)}
            {#if l.genre === 'versement'}
              <tr data-testid="ligne-versement">
                <th scope="row">{l.date}{#if l.sousMinimum}<span class="note">{l.sousMinimum}</span>{/if}</th>
                <td class="montant">{l.paye}</td>
                <td class="montant">{l.obligatoire}</td>
                <td class="montant">{l.supplementaire}</td>
                <td class="montant discret">{l.interets}</td>
                <td class="montant discret">{l.capital}</td>
                <td class="montant discret">{l.nouveauSolde}</td>
              </tr>
            {:else}
              <tr class="ligne-solde" data-testid="ligne-solde">
                <th scope="row">{l.date}</th>
                <td colspan="6">{l.texte}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <p class="discret">{v.noteRepartition}</p>
  </div>
{/snippet}

{#snippet actions(v: VuePret)}
  <p class="boutons">
    <button type="button" onclick={() => ouvrirFormulaire(v, 'renseignements')}>Compléter les renseignements…</button>
    <button type="button" onclick={() => ouvrirFormulaire(v, 'versement')}>Changer le versement…</button>
    <button type="button" onclick={() => ouvrirFormulaire(v, 'solde')}>Mettre à jour le solde…</button>
    <button type="button" onclick={() => ouvrirFormulaire(v, 'remboursement')}>Marquer comme remboursé…</button>
    <button type="button" onclick={() => proposer(() => proposerSuppressionPret(donnees!, v.id, jour))}>Supprimer…</button>
  </p>
  {#if formulaire === 'renseignements'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-renseignements"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRenseignements(donnees!, v.id, { minimum: fMinimum, echeanceFinale: fEcheance, taux: fTaux, solde: fSolde, soldeLe: fSoldeLe }, jour));
      }}
    >
      <p class="discret">Tout est facultatif. Les versements déjà confirmés ne changent pas.</p>
      <label>Minimum obligatoire ($, vide = le versement) <input inputmode="decimal" bind:value={fMinimum} /></label>
      <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
      <label>Échéance finale <input type="date" bind:value={fEcheance} /></label>
      {#if v.brut.soldes.length === 0}
        <label>Solde ($) <input inputmode="decimal" bind:value={fSolde} /></label>
        <label>Solde au <input type="date" bind:value={fSoldeLe} /></label>
      {/if}
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'versement'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-versement"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerVersement(donnees!, v.id, fDate, fMontant, jour));
      }}
    >
      <p class="discret">Les versements d’avant cette date et les versements confirmés ne changent pas.</p>
      <label>À partir du <input type="date" bind:value={fDate} /></label>
      <label>Nouveau versement ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'solde'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-solde"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerMiseAJourSolde(donnees!, v.id, fDate, fMontant, fNote, jour));
      }}
    >
      <p class="discret">D’après un relevé, par exemple. Ce solde devient la référence pour la suite ; l’historique d’avant ne change pas.</p>
      <label>Date du solde <input type="date" bind:value={fDate} /></label>
      <label>Solde ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {:else if formulaire === 'remboursement'}
    <form
      class="formulaire encadre"
      data-testid="formulaire-remboursement"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRemboursement(donnees!, v.id, fDate, jour));
      }}
    >
      <p class="discret">Vide : la date du dernier versement confirmé (ou aujourd’hui). Un aperçu suit avant d’enregistrer.</p>
      <label>Remboursé le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
    </form>
  {/if}
{/snippet}

{#if erreurChargement}
  <p role="alert" class="erreur">{erreurChargement}</p>
{:else if !donnees}
  <p>Lecture en cours…</p>
{:else if !donnees.profil}
  <p class="carte">
    Crée d’abord ton profil de paie dans « Mes paies » : les versements de tes prêts se placent dans tes cycles de paie.
  </p>
{:else}
  <section aria-labelledby="titre-prets">
    <div class="entete">
      <h2 id="titre-prets">Mes prêts</h2>
      <button type="button" class="principal" onclick={ouvrirAjout}>Ajouter un prêt</button>
    </div>
    <p class="discret">La carte de crédit viendra à l’étape suivante.</p>

    {#if formulaire === 'ajout'}
      <form
        class="formulaire encadre"
        data-testid="formulaire-ajout-pret"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() =>
            proposerAjoutPret(
              donnees!,
              { nom: fNom, versement: fVersement, quand: fQuand, prochaine: fProchaine, minimum: fMinimum, echeanceFinale: fEcheance, solde: fSolde, soldeLe: fSoldeLe, taux: fTaux },
              jour,
            ),
          );
        }}
      >
        <p class="discret">Ces quatre renseignements suffisent pour commencer.</p>
        <label>Nom du prêt <input bind:value={fNom} /></label>
        <label>Versement ($) <input inputmode="decimal" bind:value={fVersement} /></label>
        <label
          >Fréquence
          <select bind:value={fQuand}>
            <option value="">Choisir…</option>
            {#each Object.entries(LIBELLES_QUAND_PRET) as [valeur, libelle] (valeur)}
              <option value={valeur}>{libelle}</option>
            {/each}
          </select>
        </label>
        <label>Prochain versement <input type="date" bind:value={fProchaine} /></label>
        <details class="facultatif">
          <summary>Autres renseignements (facultatifs, à compléter plus tard si tu veux)</summary>
          <div class="formulaire">
            <label>Minimum obligatoire ($, vide = le versement) <input inputmode="decimal" bind:value={fMinimum} /></label>
            <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
            <label>Échéance finale <input type="date" bind:value={fEcheance} /></label>
            <label>Solde ($) <input inputmode="decimal" bind:value={fSolde} /></label>
            <label>Solde au <input type="date" bind:value={fSoldeLe} /></label>
          </div>
        </details>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
      </form>
    {/if}

    {#each liste.actifs as v (v.id)}
      <article class="carte" data-pret={v.id}>
        <div class="entete">
          <h3>{v.nom}</h3>
          <button type="button" aria-expanded={fiche === v.id} onclick={() => basculer(v.id)}>{fiche === v.id ? 'Fermer la fiche' : 'Ouvrir la fiche'}</button>
        </div>
        <p class="resume">
          <span>{v.versement}</span>
          {#if v.prochainVersement}<span>Prochain : {v.prochainVersement}</span>{/if}
          <span>Solde actuel : {v.soldeActuel}</span>
        </p>
        {#if v.note}<p class="attention">{v.note}</p>{/if}
        {#if fiche === v.id}
          {@render details(v)}
          {@render actions(v)}
        {/if}
      </article>
    {:else}
      {#if formulaire !== 'ajout'}
        <p class="discret">Aucun prêt pour l’instant.</p>
      {/if}
    {/each}
  </section>

  {#if liste.liberes.length > 0}
    <details class="liberes" data-testid="dettes-liberees">
      <summary>Dettes libérées ({liste.liberes.length})</summary>
      {#each liste.liberes as v (v.id)}
        <article class="carte" data-pret={v.id}>
          <h3>{v.nom}</h3>
          {@render details(v)}
        </article>
      {/each}
    </details>
  {/if}
{/if}

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
  .carte {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-4) var(--espace-6);
    margin: 0 0 var(--espace-4);
    max-width: 1100px;
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
  .facultatif {
    flex-basis: 100%;
  }
  .facultatif summary {
    cursor: pointer;
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
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
  .defilement {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    min-width: 640px;
  }
  th,
  td {
    text-align: left;
    padding: var(--espace-1) var(--espace-3) var(--espace-1) 0;
    font-weight: 400;
    white-space: nowrap;
  }
  thead th {
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  .montant {
    text-align: right;
  }
  .note {
    display: block;
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
  }
  .ligne-solde th,
  .ligne-solde td {
    color: var(--couleur-texte-discret);
    font-style: italic;
  }
  .liberes summary {
    cursor: pointer;
    margin: var(--espace-6) 0 var(--espace-3);
    font-weight: 600;
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
  .a-venir {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-2);
    max-width: 420px;
  }
  .a-venir li {
    display: flex;
    gap: var(--espace-4);
    padding: var(--espace-1) 0;
  }
  .a-venir .montant {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
</style>
