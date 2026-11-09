import { expect, test } from '@playwright/test';

const SECTIONS = [
  "Vue d'ensemble",
  'Mes paies',
  'Mes dettes',
  'Mon épargne',
  'Dépenses à prévoir',
  'Mes objectifs',
  'Et si…',
  'Paramètres',
];

test('la barre latérale affiche les huit sections et la Vue d’ensemble par défaut', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('button')).toHaveText(SECTIONS);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Vue d'ensemble");
  await expect(nav.getByRole('button', { name: "Vue d'ensemble" })).toHaveAttribute('aria-current', 'page');
});

test('chaque section s’ouvre et la barre latérale reste visible', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  for (const libelle of SECTIONS) {
    await nav.getByRole('button', { name: libelle }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(libelle);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: libelle })).toHaveAttribute('aria-current', 'page');
  }
});

test('la navigation fonctionne entièrement au clavier', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab'); // Vue d'ensemble
  await page.keyboard.press('Tab'); // Mes paies
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes paies');
});

test('Paramètres décrit l’installation, ici en mode aperçu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paramètres' }).click();
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
