<script lang="ts">
  // V1 lot 4 : la paie actuelle et la suivante côte à côte (revenus −
  // dépenses prévues = disponible planifié), puis la 3e et la 4e en aperçu.
  // Présentation seulement : les chiffres viennent tels quels du noyau.
  import { CalendarDays, ArrowRight, CircleAlert } from '@lucide/svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import MontantCle from '../base/MontantCle.svelte';
  import LigneMontant from '../base/LigneMontant.svelte';
  import Pastille from '../base/Pastille.svelte';
  import BarreProgression from '../base/BarreProgression.svelte';
  import Icone from '../base/Icone.svelte';
  import Illustration from '../base/Illustration.svelte';
  import type { Cycle, Ligne } from '../../noyau/cycles';
  import { formaterDateCourte, type DateCivile } from '../../noyau/dates';
  import { formaterMontant, type Cents } from '../../noyau/montants';

  interface Props {
    cycles: Cycle[];
    courant: DateCivile | null;
    /** Libellé lisible d'une ligne (prêt, carte, compte…). */
    libelle: (l: Ligne) => string;
    onvoir: (dateOrigine: DateCivile) => void;
  }
  let { cycles, courant, libelle, onvoir }: Props = $props();

  const debut = $derived(Math.max(0, courant === null ? 0 : cycles.findIndex((c) => c.paie.dateOrigine === courant)));
  const quatre = $derived(cycles.slice(debut, debut + 4));
  const texte = (m: Cents | null) => (m === null ? 'À compléter' : formaterMontant(m));
  const periode = (c: Cycle) => `${formaterDateCourte(c.debut)} → ${formaterDateCourte(c.fin)}`;
  /** Les dépenses principales : les montants inconnus d'abord (à compléter), puis les plus grosses. */
  const principales = (c: Cycle) =>
    c.lignes
      .filter((l) => l.nature === 'depense' && !l.retiree)
      .sort((a, b) => (a.montant === null ? -1 : b.montant === null ? 1 : b.montant - a.montant))
      .slice(0, 4);
  const STATUT: Record<string, { etat: 'confirme' | 'prevu' | 'alerte' | 'neutre'; texte: string }> = {
    confirme: { etat: 'confirme', texte: 'Payé' },
    aVerifier: { etat: 'alerte', texte: 'À vérifier' },
    aVenir: { etat: 'prevu', texte: 'À venir' },
    enveloppe: { etat: 'neutre', texte: 'Enveloppe' },
  };
</script>

