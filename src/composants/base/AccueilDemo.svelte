<script lang="ts">
  // Banc d'essai visuel (lot 1b V1) : reproduction de la maquette Accueil 2
  // avec les composants réels de l'application et des données FICTIVES.
  // Ce n'est pas la Vue d'ensemble (étape C) : aucun calcul, aucune donnée lue.
  // Visible seulement dans l'aperçu navigateur, avec « ?galerie=accueil ».
  import NavigationLaterale, { type EntreeNavigation } from './NavigationLaterale.svelte';
  import EnTeteSection from './EnTeteSection.svelte';
  import CarteBandeau from './CarteBandeau.svelte';
  import MontantCle from './MontantCle.svelte';
  import LigneMontant from './LigneMontant.svelte';
  import BarreProgression from './BarreProgression.svelte';
  import Pastille from './Pastille.svelte';
  import Illustration from './Illustration.svelte';
  import BandeauSurveiller from './BandeauSurveiller.svelte';
  import Icone from './Icone.svelte';
  import Eclats from './Eclats.svelte';
  import {
    House,
    CalendarDays,
    ShoppingCart,
    PiggyBank,
    Landmark,
    Target,
    FlaskConical,
    ChartColumn,
    Settings,
    CircleHelp,
    CircleAlert,
    Car,
    Umbrella,
    ShoppingBasket,
    ArrowRight,
  } from '@lucide/svelte';

  const entrees: EntreeNavigation[] = [
    { id: 'accueil', libelle: 'Accueil', icone: House },
    { id: 'paies', libelle: 'Mes paies', icone: CalendarDays },
    { id: 'depenses', libelle: 'Dépenses', icone: ShoppingCart },
    { id: 'epargne', libelle: 'Épargne', icone: PiggyBank },
    { id: 'dettes', libelle: 'Dettes', icone: Landmark },
    { id: 'objectifs', libelle: 'Objectifs', icone: Target },
    { id: 'scenarios', libelle: 'Scénarios (Et si…)', icone: FlaskConical },
    { id: 'rapports', libelle: 'Rapports', icone: ChartColumn },
  ];
  const pied: EntreeNavigation[] = [
    { id: 'parametres', libelle: 'Paramètres', icone: Settings },
    { id: 'aide', libelle: 'Aide', icone: CircleHelp },
  ];
  let active = $state('accueil');
  // Afficher les emplacements d'illustration vides (comparaison avec la maquette).
  const reserver = new URLSearchParams(location.search).get('emplacements') !== 'non';
</script>

<div class="demo">
  <NavigationLaterale {entrees} {pied} {active} {reserver} onchoisir={(id) => (active = id)} />

  <main>
    <EnTeteSection titre="Bonjour !" sousTitre="Voici ta situation financière et tes quatre prochaines paies." illustration="cafe-glace" {reserver} />

    <div class="paies">
      <CarteBandeau titre="Paie actuelle" teinte="sauge" icone={CalendarDays}>
        {#snippet badge()}<Pastille etat="a-completer"><Icone icone={CircleAlert} taille={16} /> 1 à confirmer</Pastille>{/snippet}
        <div class="haut">
          <span class="ill"><Illustration nom="licorne" largeur={112} hauteur={100} {reserver} /></span>
          <div class="chiffres">
            <MontantCle montant={42_500} libelle="Disponible à planifier" arrondi />
            <BarreProgression valeur={42_500} cible={60_000} libelle="Disponible à planifier" sansPourcentage />
          </div>
        </div>
        <div class="panneau-v1">
          <h3>Dépenses principales de cette paie</h3>
          <ul>
            <LigneMontant icone={Car} libelle="Auto" montant={20_500} arrondi />
            <LigneMontant icone={Umbrella} libelle="Assurances" montant={10_500} arrondi />
          </ul>
        </div>
        <p class="action"><button type="button" class="contour">Voir le détail complet <Icone icone={ArrowRight} taille={18} /></button></p>
      </CarteBandeau>

      <CarteBandeau titre="Paie suivante" teinte="peche" icone={CalendarDays}>
        {#snippet badge()}<Pastille etat="prevu"><Icone icone={CalendarDays} taille={16} /> Dépense spéciale à venir</Pastille>{/snippet}
        <div class="haut">
          <div class="chiffres">
            <MontantCle montant={31_000} libelle="Disponible prévu" arrondi />
            <BarreProgression valeur={31_000} cible={45_000} libelle="Disponible prévu" teinte="chaude" sansPourcentage />
          </div>
          <span class="ill"><Illustration nom="calendrier" largeur={112} hauteur={100} {reserver} /></span>
        </div>
        <div class="panneau-v1">
          <h3>Dépenses principales prévues</h3>
          <ul>
            <LigneMontant icone={Landmark} libelle="Prêt" montant={26_000} arrondi />
            <LigneMontant icone={ShoppingBasket} libelle="Épicerie" montant={20_000} arrondi />
          </ul>
        </div>
        <p class="action"><button type="button" class="principal">Voir le détail complet <Icone icone={ArrowRight} taille={18} /></button></p>
      </CarteBandeau>
    </div>

    <div class="apercus">
      <CarteBandeau titre="Troisième paie" teinte="rose" variante="teintee" icone={CalendarDays}>
        <div class="apercu-ligne">
          <MontantCle montant={52_000} libelle="" taille="moyen" arrondi />
          <span class="discret-v1">Aperçu prévisionnel</span>
          <span class="eclats-droite"><Eclats taille={34} /></span>
        </div>
      </CarteBandeau>
      <CarteBandeau titre="Quatrième paie" teinte="lilas" fond="sauge" variante="teintee" icone={CalendarDays}>
        <div class="apercu-ligne">
          <MontantCle montant={38_500} libelle="" taille="moyen" arrondi />
          <span class="discret-v1">Aperçu prévisionnel</span>
          <span class="eclats-droite"><Eclats taille={34} /></span>
        </div>
      </CarteBandeau>
    </div>

    <BandeauSurveiller
      {reserver}
      evenements={[
        { texte: 'Paiement non confirmé', action: 'Voir la paie actuelle' },
        { texte: 'Dépense exceptionnelle à venir', action: 'Voir le détail' },
      ]}
    />
    <p class="mention">Banc d’essai visuel — données fictives, aucune donnée réelle lue.</p>
  </main>
</div>

<style>
  .demo :global(.carte-v1 header .pastille) {
    font-size: 14px;
    padding: 2px var(--espace-3);
  }
  .demo {
    display: grid;
    grid-template-columns: var(--largeur-barre) 1fr;
    height: 100vh;
  }
  main {
    overflow-y: auto;
    padding: var(--espace-6) var(--espace-10) var(--espace-6);
    font-size: var(--texte-courant);
  }
  .paies {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--espace-6);
  }
  .haut {
    display: flex;
    align-items: center;
    gap: var(--espace-4);
    margin-bottom: var(--espace-4);
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
    font-size: var(--texte-courant);
  }
  button.contour {
    border: var(--bordure-structure);
  }
  .apercus {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--espace-6);
    margin: var(--espace-5) 0;
  }
  .apercu-ligne {
    display: flex;
    align-items: baseline;
    gap: var(--espace-3);
  }
  .discret-v1 {
    font-size: var(--texte-courant);
  }
  .eclats-droite {
    margin-left: auto;
    align-self: center;
  }
  .mention {
    margin: var(--espace-3) 0 0;
    font-size: var(--texte-petit);
    color: var(--couleur-texte-discret);
    text-align: center;
  }
</style>
