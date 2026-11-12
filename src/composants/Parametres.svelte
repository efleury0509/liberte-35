<script lang="ts">
  // Paramètres (V1 lot 5) : des onglets par catégorie, sur le contenu qui
  // existe déjà — sauvegardes locales, export, installation. Rien de neuf
  // n'est ajouté (pas de Google Drive) ; un problème d'intégrité reste
  // visible quel que soit l'onglet.
  import { untrack } from 'svelte';
  import type { EtatApplication, Plateforme } from '../lib/plateforme';
  import { TEXTES } from '../lib/textes.fr';
  import Sauvegardes from './Sauvegardes.svelte';
  import JournalChangements from './JournalChangements.svelte';

  interface Props {
    etat: EtatApplication | null;
    erreur: string | null;
    plateforme: Plateforme;
    onrestauration: () => void;
    /** 0.16.0 : « Voir le journal » depuis l'Accueil ouvre l'onglet Journal. */
    ongletInitial?: 'sauvegardes' | 'export' | 'installation' | 'journal';
    /** 0.22.0 : rouvrir la configuration guidée (elle ajoute seulement). */
    onguide?: () => void;
  }
  let { etat, erreur, plateforme, onrestauration, ongletInitial = 'sauvegardes', onguide }: Props = $props();
  const T = TEXTES.parametres;

  type Onglet = 'sauvegardes' | 'export' | 'installation' | 'journal';
  const ONGLETS: { id: Onglet; libelle: string }[] = [
    { id: 'sauvegardes', libelle: 'Sauvegardes locales' },
    { id: 'export', libelle: 'Exporter mes données' },
    { id: 'installation', libelle: 'Installation' },
    { id: 'journal', libelle: 'Journal' },
  ];
  let onglet: Onglet = $state(untrack(() => ongletInitial));

  function clavier(e: KeyboardEvent, i: number) {
    let j = i;
    if (e.key === 'ArrowRight') j = (i + 1) % ONGLETS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + ONGLETS.length) % ONGLETS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ONGLETS.length - 1;
    else return;
    e.preventDefault();
    onglet = ONGLETS[j]!.id;
    document.getElementById(`onglet-${onglet}`)?.focus();
  }
</script>

{#if erreur}
  <p role="alert" class="erreur" data-testid="erreur-etat">{erreur}</p>
{:else if etat && !etat.integriteOk}
  <p role="alert" class="erreur">{T.integrite} : {T.integriteKo}. Voir l’onglet « Installation ».</p>
{/if}

<div class="onglets" role="tablist" aria-label="Catégories des paramètres">
  {#each ONGLETS as o, i (o.id)}
    <button
      type="button"
      role="tab"
      id={`onglet-${o.id}`}
      aria-selected={onglet === o.id}
      aria-controls={`panneau-${o.id}`}
      tabindex={onglet === o.id ? 0 : -1}
      class:actif={onglet === o.id}
      onclick={() => (onglet = o.id)}
      onkeydown={(e) => clavier(e, i)}>{o.libelle}</button
    >
  {/each}
</div>

<div class="panneau-onglet carte" role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`}>
  {#if onglet === 'installation'}
    <section aria-labelledby="titre-installation">
      <h2 id="titre-installation">{T.titreInstallation}</h2>
      {#if erreur}
        <p class="discret">{T.erreur}</p>
      {:else if !etat}
        <p>{T.chargement}</p>
      {:else}
        <dl data-testid="etat-installation">
          <dt>{T.profil}</dt>
          <dd data-testid="profil">{TEXTES.profil[etat.profil]}</dd>

          <dt>{T.version}</dt>
          <dd>{etat.versionApplication}</dd>

          <dt>{T.schema}</dt>
          <dd data-testid="version-schema">{etat.versionSchema}</dd>

          <dt>{T.dossier}</dt>
          <dd class="chemin">{etat.dossierDonnees}</dd>

          <dt>{T.integrite}</dt>
          <dd data-testid="integrite" class={etat.integriteOk ? 'ok' : 'erreur'}>
            {etat.integriteOk ? T.integriteOk : T.integriteKo}
          </dd>

          <dt>{T.journal}</dt>
          <dd>{etat.nombreEntreesJournal}</dd>
        </dl>
      {/if}
    </section>
    {#if onguide && !erreur}
      <section class="guide" aria-labelledby="titre-guide-parametres" data-testid="parametres-guide">
        <h2 id="titre-guide-parametres">Configuration guidée</h2>
        <p class="discret">Le guide pas à pas : ta paie, tes dépenses, tes dettes et ton épargne. Il ajoute seulement : il ne modifie ni ne supprime rien de ce qui est déjà enregistré.</p>
        <button type="button" onclick={onguide} data-testid="ouvrir-guide">Ouvrir la configuration guidée</button>
      </section>
    {/if}
  {:else if onglet === 'journal' && !erreur}
    <JournalChangements {plateforme} />
  {:else if etat && !erreur}
    <Sauvegardes {plateforme} {onrestauration} vue={onglet === 'export' ? 'export' : 'sauvegardes'} />
  {:else if !etat && !erreur}
    <p>{T.chargement}</p>
  {:else}
    <p class="discret">{T.erreur}</p>
  {/if}
</div>

<style>
  .guide {
    margin-top: var(--espace-8);
    padding-top: var(--espace-6);
    border-top: var(--epaisseur-bordure) solid var(--couleur-bordure);
  }
  .guide h2 {
    margin-top: 0;
  }
  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-2);
    margin: 0 0 var(--espace-4);
  }
  .onglets button {
    border: 2px solid var(--couleur-bordure-forte);
    background: var(--couleur-surface);
    color: var(--couleur-texte);
    font-weight: 700;
  }
  .onglets button.actif {
    background: var(--prune-700);
    border-color: var(--prune-700);
    color: var(--creme-50);
  }
  .panneau-onglet {
    max-width: 920px;
    font-size: var(--texte-courant);
  }
  h2 {
    font-size: var(--titre-carte);
    margin: 0 0 var(--espace-4);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--espace-2) var(--espace-6);
    margin: 0;
    max-width: 760px;
  }
  dt {
    color: var(--couleur-texte-discret);
  }
  dd {
    margin: 0;
  }
  .chemin {
    word-break: break-all;
    font-size: var(--texte-petit);
  }
  .ok {
    color: var(--couleur-succes);
  }
</style>
