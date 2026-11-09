<script lang="ts">
  // Étape 8 : la carte Visa dans Mes dettes — on configure et on consulte.
  // Les montants des échéances se choisissent dans Mes paies (« Ajuster »),
  // où l'on confirme aussi les paiements. Rien ici ne change un paiement.
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
  }
  let { donnees, jour, proposer, remise }: Props = $props();

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

  {#if !v}
    {#if formulaire === 'ajout'}
      <form
        class="formulaire encadre"
        data-testid="formulaire-ajout-carte"
        onsubmit={(e) => {
          e.preventDefault();
          proposer(() => proposerAjoutCarte(donnees, { nom: fNom, prochaine: fProchaine, limite: fLimite, taux: fTaux }, jour));
        }}
      >
        <p class="discret">
          Une échéance chaque mois, à date fixe. Son montant se choisit à chaque relevé, dans Mes paies : d’ici là, il reste « À compléter », jamais 0 $.
        </p>
        <label>Nom de la carte <input bind:value={fNom} /></label>
        <label>Prochaine échéance <input type="date" bind:value={fProchaine} /></label>
        <details class="facultatif">
          <summary>Autres renseignements (facultatifs)</summary>
          <div class="formulaire">
            <label>Limite ($) <input inputmode="decimal" bind:value={fLimite} /></label>
            <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
          </div>
        </details>
        <button type="submit" class="principal">Enregistrer</button>
        <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
      </form>
    {:else}
      <p class="discret">Aucune carte pour l’instant.</p>
    {/if}
  {:else}
    <article class="carte" data-testid="fiche-carte">
      <h3>{v.nom}</h3>
      <p class="resume">
        <span>Échéance : {v.echeance}</span>
        <span>Montant de chaque échéance : {v.montantEcheance}</span>
      </p>
      {#each v.aChoisir as rappel (rappel)}
        <p class="attention" data-testid="a-choisir">{rappel}</p>
      {/each}

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
      </fieldset>
      {#if v.enTete}
        <p class="en-tete" data-testid="en-tete-objectif">{v.enTete}</p>
        {#if v.objectif === 'reduireSolde' && v.payesDepuisSolde}<p class="discret">{v.payesDepuisSolde} (jamais soustraits du solde actuel).</p>{/if}
      {/if}

      <dl class="details">
        <dt>Solde actuel</dt>
        <dd data-testid="solde-actuel">{v.soldeActuel}</dd>
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

      <p class="actions">
        <button type="button" class="principal" onclick={() => ouvrir('releve')}>Ajouter un relevé…</button>
        <button type="button" onclick={() => ouvrir('solde')}>Mettre à jour le solde actuel…</button>
        <button type="button" onclick={() => ouvrir('renseignements')}>Compléter les renseignements…</button>
        <button type="button" onclick={() => ouvrir('frais')}>Ajouter un frais…</button>
        <button type="button" onclick={() => proposer(() => proposerSuppressionCarte(donnees, jour))}>Supprimer la carte…</button>
      </p>

      {#if formulaire === 'releve'}
        <form
          class="formulaire encadre"
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
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
        </form>
      {:else if formulaire === 'solde'}
        <form
          class="formulaire encadre"
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
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
        </form>
      {:else if formulaire === 'renseignements'}
        <form
          class="formulaire encadre"
          data-testid="formulaire-renseignements-carte"
          onsubmit={(e) => {
            e.preventDefault();
            proposer(() => proposerRenseignementsCarte(donnees, { limite: fLimite, taux: fTaux }, jour));
          }}
        >
          <label>Limite ($) <input inputmode="decimal" bind:value={fLimite} /></label>
          <label>Taux annuel (%) <input inputmode="decimal" bind:value={fTaux} /></label>
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
        </form>
      {:else if formulaire === 'frais'}
        <form
          class="formulaire encadre"
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
          <button type="submit" class="principal">Enregistrer</button>
          <button type="button" onclick={() => (formulaire = null)}>Fermer</button>
        </form>
      {/if}

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
            {#each [...r.apresEcheance, ...r.notesEcheance] as note (note)}
              <p class="note-date">{note}</p>
            {/each}
            {#if r.constatMinimum}<p class="constat" data-testid="constat-minimum">{r.constatMinimum}</p>{/if}
            <p class="constat" data-testid="constat-solde">{r.constatSolde}</p>
          </article>
        {/each}
        <p class="discret">Ce suivi se recalcule à chaque affichage, à partir de tes confirmations et de ta planification. Les données du relevé, elles, ne changent pas.</p>
      {/if}
    </article>
  {/if}
</section>

<style>
  section {
    max-width: 1100px;
    margin-top: var(--espace-6);
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
  h3 {
    font-size: var(--taille-texte);
    margin: 0;
  }
  h4 {
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
    margin: var(--espace-6) 0 var(--espace-2);
  }
  h5 {
    font-size: var(--taille-texte);
    margin: 0;
  }
  .resume,
  .originales,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-6);
    margin: var(--espace-2) 0 0;
  }
  .actions {
    gap: var(--espace-3);
    margin-top: var(--espace-4);
  }
  .objectif {
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--arrondi);
    padding: var(--espace-2) var(--espace-4);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  .objectif legend {
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
  }
  .objectif label {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: var(--espace-1);
    margin-right: var(--espace-6);
    color: inherit;
    font-size: var(--taille-texte);
  }
  .en-tete {
    font-size: 17px;
    font-weight: 600;
    margin: var(--espace-3) 0 var(--espace-1);
  }
  .details,
  .suivi {
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
  .paiement,
  .frais {
    display: block;
  }
  .paiement {
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
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
  .releve {
    border-top: 1px solid var(--couleur-bordure);
    padding-top: var(--espace-3);
    margin-top: var(--espace-3);
  }
  .constat {
    margin: var(--espace-1) 0;
  }
  .note-date {
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
    margin: var(--espace-1) 0;
  }
  .discret {
    color: var(--couleur-texte-discret);
    font-size: var(--taille-petit);
  }
  .attention {
    color: var(--couleur-attention);
    font-size: var(--taille-petit);
  }
</style>
