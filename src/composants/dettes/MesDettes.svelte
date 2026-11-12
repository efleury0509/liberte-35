<script lang="ts">
  // Étape 7a : Mes dettes — les prêts au quotidien. On commence avec ce qu'on
  // sait (nom, versement, fréquence, prochaine échéance) ; le reste se
  // complète plus tard. Le versement vit dans les cycles de Mes paies, où on
  // le confirme comme le reste : l'historique en découle.
  import { onMount, tick } from 'svelte';
  import Apercu from '../Apercu.svelte';
  import CarteVisa from './CarteVisa.svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import MenuActions from '../base/MenuActions.svelte';
  import Pastille from '../base/Pastille.svelte';
  import { CalendarClock, Landmark, Mountain } from '@lucide/svelte';
  import { laCarte, vueCarte } from '../../actions/cartes';
  import { dettesParPriorite, proposerPrioriteDettes, rangPriorite } from '../../actions/priorite';
  import { ArrowDown, ArrowUp, ListOrdered } from '@lucide/svelte';
  import Icone from '../base/Icone.svelte';
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
    reductionSolde,
    texteReductionSolde,
    type QuandPret,
    type VuePret,
  } from '../../actions/prets';
  import { inverser } from '../../lib/appliquer';
  import { formaterDateCourte, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { ChangementPaie, DonneesPaie, EntreeJournal, Plateforme } from '../../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onchangement: () => void;
    /** Prêt à ouvrir (lien « Voir le prêt » depuis Mes paies), ou 'carte' (« Voir la carte »). */
    ouvert?: string | null;
  }
  let { plateforme, onchangement, ouvert = null }: Props = $props();

  const jour = aujourdhui();
  let donnees: DonneesPaie | null = $state(null);
  let erreurChargement: string | null = $state(null);
  let fiche: string | null = $state(null);
  let formulaire: 'ajout' | 'renseignements' | 'versement' | 'solde' | 'remboursement' | null = $state(null);
  /** V1 lot 5 : le prêt dont le formulaire est ouvert (fenêtre centrée). */
  let pretFormulaire: string | null = $state(null);
  /** Un formulaire de la carte est ouvert : son erreur s'y affiche. */
  let formulaireCarte = $state(false);
  /** Lot 1 : fenêtre « Ordre de priorité » et l'ordre en cours d'édition. */
  let fenetrePriorite = $state(false);
  let ordreEdition: { id: string; nom: string }[] = $state([]);
  const parPriorite = $derived(donnees ? dettesParPriorite(donnees) : []);
  const prioriteChoisie = $derived(parPriorite.some((x) => x.rang !== null));
  function ouvrirPriorite() {
    ordreEdition = parPriorite.map((x) => ({ id: x.id, nom: x.nom }));
    erreurSaisie = null;
    fenetrePriorite = true;
  }
  function deplacer(i: number, sens: -1 | 1) {
    const j = i + sens;
    if (j < 0 || j >= ordreEdition.length) return;
    const copie = [...ordreEdition];
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
    ordreEdition = copie;
  }
  let proposition: Proposition | null = $state(null);
  let erreurSaisie: string | null = $state(null);
  let enCours = $state(false);
  let dernier: { titre: string; inverse: ChangementPaie[]; journal: EntreeJournal[] } | null = $state(null);
  let messageAnnulation: string | null = $state(null);
  let remise = $state(0);

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
      } else if (ouvert === 'carte') {
        await tick();
        document.querySelector('[data-carte]')?.scrollIntoView?.({ block: 'start' });
      }
    } catch (e) {
      erreurChargement = typeof e === 'string' ? e : 'Impossible de lire les données.';
    }
  });

  const liste = $derived(donnees ? listePrets(donnees, jour) : { actifs: [], liberes: [] });
  const carte = $derived(donnees ? vueCarte(donnees, jour) : null);
  const pretOuvert = $derived(pretFormulaire ? (liste.actifs.find((x) => x.id === pretFormulaire) ?? null) : null);
  const TITRES = {
    ajout: 'Ajouter un prêt',
    renseignements: 'Compléter les renseignements',
    versement: 'Changer le versement',
    solde: 'Mettre à jour le solde',
    remboursement: 'Marquer comme remboursé',
  } as const;
  function fermerFormulaire() {
    formulaire = null;
    pretFormulaire = null;
    erreurSaisie = null;
  }
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
      pretFormulaire = null;
      fenetrePriorite = false;
      erreurSaisie = null;
      remise += 1;
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
    pretFormulaire = v.id;
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
    pretFormulaire = null;
    proposition = null;
    erreurSaisie = null;
  }
  /** Affichage seulement : « montant au … » puis « payés depuis, … ». */
  function partiesSolde(t: string): [string, string | null] {
    const i = t.indexOf(' — ');
    return i < 0 ? [t, null] : [t.slice(0, i), t.slice(i + 3)];
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

{#snippet formulairePret(v: VuePret)}
  {#if formulaire === 'renseignements'}
    <form
      class="formulaire"
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
      <p class="boutons-fenetre">
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </p>
    </form>
  {:else if formulaire === 'versement'}
    <form
      class="formulaire"
      data-testid="formulaire-versement"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerVersement(donnees!, v.id, fDate, fMontant, jour));
      }}
    >
      <p class="discret">Les versements d’avant cette date et les versements confirmés ne changent pas.</p>
      <label>À partir du <input type="date" bind:value={fDate} /></label>
      <label>Nouveau versement ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <p class="boutons-fenetre">
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </p>
    </form>
  {:else if formulaire === 'solde'}
    <form
      class="formulaire"
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
      <p class="boutons-fenetre">
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </p>
    </form>
  {:else if formulaire === 'remboursement'}
    <form
      class="formulaire"
      data-testid="formulaire-remboursement"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerRemboursement(donnees!, v.id, fDate, jour));
      }}
    >
      <p class="discret">Vide : la date du dernier versement confirmé (ou aujourd’hui). Un aperçu suit avant d’enregistrer.</p>
      <label>Remboursé le <input type="date" bind:value={fDate} /></label>
      <p class="boutons-fenetre">
        <button type="submit" class="principal">Voir l’aperçu</button>
        <button type="button" onclick={fermerFormulaire}>Abandonner</button>
      </p>
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
  <div class="colonnes">
    <div class="principale">
      <section aria-labelledby="titre-prets">
        <div class="entete">
          <h2 id="titre-prets">Mes prêts</h2>
          <button type="button" class="principal" onclick={ouvrirAjout}>Ajouter un prêt</button>
        </div>
        <p class="discret intro">Des versements réguliers jusqu’au remboursement complet. Chaque versement se confirme dans Mes paies, au bon cycle.</p>

        {#each liste.actifs as v (v.id)}
          <div class="pret" data-pret={v.id}>
            <CarteBandeau titre={v.nom} teinte="lilas" icone={Landmark}>
              {#snippet badge()}
                {#if rangPriorite(donnees!, v.id) !== null}<Pastille etat="neutre">Priorité {rangPriorite(donnees!, v.id)}</Pastille>{/if}
                <Pastille>{v.rythme}</Pastille>
              {/snippet}
              <dl class="cles">
                <div>
                  <dt>Versement</dt>
                  <dd>{v.versement}</dd>
                </div>
                <div>
                  <dt>Prochain versement</dt>
                  <dd>{v.prochainVersement ?? 'Aucun versement planifié'}</dd>
                </div>
                <!-- 0.21 : le solde sur toute la largeur ; le complément (payé depuis,
                     répartition) sur sa propre ligne, plus discret. Même texte. -->
                <div class="solde-actuel">
                  <dt>Solde actuel</dt>
                  <dd class:inconnu={v.soldeActuel === 'À compléter'} data-testid="solde-actuel-carte">
                    <span class="solde-montant">{partiesSolde(v.soldeActuel)[0]}</span>{#if partiesSolde(v.soldeActuel)[1]}<span class="solde-suite"><span class="visuellement-cache">{' — '}</span>{partiesSolde(v.soldeActuel)[1]}</span>{/if}
                  </dd>
                </div>
              </dl>
              {#if v.note}<p class="attention">{v.note}</p>{/if}
              <p class="actions-pret">
                <button type="button" aria-expanded={fiche === v.id} onclick={() => basculer(v.id)}>{fiche === v.id ? 'Fermer la fiche' : 'Ouvrir la fiche'}</button>
                <button type="button" onclick={() => ouvrirFormulaire(v, 'solde')}>Mettre à jour le solde…</button>
                <MenuActions nom={`prêt « ${v.nom} »`}>
                  <button type="button" onclick={() => ouvrirFormulaire(v, 'renseignements')}>Compléter les renseignements…</button>
                  <button type="button" onclick={() => ouvrirFormulaire(v, 'versement')}>Changer le versement…</button>
                  <button type="button" onclick={() => ouvrirFormulaire(v, 'remboursement')}>Marquer comme remboursé…</button>
                  <button type="button" onclick={() => proposer(() => proposerSuppressionPret(donnees!, v.id, jour))}>Supprimer…</button>
                </MenuActions>
              </p>
              {#if fiche === v.id}
                <div class="fiche-ouverte">{@render details(v)}</div>
              {/if}
            </CarteBandeau>
          </div>
        {:else}
          <p class="discret">Aucun prêt pour l’instant.</p>
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

      <CarteVisa donnees={donnees} {jour} {proposer} {remise} rang={laCarte(donnees) ? rangPriorite(donnees, laCarte(donnees)!.id) : null} erreur={proposition ? null : erreurSaisie} onformulaire={(ouvert) => (formulaireCarte = ouvert)} />
    </div>

    <aside class="contexte" aria-label="Vue d’ensemble des dettes">
      <CarteBandeau titre="Prochains paiements" teinte="peche" icone={CalendarClock}>
        <ul class="prochains" data-testid="prochains-paiements">
          {#each liste.actifs as v (v.id)}
            <li>
              <span class="nom">{v.nom}</span>
              <Pastille>{v.rythme}</Pastille>
              <span class="quand">{v.prochainVersement ?? 'Aucun versement planifié'}</span>
            </li>
          {/each}
          {#if carte}
            <li>
              <span class="nom">{carte.nom}</span>
              <Pastille>Mensuel</Pastille>
              <span class="quand">Échéance : {carte.echeance} · {carte.montantEcheance}</span>
            </li>
          {/if}
          {#if liste.actifs.length === 0 && !carte}
            <li class="discret">Aucune dette suivie pour l’instant.</li>
          {/if}
        </ul>
        <p class="discret petit">Une date planifiée n’est pas une preuve de paiement : les paiements se confirment dans Mes paies.</p>
      </CarteBandeau>

      {#if parPriorite.length > 0}
        <CarteBandeau titre="Priorité" teinte="lilas" icone={ListOrdered}>
          <div data-testid="priorite-dettes">
            {#if prioriteChoisie}
              <ol class="priorites">
                {#each parPriorite.filter((x) => x.rang !== null) as x (x.id)}<li>{x.nom}</li>{/each}
              </ol>
              {#if parPriorite.some((x) => x.rang === null)}
                <p class="discret petit">Sans priorité : {parPriorite.filter((x) => x.rang === null).map((x) => x.nom).join(', ')}.</p>
              {/if}
            {:else}
              <p class="discret petit">Aucune priorité choisie.</p>
            {/if}
            <p class="discret petit">Un repère pour toi : il ne change aucun paiement ni aucun calcul.</p>
            <p class="actions-priorite"><button type="button" class="action-secondaire" onclick={ouvrirPriorite}>{prioriteChoisie ? 'Modifier l’ordre…' : 'Choisir un ordre…'}</button></p>
          </div>
        </CarteBandeau>
      {/if}

      <CarteBandeau titre="Progression" teinte="sauge" icone={Mountain}>
        <ul class="progressions" data-testid="progression-dettes">
          {#each liste.actifs as v (v.id)}
            {@const r = reductionSolde(v.brut.soldes)}
            <li data-pret-progression={v.id}>
              <span class="nom">{v.nom}</span>
              {#if r.etat === 'a-completer'}
                <Pastille etat="a-completer">À compléter</Pastille>
                <span class="discret petit">{r.raison}</span>
              {:else}
                <Pastille etat={r.etat === 'reduit' ? 'confirme' : r.etat === 'augmente' ? 'alerte' : 'neutre'}>{texteReductionSolde(r)}</Pastille>
                <span class="discret petit"
                  >Soldes déclarés : {formaterMontant(r.depart.montant)} au {formaterDateCourte(r.depart.date as DateCivile)}
                  {r.depart.date.slice(0, 4)}, puis {formaterMontant(r.dernier.montant)} au {formaterDateCourte(r.dernier.date as DateCivile)}
                  {r.dernier.date.slice(0, 4)}.</span
                >
              {/if}
              <span class="discret petit">{v.payeDepuisAjout}. La part de capital remboursé reste à compléter : la méthode d’intérêts du contrat manque.</span>
            </li>
          {:else}
            <li class="discret">Aucun prêt en cours.</li>
          {/each}
        </ul>
        {#if liste.liberes.length > 0}
          <p class="libere-compte"><Pastille etat="confirme">{liste.liberes.length === 1 ? '1 dette libérée' : `${liste.liberes.length} dettes libérées`}</Pastille></p>
        {/if}
      </CarteBandeau>
    </aside>
  </div>

  {#if fenetrePriorite}
    <FenetreFormulaire
      titre="Ordre de priorité des dettes"
      contexte="La première est celle que tu veux rembourser en premier. Aucun paiement ne change."
      erreur={proposition ? null : erreurSaisie}
      onabandonner={() => {
        fenetrePriorite = false;
        erreurSaisie = null;
      }}
    >
      <ol class="ordre-edition" data-testid="ordre-priorite">
        {#each ordreEdition as x, i (x.id)}
          <li>
            <span class="rang">{i + 1}</span>
            <span class="nom">{x.nom}</span>
            <button type="button" class="petit" aria-label={`Monter « ${x.nom} »`} disabled={i === 0} onclick={() => deplacer(i, -1)}><Icone icone={ArrowUp} taille={16} /></button>
            <button type="button" class="petit" aria-label={`Descendre « ${x.nom} »`} disabled={i === ordreEdition.length - 1} onclick={() => deplacer(i, 1)}><Icone icone={ArrowDown} taille={16} /></button>
          </li>
        {/each}
      </ol>
      <p class="boutons-fenetre">
        <button type="button" class="principal" onclick={() => proposer(() => proposerPrioriteDettes(donnees!, ordreEdition.map((x) => x.id)))}>Enregistrer cet ordre</button>
        {#if prioriteChoisie}<button type="button" onclick={() => proposer(() => proposerPrioriteDettes(donnees!, []))}>Retirer les priorités</button>{/if}
        <button type="button" onclick={() => (fenetrePriorite = false)}>Abandonner</button>
      </p>
    </FenetreFormulaire>
  {/if}

  {#if formulaire === 'ajout'}
    <FenetreFormulaire titre={TITRES.ajout} contexte="Ces quatre renseignements suffisent pour commencer." erreur={proposition ? null : erreurSaisie} onabandonner={fermerFormulaire}>
      <form
        class="formulaire"
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
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={fermerFormulaire}>Abandonner</button>
        </p>
      </form>
    </FenetreFormulaire>
  {:else if formulaire && pretOuvert}
    <FenetreFormulaire
      titre={`${TITRES[formulaire]} — ${pretOuvert.nom}`}
      contexte={`${pretOuvert.versement} · solde actuel : ${pretOuvert.soldeActuel}`}
      erreur={proposition ? null : erreurSaisie}
      onabandonner={fermerFormulaire}
    >
      {@render formulairePret(pretOuvert)}
    </FenetreFormulaire>
  {/if}
{/if}

{#if erreurSaisie && !proposition && !formulaire && !formulaireCarte && !fenetrePriorite}
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
  .colonnes {
    /* Sous le paysage de l'en-tête (flottant à droite). */
    clear: both;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--espace-6);
    align-items: start;
    max-width: var(--largeur-contenu);
    font-size: var(--texte-courant);
  }
  @media (max-width: 1180px) {
    .colonnes {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .principale {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-5);
  }
  .contexte {
    position: sticky;
    top: var(--espace-4);
    display: flex;
    flex-direction: column;
    gap: var(--espace-5);
  }
  h2 {
    font-size: var(--titre-carte);
    margin: 0;
  }
  h3 {
    font-size: var(--titre-bloc);
    margin: 0;
  }
  h4 {
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  .intro {
    margin: var(--espace-1) 0 var(--espace-4);
  }
  .pret + .pret {
    margin-top: var(--espace-5);
  }
  .cles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: var(--espace-3) var(--espace-6);
    margin: 0;
  }
  .cles dt {
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
    font-weight: 700;
  }
  .cles dd {
    margin: var(--espace-1) 0 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
  .solde-actuel {
    grid-column: 1 / -1;
  }
  .solde-montant {
    display: block;
  }
  .solde-suite {
    display: block;
    margin-top: 2px;
    font-weight: 400;
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
  }
  .actions-pret {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: center;
    margin: var(--espace-4) 0 0;
  }
  .fiche-ouverte {
    border-top: 1px solid var(--couleur-bordure);
    margin-top: var(--espace-4);
    padding-top: var(--espace-2);
  }
  .prochains,
  .progressions {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-3);
  }
  .prochains li,
  .progressions li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--espace-1) var(--espace-2);
    padding-bottom: var(--espace-3);
    border-bottom: 1px dashed var(--couleur-bordure);
  }
  .prochains li:last-child,
  .progressions li:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .nom {
    font-weight: 700;
  }
  .quand {
    flex-basis: 100%;
    font-variant-numeric: tabular-nums;
  }
  .petit {
    font-size: var(--texte-petit);
  }
  .progressions .petit {
    flex-basis: 100%;
  }
  .priorites {
    margin: 0 0 var(--espace-2);
    padding-left: var(--espace-6);
    font-weight: 700;
  }
  .priorites li + li {
    margin-top: var(--espace-1);
  }
  .actions-priorite {
    margin: var(--espace-2) 0 0;
  }
  .ordre-edition {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-4);
    display: flex;
    flex-direction: column;
    gap: var(--espace-2);
  }
  .ordre-edition li {
    display: flex;
    align-items: center;
    gap: var(--espace-3);
    padding: var(--espace-2) var(--espace-3);
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    background: var(--couleur-panneau);
  }
  .ordre-edition .rang {
    font-weight: 800;
    min-width: 1.5em;
    color: var(--prune-700);
  }
  .ordre-edition .nom {
    flex: 1;
    font-weight: 700;
  }
  .libere-compte {
    margin: var(--espace-3) 0 0;
  }
  .fiche {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--espace-1) var(--espace-6);
    margin: var(--espace-4) 0 var(--espace-2);
    font-size: var(--texte-dense);
  }
  dt {
    color: var(--couleur-texte-discret);
  }
  dd {
    margin: 0;
  }
  .boutons-fenetre {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    margin: var(--espace-2) 0 0;
  }
  .facultatif summary {
    cursor: pointer;
    color: var(--couleur-texte-discret);
    font-size: var(--texte-petit);
  }
  .defilement {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    min-width: 640px;
    font-size: var(--texte-dense);
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
    font-size: var(--texte-petit);
  }
  .note {
    display: block;
    color: var(--couleur-attention);
    font-size: var(--texte-petit);
  }
  .ligne-solde th,
  .ligne-solde td {
    color: var(--couleur-texte-discret);
    font-style: italic;
  }
  .liberes summary {
    cursor: pointer;
    margin: var(--espace-2) 0 var(--espace-3);
    font-weight: 700;
  }
  .a-venir {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--espace-2);
    max-width: 420px;
    font-size: var(--texte-dense);
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
