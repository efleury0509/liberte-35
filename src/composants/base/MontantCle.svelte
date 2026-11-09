<script lang="ts">
  // Montant clé (« 425 $ — Disponible à planifier »). Inconnu : « À compléter », jamais 0 $.
  import { formaterMontant, type Cents } from '../../noyau/montants';
  import { A_COMPLETER } from '../../actions/paie';

  interface Props {
    montant: Cents | null;
    libelle: string;
    taille?: 'cle' | 'moyen';
    /** Arrondi au dollar pour l'affichage d'aperçu (le détail garde les cents). */
    arrondi?: boolean;
  }
  let { montant, libelle, taille = 'cle', arrondi = false }: Props = $props();
  const texte = $derived(montant === null ? A_COMPLETER : arrondi ? formaterMontant(Math.round(montant / 100) * 100).replace(/,00(?=\s?\$)/, '') : formaterMontant(montant));
</script>

<div class="montant-cle {taille}" class:inconnu={montant === null}>
  <span class="valeur" data-testid="montant-cle">{texte}</span>
  <span class="libelle">{libelle}</span>
</div>

<style>
  .montant-cle {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .valeur {
    font-family: var(--police-titre);
    font-variation-settings: 'SOFT' 100;
    font-weight: 900;
    font-size: var(--montant-cle);
    line-height: 1;
    letter-spacing: -0.01em;
    font-variant-numeric: lining-nums;
    color: var(--couleur-titre);
  }
  .moyen .valeur {
    font-size: var(--montant-moyen);
  }
  .inconnu .valeur {
    font-size: calc(var(--montant-moyen) * 0.7);
    color: var(--etat-a-completer-texte);
  }
  .libelle {
    font-size: var(--texte-courant);
    color: var(--couleur-texte);
  }
</style>
