<script lang="ts">
  // Étape 6 : copies du jour, copies de précaution, restauration et export.
  // Rien ici au quotidien : les copies se font seules. On vient ici
  // seulement pour vérifier, revenir en arrière ou exporter.
  import { onMount } from 'svelte';
  import {
    libelleCopie,
    lignesApercu,
    messageExport,
    resumeTexte,
    texteDerniereCopie,
    titreApercu,
  } from '../actions/sauvegardes';
  import { aujourdhui } from '../lib/aujourdhui';
  import type { ApercuRestauration, CopieListee, EtatSauvegardes, Plateforme, SourceCopie } from '../lib/plateforme';

  interface Props {
    plateforme: Plateforme;
    onrestauration: () => void;
  }
  let { plateforme, onrestauration }: Props = $props();

  const jour = aujourdhui();
  let etat: EtatSauvegardes | null = $state(null);
  let erreurLecture: string | null = $state(null);
  let apercu: ApercuRestauration | null = $state(null);
  let refus: string | null = $state(null);
  let restaure: string | null = $state(null);
  let exporte: string | null = $state(null);
  let erreurExport: string | null = $state(null);
  let enCours = $state(false);

  // Ce qui apparaît après un clic (aperçu, message) vient à l'écran : la
  // liste des copies peut être longue, et l'aperçu s'ouvre en dessous.
  function montrer(el: HTMLElement) {
    el.scrollIntoView?.({ block: 'nearest' });
    if (el.hasAttribute('tabindex')) el.focus({ preventScroll: true });
  }

  const texte = (e: unknown) => (typeof e === 'string' ? e : 'Une erreur inattendue est survenue. Rien n’a été modifié.');

  async function charger() {
    try {
      etat = await plateforme.etatSauvegardes();
      erreurLecture = null;
    } catch (e) {
      erreurLecture = texte(e);
    }
  }

  onMount(() => {
    void charger();
    return plateforme.surAvisCopie(() => void charger());
  });

  function effacerMessages() {
    refus = null;
    restaure = null;
    exporte = null;
    erreurExport = null;
  }

  async function ouvrirApercu(source: SourceCopie) {
    effacerMessages();
    apercu = null;
    try {
      apercu = await plateforme.apercuRestauration(source);
    } catch (e) {
      refus = texte(e);
    }
  }

  async function choisirFichier() {
    effacerMessages();
    apercu = null;
    enCours = true;
    try {
      apercu = await plateforme.choisirFichierCopie();
    } catch (e) {
      refus = texte(e);
    } finally {
      enCours = false;
    }
  }

  async function confirmerRestauration() {
    if (!apercu) return;
    enCours = true;
    refus = null;
    try {
      const titre = titreApercu(apercu, jour).replace(/^Restaurer /, '');
      await plateforme.restaurer(apercu.source);
      restaure = `Restauré : ${titre}. L’état d’avant est gardé : c’est la première des copies de précaution.`;
      apercu = null;
      await charger();
      onrestauration();
    } catch (e) {
      refus = texte(e);
    } finally {
      enCours = false;
    }
  }

  async function exporter() {
    effacerMessages();
    enCours = true;
    try {
      const r = await plateforme.exporter();
      if (r) exporte = messageExport(r);
    } catch (e) {
      erreurExport = texte(e);
    } finally {
      enCours = false;
    }
  }
</script>

