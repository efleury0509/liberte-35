<script lang="ts">
  // Paramètres → Journal (0.16.0) : consultation seulement. Pages de 50, du
  // plus récent au plus ancien ; filtres de section, d'année et de mois
  // appliqués avant la pagination. Les mois et années sont ceux de l'heure
  // locale. « Telle qu'enregistrée » montre l'entrée exacte.
  import { onMount, tick } from 'svelte';
  import { Undo2, RotateCcw, ArrowLeft, ArrowRight } from '@lucide/svelte';
  import Pastille from './base/Pastille.svelte';
  import Icone from './base/Icone.svelte';
  import {
    FILTRES_JOURNAL,
    MOIS_JOURNAL,
    TAILLE_PAGE_JOURNAL,
    anneesCandidates,
    bornesPeriode,
    grouperParJour,
    nombrePages,
    presenterEntree,
    texteCompte,
    type EntreePresentee,
    type IdFiltreJournal,
  } from '../lib/journal';
  import { aujourdhui } from '../lib/aujourdhui';
  import type { DateCivile } from '../noyau/dates';
  import type { Plateforme } from '../lib/plateforme';

  let { plateforme }: { plateforme: Plateforme } = $props();

  const jour = aujourdhui();
  let filtre: IdFiltreJournal = $state('toutes');
  let annee: number | null = $state(null);
  let mois: number | null = $state(null);
  let page = $state(0);
  let annees: number[] = $state([]);
  let entrees: EntreePresentee[] = $state([]);
  /** Jour de la dernière entrée de la page d'avant, pour « (suite) ». */
  let precedente: DateCivile | null = $state(null);
  let total = $state(0);
  let enCours = $state(false);
  let erreur: string | null = $state(null);
  let ouvertes: Set<number> = $state(new Set());
  let titre: HTMLHeadingElement | undefined = $state();
  const jours = $derived(grouperParJour(entrees, jour, precedente));
  const pages = $derived(nombrePages(total));
  const filtreActif = $derived(filtre !== 'toutes' || annee !== null);
  /** Chaque chargement porte un numéro : une réponse dépassée est ignorée. */
  let demande = 0;

  function filtreCourant() {
    const periode = annee === null ? null : bornesPeriode(annee, mois);
    return { sections: [...FILTRES_JOURNAL.find((f) => f.id === filtre)!.sections], debut: periode?.debut ?? null, fin: periode?.fin ?? null };
  }

  async function charger(versHaut: boolean) {
    const n = ++demande;
    enCours = true;
    erreur = null;
    try {
      // Une entrée de plus en tête (la dernière de la page d'avant) pour savoir
      // si le premier jour continue : elle n'est pas affichée.
      const avecPrecedente = page > 0;
      const res = await plateforme.lireJournal({
        decalage: page * TAILLE_PAGE_JOURNAL - (avecPrecedente ? 1 : 0),
        limite: TAILLE_PAGE_JOURNAL + (avecPrecedente ? 1 : 0),
        filtre: filtreCourant(),
      });
      if (n !== demande) return;
      const lues = res.entrees.map((e) => presenterEntree(e));
      precedente = avecPrecedente && lues.length > 0 ? lues[0]!.date : null;
      entrees = avecPrecedente ? lues.slice(1) : lues;
      total = res.total;
      ouvertes = new Set();
      if (annees.length === 0 && res.plusAncien !== null) void chargerAnnees(res.plusAncien);
      if (versHaut) {
        await tick();
        titre?.scrollIntoView({ block: 'start' });
        titre?.focus({ preventScroll: true });
      }
    } catch (e) {
      if (n === demande) erreur = typeof e === 'string' ? e : 'Le journal n’a pas pu être lu. Rien n’a été modifié.';
    } finally {
      if (n === demande) enCours = false;
    }
  }

  /** Seulement les années (locales) où il y a vraiment des changements. */
  async function chargerAnnees(plusAncien: string) {
    const candidates = anneesCandidates(plusAncien, jour);
    try {
      const nombres = await plateforme.compterJournal(candidates.map((a) => bornesPeriode(a, null)));
      annees = candidates.filter((_, i) => (nombres[i] ?? 0) > 0);
    } catch {
      annees = [];
    }
  }

  /** Tout changement de filtre ramène à la page 1. */
  function filtrer() {
    page = 0;
    void charger(false);
  }
  function choisirSection(id: IdFiltreJournal) {
    filtre = id;
    filtrer();
  }
  function choisirAnnee(valeur: string) {
    annee = valeur === '' ? null : Number(valeur);
    if (annee === null) mois = null; // « Toutes les années » → « Tous les mois »
    filtrer();
  }
  function choisirMois(valeur: string) {
    mois = valeur === '' ? null : Number(valeur);
    filtrer();
  }
  function reinitialiser() {
    filtre = 'toutes';
    annee = null;
    mois = null;
    filtrer();
  }
  /** Changer de page garde les filtres et remonte au début du Journal. */
  function allerA(p: number) {
    page = Math.min(Math.max(0, p), pages - 1);
    void charger(true);
  }
  function basculer(id: number) {
    const s = new Set(ouvertes);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    ouvertes = s;
  }

  onMount(() => void charger(false));
