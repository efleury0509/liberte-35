import { expect, test } from '@playwright/test';

// Sections développées, dans l'ordre de la barre latérale (V1).
const SECTIONS = ['Accueil', 'Mes paies', 'Dépenses', 'Épargne', 'Dettes', 'Paramètres'];
// 0.16.0 : l'Accueil a un titre de page « Bonjour ! » (la loutre le dit aussi).
const TITRE: Record<string, string> = { Accueil: 'Bonjour !' };

test('la barre latérale prune affiche les sections développées et l’Accueil par défaut', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('button')).toHaveText(SECTIONS);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour !');
  await expect(nav.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByText('Des rêves, mais')).toBeVisible();
});

test('les modules non développés restent masqués', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  for (const absent of ['Objectifs', 'Scénarios', 'Rapports', 'Aide']) await expect(nav.getByRole('button', { name: absent })).toHaveCount(0);
});

test('chaque section s’ouvre avec son en-tête et la barre latérale reste visible', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  for (const libelle of SECTIONS) {
    await nav.getByRole('button', { name: libelle, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITRE[libelle] ?? libelle);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: libelle, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('la navigation fonctionne entièrement au clavier', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab'); // Accueil
  await page.keyboard.press('Tab'); // Mes paies
  await page.keyboard.press('Tab'); // Dépenses
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépenses');
});

test('Paramètres décrit l’installation, ici en mode aperçu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paramètres' }).click();
  // V1 lot 5 : onglets par catégorie ; « Sauvegardes locales » s'ouvre d'abord.
  await expect(page.getByRole('tab', { name: 'Sauvegardes locales' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Installation' }).click();
  await expect(page.getByTestId('profil')).toHaveText('Aperçu dans le navigateur — rien n’est enregistré');
  await expect(page.getByTestId('version-schema')).toHaveText('9');
  await expect(page.getByTestId('integrite')).toHaveText('Aucun problème détecté');
  await expect(page.getByTestId('bandeau-profil')).toBeVisible();
});

test('un fichier de données illisible est signalé clairement, sur toutes les pages', async ({ page }) => {
  await page.goto('/?simuler=erreur');
  await expect(page.getByTestId('bandeau-erreur')).toContainText('Rien n’a été modifié');
  await page.getByRole('button', { name: 'Paramètres' }).click();
  await expect(page.getByTestId('erreur-etat')).toContainText('contrôle d’intégrité');
});

test('aucune requête ne sort vers Internet', async ({ page }) => {
  const exterieures: string[] = [];
  page.on('request', (r) => {
    const hote = new URL(r.url()).hostname;
    if (hote !== 'localhost' && hote !== '127.0.0.1') exterieures.push(r.url());
  });
  await page.goto('/');
  for (const libelle of SECTIONS) {
    await page.getByRole('button', { name: libelle }).click();
  }
  await page.waitForLoadState('networkidle');
  expect(exterieures).toEqual([]);
});

test('la version de l’application est visible dans la barre latérale (4b)', async ({ page }) => {
  await page.goto('/');
  const paquet = (await import('../package.json', { with: { type: 'json' } })).default.version;
  await expect(page.getByTestId('version-barre')).toHaveText(`Version ${paquet}`);
});