{#snippet principale(c: Cycle, titre: string, teinte: 'sauge' | 'peche', illustration: 'licorne' | 'calendrier')}
  <div class="paie-principale" data-testid="paie-principale" data-cycle-carte={c.paie.dateOrigine}>
    <CarteBandeau {titre} {teinte} icone={CalendarDays}>
      {#snippet badge()}
        {#if c.aVerifier > 0}
          <Pastille etat="alerte"><Icone icone={CircleAlert} taille={15} /> {c.aVerifier} à vérifier</Pastille>
        {:else if c.estimation}
          <Pastille etat="prevu">Estimation</Pastille>
        {:else}
          <Pastille>{periode(c)}</Pastille>
        {/if}
      {/snippet}
      <div class="haut">
        <div class="chiffres">
          <MontantCle montant={c.disponible} libelle={`Disponible planifié — paie du ${formaterDateCourte(c.paie.date)}`} />
          {#if c.disponible !== null && c.revenus !== null}
            <BarreProgression valeur={c.disponible} cible={c.revenus} libelle="Part des revenus encore disponible" teinte={teinte === 'sauge' ? 'fraiche' : 'chaude'} sansPourcentage />
          {/if}
        </div>
        <span class="ill"><Illustration nom={illustration} largeur={104} hauteur={92} /></span>
      </div>
      <p class="equation" data-testid="equation">
        <span><span class="discret-eq">Revenus</span> <strong>{texte(c.revenus)}</strong></span>
        <span class="op">−</span>
        <span><span class="discret-eq">Dépenses prévues</span> <strong>{texte(c.sorties)}</strong></span>
        <span class="op">=</span>
        <span><span class="discret-eq">Disponible</span> <strong>{texte(c.disponible)}</strong></span>
      </p>
      <div class="panneau-v1">
        <h3>Dépenses principales de cette paie</h3>
        {#if principales(c).length === 0}
          <p class="vide">Aucune sortie prévue.</p>
        {:else}
          <ul>
            {#each principales(c) as l (`${l.elementId}|${l.origine}`)}
              <LigneMontant libelle={libelle(l)} montant={l.statut === 'confirme' && l.confirmation ? l.confirmation.montant : l.montant}>
                {#snippet fin()}<Pastille etat={STATUT[l.statut]?.etat ?? 'neutre'}>{STATUT[l.statut]?.texte ?? ''}</Pastille>{/snippet}
              </LigneMontant>
            {/each}
          </ul>
        {/if}
      </div>
      <p class="action">
        <button type="button" class={teinte === 'peche' ? 'principal' : 'contour'} onclick={() => onvoir(c.paie.dateOrigine)}>
          Voir le détail complet <Icone icone={ArrowRight} taille={18} />
        </button>
      </p>
    </CarteBandeau>
  </div>
{/snippet}

{#snippet apercu(c: Cycle, titre: string, teinte: 'rose' | 'lilas', fond: 'rose' | 'sauge')}
  <div class="paie-apercu" data-testid="paie-apercu">
    <CarteBandeau {titre} {teinte} {fond} variante="teintee" icone={CalendarDays}>
      <div class="apercu-ligne">
        <MontantCle montant={c.disponible} libelle="" taille="moyen" />
        <span class="apercu-texte">Aperçu prévisionnel · paie du {formaterDateCourte(c.paie.date)}</span>
        <button type="button" class="lien voir" onclick={() => onvoir(c.paie.dateOrigine)}>Détail</button>
      </div>
    </CarteBandeau>
  </div>
{/snippet}

{#if quatre.length > 0}
  <section class="quatre-paies" aria-label="Mes quatre prochaines paies">
    <div class="deux">
      {@render principale(quatre[0]!, courant === null ? 'Première paie' : 'Paie actuelle', 'sauge', 'licorne')}
      {#if quatre[1]}{@render principale(quatre[1], 'Paie suivante', 'peche', 'calendrier')}{/if}
    </div>
    {#if quatre.length > 2}
      <div class="deux apercus">
        {@render apercu(quatre[2]!, 'Troisième paie', 'rose', 'rose')}
        {#if quatre[3]}{@render apercu(quatre[3], 'Quatrième paie', 'lilas', 'sauge')}{/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .quatre-paies {
    margin: 0 0 var(--espace-8);
    font-size: var(--texte-courant);
  }
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--espace-6);
  }
  .apercus {
    margin-top: var(--espace-5);
  }
  .haut {
    display: flex;
    align-items: center;
    gap: var(--espace-4);
  }
  .chiffres {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--espace-3);
    min-width: 0;
  }
  .ill {
    display: flex;
    flex-shrink: 0;
  }
  .equation {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--espace-1) var(--espace-3);
    margin: var(--espace-3) 0;
    font-size: var(--texte-dense);
  }
  .discret-eq {
    color: var(--couleur-texte-discret);
  }
  .op {
    font-weight: 800;
    color: var(--prune-600);
  }
  .panneau-v1 {
    background: var(--couleur-panneau);
    border-radius: var(--arrondi-panneau);
    padding: var(--espace-3) var(--espace-5);
  }
  .panneau-v1 h3 {
    margin: 0 0 var(--espace-1);
    font-size: var(--titre-bloc);
  }
  .panneau-v1 ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .vide {
    margin: 0;
    color: var(--couleur-texte-discret);
  }
  .action {
    margin: var(--espace-4) 0 0;
    text-align: center;
  }
  .action button {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-2);
    min-height: 44px;
    padding: 0 var(--espace-6);
  }
  button.contour {
    border: var(--bordure-structure);
  }
  .apercu-ligne {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--espace-3);
  }
  .apercu-texte {
    font-size: var(--texte-dense);
  }
  .voir {
    margin-left: auto;
    align-self: center;
  }
</style>
