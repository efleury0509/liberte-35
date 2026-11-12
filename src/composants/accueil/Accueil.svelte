<script lang="ts">
  // Accueil (0.16.0) : où j'en suis en dix secondes. Tout vient de vueAccueil,
  // qui reprend les chiffres de Mes paies sans nouveau calcul. Chaque bloc
  // mène à l'écran où l'on agit ; rien ne se confirme ici.
  import { onMount } from 'svelte';
  import { CalendarDays, CircleAlert, ArrowRight, ListChecks, History, ShieldCheck } from '@lucide/svelte';
  import CarteBandeau from '../base/CarteBandeau.svelte';
  import MontantCle from '../base/MontantCle.svelte';
  import Pastille from '../base/Pastille.svelte';
  import BarreProgression from '../base/BarreProgression.svelte';
  import Icone from '../base/Icone.svelte';
  import Eclats from '../base/Eclats.svelte';
  import Etoile from '../base/Etoile.svelte';
  import Illustration from '../base/Illustration.svelte';
  import BandeauSurveiller from '../base/BandeauSurveiller.svelte';
  import { vueAccueil, type CibleMesPaies, type ResumePaie, type VueAccueil } from '../../actions/accueil';
  import { texteDerniereCopie } from '../../actions/sauvegardes';
  import { momentCourt, presenterEntree, type EntreePresentee } from '../../lib/journal';
  import { aujourdhui } from '../../lib/aujourdhui';
  import type { DonneesPaie, EtatSauvegardes, Plateforme } from '../../lib/plateforme';
  import { formaterDateCourte, jourDeLaSemaine, type DateCivile } from '../../noyau/dates';
  import { formaterMontant, type Cents } from '../../noyau/montants';

  interface Props {
    plateforme: Plateforme;
    onouvrirpaies: (cible: CibleMesPaies | null) => void;
    onjournal: () => void;
    /** 0.22.0 : la configuration guidée commencée, à reprendre (null : rien à proposer). */
    invitation?: { etape: number; libelle: string } | null;
    onreprendre?: () => void;
    onmasquer?: () => void;
  }
  let { plateforme, onouvrirpaies, onjournal, invitation = null, onreprendre, onmasquer }: Props = $props();

  const jour = aujourdhui();
  let donnees: DonneesPaie | null = $state(null);
  let erreur: string | null = $state(null);
  let derniers: EntreePresentee[] = $state([]);
  let sauvegardes: EtatSauvegardes | null = $state(null);

  onMount(async () => {
    try {
      donnees = await plateforme.lirePaie();
    } catch (e) {
      erreur = typeof e === 'string' ? e : 'Impossible de lire les données de paie.';
      return;
    }
    // Secondaires : un échec ici ne cache pas l'essentiel.
    try {
      derniers = (await plateforme.lireJournal({ decalage: 0, limite: 3 })).entrees.map((e) => presenterEntree(e));
    } catch {
      derniers = [];
    }
    try {
      sauvegardes = await plateforme.etatSauvegardes();
    } catch {
      sauvegardes = null;
    }
  });

  const calcul: { vue: VueAccueil | null; erreur: string | null } = $derived.by(() => {
    if (!donnees) return { vue: null, erreur: null };
    try {
      return { vue: vueAccueil(donnees, jour), erreur: null };
    } catch (e) {
      return { vue: null, erreur: e instanceof Error ? e.message : String(e) };
    }
  });
  const vue = $derived(calcul.vue);

  const texte = (m: Cents | null) => (m === null ? 'À compléter' : formaterMontant(m));
  const periode = (r: ResumePaie) => `${formaterDateCourte(r.cycle.debut)} → ${formaterDateCourte(r.cycle.fin)}`;
  const dateBientot = (d: DateCivile) => `${jourDeLaSemaine(d).slice(0, 3)}. ${formaterDateCourte(d)}`;
  const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;
</script>