{#snippet ligneCopie(c: CopieListee)}
  {@const libelle = libelleCopie(c, jour)}
  <li data-copie={c.nom}>
    <div>
      <span class="libelle">{libelle}</span>
      {#if c.lisible && c.resume}
        <span class="discret">{resumeTexte(c.resume)}</span>
      {:else}
        <span class="erreur" data-testid="illisible">{c.raison}</span>
      {/if}
    </div>
    {#if c.lisible}
      <button type="button" aria-label={`Restaurer : ${libelle}`} onclick={() => ouvrirApercu(c.source)} disabled={enCours}>Restaurer…</button>
    {/if}
  </li>
{/snippet}

<section aria-labelledby="titre-sauvegardes">
  <h2 id="titre-sauvegardes">Sauvegardes</h2>
  {#if erreurLecture}
    <p role="alert" class="erreur">{erreurLecture}</p>
  {:else if !etat}
    <p>Lecture en cours…</p>
  {:else}
    <p data-testid="derniere-copie">{texteDerniereCopie(etat, jour)}</p>
    {#if etat.enAttente}
      <p class="discret" data-testid="copie-en-attente">Une copie de tes derniers changements suit dans quelques secondes.</p>
    {/if}
    {#if etat.erreur}
      <p role="alert" class="erreur" data-testid="erreur-copie">{etat.erreur}</p>
    {/if}

    <h3>Copies quotidiennes</h3>
    <p class="discret">Faites automatiquement, vérifiées : les trois dernières journées où tu as utilisé Liberté 35.</p>
    {#if etat.copies.copiesDuJour.length === 0}
      <p class="discret">Aucune pour l’instant.</p>
    {:else}
      <ul class="copies" data-testid="copies-du-jour">
        {#each etat.copies.copiesDuJour as c (c.nom)}
          {@render ligneCopie(c)}
        {/each}
      </ul>
    {/if}

    <h3>Copies de précaution</h3>
    <p class="discret">Faites automatiquement avant une restauration ou une mise à niveau. Les cinq plus récentes sont gardées.</p>
    {#if etat.copies.precautions.length === 0}
      <p class="discret">Aucune pour l’instant.</p>
    {:else}
      <ul class="copies" data-testid="precautions">
        {#each etat.copies.precautions as c (c.nom)}
          {@render ligneCopie(c)}
        {/each}
      </ul>
    {/if}

    <p>
      <button type="button" onclick={choisirFichier} disabled={enCours}>Restaurer depuis un fichier…</button>
      <span class="discret">Une copie gardée ailleurs, par exemple sur une clé USB.</span>
    </p>

    {#if refus}
      <p role="alert" class="erreur" data-testid="refus-restauration" use:montrer>{refus}</p>
    {/if}
    {#if restaure}
      <p role="status" class="succes" data-testid="restaure" use:montrer>{restaure}</p>
    {/if}

    {#if apercu}
      {@const l = lignesApercu(apercu)}
      <div class="apercu" role="dialog" aria-modal="false" aria-labelledby="titre-apercu-restauration" data-testid="apercu-restauration" tabindex="-1" use:montrer>
        <p class="avis">À vérifier avant de restaurer</p>
        <h3 id="titre-apercu-restauration">{titreApercu(apercu, jour)}</h3>
        <p>{l.contenu}</p>
        <p>{l.intro}</p>
        {#if l.retires.length > 0}
          <ul data-testid="retires">
            {#each l.retires as r, i (i)}
              <li>{r}</li>
            {/each}
          </ul>
          {#if l.suite}<p class="discret">{l.suite}</p>{/if}
        {/if}
        {#each l.notes as n (n)}
          <p class="discret">{n}</p>
        {/each}
        <div class="boutons">
          <button type="button" class="principal" onclick={confirmerRestauration} disabled={enCours}>Restaurer</button>
          <button type="button" onclick={() => (apercu = null)} disabled={enCours}>Annuler</button>
        </div>
      </div>
    {/if}
  {/if}
</section>

<section aria-labelledby="titre-export">
  <h2 id="titre-export">Exporter mes données</h2>
  <p>
    Un dossier compressé (.zip) avec toutes tes données : un fichier JSON complet, des fichiers CSV qui s’ouvrent dans
    LibreOffice Calc ou Excel, et un LISEZMOI qui explique chaque colonne. Tu choisis où l’enregistrer : Documents, une clé
    USB, un dossier Google Drive…
  </p>
  <p class="attention">L’export n’est pas chiffré : garde-le en lieu sûr.</p>
  <button type="button" onclick={exporter} disabled={enCours}>Exporter mes données…</button>
  {#if exporte}
    <p role="status" class="succes" data-testid="exporte" use:montrer>{exporte}</p>
  {/if}
  {#if erreurExport}
    <p role="alert" class="erreur" data-testid="erreur-export" use:montrer>{erreurExport}</p>
  {/if}
</section>

<style>
  section {
    max-width: 760px;
    margin-top: var(--espace-8);
  }
  h2 {
    font-size: 17px;
    margin: 0 0 var(--espace-4);
  }
  h3 {
    font-size: var(--taille-texte);
    margin: var(--espace-6) 0 var(--espace-1);
  }
  .copies {
    list-style: none;
    padding: 0;
    margin: var(--espace-2) 0;
  }
  .copies li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--espace-4);
    padding: var(--espace-2) 0;
    border-bottom: 1px solid var(--couleur-bordure);
  }
  .copies li div {
    display: flex;
    flex-direction: column;
  }
  .libelle {
    font-weight: 500;
  }
  .succes {
    color: var(--couleur-succes);
  }
  .apercu {
    border: 1px solid var(--couleur-accent);
    border-radius: var(--arrondi);
    background: var(--couleur-surface);
    padding: var(--espace-4) var(--espace-6);
    margin: var(--espace-4) 0;
  }
  .apercu:focus {
    outline: 2px solid var(--couleur-focus);
    outline-offset: 2px;
  }
  .apercu h3 {
    margin-top: 0;
  }
  .avis {
    margin: 0 0 var(--espace-1);
    font-size: var(--taille-petit);
    color: var(--couleur-texte-discret);
  }
  .apercu ul {
    margin: 0;
    padding-left: var(--espace-6);
  }
  .boutons {
    display: flex;
    gap: var(--espace-2);
    margin-top: var(--espace-4);
  }
</style>
