<script lang="ts">
  // Étape 8 : la carte Visa dans Mes dettes — on configure et on consulte.
  // Les montants des échéances se choisissent dans Mes paies (« Ajuster »),
  // où l'on confirme aussi les paiements. Rien ici ne change un paiement.
  import { untrack } from 'svelte';
  import { CreditCard } from '@lucide/svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import MenuActions from '../base/MenuActions.svelte';
  import Pastille from '../base/Pastille.svelte';
  import type { Proposition } from '../../actions/paie';
  import {
    LIBELLES_OBJECTIF,
    proposerAjoutCarte,
    proposerFrais,
    proposerObjectif,
    proposerReleve,
    proposerRenseignementsCarte,
    proposerRetraitFrais,
    proposerRetraitReleve,
    proposerSoldeActuel,
    proposerSuppressionCarte,
    vueCarte,
  } from '../../actions/cartes';
  import type { DonneesPaie, ObjectifCarte } from '../../lib/plateforme';
  import type { DateCivile } from '../../noyau/dates';

  interface Props {
    donnees: DonneesPaie;
    jour: DateCivile;
    proposer: (fabrique: () => Proposition) => void;
    /** Incrémenté à chaque enregistrement : referme le formulaire ouvert. */
    remise: number;
    /** V1 lot 5 : erreur de la dernière proposition, montrée dans la fenêtre ouverte. */
    erreur?: string | null;
    onformulaire?: (ouvert: boolean) => void;
  }
  let { donnees, jour, proposer, remise, erreur = null, onformulaire }: Props = $props();

  type Formulaire = 'ajout' | 'renseignements' | 'releve' | 'solde' | 'frais';
  let formulaire: Formulaire | null = $state(null);
  let fNom = $state('');
  let fProchaine = $state('');
  let fLimite = $state('');
  let fTaux = $state('');
  let fDate = $state('');
  let fSolde = $state('');
  let fMinimum = $state('');
  let fEcheance = $state('');
  let fNote = $state('');
  let fLibelle = $state('');
  let fFrequence: 'annee' | 'mois' = $state('annee');

  $effect(() => {
    void remise;
    formulaire = null;
  });

  let dernierEtat = false;
  $effect(() => {
    const ouvert = formulaire !== null;
    if (ouvert !== dernierEtat) {
      dernierEtat = ouvert;
      untrack(() => onformulaire?.(ouvert));
    }
  });
  const TITRES: Record<Formulaire, string> = {
    ajout: 'Ajouter ma carte',
    renseignements: 'Compléter les renseignements',
    releve: 'Ajouter un relevé',
    solde: 'Mettre à jour le solde actuel',
    frais: 'Ajouter un frais',
  };

  const v = $derived(vueCarte(donnees, jour));
  const enTexte = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const OBJECTIFS: (ObjectifCarte | null)[] = [null, 'reduireSolde', 'payerReleves'];

  function ouvrir(f: Formulaire) {
    formulaire = f;
    fNom = fProchaine = fDate = fSolde = fMinimum = fEcheance = fNote = fLibelle = '';
    fFrequence = 'annee';
    if (f === 'renseignements' && v) {
      fLimite = enTexte(v.brut.limite);
      fTaux = v.brut.taux?.replace('.', ',') ?? '';
    } else fLimite = fTaux = '';
  }
</script>

