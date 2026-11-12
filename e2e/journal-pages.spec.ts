import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// Journal (0.16.0) : pages de 50, filtres année / mois / section. Fuseau de
// Montréal, aperçu en mémoire, données fictives.
test.use({ timezoneId: 'America/Toronto' });

const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page, changements: number) {
  await page.goto('/?aujourdhui=2026-11-30');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2026-11-05');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  // Des changements de seuil fictifs pour remplir le journal.
  for (let i = 1; i <= changements; i++) {
    await page.getByRole('button', { name: 'Seuil d’attention' }).click();
    await page.getByLabel('Seuil d’attention ($, vide pour aucun)').fill(String(i));
    await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page.getByTestId('fenetre-formulaire')).toHaveCount(0);
  }
  await nav(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Journal' }).click();
  return page.getByTestId('journal');
}

test('pages de 50 : seule la page choisie, filtres gardés, retour au début du Journal', async ({ page }) => {
  test.setTimeout(120_000);
  const journal = await preparer(page, 53);
  const compte = journal.getByTestId('compte-journal');
  const entrees = journal.getByTestId('entree-journal');
  await expect(compte).toHaveText(/^Page 1 sur 2 · changements 1 à 50 sur \d+$/);
  const total = Number((await compte.textContent())!.match(/sur (\d+)$/)![1]);
  expect(total).toBeGreaterThan(50);
  await expect(entrees).toHaveCount(50);
  await expect(journal.getByRole('button', { name: 'Plus récents' })).toBeDisabled();
  const premiere = await entrees.first().textContent();

  await journal.getByRole('button', { name: 'Plus anciens' }).click();
  await expect(compte).toHaveText(`Page 2 sur 2 · changements 51 à ${total} sur ${total}`);
  await expect(entrees).toHaveCount(total - 50); // pas d'accumulation
  await expect(entrees.first()).not.toHaveText(premiere!);
  await expect(journal.getByRole('heading', { level: 3 }).first()).toHaveText('Aujourd’hui — lundi 30 novembre (suite)');
  await expect(journal.getByRole('button', { name: 'Plus anciens' })).toBeDisabled();
  // Retour au début du Journal : son titre est en haut de l'écran.
  const y = (await journal.getByRole('heading', { name: 'Journal des changements' }).boundingBox())!.y;
  expect(y).toBeGreaterThan(0);
  expect(y).toBeLessThan(150);

  // Les filtres restent actifs d'une page à l'autre.
  await journal.getByRole('button', { name: 'Plus récents' }).click();
  await journal.getByTestId('filtre-annee').selectOption('2026');
  await expect(compte).toHaveText(/^Page 1 sur 2/);
  await journal.getByRole('button', { name: 'Plus anciens' }).click();
  await expect(compte).toHaveText(/^Page 2 sur 2/);
  await expect(journal.getByTestId('filtre-annee')).toHaveValue('2026');
  // Un changement de filtre ramène à la page 1.
  await journal.getByRole('button', { name: 'Mes paies', exact: true }).click();
  await expect(compte).toHaveText(/^Page 1 sur /);
});

test('année puis mois, combinés à la section ; « Toutes les années » remet « Tous les mois » ; réinitialiser', async ({ page }) => {
  const journal = await preparer(page, 2);
  const annee = journal.getByTestId('filtre-annee');
  const mois = journal.getByTestId('filtre-mois');
  // Seulement les années présentes, et le mois attend une année.
  await expect(annee.locator('option')).toHaveText(['Toutes les années', '2026']);
  await expect(mois).toBeDisabled();
  await expect(journal.getByRole('button', { name: 'Réinitialiser les filtres' })).toHaveCount(0);

  await annee.selectOption('2026');
  await expect(mois).toBeEnabled();
  await expect(mois.locator('option')).toHaveCount(13);
  await mois.selectOption('11');
  await expect(journal.getByTestId('entree-journal').first()).toBeVisible();
  const enNovembre = await journal.getByTestId('entree-journal').count();
  await mois.selectOption('10');
  await expect(journal.getByTestId('journal-vide')).toHaveText('Aucun changement pour cette période.');
  await mois.selectOption('11');
  await journal.getByRole('button', { name: 'Dettes', exact: true }).click();
  await expect(journal.getByTestId('journal-vide')).toHaveText('Aucun changement pour cette période.');
  await journal.getByRole('button', { name: 'Mes paies', exact: true }).click();
  await expect(journal.getByTestId('entree-journal')).toHaveCount(enNovembre);

  await annee.selectOption('');
  await expect(mois).toHaveValue('');
  await expect(mois).toBeDisabled();
  await journal.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(journal.getByRole('button', { name: 'Toutes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(annee).toHaveValue('');
  await expect(journal.getByRole('button', { name: 'Réinitialiser les filtres' })).toHaveCount(0);

  // Réouverture de l'onglet : filtres par défaut et page 1.
  await annee.selectOption('2026');
  await page.getByRole('tab', { name: 'Sauvegardes locales' }).click();
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page.getByTestId('filtre-annee')).toHaveValue('');
  await expect(page.getByTestId('compte-journal')).toHaveText(/^Page 1 sur 1/);
});