{#snippet bienvenue(phrase: string | null)}
  <section class="bienvenue" aria-labelledby="titre-section" data-testid="bienvenue">
    <div class="textes">
      <h1 id="titre-section" class="visuellement-cache">Bonjour !</h1>
      <p class="date" data-testid="date-accueil">
        {vue?.jourSemaine ?? ''}<br />{vue?.jourMois ?? ''}
      </p>
      <Eclats />
      {#if phrase}<p class="phrase" data-testid="phrase-accueil">{phrase}</p>{/if}
      <span class="etoiles" aria-hidden="true"><Etoile taille={22} teinte="beurre" /><Etoile taille={14} teinte="peche" /></span>
    </div>
    <div class="loutre"><Illustration nom="loutre-bienvenue" /></div>
  </section>
{/snippet}

{#snippet reprise()}
  {#if invitation}
    <section class="reprise" aria-labelledby="titre-reprise" data-testid="reprise-configuration">
      <div>
        <h2 id="titre-reprise">{invitation.etape <= 1 ? 'Configurer Liberté 35' : 'Reprendre ma configuration'}</h2>
        <p>
          {#if invitation.etape <= 1}Le guide t’accompagne pas à pas : ta paie, tes dépenses, tes dettes et ton épargne.{:else}Tu t’étais arrêtée à l’étape {invitation.etape} sur 6 : {invitation.libelle}.{/if}
        </p>
        <div class="progression" aria-hidden="true"><span style:width={`${Math.round(((invitation.etape - 1) / 5) * 100)}%`}></span></div>
      </div>
      <div class="boutons-reprise">
        <button type="button" class="principal" onclick={() => onreprendre?.()} data-testid="reprendre-configuration">
          {invitation.etape <= 1 ? 'Commencer ma configuration' : 'Reprendre'} <Icone icone={ArrowRight} taille={18} />
        </button>
        <button type="button" class="lien" onclick={() => onmasquer?.()} data-testid="masquer-reprise">Ne plus afficher ici</button>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet carte(r: ResumePaie, teinte: 'sauge' | 'peche')}
  {@const c = r.cycle}
  <div class="carte-paie" data-testid="carte-accueil" data-cycle-carte={c.paie.dateOrigine}>
    <CarteBandeau titre={r.titre} {teinte} icone={CalendarDays}>
      {#snippet badge()}
        {#if r.comptes.aVerifier > 0}
          <Pastille etat="alerte"><Icone icone={CircleAlert} taille={15} /> {r.comptes.aVerifier} à vérifier</Pastille>
        {:else}
          <Pastille>{periode(r)}</Pastille>
        {/if}
      {/snippet}
      <MontantCle montant={c.disponible} libelle={`Disponible planifié — paie du ${formaterDateCourte(c.paie.date)}`} />
      {#if c.disponible !== null && c.revenus !== null && c.disponible >= 0}
        <BarreProgression valeur={c.disponible} cible={c.revenus} libelle="Part des revenus encore disponible" teinte={teinte === 'sauge' ? 'fraiche' : 'chaude'} sansPourcentage />
      {/if}
      {#if r.manque}
        <p class="manque" data-testid="manque"><Icone icone={CircleAlert} taille={16} /> {r.manque} Le disponible reste « À compléter ».</p>
      {/if}
      {#if c.estimation && c.disponible !== null}
        <p class="petit discret">Estimation : au moins un montant est estimé.</p>
      {/if}
      <p class="equation" data-testid="equation-accueil">
        <span>Revenus <strong>{texte(c.revenus)}</strong></span><span class="op" aria-hidden="true">−</span><span>Dépenses prévues <strong>{texte(c.sorties)}</strong></span>
      </p>
      <ul class="statuts" aria-label="États des opérations de cette paie">
        {#if r.comptes.confirmees > 0}<li><Pastille etat="confirme">{pluriel(r.comptes.confirmees, 'confirmée', 'confirmées')}</Pastille></li>{/if}
        {#if r.comptes.aVenir > 0}<li><Pastille etat="prevu">{r.comptes.aVenir} à venir</Pastille></li>{/if}
        {#if r.comptes.aVerifier > 0}<li><Pastille etat="alerte">{r.comptes.aVerifier} à vérifier</Pastille></li>{/if}
        {#if r.comptes.aCompleter > 0}<li><Pastille etat="a-completer">{r.comptes.aCompleter} à compléter</Pastille></li>{/if}
      </ul>
      <p class="action">
        <button type="button" class={teinte === 'peche' ? 'principal' : 'contour'} onclick={() => onouvrirpaies({ type: 'paie', date: c.paie.dateOrigine })}>
          Ouvrir cette paie <Icone icone={ArrowRight} taille={18} />
        </button>
      </p>
    </CarteBandeau>
  </div>
{/snippet}

{#if erreur || calcul.erreur}
  {@render bienvenue(null)}
  <p role="alert" class="erreur">{erreur ?? calcul.erreur}</p>
{:else if !vue}
  <p class="discret">Chargement…</p>
{:else if vue.paies.length === 0}
  {@render bienvenue(vue.phrase)}
  {#if invitation}
    {@render reprise()}
  {:else}
    <p><button type="button" class="principal" onclick={() => onouvrirpaies(null)}>Configurer ma paie <Icone icone={ArrowRight} taille={18} /></button></p>
  {/if}
{:else}
  {@render bienvenue(vue.phrase)}
  {@render reprise()}

  <div class="surveiller" data-testid="a-surveiller">
    {#if vue.surveiller.length === 0}
      <section class="calme" aria-label="À surveiller" data-testid="rien-a-surveiller">
        <Icone icone={ShieldCheck} taille={26} />
        <p><strong>Rien à surveiller pour l’instant.</strong> Tes paies sont à jour.</p>
      </section>
    {:else}
      <BandeauSurveiller evenements={vue.surveiller.map((p) => ({ texte: p.texte, action: p.action, onaction: () => onouvrirpaies(p.cible) }))} />
    {/if}
  </div>

  <h2 class="titre-bloc">Où j’en suis</h2>
  <div class="deux">
    {@render carte(vue.paies[0]!, 'sauge')}
    {#if vue.paies[1]}{@render carte(vue.paies[1], 'peche')}{/if}
  </div>
  <p class="rappel">Le disponible planifié est le résultat de la planification : ce n’est pas le solde de ton compte.</p>

  <div class="bas">
    <div data-testid="bientot">
      <CarteBandeau titre="Bientôt" teinte="lilas" icone={ListChecks}>
        {#if vue.bientot.length === 0}
          <p class="discret">Aucune dépense à venir d’ici la fin de la prochaine paie.</p>
        {/if}
        {#each vue.bientot as g (g.titre)}
          <h3 class="groupe">{g.titre}</h3>
          <ul class="liste">
            {#each g.lignes as l (`${l.date}|${l.libelle}`)}
              <li>
                <span class="quand">{l.sansDate ? `d’ici le ${formaterDateCourte(l.date)}` : dateBientot(l.date)}</span>
                <button type="button" class="nom lien" onclick={() => onouvrirpaies(l.cible)}>{l.libelle}</button>
                <span class="montant" class:inconnu={l.montant === null}>{texte(l.montant)}</span>
                <Pastille etat={l.etat}>{l.statut}</Pastille>
              </li>
            {/each}
          </ul>
        {/each}
        {#if vue.autresBientot > 0}
          <p class="petit">
            <button type="button" class="lien" onclick={() => onouvrirpaies(null)}>
              + {vue.autresBientot === 1 ? '1 autre opération' : `${vue.autresBientot} autres opérations`} dans Mes paies
            </button>
          </p>
        {/if}
        <p class="petit discret">Prévu ne veut pas dire payé : chaque paiement se confirme dans Mes paies.</p>
      </CarteBandeau>
    </div>
    <div class="colonne">
      <div data-testid="derniers-changements">
        <CarteBandeau titre="Derniers changements" teinte="rose" icone={History}>
          {#if derniers.length === 0}
            <p class="discret">Aucun changement enregistré pour l’instant.</p>
          {:else}
            <ul class="changements">
              {#each derniers as e (e.id)}
                <li><span class="heure">{momentCourt(e, jour)}</span>{e.titre}</li>
              {/each}
            </ul>
          {/if}
          <p class="petit"><button type="button" class="lien" onclick={onjournal}>Voir le journal</button></p>
        </CarteBandeau>
      </div>
      {#if sauvegardes}
        <p class="copie" data-testid="copie-accueil"><Icone icone={ShieldCheck} taille={18} /> {texteDerniereCopie(sauvegardes, jour)}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* 0.22.0 : invitation à reprendre la configuration guidée. */
  .reprise {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--espace-6);
    flex-wrap: wrap;
    margin: 0 0 var(--espace-6);
    padding: var(--espace-5) var(--espace-6);
    background: var(--sorbet-peche-pale);
    border: 2px solid var(--sorbet-orange);
    border-radius: var(--arrondi-carte);
  }
  .reprise h2 {
    margin: 0 0 var(--espace-1);
    font-size: 22px;
  }
  .reprise p {
    margin: 0;
  }
  .progression {
    height: 10px;
    width: min(320px, 100%);
    margin-top: var(--espace-3);
    background: var(--progression-fond);
    border-radius: var(--arrondi-pilule);
    overflow: hidden;
  }
  .progression span {
    display: block;
    height: 100%;
    background: var(--progression-remplie);
  }
  .boutons-reprise {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--espace-2);
  }
  .boutons-reprise .principal {
    display: inline-flex;
    align-items: center;
    gap: var(--espace-2);
  }
  /* Bienvenue : la loutre (1 671 × 941) entière, à côté de la date. */
  .bienvenue {
    display: grid;
    grid-template-columns: minmax(200px, 1fr) minmax(0, 2fr);
    align-items: center;
    gap: var(--espace-8);
    background: var(--couleur-surface);
    border: var(--bordure-structure);
    border-radius: var(--arrondi-grand);
    padding: var(--espace-5) var(--espace-5) var(--espace-5) var(--espace-8);
    margin-bottom: var(--espace-6);
  }
  .date {
    margin: 0;
    font-family: var(--police-titre);
    font-size: 40px;
    line-height: 1.05;
    font-weight: 800;
  }
  .phrase {
    margin: var(--espace-3) 0 0;
    font-size: 17px;
    line-height: 1.5;
  }
  .etoiles {
    display: flex;
    gap: var(--espace-2);
    margin-top: var(--espace-4);
  }
  .loutre {
    justify-self: end;
    width: 100%;
    max-width: 600px;
  }
  .loutre :global(img) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1671 / 941;
    object-fit: contain;
    border-radius: 16px;
  }

  .surveiller {
    margin-bottom: var(--espace-8);
  }
  .calme {
    display: flex;
    align-items: center;
    gap: var(--espace-4);
    background: var(--couleur-succes-fond);
    color: var(--couleur-succes);
    border-radius: var(--arrondi-grand);
    padding: var(--espace-4) var(--espace-8);
  }
  .calme p {
    margin: 0;
  }

  .titre-bloc {
    font-size: var(--titre-carte);
    margin: 0 0 var(--espace-4);
  }
  .deux {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--espace-6);
  }
  .carte-paie {
    display: flex;
    min-width: 0;
  }
  .carte-paie > :global(*) {
    flex: 1;
  }
  .equation {
    display: flex;
    gap: var(--espace-2);
    flex-wrap: wrap;
    margin: var(--espace-3) 0 0;
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
  }
  .equation strong {
    color: var(--couleur-texte);
  }
  .statuts {
    display: flex;
    gap: var(--espace-2);
    flex-wrap: wrap;
    list-style: none;
    padding: 0;
    margin: var(--espace-3) 0 0;
  }
  .manque {
    display: flex;
    gap: var(--espace-2);
    align-items: flex-start;
    margin: var(--espace-3) 0 0;
    padding: var(--espace-2) var(--espace-3);
    border-radius: 12px;
    background: var(--etat-a-completer-fond);
    color: var(--etat-a-completer-texte);
    font-size: var(--texte-dense);
  }
  .action {
    margin: var(--espace-4) 0 0;
  }
  .rappel {
    margin: var(--espace-3) 0 0;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }

  .bas {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: var(--espace-6);
    margin-top: var(--espace-8);
    align-items: start;
  }
  .groupe {
    font-size: var(--texte-dense);
    color: var(--couleur-texte-discret);
    margin: 0 0 var(--espace-2);
    font-family: var(--police);
    font-weight: 800;
  }
  .groupe:not(:first-child) {
    margin-top: var(--espace-4);
  }
  .liste {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .liste li {
    display: grid;
    grid-template-columns: 7.5em minmax(0, 1fr) auto 10.5em;
    gap: var(--espace-3);
    align-items: center;
    padding: var(--espace-2) 0;
    border-bottom: 1px dashed var(--couleur-bordure);
    font-size: var(--texte-dense);
  }
  .liste li :global(.pastille) {
    justify-self: start;
  }
  .quand {
    color: var(--couleur-texte-discret);
  }
  .nom {
    justify-self: start;
    text-align: left;
    color: var(--couleur-texte);
  }
  .montant {
    font-weight: 800;
    text-align: right;
  }
  .montant.inconnu {
    color: var(--couleur-attention);
  }
  .petit {
    font-size: var(--texte-petit);
    margin: var(--espace-3) 0 0;
  }
  .discret {
    color: var(--couleur-texte-discret);
  }
  .colonne {
    display: flex;
    flex-direction: column;
    gap: var(--espace-4);
  }
  .changements {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--espace-3);
    font-size: var(--texte-dense);
  }
  .heure {
    display: block;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
  .copie {
    display: flex;
    gap: var(--espace-2);
    align-items: center;
    margin: 0;
    font-size: var(--texte-petit);
    color: var(--couleur-succes);
  }
  .erreur {
    color: var(--couleur-erreur);
  }

  @media (max-width: 1150px) {
    .bienvenue {
      grid-template-columns: minmax(180px, 1fr) minmax(0, 1.6fr);
      gap: var(--espace-5);
      padding-left: var(--espace-6);
    }
    .date {
      font-size: 32px;
    }
    .bas {
      grid-template-columns: 1fr;
    }
  }
</style>
