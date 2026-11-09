<script lang="ts">
  // Barre latérale prune V1, toujours visible (cahier V1, section 4) : seules
  // les sections développées s'affichent ; Paramètres et Aide en pied.
  import { House, CalendarDays, ShoppingCart, PiggyBank, Landmark, Target, FlaskConical, ChartColumn, Settings, CircleHelp } from '@lucide/svelte';
  import NavigationLaterale, { type EntreeNavigation } from './base/NavigationLaterale.svelte';
  import { SECTIONS, type IconeSection, type IdSection } from '../lib/navigation';
  import type { Profil } from '../lib/plateforme';
  import { TEXTES } from '../lib/textes.fr';

  interface Props {
    active: IdSection;
    profil: Profil | undefined;
    /** Numéro de version, visible dès l'ouverture (étape 4b). */
    version?: string | undefined;
    onchoisir: (id: IdSection) => void;
  }
  let { active, profil, version, onchoisir }: Props = $props();

  const ICONES: Record<IconeSection, EntreeNavigation['icone']> = {
    accueil: House,
    paies: CalendarDays,
    depenses: ShoppingCart,
    epargne: PiggyBank,
    dettes: Landmark,
    objectifs: Target,
    scenarios: FlaskConical,
    rapports: ChartColumn,
    parametres: Settings,
    aide: CircleHelp,
  };
  const entree = (s: (typeof SECTIONS)[number]): EntreeNavigation => ({ id: s.id, libelle: s.libelle, icone: ICONES[s.icone] });
  const principales = SECTIONS.filter((s) => s.zone === 'principale').map(entree);
  const pied = SECTIONS.filter((s) => s.zone === 'pied').map(entree);
</script>

<NavigationLaterale
  entrees={principales}
  {pied}
  {active}
  libelle={TEXTES.navigation.titre}
  marque={profil === 'essai' ? 'Essai' : null}
  version={version ?? null}
  onchoisir={(id) => onchoisir(id as IdSection)}
/>
