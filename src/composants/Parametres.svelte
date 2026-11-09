<script lang="ts">
  import type { EtatApplication, Plateforme } from '../lib/plateforme';
  import { TEXTES } from '../lib/textes.fr';
  import Sauvegardes from './Sauvegardes.svelte';

  interface Props {
    etat: EtatApplication | null;
    erreur: string | null;
    plateforme: Plateforme;
    onrestauration: () => void;
  }
  let { etat, erreur, plateforme, onrestauration }: Props = $props();
  const T = TEXTES.parametres;
</script>

<section aria-labelledby="titre-installation">
  <h2 id="titre-installation">{T.titreInstallation}</h2>

  {#if erreur}
    <p role="alert" class="erreur" data-testid="erreur-etat">{erreur}</p>
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

{#if etat && !erreur}
  <Sauvegardes {plateforme} {onrestauration} />
{/if}

<style>
  h2 {
    font-size: 17px;
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
    font-size: var(--taille-petit);
  }

  .ok {
    color: var(--couleur-succes);
  }

</style>
