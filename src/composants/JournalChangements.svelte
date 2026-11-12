<script lang="ts">
  // Paramètres → Journal (0.16.0) : consultation seulement. Les entrées sont
  // lues par pages de 50, mises en mots pour l'œil (jours, heure locale,
  // dates lisibles) ; « telle qu'enregistrée » montre l'entrée exacte.
  import { onMount } from 'svelte';
  import { Undo2, RotateCcw } from '@lucide/svelte';
  import Pastille from './base/Pastille.svelte';
  import Icone from './base/Icone.svelte';
  import { FILTRES_JOURNAL, grouperParJour, presenterEntree, type EntreePresentee, type IdFiltreJournal } from '../lib/journal';
  import { aujourdhui } from '../lib/aujourdhui';
  import type { Plateforme } from '../lib/plateforme';

  let { plateforme }: { plateforme: Plateforme } = $props();

  const TAILLE_PAGE = 50;
  const jour = aujourdhui();
  let filtre: IdFiltreJournal = $state('toutes');
  let entrees: EntreePresentee[] = $state([]);
  let restantes = $state(0);
  let enCours = $state(false);
  let erreur: string | null = $state(null);
  let ouvertes: Set<number> = $state(new Set());
  const jours = $derived(grouperParJour(entrees, jour));
  /** Chaque chargement porte un numéro : une réponse dépassée est ignorée. */
  let demande = 0;

  async function charger(suite: boolean) {
    const n = ++demande;
    enCours = true;
    erreur = null;
    try {
      const sections = [...FILTRES_JOURNAL.find((f) => f.id === filtre)!.sections];
      const avant = suite ? (entrees.at(-1)?.id ?? null) : null;
      const page = await plateforme.lireJournal({ avant, limite: TAILLE_PAGE, sections });
      if (n !== demande) return;
      const nouvelles = page.entrees.map((e) => presenterEntree(e));
      entrees = suite ? [...entrees, ...nouvelles] : nouvelles;
      restantes = page.restantes;
    } catch (e) {
      if (n === demande) erreur = typeof e === 'string' ? e : 'Le journal n’a pas pu être lu. Rien n’a été modifié.';
    } finally {
      if (n === demande) enCours = false;
    }
  }

  function choisir(id: IdFiltreJournal) {
    filtre = id;
    ouvertes = new Set();
    void charger(false);
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
  <h2 id="titre-journal">Journal des changements</h2>
  <p class="discret">Chaque changement enregistré, du plus récent au plus ancien. Consultation seulement : rien ne se modifie ici.</p>
  <div class="filtres" role="group" aria-label="Filtrer par section">
    {#each FILTRES_JOURNAL as f (f.id)}
      <button type="button" aria-pressed={filtre === f.id} class:actif={filtre === f.id} onclick={() => choisir(f.id)}>{f.libelle}</button>
    {/each}
  </div>

  {#if erreur}
    <p role="alert" class="erreur">{erreur}</p>
  {:else if !enCours && entrees.length === 0}
    <p class="discret" data-testid="journal-vide">{filtre === 'toutes' ? 'Aucun changement enregistré pour l’instant.' : 'Aucun changement dans cette section.'}</p>
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

  {#if entrees.length > 0}
    <p class="pied">
      {#if restantes > 0}
        <button type="button" class="contour" disabled={enCours} onclick={() => charger(true)}>Voir les changements plus anciens</button>
      {/if}
      <span class="discret" data-testid="compte-journal">
        {entrees.length === 1 ? '1 changement affiché' : `${entrees.length} changements affichés`}{restantes > 0 ? ` · ${restantes} plus ${restantes === 1 ? 'ancien' : 'anciens'}` : ''}
      </span>
    </p>
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
  .pied {
    display: flex;
    gap: var(--espace-4);
    align-items: center;
    flex-wrap: wrap;
    margin: var(--espace-6) 0 0;
  }
  .erreur {
    color: var(--couleur-erreur);
  }
</style>
