<script lang="ts">
  import { untrack } from 'svelte';
  // Étape A : les réserves d'un compte (virtuelles : elles découpent la valeur
  // suivie, elles ne l'augmentent jamais). Réserves + non réservé = valeur suivie.
  import type { Proposition } from '../../actions/paie';
  import {
    proposerAffectation,
    proposerAjusterReserves,
    proposerArretReserve,
    proposerLiberation,
    proposerModificationReserve,
    proposerReaffectation,
    proposerRepartition,
    proposerRepriseReserve,
    proposerRetourRepartition,
    proposerSuppressionReserve,
    proposerSuspensionReserve,
    vueReserves,
    type VueReserve,
  } from '../../actions/reserves';
  import { partsDe } from '../../actions/couvertures';
  import { proposerReserveAvecAffectation } from '../../actions/epargneV1';
  import FenetreFormulaire from '../base/FenetreFormulaire.svelte';
  import MenuActions from '../base/MenuActions.svelte';
  import { avecAnnee } from '../../actions/comptes';
  import { formaterMontant } from '../../noyau/montants';
  import type { DateCivile } from '../../noyau/dates';
  import type { DonneesPaie } from '../../lib/plateforme';

  interface Props {
    donnees: DonneesPaie;
    compteId: string;
    ferme: boolean;
    contributions: { id: string; texte: string; arretee: boolean }[];
    jour: DateCivile;
    proposer: (f: () => Proposition) => void;
    /** Message d'erreur de la dernière proposition (affiché dans la fenêtre ouverte). */
    erreur?: string | null;
    contexteCompte?: string;
    /** Prévient le parent qu'une fenêtre de réserve est ouverte ou fermée. */
    onformulaire?: (ouvert: boolean) => void;
  }
  let { donnees, compteId, ferme, contributions, jour, proposer, erreur = null, contexteCompte = '', onformulaire }: Props = $props();

  const vue = $derived(vueReserves(donnees, compteId, jour));
  const compte = $derived(donnees.comptes.find((k) => k.id === compteId)!);
  const nomReserve = (id: string) => compte.reserves?.find((r) => r.id === id)?.nom ?? '?';

  type Form = 'nouvelle' | 'modifier' | 'affecter' | 'reaffecter' | 'liberer' | 'suspendre' | 'reprendre' | 'arreter' | 'ajuster' | 'repartir' | 'repartir-paie';
  let form: Form | null = $state(null);
  const TITRES: Record<Form, string> = {
    nouvelle: 'Nouvelle réserve',
    modifier: 'Modifier la réserve',
    affecter: 'Affecter à la réserve',
    reaffecter: 'Réaffecter',
    liberer: 'Libérer',
    suspendre: 'Suspendre la réserve',
    reprendre: 'Reprendre la réserve',
    arreter: 'Arrêter la réserve',
    ajuster: 'Ajuster mes réserves',
    repartir: 'Répartir la contribution',
    'repartir-paie': 'Répartir une seule paie',
  };
  let fPremiere = $state('');
  // Prévenir le parent seulement quand l'état ouvert/fermé change.
  let dernierEtat = false;
  $effect(() => {
    const ouvert = form !== null;
    if (ouvert !== dernierEtat) {
      dernierEtat = ouvert;
      untrack(() => onformulaire?.(ouvert));
    }
  });
  let cible: string | null = $state(null);
  let ouverteHisto: string | null = $state(null);
  let fNom = $state('');
  let fSorte: 'permanente' | 'ponctuelle' = $state('permanente');
  let fCible = $state('');
  let fDate = $state('');
  let fFreq = $state('');
  let fNote = $state('');
  let fMontant = $state('');
  let fVers = $state('');
  let fMode: 'une' | 'prorata' = $state('une');
  let fParts: Record<string, string> = $state({});

  // Un enregistrement (nouvelles données) ferme le formulaire ouvert.
  let derniereDonnees: DonneesPaie | null = null;
  $effect(() => {
    if (derniereDonnees !== null && donnees !== derniereDonnees) form = null;
    derniereDonnees = donnees;
  });

  function ouvrir(f: Form, id: string | null = null) {
    form = f;
    cible = id;
    fNom = fCible = fFreq = fNote = fMontant = fVers = fPremiere = '';
    fDate = f === 'nouvelle' || f === 'modifier' ? '' : jour;
    fSorte = 'permanente';
    fMode = 'une';
    fParts = {};
    const r = id ? compte.reserves?.find((x) => x.id === id) : undefined;
    if (f === 'modifier' && r) {
      fNom = r.nom;
      fSorte = r.sorte;
      fCible = r.cible === null ? '' : String(r.cible / 100).replace('.', ',');
      fDate = r.date ?? '';
      fFreq = r.frequenceMois === null ? '' : String(r.frequenceMois);
      fNote = r.note ?? '';
    }
    if ((f === 'repartir' || f === 'repartir-paie') && id) {
      for (const p of partsDe(compte, id, jour)) fParts[p.reserveId] = String(p.montant / 100).replace('.', ',');
    }
  }
  const fermer = () => (form = null);
  const autres = (id: string) => vue.actives.filter((r) => r.id !== id && r.etat === 'active');
  const repartitionTexte = (elementId: string) => {
    const parts = (compte.repartitions ?? []).find((r) => r.elementId === elementId && r.origine === null)?.parts ?? [];
    return parts.length === 0 ? 'tout au non réservé' : parts.map((p) => `${formaterMontant(p.montant)} → « ${nomReserve(p.reserveId)} »`).join(' · ');
  };
  const particulieres = (elementId: string) => (compte.repartitions ?? []).filter((r) => r.elementId === elementId && r.origine !== null && r.origine >= jour);
  const saisieReserve = () => ({ nom: fNom, sorte: fSorte, cible: fCible, date: fDate, frequenceMois: fFreq, depenseId: '', note: fNote });
