<script lang="ts">
  // Configuration guidée, étape 2 : le calendrier de paie. Les mêmes champs
  // que FormulaireProfil, puis le choix de la paie de départ ; tout passe par
  // proposerProfil et son aperçu habituel. Rien n'est enregistré sans
  // « Enregistrer » dans l'aperçu.
  import { choixDepart, paiesAnterieures, type SaisieRythme } from '../../actions/guide';
  import { LIBELLES_FREQUENCE, decrireFrequence, proposerProfil, type Proposition } from '../../actions/paie';
  import type { DonneesPaie, FrequenceStockee } from '../../lib/plateforme';
  import { formaterDateCourte, formaterDateLongue, type DateCivile } from '../../noyau/dates';
  import { formaterMontant } from '../../noyau/montants';

  interface Props {
    donnees: DonneesPaie;
    jour: DateCivile;
    proposer: (fabrique: () => Proposition) => void;
  }
  let { donnees, jour, proposer }: Props = $props();

  let fFrequence: FrequenceStockee = $state('deuxSemaines');
  let fReference = $state('');
  let fJour1 = $state(15);
  let fJour2 = $state(31);
  let fMontant = $state('');
  let fDepart: 'enCours' | 'prochaine' | 'ancienne' = $state('enCours');
  let fAncienne: DateCivile | '' = $state('');

  const rythme: SaisieRythme = $derived({ frequence: fFrequence, reference: fReference, jours: [Number(fJour1), Number(fJour2)] });
  /** Les paies proposées, dès que le rythme est complet ; sinon, un conseil. */
  const choix = $derived.by(() => {
    if (fFrequence !== 'deuxFoisParMois' && fReference.trim() === '') return { c: null, erreur: null };
    try {
      return { c: choixDepart(rythme, jour), erreur: null };
    } catch (e) {
      return { c: null, erreur: e instanceof Error ? e.message : String(e) };
    }
  });
  // Le départ recommandé (la paie en cours) est choisi d'office s'il existe.
  $effect(() => {
    const c = choix.c;
    if (!c) return;
    if (fDepart === 'enCours' && !c.enCours) fDepart = c.prochaine ? 'prochaine' : 'ancienne';
    if (fDepart === 'prochaine' && !c.prochaine) fDepart = c.enCours ? 'enCours' : 'ancienne';
    if (fAncienne === '' || !c.anciennes.includes(fAncienne)) fAncienne = c.anciennes[0] ?? '';
  });
  const depart: DateCivile | null = $derived.by(() => {
    const c = choix.c;
    if (!c) return null;
    if (fDepart === 'enCours') return c.enCours;
    if (fDepart === 'prochaine') return c.prochaine;
    return fAncienne !== '' && c.anciennes.includes(fAncienne) ? fAncienne : null;
  });
  const anterieures = $derived(depart && choix.c ? paiesAnterieures(rythme, depart, jour) : []);
  const longue = (d: DateCivile) => formaterDateLongue(d);
  const phraseAnterieures = (l: DateCivile[]) =>
    l.length === 1
      ? `La paie du ${formaterDateCourte(l[0]!)} apparaîtra « à vérifier »`
      : `${l.length} paies passées, du ${formaterDateCourte(l[0]!)} au ${formaterDateCourte(l.at(-1)!)}, apparaîtront « à vérifier »`;

  function voirApercu(e: SubmitEvent) {
    e.preventDefault();
    proposer(() => {
      if (choix.erreur) throw new Error(choix.erreur);
      if (!depart) throw new Error('Choisis la paie à partir de laquelle Liberté 35 commence.');
      const p = proposerProfil(donnees, { frequence: fFrequence, depart, ...(fFrequence === 'deuxFoisParMois' ? { jours: [Number(fJour1), Number(fJour2)] as [number, number] } : {}), montant: fMontant }, jour);
      // Affichage seulement : l'avertissement des paies passées est repris dans l'aperçu.
      if (anterieures.length > 0) {
        return { ...p, consequences: [...p.consequences, `${phraseAnterieures(anterieures)} dans Mes paies. Elles ne seront jamais confirmées automatiquement : tu pourras les vérifier une à une.`] };
      }
      return p;
    });
  }
</script>

