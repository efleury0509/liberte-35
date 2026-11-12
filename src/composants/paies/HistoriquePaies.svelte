<script lang="ts">
  // H2 : les paies terminées, par année et par mois. Chaque paie s'ouvre dans
  // la grande fenêtre de détail, où les mécanismes habituels (confirmer,
  // corriger, ajuster…) restent disponibles. « Terminée » et l'état de
  // vérification sont deux indications séparées.
  import { ChevronRight } from '@lucide/svelte';
  import Icone from '../base/Icone.svelte';
  import Pastille from '../base/Pastille.svelte';
  import type { Cycle } from '../../noyau/cycles';
  import { formaterDateCourte, formaterDateLongue } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';
  import { anneesHistorique, moisHistorique, texteVerification } from '../../lib/historique';

  interface Props {
    cycles: Cycle[];
    annee: number | null;
    seulementAVerifier: boolean;
    onouvrir: (c: Cycle) => void;
  }
  let { cycles, annee = $bindable(), seulementAVerifier = $bindable(), onouvrir }: Props = $props();

  const annees = $derived(anneesHistorique(cycles));
  const anneeAffichee = $derived(annee !== null && annees.some((a) => a.annee === annee) ? annee : (annees[0]?.annee ?? null));
  const mois = $derived(anneeAffichee === null ? [] : moisHistorique(cycles, anneeAffichee, seulementAVerifier));
  const texte = (m: number | null) => (m === null ? 'À compléter' : formaterMontant(m));
</script>

{#if annees.length === 0}
  <p class="discret" data-testid="historique-vide">Aucune paie terminée pour l’instant.</p>
{:else}
  <div class="outils">
    <label class="en-ligne annee"
      >Année
      <select
        value={anneeAffichee}
        onchange={(e) => (annee = Number((e.currentTarget as HTMLSelectElement).value))}
        data-testid="choix-annee"
      >
        {#each annees as a (a.annee)}
          <option value={a.annee}>{a.annee} — {a.paies === 1 ? '1 paie' : `${a.paies} paies`}{a.aVerifier > 0 ? `, ${texteVerification(a.aVerifier)}` : ''}</option>
        {/each}
      </select>
    </label>
    <label class="en-ligne"><input type="checkbox" bind:checked={seulementAVerifier} data-testid="filtre-a-verifier" /> Seulement les paies qui ont des éléments à vérifier</label>
  </div>

  {#if mois.length === 0}
    <p class="discret" data-testid="historique-vide">
      {seulementAVerifier ? `Rien à vérifier dans les paies terminées de ${anneeAffichee}.` : `Aucune paie terminée en ${anneeAffichee}.`}
    </p>
  {/if}

  {#each mois as m (m.cle)}
    <section class="mois" aria-labelledby={`mois-${m.cle}`} data-testid="mois-historique">
      <h3 id={`mois-${m.cle}`}>{m.libelle}</h3>
      <ul>
        {#each m.cycles as c (c.paie.dateOrigine)}
          <li>
            <button
              type="button"
              class="paie"
              data-testid="paie-terminee"
              data-cycle={c.paie.dateOrigine}
              aria-label={`Paie du ${formaterDateLongue(c.paie.date)} — terminée, ${texteVerification(c.aVerifier)} — voir le détail`}
              onclick={() => onouvrir(c)}
            >
              <span class="quand">
                <strong>Paie du {formaterDateCourte(c.paie.date)}</strong>
                <span class="periode">{formaterDateCourte(c.debut)} → {formaterDateCourte(c.fin)}</span>
              </span>
              <span class="dispo">
                <span class="etiquette">Disponible planifié</span>
                <span class="valeur" class:inconnu={c.disponible === null}>{texte(c.disponible)}</span>
              </span>
              <span class="etats">
                <Pastille>Terminée</Pastille>
                <Pastille etat={c.aVerifier > 0 ? 'alerte' : 'confirme'}>{texteVerification(c.aVerifier)}</Pastille>
              </span>
              <span class="chevron" aria-hidden="true"><Icone icone={ChevronRight} taille={18} /></span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/if}

<style>
  .outils {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--espace-3) var(--espace-6);
    margin: 0 0 var(--espace-4);
  }
  .annee select {
    margin-left: var(--espace-2);
  }
  .mois {
    max-width: 960px;
    margin: 0 0 var(--espace-5);
  }
  h3 {
    font-size: var(--titre-bloc);
    margin: 0 0 var(--espace-2);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 2px solid var(--couleur-bordure);
    border-radius: var(--arrondi-panneau);
    background: var(--couleur-surface);
    overflow: hidden;
  }
  li + li {
    border-top: 1px solid var(--couleur-bordure);
  }
  .paie {
    display: grid;
    grid-template-columns: minmax(170px, 1.2fr) minmax(150px, 1fr) minmax(220px, 1.3fr) auto;
    align-items: center;
    gap: var(--espace-4);
    width: 100%;
    min-height: 0;
    padding: var(--espace-3) var(--espace-4);
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    text-align: left;
    cursor: pointer;
  }
  .paie:hover,
  .paie:focus-visible {
    background: color-mix(in srgb, var(--prune-300) 22%, transparent);
  }
  .paie:focus-visible {
    outline: 2px solid var(--couleur-focus);
    outline-offset: -3px;
  }
  .quand,
  .dispo {
    display: flex;
    flex-direction: column;
  }
  .periode,
  .etiquette {
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
  .valeur {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
  .etats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
  }
  .chevron {
    display: inline-flex;
    color: var(--prune-600);
    opacity: 0.5;
  }
  .paie:hover .chevron,
  .paie:focus-visible .chevron {
    opacity: 1;
  }
</style>