</script>

<section aria-labelledby="titre-journal" data-testid="journal">
  <h2 id="titre-journal" tabindex="-1" bind:this={titre}>Journal des changements</h2>
  <p class="discret">Chaque changement enregistré, du plus récent au plus ancien. Consultation seulement : rien ne se modifie ici.</p>
  <div class="filtres" role="group" aria-label="Filtrer par section">
    {#each FILTRES_JOURNAL as f (f.id)}
      <button type="button" aria-pressed={filtre === f.id} class:actif={filtre === f.id} onclick={() => choisirSection(f.id)}>{f.libelle}</button>
    {/each}
  </div>
  <div class="periode">
    <label
      >Année
      <select data-testid="filtre-annee" value={annee === null ? '' : String(annee)} onchange={(e) => choisirAnnee(e.currentTarget.value)}>
        <option value="">Toutes les années</option>
        {#each annees as a (a)}<option value={String(a)}>{a}</option>{/each}
      </select>
    </label>
    <label
      >Mois
      <select data-testid="filtre-mois" disabled={annee === null} value={mois === null ? '' : String(mois)} onchange={(e) => choisirMois(e.currentTarget.value)}>
        <option value="">Tous les mois</option>
        {#if annee !== null}
          {#each MOIS_JOURNAL as m, i (m)}<option value={String(i + 1)}>{m}</option>{/each}
        {/if}
      </select>
    </label>
    {#if filtreActif}
      <button type="button" class="lien" onclick={reinitialiser}>Réinitialiser les filtres</button>
    {/if}
  </div>
  {#if annee === null}<p class="petit discret">Choisis une année pour filtrer par mois.</p>{/if}

  {#if erreur}
    <p role="alert" class="erreur">{erreur}</p>
  {:else if !enCours && total === 0}
    <p class="discret" data-testid="journal-vide">
      {annee !== null ? 'Aucun changement pour cette période.' : filtre !== 'toutes' ? 'Aucun changement dans cette section.' : 'Aucun changement enregistré pour l’instant.'}
    </p>
  {/if}

  {#each jours as j (j.date)}
    <h3 class="jour">{j.titre}</h3>
    <ul class="entrees">
      {#each j.entrees as e (e.id)}
        <li data-testid="entree-journal">
          <span class="heure">{e.heure}</span>
          <div class="contenu">
            <p class="titre-entree">
              <Pastille>{e.section}</Pastille>
              {#if e.marque === 'annulation'}<Pastille etat="a-completer"><Icone icone={Undo2} taille={14} /> Annulé</Pastille>{/if}
              {#if e.marque === 'restauration'}<Pastille etat="prevu"><Icone icone={RotateCcw} taille={14} /> Restauration</Pastille>{/if}
              <strong>{e.titre}</strong>
            </p>
            {#if e.detail}<p class="detail">{e.detail}</p>{/if}
            {#if e.motif}<p class="detail"><em>{e.motif}</em></p>{/if}
            <button type="button" class="lien petit" aria-expanded={ouvertes.has(e.id)} onclick={() => basculer(e.id)}>
              {ouvertes.has(e.id) ? 'Masquer' : 'Voir'} l’entrée telle qu’enregistrée
            </button>
            {#if ouvertes.has(e.id)}
              <dl class="brut" data-testid="entree-brute">
                <dt>Numéro</dt><dd>{e.brute.id}</dd>
                <dt>Moment</dt><dd>{e.brute.horodatage} (heure universelle)</dd>
                <dt>Section</dt><dd>{e.brute.section}</dd>
                <dt>Objet</dt><dd>{e.brute.objet}</dd>
                <dt>Champ</dt><dd>{e.brute.champ}</dd>
                <dt>Avant</dt><dd>{e.brute.ancienneValeur ?? '—'}</dd>
                <dt>Après</dt><dd>{e.brute.nouvelleValeur ?? '—'}</dd>
                {#if e.brute.motif}<dt>Motif</dt><dd>{e.brute.motif}</dd>{/if}
              </dl>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/each}

  {#if total > 0}
    <nav class="pages" aria-label="Pages du journal">
      <button type="button" class="contour" disabled={enCours || page === 0} onclick={() => allerA(page - 1)}>
        <Icone icone={ArrowLeft} taille={16} /> Plus récents
      </button>
      <span class="discret" data-testid="compte-journal" aria-live="polite">{texteCompte(page, total)}</span>
      <button type="button" class="contour" disabled={enCours || page >= pages - 1} onclick={() => allerA(page + 1)}>
        Plus anciens <Icone icone={ArrowRight} taille={16} />
      </button>
    </nav>
  {/if}
</section>

<style>
  h2 {
    font-size: var(--titre-carte);
    margin: 0 0 var(--espace-2);
  }
  .discret {
    color: var(--couleur-texte-discret);
  }
  .filtres {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
    margin: var(--espace-4) 0 var(--espace-2);
  }
  .filtres button {
    border-radius: var(--arrondi-pilule);
    font-size: var(--texte-petit);
    padding: var(--espace-1) var(--espace-3);
    min-height: 0;
  }
  .filtres button.actif {
    background: var(--prune-700);
    color: var(--creme-50);
    border-color: var(--prune-700);
  }
  .jour {
    font-family: var(--police-titre);
    font-size: var(--titre-bloc);
    margin: var(--espace-6) 0 var(--espace-2);
    padding-bottom: var(--espace-2);
    border-bottom: 2px solid var(--sorbet-rose);
  }
  .entrees {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .entrees li {
    display: grid;
    grid-template-columns: 5.5em minmax(0, 1fr);
    gap: var(--espace-4);
    padding: var(--espace-3) 0;
    border-bottom: 1px dashed var(--couleur-bordure);
  }
  .heure {
    font-weight: 700;
    padding-top: 3px;
  }
  .titre-entree {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--espace-2);
    margin: 0;
  }
  .detail {
    margin: var(--espace-1) 0 0;
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
  }
  .petit {
    font-size: var(--texte-petit);
    margin-top: var(--espace-1);
  }
  .brut {
    display: grid;
    grid-template-columns: 6em minmax(0, 1fr);
    gap: 2px var(--espace-3);
    margin: var(--espace-2) 0 0;
    padding: var(--espace-2) var(--espace-3);
    background: var(--couleur-panneau);
    border-radius: 10px;
    font-size: var(--texte-petit);
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }
  .brut dt {
    font-weight: 700;
  }
  .brut dd {
    margin: 0;
  }
  h2 {
    scroll-margin-top: var(--espace-6);
  }
  h2:focus {
    outline: none;
  }
  .periode {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-4);
    align-items: flex-end;
    margin: var(--espace-3) 0 var(--espace-1);
  }
  .periode label {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-size: var(--texte-petit);
    font-weight: 700;
  }
  .periode .lien {
    margin-bottom: var(--espace-2);
  }
  .pages {
    display: flex;
    gap: var(--espace-4);
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    margin: var(--espace-6) 0 0;
  }
  .erreur {
    color: var(--couleur-erreur);
  }
</style>
