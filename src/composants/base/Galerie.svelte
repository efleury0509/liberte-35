<script lang="ts">
  // Galerie des fondations visuelles (lot 1 V1). Outil de vérification seulement :
  // visible dans l'aperçu navigateur avec « ?galerie », jamais dans l'application installée.
  import Pastille from './Pastille.svelte';
  import BarreProgression from './BarreProgression.svelte';
  import Illustration from './Illustration.svelte';
  import Icone from './Icone.svelte';
  import { ILLUSTRATIONS, type NomIllustration } from '../../lib/illustrations';
  import { formaterMontant } from '../../noyau/montants';
  import { House, CalendarDays, ShoppingCart, PiggyBank, Landmark, Target, FlaskConical, ChartColumn, Settings, CircleHelp, Bell, ArrowRight, TriangleAlert, Check } from '@lucide/svelte';

  const couleurs = [
    ['Prune 900 (encre)', '--prune-900'],
    ['Prune 800 (barre)', '--prune-800'],
    ['Prune 700 (bandeaux)', '--prune-700'],
    ['Prune 600 (liens)', '--prune-600'],
    ['Crème 50 (cartes)', '--creme-50'],
    ['Crème 100 (fond)', '--creme-100'],
    ['Pêche', '--sorbet-peche'],
    ['Orange', '--sorbet-orange'],
    ['Rose', '--sorbet-rose'],
    ['Lilas', '--sorbet-lilas'],
    ['Sauge', '--sorbet-sauge'],
    ['Vert', '--sorbet-vert'],
    ['Beurre', '--sorbet-beurre'],
  ];
  const icones = [House, CalendarDays, ShoppingCart, PiggyBank, Landmark, Target, FlaskConical, ChartColumn, Settings, CircleHelp, Bell];
  const noms = Object.keys(ILLUSTRATIONS) as NomIllustration[];
</script>

<div class="galerie" data-testid="galerie">
  <h1>Bonjour !</h1>
  <p>Galerie des fondations visuelles — lot 1. Les montants sont fictifs.</p>

  <h2>Couleurs</h2>
  <div class="nuancier">
    {#each couleurs as [nom, v] (v)}
      <div class="nuance"><span class="echantillon" style:background="var({v})"></span>{nom}</div>
    {/each}
  </div>

  <h2>Typographie</h2>
  <div class="carte">
    <h1>Titre de section (Fraunces 900)</h1>
    <h2>Sous-titre de carte (Fraunces 700)</h2>
    <h3>Titre de bloc (Fraunces 650)</h3>
    <h4>Étiquette (Nunito 700)</h4>
    <p>Texte courant en Nunito : « Des rêves, mais avec un budget. » Les chiffres sont alignés : 1 234,56 $ · 98,10 $ · 12 000,00 $.</p>
    <p class="discret">Texte discret pour les précisions.</p>
    <p><span class="montant-grand">425 $</span> <span class="discret">Disponible à planifier</span></p>
  </div>

  <h2>Boutons et champs</h2>
  <div class="carte">
    <div class="formulaire">
      <label>Montant ($) <input inputmode="decimal" value="150" /></label>
      <label>Date <input type="date" value="2027-01-07" /></label>
      <label>Fréquence <select><option>À chaque paie</option><option>Chaque mois</option></select></label>
      <label class="en-ligne"><input type="checkbox" checked /> Une case à cocher</label>
      <button type="button" class="principal">Enregistrer</button>
      <button type="button">Ajuster</button>
      <button type="button" class="petit">Petit bouton</button>
      <button type="button" class="lien">Bouton-lien</button>
      <button type="button" disabled>Désactivé</button>
    </div>
  </div>

  <h2>Cartes, bandeau, panneau</h2>
  <div class="grille">
    <div class="carte">
      <div class="entete"><h3>Paie actuelle</h3><Pastille etat="a-completer">1 à confirmer</Pastille></div>
      <p><span class="montant-grand">{formaterMontant(42_500)}</span></p>
      <BarreProgression valeur={42_500} cible={60_000} libelle="Disponible" />
      <div class="panneau">
        <h4>Dépenses principales de cette paie</h4>
        <p class="ligne"><span>Auto</span><span class="montant">{formaterMontant(20_500)}</span></p>
        <p class="ligne"><span>Lunettes</span><span class="montant">À compléter</span></p>
      </div>
      <p class="boutons-galerie"><button type="button">Voir le détail complet <Icone icone={ArrowRight} taille={16} /></button></p>
    </div>
    <div class="carte">
      <div class="entete"><h3>Fonds d’urgence</h3><Pastille etat="confirme">Confirmé</Pastille></div>
      <p><span class="montant-grand">{formaterMontant(750_000)}</span></p>
      <BarreProgression valeur={750_000} cible={1_000_000} libelle="Fonds d’urgence" teinte="chaude" />
      <p class="discret">Cible inconnue :</p>
      <BarreProgression valeur={150_000} cible={null} libelle="Voyage" />
      <p class="discret">Valeur inconnue :</p>
      <BarreProgression valeur={null} cible={500_000} libelle="REER" />
    </div>
  </div>
  <div class="bandeau-prune"><h3>À surveiller</h3><p>Bandeau prune pour les informations clés.</p></div>

  <h2>Pastilles d’état</h2>
  <p class="pastilles">
    <Pastille etat="confirme"><Icone icone={Check} taille={14} /> Payé</Pastille>
    <Pastille etat="prevu">Planifié</Pastille>
    <Pastille etat="a-completer">À compléter</Pastille>
    <Pastille etat="alerte"><Icone icone={TriangleAlert} taille={14} /> En retard</Pastille>
    <Pastille>Neutre</Pastille>
  </p>
  <p class="attention">Texte d’attention.</p>
  <p class="erreur">Texte d’erreur.</p>

  <h2>Icônes</h2>
  <p class="icones">{#each icones as I, i (i)}<Icone icone={I} taille={24} />{/each}</p>

  <h2>Emplacements d’illustration (fichiers à venir)</h2>
  <p class="icones">{#each noms as n (n)}<Illustration nom={n} largeur={120} hauteur={90} reserver />{/each}</p>
</div>

<style>
  .galerie {
    max-width: var(--largeur-contenu);
    padding: var(--espace-8);
  }
  .nuancier {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
  }
  .nuance {
    display: flex;
    flex-direction: column;
    gap: var(--espace-1);
    font-size: var(--taille-petit);
    width: 110px;
  }
  .echantillon {
    height: 48px;
    border-radius: var(--arrondi);
    border: var(--epaisseur-bordure) solid var(--couleur-bordure);
  }
  .grille {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--espace-4);
  }
  .ligne {
    display: flex;
    justify-content: space-between;
    margin: var(--espace-1) 0;
  }
  .pastilles,
  .icones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espace-3);
    align-items: center;
  }
  .boutons-galerie button {
    display: inline-flex;
    gap: var(--espace-2);
    align-items: center;
  }
</style>