<section aria-labelledby="titre-carte" data-carte="oui">
  <div class="entete">
    <h2 id="titre-carte">Ma carte de crédit</h2>
    {#if !v}<button type="button" class="principal" onclick={() => ouvrir('ajout')}>Ajouter ma carte</button>{/if}
  </div>
  <p class="discret intro">Un solde qui bouge avec tes achats, une échéance par mois. Le montant de chaque échéance se choisit à chaque relevé, dans Mes paies.</p>

  {#if !v}
    <p class="discret">Aucune carte pour l’instant.</p>
  {:else}
    <div data-testid="fiche-carte">
      <CarteBandeau titre={v.nom} teinte="rose" icone={CreditCard}>
        {#snippet badge()}<Pastille>Mensuel</Pastille>{/snippet}
        <dl class="cles">
          <div>
            <dt>Échéance</dt>
            <dd>{v.echeance}</dd>
          </div>
          <div>
            <dt>Montant de chaque échéance</dt>
            <dd>{v.montantEcheance}</dd>
          </div>
          <div>
            <dt>Solde actuel</dt>
            <dd data-testid="solde-actuel" class:inconnu={v.soldeActuel === 'À compléter'}>{v.soldeActuel}</dd>
          </div>
        </dl>
        {#each v.aChoisir as rappel (rappel)}
          <p class="attention" data-testid="a-choisir">{rappel}</p>
        {/each}

        <p class="actions">
          <button type="button" class="principal" onclick={() => ouvrir('releve')}>Ajouter un relevé…</button>
          <MenuActions nom={`carte « ${v.nom} »`}>
            <button type="button" onclick={() => ouvrir('solde')}>Mettre à jour le solde actuel…</button>
            <button type="button" onclick={() => ouvrir('renseignements')}>Compléter les renseignements…</button>
            <button type="button" onclick={() => ouvrir('frais')}>Ajouter un frais…</button>
            <button type="button" onclick={() => proposer(() => proposerSuppressionCarte(donnees, jour))}>Supprimer la carte…</button>
          </MenuActions>
        </p>

        <div class="deux-colonnes">
          <fieldset class="objectif">
            <legend>Mon objectif</legend>
            {#each OBJECTIFS as o (o ?? 'aucun')}
              <label>
                <input
                  type="radio"
                  name="objectif-carte"
                  checked={v.objectif === o}
                  onchange={() => proposer(() => proposerObjectif(donnees, o, jour))}
                />
                {LIBELLES_OBJECTIF[o ?? 'aucun']}
              </label>
            {/each}
            <p class="discret">Informatif : il change seulement ce qui est mis en avant ici. Il ne change aucun paiement.</p>
            {#if v.enTete}
              <p class="en-tete" data-testid="en-tete-objectif">{v.enTete}</p>
              {#if v.objectif === 'reduireSolde' && v.payesDepuisSolde}<p class="discret">{v.payesDepuisSolde} (jamais soustraits du solde actuel).</p>{/if}
            {/if}
          </fieldset>

          <dl class="details">
            {#if v.payesDepuisSolde}
              <dt>Depuis</dt>
              <dd>{v.payesDepuisSolde}</dd>
            {/if}
            <dt>Limite</dt>
            <dd>{v.limite}</dd>
            <dt>Utilisation</dt>
            <dd data-testid="utilisation">{v.utilisation}</dd>
            <dt>Taux</dt>
            <dd>{v.taux}</dd>
            <dt>Frais autorisés</dt>
            <dd>
              {#each v.frais as f (f.libelle)}
                <span class="frais">{f.texte} <button type="button" class="petit" onclick={() => proposer(() => proposerRetraitFrais(donnees, f.libelle, jour))}>Retirer</button></span>
              {:else}
                Aucun
              {/each}
              <span class="discret">(dans la fiche seulement, jamais dans Mes paies)</span>
            </dd>
          </dl>
        </div>

        <h4>Mes relevés</h4>
        {#if v.releves.length === 0}
          <p class="discret">Aucun relevé pour l’instant.</p>
        {:else}
          <p class="discret" data-testid="phrase-echeance">{v.phraseEcheance}</p>
          {#each v.releves as r, i (r.date)}
            <article class="releve" data-testid="releve" data-date={v.dates[i]}>
              <div class="entete">
                <h5>Relevé du {r.date}{i === 0 ? ' — dernier relevé' : ''}</h5>
                <button type="button" class="petit" onclick={() => proposer(() => proposerRetraitReleve(donnees, v.dates[i]!, jour))}>Retirer ce relevé…</button>
              </div>
              <p class="originales">
                <span>Nouveau solde : {r.nouveauSolde}</span>
                <span>Minimum : {r.minimum}</span>
                <span>Échéance : {r.echeance}</span>
              </p>
              <dl class="suivi">
                <dt>Paiements confirmés rattachés</dt>
                <dd data-testid="confirmes">
                  {r.totalConfirmes}
                  {#each r.confirmes as p (p)}<span class="paiement">{p}</span>{/each}
                </dd>
                <dt>Planifiés, pas encore confirmés{r.echeance !== 'À compléter' ? ` (d’ici le ${r.echeance})` : ''}</dt>
                <dd data-testid="planifies">
                  {r.totalPlanifies}
                  {#each r.planifies as p (p)}<span class="paiement">{p}</span>{/each}
                </dd>
              </dl>
              {#each r.notesEcheance as note (note)}
                <p class="note-date">{note}</p>
              {/each}
              {#if r.constatMinimum}<p class="constat" data-testid="constat-minimum">{r.constatMinimum}</p>{/if}
              <p class="constat" data-testid="constat-solde">{r.constatSolde}</p>
            </article>
          {/each}
          <p class="discret">Ce suivi se recalcule à chaque affichage, à partir de tes confirmations et de ta planification. Les données du relevé, elles, ne changent pas.</p>
        {/if}
      </CarteBandeau>
    </div>
  {/if}
</section>

{#if formulaire}
  <FenetreFormulaire
    titre={TITRES[formulaire]}
    contexte={v ? `${v.nom} · solde actuel : ${v.soldeActuel}` : 'Une échéance chaque mois, à date fixe.'}
    {erreur}
    onabandonner={() => (formulaire = null)}
  >
    {#if formulaire === 'ajout'}
      <form
        class="formulaire"
        data-testid="formulaire-ajout-carte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutCarte(donnees, { nom: fNom, prochaine: fProchaine, limite: fLimite, taux: fTaux }, jour));
        }}
      >
        <p class="discret">Son montant se choisit à chaque relevé, dans Mes paies : d’ici là, il reste « À compléter », jamais 0 $.</p>
        <label>Nom de la carte <input bind:value={fNom} /></label>
        <label>Prochaine échéance <input type="date" bind:value={fProchaine} /></label>
        <details class="facultatif">
          <summary>Autres renseignements (facultatifs)</summary>
          <div class="formulaire">
            <label>Limite ($) <input inputmode="decimal" bind:value={fLimite} /></label>
            <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
          </div>
        </details>
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
        </p>
      </form>
    {:else if formulaire === 'releve'}
      <form
        class="formulaire"
        data-testid="formulaire-releve"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerReleve(donnees, { date: fDate, solde: fSolde, minimum: fMinimum, echeance: fEcheance }, jour));
        }}
      >
        <p class="discret">Recopie ton relevé tel quel : il ne sera jamais modifié (une erreur se retire, puis se ressaisit).</p>
        <label>Date du relevé <input type="date" bind:value={fDate} /></label>
        <label>Nouveau solde ($) <input inputmode="decimal" bind:value={fSolde} /></label>
        <label>Paiement minimum ($) <input inputmode="decimal" bind:value={fMinimum} /></label>
        <label>Date d’échéance <input type="date" bind:value={fEcheance} /></label>
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
        </p>
      </form>
    {:else if formulaire === 'solde'}
      <form
        class="formulaire"
        data-testid="formulaire-solde-carte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerSoldeActuel(donnees, { date: fDate, montant: fSolde, note: fNote }, jour));
        }}
      >
        <p class="discret">Le solde que tu vois aujourd’hui (app de la banque, par exemple). Il ne baisse jamais tout seul.</p>
        <label>Solde actuel ($) <input inputmode="decimal" bind:value={fSolde} /></label>
        <label>En date du (vide : aujourd’hui) <input type="date" bind:value={fDate} /></label>
        <label>Note (facultative) <input bind:value={fNote} /></label>
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
        </p>
      </form>
    {:else if formulaire === 'renseignements'}
      <form
        class="formulaire"
        data-testid="formulaire-renseignements-carte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerRenseignementsCarte(donnees, { limite: fLimite, taux: fTaux }, jour));
        }}
      >
        <label>Limite ($) <input inputmode="decimal" bind:value={fLimite} /></label>
        <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
        </p>
      </form>
    {:else if formulaire === 'frais'}
      <form
        class="formulaire"
        data-testid="formulaire-frais"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerFrais(donnees, { libelle: fLibelle, montant: fSolde, frequence: fFrequence }, jour));
        }}
      >
        <label>Nom du frais <input bind:value={fLibelle} /></label>
        <label>Montant ($) <input inputmode="decimal" bind:value={fSolde} /></label>
        <label
          >Fréquence
          <select bind:value={fFrequence}>
            <option value="annee">Par année</option>
            <option value="mois">Par mois</option>
          </select>
        </label>
        <p class="boutons-fenetre">
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Abandonner</button>
        </p>
      </form>
    {/if}
  </FenetreFormulaire>
{/if}

<style>
  section {
    max-width: var(--largeur-contenu);
  }
  h2 {
    font-size: var(--titre-carte);
    margin: 0;
  }
  h4 {
    font-size: var(--titre-bloc);
    margin: var(--espace-6) 0 var(--espace-2);
  }
  h5 {
    font-size: var(--texte-courant);
    margin: 0;
  }
  .intro {
    margin: var(--espace-1) 0 var(--espace-4);
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
  .originales,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-6);
    margin: var(--espace-2) 0 0;
  }
  .actions {
    gap: var(--espace-3);
    align-items: center;
    margin-top: var(--espace-4);
  }
  .deux-colonnes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--espace-4) var(--espace-6);
    align-items: start;
    margin-top: var(--espace-4);
  }
  .objectif {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi-panneau);
    background: var(--couleur-panneau);
    padding: var(--espace-2) var(--espace-4) var(--espace-3);
    margin: 0;
  }
  .objectif legend {
    font-size: var(--texte-petit);
    font-weight: 700;
    color: var(--couleur-texte-discret);
  }
  .objectif label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--espace-2);
    color: inherit;
    font-size: var(--texte-dense);
    margin: var(--espace-1) 0;
  }
  .en-tete {
    font-size: var(--titre-bloc);
    font-weight: 700;
    margin: var(--espace-3) 0 var(--espace-1);
  }
  .details,
  .suivi {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--espace-1) var(--espace-6);
    margin: 0;
    font-size: var(--texte-dense);
  }
  .suivi {
    margin: var(--espace-3) 0 var(--espace-2);
  }
  dt {
    color: var(--couleur-texte-discret);
  }
  dd {
    margin: 0;
  }
  .paiement,
  .frais {
    display: block;
  }
  .paiement {
    color: var(--couleur-texte-discret);
    font-size: var(--texte-petit);
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
  .releve {
    border-top: 1px solid var(--couleur-bordure);
    padding-top: var(--espace-3);
    margin-top: var(--espace-3);
    font-size: var(--texte-dense);
  }
  .constat {
    margin: var(--espace-1) 0;
  }
  .note-date {
    color: var(--couleur-attention);
    font-size: var(--texte-petit);
    margin: var(--espace-1) 0;
  }
</style>
