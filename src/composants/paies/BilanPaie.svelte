<script lang="ts">
  // H3 : mini-bilan d'une paie terminée, en tête de sa grande fenêtre.
  // Prévu et confirmé côte à côte, ce qui reste à vérifier, les enveloppes
  // comme montants prévus. Aucun écart, aucun solde bancaire.
  import { ArrowDownLeft, ArrowUpRight, ShoppingBasket } from '@lucide/svelte';
  import Icone from '../base/Icone.svelte';
  import Pastille from '../base/Pastille.svelte';
  import type { Cycle, Ligne } from '../../noyau/cycles';
  import { formaterDateCourte } from '../../noyau/dates';
  import { formaterMontant, type Cents } from '../../noyau/montants';
  import { bilanPaie, type ColonneBilan } from '../../lib/bilan';
  import { texteVerification } from '../../lib/historique';

  interface Props {
    cycle: Cycle;
    libelle: (l: Ligne) => string;
  }
  let { cycle, libelle }: Props = $props();

  const b = $derived(bilanPaie(cycle));
  const texte = (m: Cents | null) => (m === null ? 'À compléter' : formaterMontant(m));
  const confirmees = (k: ColonneBilan) => (k.operations === 1 ? `${k.confirmees} sur 1 opération` : `${k.confirmees} sur ${k.operations} opérations`);
  const aVerifier = $derived([
    ...(b.paieAVerifier ? [`la paie du ${formaterDateCourte(cycle.paie.date)}`] : []),
    ...b.aVerifier.map((l) => `${libelle(l)}${l.echeance ? ` (${formaterDateCourte(l.echeance)})` : ''}`),
  ]);
</script>

{#snippet colonne(titre: string, k: ColonneBilan, icone: typeof ArrowDownLeft, testid: string)}
  <div class="bloc" data-testid={testid}>
    <h4><Icone {icone} taille={18} /> {titre}</h4>
    {#if k.operations === 0}
      <p class="vide">Aucune dans cette paie.</p>
    {:else}
      <dl>
        <div>
          <dt>Prévu</dt>
          <dd class:inconnu={k.prevu === null} data-testid="prevu">{texte(k.prevu)}</dd>
        </div>
        <div>
          <dt>Confirmé</dt>
          <dd data-testid="confirme">
            {#if k.confirmees === 0}<span class="aucune">Aucune confirmation</span>{:else}{formaterMontant(k.confirme)}{/if}
            <span class="compte">{confirmees(k)}</span>
          </dd>
        </div>
      </dl>
    {/if}
  </div>
{/snippet}

<section class="bilan" aria-labelledby="titre-bilan" data-testid="bilan-paie">
  <header>
    <h3 id="titre-bilan">Bilan de cette paie</h3>
    <span class="etats">
      <Pastille>Terminée</Pastille>
      <Pastille etat={cycle.aVerifier > 0 ? 'alerte' : 'confirme'}>{texteVerification(cycle.aVerifier)}</Pastille>
    </span>
  </header>

  <div class="colonnes">
    {@render colonne('Revenus', b.revenus, ArrowDownLeft, 'bilan-revenus')}
    {@render colonne('Sorties', b.sorties, ArrowUpRight, 'bilan-sorties')}
    <div class="bloc" data-testid="bilan-enveloppes">
      <h4><Icone icone={ShoppingBasket} taille={18} /> Enveloppes</h4>
      {#if b.enveloppes.nombre === 0}
        <p class="vide">Aucune dans cette paie.</p>
      {:else}
        <dl>
          <div>
            <dt>Prévu</dt>
            <dd class:inconnu={b.enveloppes.prevu === null} data-testid="prevu">{texte(b.enveloppes.prevu)}</dd>
          </div>
        </dl>
        <p class="note">Montant prévu seulement : une enveloppe ne se confirme pas.</p>
      {/if}
    </div>
  </div>

  {#if aVerifier.length > 0}
    <p class="a-verifier" data-testid="bilan-a-verifier"><strong>À vérifier :</strong> {aVerifier.join(', ')}.</p>
  {:else}
    <p class="tout-verifie" data-testid="bilan-a-verifier">Rien à vérifier dans cette paie.</p>
  {/if}

  {#if b.retirees > 0 || b.nonComptes > 0 || b.avecReserve}
    <ul class="notes">
      {#if b.retirees > 0}<li>{b.retirees === 1 ? '1 opération retirée cette fois' : `${b.retirees} opérations retirées cette fois`} : jamais comptée{b.retirees === 1 ? '' : 's'}.</li>{/if}
      {#if b.nonComptes > 0}<li>Revenus incertains non confirmés : {formaterMontant(b.nonComptes)}, affichés mais pas comptés dans le prévu.</li>{/if}
      {#if b.avecReserve}<li>Une partie des sorties est payée avec une réserve d’épargne : le prévu montre le montant complet de chaque dépense.</li>{/if}
    </ul>
  {/if}
  <p class="avis">« Confirmé » additionne ce que tu as confirmé : ce n’est pas le solde de ton compte.</p>
</section>

<style>
  .bilan {
    margin: 0 0 var(--espace-5);
    padding: var(--espace-4) var(--espace-5);
    border: 2px solid var(--couleur-bordure);
    border-radius: var(--arrondi-panneau);
    background: var(--couleur-panneau);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-2) var(--espace-4);
    margin: 0 0 var(--espace-3);
  }
  h3 {
    margin: 0;
    font-size: var(--titre-bloc);
  }
  .etats {
    display: flex;
    gap: var(--espace-2);
  }
  .colonnes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--espace-3);
  }
  .bloc {
    padding: var(--espace-3) var(--espace-4);
    border-radius: var(--arrondi);
    background: var(--couleur-surface);
  }
  h4 {
    display: flex;
    align-items: center;
    gap: var(--espace-2);
    margin: 0 0 var(--espace-2);
    font-size: var(--texte-courant);
    color: var(--prune-700);
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2) var(--espace-6);
    margin: 0;
  }
  dt {
    font-size: var(--texte-petit);
    font-weight: 700;
    color: var(--couleur-texte-discret);
  }
  dd {
    margin: 0;
    font-weight: 800;
    font-size: var(--titre-bloc);
    font-variant-numeric: tabular-nums;
  }
  .compte {
    display: block;
    font-size: var(--texte-petit);
    font-weight: 600;
    color: var(--couleur-texte-discret);
  }
  .aucune {
    font-size: var(--texte-dense);
    font-weight: 600;
    color: var(--couleur-texte-discret);
  }
  .inconnu {
    color: var(--etat-a-completer-texte);
  }
  .vide,
  .note {
    margin: 0;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
  .note {
    margin-top: var(--espace-2);
  }
  .a-verifier,
  .tout-verifie {
    margin: var(--espace-3) 0 0;
    font-size: var(--texte-dense);
  }
  .a-verifier {
    color: var(--etat-alerte-texte);
  }
  .notes {
    margin: var(--espace-2) 0 0;
    padding-left: var(--espace-5);
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
  .avis {
    margin: var(--espace-2) 0 0;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
</style>
