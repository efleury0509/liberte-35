<script lang="ts">
  // Ligne « Auto ........ 205 $ » avec points de conduite. Inconnu : « À compléter ».
  import type { Component, Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  import { formaterMontant, type Cents } from '../../noyau/montants';
  import { A_COMPLETER } from '../../actions/paie';

  interface Props {
    libelle: string;
    montant: Cents | null;
    icone?: Component<{ size?: number; strokeWidth?: number }>;
    arrondi?: boolean;
    /** Élément affiché après le montant (ex. une pastille d'état). */
    fin?: Snippet;
  }
  let { libelle, montant, icone, arrondi = false, fin }: Props = $props();
  const texte = $derived(montant === null ? A_COMPLETER : arrondi && montant % 100 === 0 ? formaterMontant(montant).replace(/,00(?=\s?\$)/, '') : formaterMontant(montant));
</script>

<li class="ligne-montant">
  {#if icone}<span class="icone"><Icone {icone} taille={18} /></span>{/if}
  <span class="libelle">{libelle}</span>
  <span class="conduite" aria-hidden="true"></span>
  <span class="montant" class:inconnu={montant === null}>{texte}</span>
  {#if fin}{@render fin()}{/if}
</li>

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
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
</style>