{#if donnees.profil}
  <div class="bloc peche" data-testid="guide-paie-en-place">
    <h2>Mon calendrier de paie</h2>
    <p>Ton calendrier est en place : <strong>{decrireFrequence(donnees.profil)}</strong>.</p>
    <p>
      Montant net habituel :
      {#if donnees.salaires.length > 0}<strong>{formaterMontant(donnees.salaires.at(-1)!.montant)}</strong>{:else}<span class="a-completer">À compléter</span>{/if}
    </p>
    <p class="discret">Le guide ajoute seulement : pour modifier ton calendrier ou ton montant, passe par Mes paies.</p>
  </div>
{:else}
  <form class="bloc peche" onsubmit={voirApercu} data-testid="guide-formulaire-paie">
    <h2>Mon calendrier de paie</h2>
    <p class="discret">Les mêmes renseignements que dans Mes paies.</p>
    <div class="champs">
      <label
        >Fréquence
        <select bind:value={fFrequence}>
          {#each Object.entries(LIBELLES_FREQUENCE) as [valeur, libelle] (valeur)}
            <option value={valeur}>{libelle}</option>
          {/each}
        </select>
      </label>
      {#if fFrequence === 'deuxFoisParMois'}
        <label>Premier jour <input type="number" min="1" max="27" bind:value={fJour1} /></label>
        <label>Second jour (31 = dernier jour) <input type="number" min="2" max="31" bind:value={fJour2} /></label>
      {:else}
        <label
          >Date d’une paie récente <input type="date" bind:value={fReference} />
          <span class="aide">Une date que tu connais, par exemple ta dernière paie reçue.</span></label
        >
      {/if}
      <label class="plein"
        >Montant net habituel ($, facultatif) <input inputmode="decimal" bind:value={fMontant} />
        <span class="aide">Laisse vide si tu ne le sais pas encore : il restera « À compléter ».</span></label
      >
    </div>

    {#if choix.erreur}
      <p class="erreur" role="alert">{choix.erreur}</p>
    {:else if choix.c}
      <fieldset class="depart" data-testid="choix-depart">
        <legend>À partir de quelle paie Liberté 35 commence-t-elle ?</legend>
        {#if choix.c.enCours}
          <label class="option" class:choisie={fDepart === 'enCours'}>
            <input type="radio" name="depart" value="enCours" bind:group={fDepart} />
            <span><strong>Ma paie en cours — {longue(choix.c.enCours)} <span class="recommande">Recommandé</span></strong>
              <span class="discret">Tu commences avec le cycle d’aujourd’hui. Aucune paie antérieure à vérifier.</span></span>
          </label>
        {/if}
        {#if choix.c.prochaine}
          <label class="option" class:choisie={fDepart === 'prochaine'}>
            <input type="radio" name="depart" value="prochaine" bind:group={fDepart} />
            <span><strong>Ma prochaine paie — {longue(choix.c.prochaine)}</strong>
              <span class="discret">Pratique si le cycle en cours est presque terminé.</span></span>
          </label>
        {/if}
        {#if choix.c.anciennes.length > 0}
          <label class="option" class:choisie={fDepart === 'ancienne'}>
            <input type="radio" name="depart" value="ancienne" bind:group={fDepart} />
            <span><strong>Une date plus ancienne…</strong>
              <span class="discret">Pour inscrire des paies déjà passées. Elles apparaîtront « à vérifier ».</span></span>
          </label>
          {#if fDepart === 'ancienne'}
            <label class="ancienne"
              >Paie de départ
              <select bind:value={fAncienne} data-testid="paie-ancienne">
                {#each choix.c.anciennes as a (a)}<option value={a}>{longue(a)}</option>{/each}
              </select>
            </label>
          {/if}
        {/if}
      </fieldset>
      {#if anterieures.length > 0}
        <div class="avertissement" role="note" data-testid="avertissement-anterieures">
          <strong>{phraseAnterieures(anterieures)}</strong>
          <p>Elles seront marquées prévues, jamais reçues automatiquement : tu pourras les vérifier une à une dans Mes paies, ou les laisser telles quelles.</p>
          <p class="discret">Tu préfères éviter ces rappels ? Choisis plutôt ta paie en cours.</p>
        </div>
      {/if}
    {/if}
    <p class="soumettre"><button type="submit" class="principal">Voir l’aperçu</button></p>
  </form>
{/if}

<style>
  .champs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
    gap: var(--espace-4) var(--espace-6);
  }
  .champs label {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-weight: 700;
  }
  .champs .plein {
    grid-column: 1 / -1;
  }
  .champs .plein input {
    max-width: 320px;
  }
  .aide {
    font-weight: 400;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
  }
  .depart {
    border: 0;
    margin: var(--espace-6) 0 0;
    padding: 0;
    display: grid;
    gap: var(--espace-3);
  }
  .depart legend {
    font-family: var(--police-titre);
    font-weight: 700;
    font-size: var(--titre-bloc);
    margin-bottom: var(--espace-3);
  }
  .option {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: var(--espace-3);
    padding: var(--espace-3) var(--espace-4);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
    border-radius: var(--arrondi-panneau);
    background: var(--couleur-surface);
    font-weight: 400;
    cursor: pointer;
  }
  .option input {
    margin-top: 5px;
  }
  .option strong {
    display: block;
    font-size: 17px;
  }
  .option .discret {
    display: block;
  }
  .option.choisie {
    border: 2px solid var(--sorbet-orange);
    background: var(--sorbet-peche-pale);
  }
  .recommande {
    display: inline-block;
    margin-left: var(--espace-2);
    font-size: 12px;
    font-weight: 800;
    background: var(--sorbet-sauge-pale);
    color: var(--couleur-succes);
    border-radius: var(--arrondi-pilule);
    padding: 1px 10px;
  }
  .ancienne {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-weight: 700;
    max-width: 360px;
    margin-left: var(--espace-8);
  }
  .avertissement {
    margin-top: var(--espace-4);
    background: var(--couleur-attention-fond);
    border: var(--epaisseur-bordure) solid var(--sorbet-beurre);
    border-left: 6px solid var(--couleur-attention);
    border-radius: var(--arrondi-panneau);
    padding: var(--espace-4);
  }
  .avertissement strong {
    color: var(--couleur-attention);
  }
  .avertissement p {
    margin: var(--espace-1) 0;
  }
  .soumettre {
    margin: var(--espace-5) 0 0;
  }
  .a-completer {
    font-weight: 800;
    color: var(--etat-a-completer-texte);
    background: var(--etat-a-completer-fond);
    border-radius: var(--arrondi-pilule);
    padding: 1px var(--espace-3);
  }
</style>