</script>

{#snippet formAjuster()}
  <form
          class="formulaire"
          data-testid="formulaire-ajuster"
          onsubmit={(e) => {
            e.preventDefault();
            proposer(() => proposerAjusterReserves(donnees, compteId, fMode, fVers, jour));
          }}
        >
          <fieldset class="choix">
            <label class="en-ligne"><input type="radio" bind:group={fMode} value="une" /> Réduire une réserve</label>
            <label class="en-ligne"><input type="radio" bind:group={fMode} value="prorata" /> Réduire toutes, au prorata</label>
          </fieldset>
          {#if fMode === 'une'}
            <label
              >Réserve
              <select bind:value={fVers}>
                <option value="" disabled>Choisir…</option>
                {#each vue.actives.filter((x) => x.solde > 0) as x (x.id)}<option value={x.id}>{x.nom} ({x.soldeTexte})</option>{/each}
              </select>
            </label>
          {/if}
          <button type="submit" class="principal">Voir l’aperçu</button>
          <button type="button" onclick={fermer}>Abandonner</button>
        </form>
{/snippet}

{#snippet formRepartir(c: { id: string; texte: string })}
  <form
              class="formulaire"
              data-testid="formulaire-repartir"
              onsubmit={(e) => {
                e.preventDefault();
                proposer(() => proposerRepartition(donnees, c.id, fParts, form === 'repartir-paie' ? fDate : null, jour));
              }}
            >
              <p class="discret">
                Montants en $ ; ce qui reste va au non réservé. Si le montant réel diffère, les parts suivent la même proportion (au cent près, le reste au non réservé). Rien ne compte avant la confirmation dans Mes paies.
              </p>
              {#if form === 'repartir-paie'}<label>Paie du <input type="date" bind:value={fDate} /></label>{/if}
              {#each vue.actives.filter((x) => x.etat === 'active') as x (x.id)}
                <label>{x.nom} ($) <input inputmode="decimal" bind:value={fParts[x.id]} /></label>
              {/each}
              <button type="submit" class="principal">Enregistrer</button>
              <button type="button" onclick={fermer}>Abandonner</button>
            </form>
{/snippet}

{#snippet ligneReserve(r: VueReserve)}
  <li data-testid="reserve" data-reserve={r.nom}>
    <div class="ligne">
      <strong>{r.nom}</strong>
      <span data-testid="solde-reserve">{r.soldeTexte}</span>
      <span class="discret">
        {#if r.depense}pour la dépense « {r.depense} » ·{/if}
        cible {r.cible}{r.date ? ` le ${r.date}` : ''}{r.etat === 'suspendue' ? ' · suspendue' : ''}{r.transfereeVers ? ` · transférée vers ${r.transfereeVers}` : ''}
      </span>
    </div>
    {#if r.etat === 'arretee'}
      <button type="button" class="petit lien" onclick={() => (ouverteHisto = ouverteHisto === r.id ? null : r.id)}>{ouverteHisto === r.id ? 'Masquer l’historique' : 'Historique'}</button>
    {:else}
      <div class="ligne discret">
        {#if r.manque}<span>Il manque {r.manque}</span>{/if}
        {#if r.aReconstituer}<span class="attention">À reconstituer : {r.aReconstituer}</span>{/if}
        {#if r.surplus}<span>Surplus : {r.surplus}</span>{/if}
        {#if r.suggestion}<span data-testid="suggestion-reserve">Suggestion : {r.suggestion}</span>{/if}
      </div>
      {#if !ferme}
        <div class="boutons-ligne">
          <MenuActions nom={`réserve « ${r.nom} »`}>
            {#if r.etat === 'active'}
              <button type="button" onclick={() => ouvrir('affecter', r.id)} disabled={!vue.valeurConnue || vue.depassement !== null}>Affecter…</button>
            {/if}
            {#if r.solde > 0}
              {#if autres(r.id).length > 0}<button type="button" onclick={() => ouvrir('reaffecter', r.id)}>Réaffecter…</button>{/if}
              <button type="button" onclick={() => ouvrir('liberer', r.id)}>Libérer…</button>
            {/if}
            <button type="button" onclick={() => ouvrir('modifier', r.id)}>Modifier…</button>
            {#if r.etat === 'suspendue'}
              <button type="button" onclick={() => ouvrir('reprendre', r.id)}>Reprendre…</button>
            {:else}
              <button type="button" onclick={() => ouvrir('suspendre', r.id)}>Suspendre…</button>
            {/if}
            <button type="button" onclick={() => ouvrir('arreter', r.id)}>Arrêter…</button>
            <button type="button" onclick={() => proposer(() => proposerSuppressionReserve(donnees, compteId, r.id, jour))}>Supprimer</button>
          </MenuActions>
          <button type="button" class="petit lien" onclick={() => (ouverteHisto = ouverteHisto === r.id ? null : r.id)}>{ouverteHisto === r.id ? 'Masquer l’historique' : 'Historique'}</button>
        </div>
      {/if}
    {/if}
    {#if ouverteHisto === r.id}
      {#if r.historique.length === 0}
        <p class="discret">Aucun mouvement.</p>
      {:else}
        <ul class="historique">
          {#each r.historique as h, i (i)}<li><span class="date">{h.date}</span> {h.texte}</li>{/each}
        </ul>
      {/if}
    {/if}
  </li>
{/snippet}

{#snippet formulaire(r: VueReserve | null)}
  {#if form === 'nouvelle' || (form === 'modifier' && r)}
    <form
      class="formulaire"
      data-testid="formulaire-reserve"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => (form === 'nouvelle' ? proposerReserveAvecAffectation(donnees, compteId, saisieReserve(), fPremiere, jour) : proposerModificationReserve(donnees, compteId, r!.id, saisieReserve(), jour)));
      }}
    >
      {#if r?.depense}
        <p class="discret">Sa cible, sa date et sa fréquence viennent de la dépense « {r.depense} » : change-les dans Dépenses à prévoir.</p>
      {:else}
        <p class="discret">Une réserve découpe la valeur du compte ; elle ne la change pas.</p>
      {/if}
      <label>Nom <input bind:value={fNom} /></label>
      {#if !r?.depense}
        <fieldset class="choix">
          <label class="en-ligne"><input type="radio" bind:group={fSorte} value="permanente" /> Permanente (ex. fonds d’urgence)</label>
          <label class="en-ligne"><input type="radio" bind:group={fSorte} value="ponctuelle" /> Pour une date</label>
        </fieldset>
        <label>Cible ($, facultative) <input inputmode="decimal" bind:value={fCible} /></label>
        {#if fSorte === 'ponctuelle'}
          <label>Pour le <input type="date" bind:value={fDate} /></label>
          <label
            >Revient
            <select bind:value={fFreq}>
              <option value="">Une seule fois</option>
              <option value="12">Chaque année</option>
              <option value="6">Tous les 6 mois</option>
              <option value="3">Tous les 3 mois</option>
              <option value="1">Chaque mois</option>
            </select>
          </label>
        {/if}
      {/if}
      <label>Note (facultative) <input bind:value={fNote} /></label>
      {#if form === 'nouvelle' && vue.valeurConnue && vue.depassement === null}
        <label>Première affectation ($, facultative — depuis le non réservé : {vue.nonReserve}) <input inputmode="decimal" bind:value={fPremiere} data-testid="premiere-affectation" /></label>
      {/if}
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={fermer}>Abandonner</button>
    </form>
  {:else if (form === 'affecter' || form === 'liberer' || form === 'reaffecter') && r}
    <form
      class="formulaire"
      data-testid="formulaire-{form}"
      onsubmit={(e) => {
        e.preventDefault();
        const s = { montant: fMontant, date: fDate, note: fNote };
        proposer(() =>
          form === 'affecter' ? proposerAffectation(donnees, compteId, r.id, s, jour) : form === 'liberer' ? proposerLiberation(donnees, compteId, r.id, s, jour) : proposerReaffectation(donnees, compteId, r.id, fVers, s, jour),
        );
      }}
    >
      <p class="discret">
        {form === 'affecter' ? `Du non réservé (${vue.nonReserve}) vers « ${r.nom} ».` : form === 'liberer' ? `De « ${r.nom} » vers le non réservé.` : `De « ${r.nom} » vers une autre réserve du compte.`}
        La valeur du compte ne change pas.
      </p>
      {#if form === 'reaffecter'}
        <label
          >Vers
          <select bind:value={fVers}>
            <option value="" disabled>Choisir…</option>
            {#each autres(r.id) as x (x.id)}<option value={x.id}>{x.nom}</option>{/each}
          </select>
        </label>
      {/if}
      <label>Montant ($) <input inputmode="decimal" bind:value={fMontant} /></label>
      <label>Date <input type="date" bind:value={fDate} /></label>
      <label>Note (facultative) <input bind:value={fNote} /></label>
      <button type="submit" class="principal">Enregistrer</button>
      <button type="button" onclick={fermer}>Abandonner</button>
    </form>
  {:else if (form === 'suspendre' || form === 'reprendre') && r}
    <form
      class="formulaire"
      data-testid="formulaire-{form}"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => (form === 'suspendre' ? proposerSuspensionReserve(donnees, compteId, r.id, fDate, jour) : proposerRepriseReserve(donnees, compteId, r.id, fDate, jour)));
      }}
    >
      <p class="discret">
        {form === 'suspendre' ? 'Elle garde son solde ; ses parts de contribution iront au non réservé jusqu’à la reprise.' : 'Ses parts de contribution reviennent à partir de cette date.'}
      </p>
      <label>{form === 'suspendre' ? 'Suspendre à partir du' : 'Reprendre à partir du'} <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={fermer}>Abandonner</button>
    </form>
  {:else if form === 'arreter' && r}
    <form
      class="formulaire"
      data-testid="formulaire-arreter"
      onsubmit={(e) => {
        e.preventDefault();
        proposer(() => proposerArretReserve(donnees, compteId, r.id, { date: fDate, versId: fVers }, jour));
      }}
    >
      <p class="discret">Elle est archivée avec son historique et retirée des répartitions.{r.solde > 0 ? ` Son solde (${r.soldeTexte}) :` : ''}</p>
      {#if r.solde > 0}
        <label
          >Solde
          <select bind:value={fVers}>
            <option value="">Libérer (non réservé)</option>
            {#each autres(r.id) as x (x.id)}<option value={x.id}>Réaffecter à « {x.nom} »</option>{/each}
          </select>
        </label>
      {/if}
      <label>Arrêtée le <input type="date" bind:value={fDate} /></label>
      <button type="submit" class="principal">Voir l’aperçu</button>
      <button type="button" onclick={fermer}>Abandonner</button>
    </form>
  {/if}
{/snippet}

<div class="reserves" data-testid="reserves">
  <h4>Réserves</h4>
  <p class="resume">
    <span>Non réservé : <strong data-testid="non-reserve">{vue.nonReserve}</strong></span>
    {#if vue.actives.length > 0}<span class="discret">Réserves + non réservé = valeur suivie.</span>{/if}
  </p>
  {#if vue.depassement}
    <div class="attention encadre" data-testid="depassement">
      <p>Tes réserves dépassent la valeur du compte de <strong>{vue.depassement}</strong>. Rien n’est changé seul ; tu ne peux plus affecter tant que l’écart reste.</p>
      {#if !ferme}<button type="button" onclick={() => ouvrir('ajuster')}>Ajuster mes réserves…</button>{/if}
    </div>
  {/if}

  {#if vue.actives.length === 0}
    <p class="discret">Aucune réserve. Tout est dans le non réservé.</p>
  {:else}
    <ul class="liste">
      {#each vue.actives as r (r.id)}{@render ligneReserve(r)}{/each}
    </ul>
  {/if}
  {#if !ferme}
    <p class="boutons"><button type="button" onclick={() => ouvrir('nouvelle')}>Nouvelle réserve…</button></p>
  {/if}
  {#if vue.arretees.length > 0}
    <details>
      <summary class="discret">Réserves arrêtées ({vue.arretees.length})</summary>
      <ul class="liste">
        {#each vue.arretees as r (r.id)}{@render ligneReserve(r)}{/each}
      </ul>
    </details>
  {/if}

  {#if vue.actives.length > 0 && contributions.some((c) => !c.arretee) && !ferme}
    <h4>Répartition des contributions</h4>
    <ul class="liste" data-testid="repartitions">
      {#each contributions.filter((c) => !c.arretee) as c (c.id)}
        <li>
          <div class="ligne">
            <span>{c.texte}</span>
            <span class="discret" data-testid="repartition">{repartitionTexte(c.id)}</span>
          </div>
          {#each particulieres(c.id) as p (p.origine)}
            <div class="ligne discret">
              Paie du {avecAnnee(p.origine!)} : {p.parts.length === 0 ? 'tout au non réservé' : p.parts.map((x) => `${formaterMontant(x.montant)} → « ${nomReserve(x.reserveId)} »`).join(' · ')}
              <button type="button" class="petit" onclick={() => proposer(() => proposerRetourRepartition(donnees, c.id, p.origine!, jour))}>Revenir à l’habituelle</button>
            </div>
          {/each}
          <div class="boutons-ligne">
            <button type="button" class="petit" onclick={() => ouvrir('repartir', c.id)}>Répartir…</button>
            <button type="button" class="petit" onclick={() => ouvrir('repartir-paie', c.id)}>Répartir une seule paie…</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if form}
    {@const r = cible ? ([...vue.actives, ...vue.arretees].find((x) => x.id === cible) ?? null) : null}
    {@const c = cible ? contributions.find((x) => x.id === cible) : undefined}
    <FenetreFormulaire titre={TITRES[form]} contexte={r ? `${contexteCompte} · réserve « ${r.nom} » (${r.soldeTexte})` : c ? `${contexteCompte} · ${c.texte}` : contexteCompte} {erreur} onabandonner={fermer}>
      {#if form === 'ajuster'}
        {@render formAjuster()}
      {:else if (form === 'repartir' || form === 'repartir-paie') && c}
        {@render formRepartir(c)}
      {:else}
        {@render formulaire(r)}
      {/if}
    </FenetreFormulaire>
  {/if}
</div>

<style>
  h4 {
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  .resume,
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-1) var(--espace-4);
    align-items: baseline;
    margin: 0;
  }
  .liste,
  .historique {
    list-style: none;
    padding: 0;
    margin: var(--espace-2) 0;
  }
  .liste > li {
    padding: var(--espace-2) 0;
    border-bottom: 1px solid var(--couleur-bordure);
  }
  .historique .date {
    display: inline-block;
    min-width: 110px;
    color: var(--couleur-texte-discret);
  }
  .boutons-ligne {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
    margin-top: var(--espace-1);
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
  .attention {
    font-size: inherit;
  }
  details summary {
    cursor: pointer;
    margin-top: var(--espace-3);
  }
</style>
