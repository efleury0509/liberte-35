<script lang="ts">
  // Ligne « Auto ........ 205 $ » avec points de conduite. Inconnu : « À compléter ».
  import type { Component, Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  import { ChevronRight } from '@lucide/svelte';
  import { formaterMontant, type Cents } from '../../noyau/montants';
  import { A_COMPLETER } from '../../actions/paie';

  interface Props {
    libelle: string;
    montant: Cents | null;
    icone?: Component<{ size?: number; strokeWidth?: number }>;
    arrondi?: boolean;
    /** Élément affiché après le montant (ex. une pastille d'état). */
    fin?: Snippet;
    /** V1 lot 6b : la ligne devient cliquable (souris et clavier) et ouvre son détail. */
    onclic?: () => void;
    /** Nom accessible de la ligne cliquable. */
    titreClic?: string;
  }
  let { libelle, montant, icone, arrondi = false, fin, onclic, titreClic }: Props = $props();
  const texte = $derived(montant === null ? A_COMPLETER : arrondi && montant % 100 === 0 ? formaterMontant(montant).replace(/,00(?=\s?\$)/, '') : formaterMontant(montant));
</script>

{#snippet contenu()}
  {#if icone}<span class="icone"><Icone {icone} taille={18} /></span>{/if}
  <span class="libelle">{libelle}</span>
  <span class="conduite" aria-hidden="true"></span>
  <span class="montant" class:inconnu={montant === null}>{texte}</span>
  {#if fin}{@render fin()}{/if}
{/snippet}

{#if onclic}
  <li class="ligne-montant cliquable-li">
    <button type="button" class="ligne-cliquable" onclick={onclic} aria-label={titreClic ?? libelle} data-testid="ligne-cliquable">
      {@render contenu()}
      <span class="chevron" aria-hidden="true"><Icone icone={ChevronRight} taille={16} /></span>
    </button>
  </li>
{:else}
  <li class="ligne-montant">{@render contenu()}</li>
{/if}

<style>
  .ligne-montant {
    display: flex;
    align-items: baseline;
    gap: var(--espace-2);
    font-size: var(--texte-courant);
    padding: 3px 0;
  }
  .icone {
    align-self: center;
    color: var(--prune-600);
  }
  .conduite {
    flex: 1;
    border-bottom: 2px dotted var(--couleur-bordure-forte);
    transform: translateY(-4px);
    min-width: var(--espace-4);
  }
  .montant {
    font-weight: 700;
    white-space: nowrap;
  }
  .cliquable-li {
    padding: 0;
  }
  .ligne-cliquable {
    display: flex;
    align-items: baseline;
    gap: var(--espace-2);
    width: calc(100% + 2 * var(--espace-2));
    min-height: 0;
    margin: 0 calc(-1 * var(--espace-2));
    padding: 3px var(--espace-2);
    box-sizing: border-box;
    border: 0;
    border-radius: var(--arrondi);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ligne-cliquable:hover,
  .ligne-cliquable:focus-visible {
    background: color-mix(in srgb, var(--prune-300) 28%, transparent);
  }
  .ligne-cliquable:focus-visible {
    outline: 2px solid var(--couleur-focus);
    outline-offset: 1px;
  }
  .chevron {
    align-self: center;
    display: inline-flex;
    color: var(--prune-600);
    opacity: 0.35;
  }
  .ligne-cliquable:hover .chevron,
  .ligne-cliquable:focus-visible .chevron {
    opacity: 1;
  }
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
</style>
