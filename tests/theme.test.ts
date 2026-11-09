// Lot 1 V1 : fondations visuelles. Lisibilité (contraste AA), couleurs
// centralisées, polices embarquées, progression jamais inventée.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { progression } from '../src/lib/progression';
import { ILLUSTRATIONS } from '../src/lib/illustrations';

const jetons = readFileSync('src/styles/jetons.css', 'utf8');
const brut = new Map([...jetons.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
function couleur(nom: string): string {
  let v = brut.get(nom);
  for (let i = 0; v && v.startsWith('var(') && i < 10; i++) v = brut.get(v.slice(4, -1));
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${nom} : couleur introuvable (${v})`);
  return v;
}
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminance(couleur(a)), luminance(couleur(b))].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

describe('Thème V1 — lisibilité', () => {
  const fonds = ['--couleur-fond', '--couleur-surface', '--couleur-surface-active', '--couleur-panneau'];
  it.each([
    ...fonds.flatMap((f) => [
      ['--couleur-texte', f],
      ['--couleur-texte-discret', f],
      ['--couleur-lien', f],
      ['--couleur-attention', f],
      ['--couleur-erreur', f],
      ['--couleur-succes', f],
    ]),
    ['--couleur-accent-texte', '--couleur-accent'],
    ['--couleur-accent-texte', '--couleur-accent-survol'],
    ['--couleur-bandeau-texte', '--couleur-bandeau'],
    ['--couleur-barre-texte', '--couleur-barre'],
    ['--couleur-barre-actif-texte', '--couleur-barre-actif'],
    ['--etat-confirme-texte', '--etat-confirme-fond'],
    ['--etat-prevu-texte', '--etat-prevu-fond'],
    ['--etat-a-completer-texte', '--etat-a-completer-fond'],
    ['--etat-alerte-texte', '--etat-alerte-fond'],
    ['--etat-neutre-texte', '--etat-neutre-fond'],
    ['--couleur-attention', '--couleur-attention-fond'],
    ...['sauge', 'peche', 'rose', 'lilas'].map((t) => ['--couleur-titre', `--sorbet-${t}-moyen`]),
    ...['sauge', 'peche', 'rose', 'lilas', 'beurre'].map((t) => ['--couleur-texte', `--sorbet-${t}-pale`]),
    ['--couleur-erreur', '--couleur-erreur-fond'],
  ])('%s sur %s : contraste AA (≥ 4,5)', (texte, fond) => {
    expect(contraste(texte, fond)).toBeGreaterThanOrEqual(4.5);
  });

  it('les états sont distincts les uns des autres', () => {
    const fondsEtats = ['confirme', 'prevu', 'a-completer', 'alerte', 'neutre'].map((e) => couleur(`--etat-${e}-fond`));
    expect(new Set(fondsEtats).size).toBe(5);
  });
});

describe('Thème V1 — couleurs centralisées', () => {
  it('aucun composant ne code une couleur en dur', () => {
    const sources = [...fichiers('src/composants'), 'src/App.svelte'].filter((f) => f.endsWith('.svelte'));
    const fautifs = sources.filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(f, 'utf8').replace(/data-testid="[^"]*"/g, '')));
    expect(fautifs).toEqual([]);
  });
});

describe('Thème V1 — polices embarquées', () => {
  const base = readFileSync('src/styles/base.css', 'utf8');
  it.each(['Fraunces', 'Nunito'])('%s : fichier local présent, déclaré, licence OFL jointe', (nom) => {
    expect(existsSync(`src/assets/polices/${nom}-variable.woff2`)).toBe(true);
    expect(base).toContain(`url('../assets/polices/${nom}-variable.woff2')`);
    expect(readFileSync(`licences/${nom}-OFL.txt`, 'utf8')).toContain('SIL OPEN FONT LICENSE');
  });
  it('les titres et le texte utilisent ces polices', () => {
    expect(brut.get('--police-titre')).toMatch(/^'Fraunces'/);
    expect(brut.get('--police')).toMatch(/^'Nunito'/);
  });
});

describe('Échelle V1 (lot 1b)', () => {
  it('16 px pour le texte courant, une densité plus serrée pour les tableaux', () => {
    expect(brut.get('--texte-courant')).toBe('16px');
    expect(parseInt(brut.get('--texte-dense')!)).toBeLessThan(16);
  });
  it('la galerie et le banc d’essai ne s’ouvrent jamais dans l’application installée', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain("dansTauri() ? null : parametres.get('galerie')");
  });
});

describe('Progression : seulement quand elle est calculable', () => {
  it('valeur ou cible inconnue : à compléter, jamais 0 %', () => {
    expect(progression(null, 100_000)).toEqual({ calculable: false, raison: 'valeur-inconnue' });
    expect(progression(50_000, null)).toEqual({ calculable: false, raison: 'cible-inconnue' });
    expect(progression(50_000, 0)).toEqual({ calculable: false, raison: 'cible-inconnue' });
  });
  it('arrondi vers le bas, barre plafonnée à 100 %', () => {
    expect(progression(74_999, 100_000)).toMatchObject({ pourcentage: 74, largeur: 74, atteinte: false });
    expect(progression(0, 100_000)).toMatchObject({ pourcentage: 0, largeur: 0 });
    expect(progression(120_000, 100_000)).toMatchObject({ pourcentage: 120, largeur: 100, atteinte: true });
  });
});

describe('Illustrations', () => {
  it('aucune version simplifiée : tant qu’un fichier n’est pas fourni, l’emplacement reste vide', () => {
    for (const ill of Object.values(ILLUSTRATIONS)) expect(ill.fichier === null || !/^https?:/.test(ill.fichier)).toBe(true);
  });
});
