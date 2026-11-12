import { expect, test, type Page } from '@playwright/test';
import { voirTout, ouvrirMesPaies } from './onglets';

// H2 : les paies terminées dans « Toutes mes paies », par année et par mois.
// Données fictives ; aujourd'hui : 14 janv. 2027 ; paies aux deux semaines depuis le 6 nov. 2025.
async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-14');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2025-11-06');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nom').fill('Loyer (fictif)');
  await f.getByLabel('Montant ($, facultatif)').fill('1100');
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill('2025-11-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  // Des paies passées changent : l'aperçu le dit avant d'enregistrer.
  await expect(page.getByTestId('apercu')).toContainText('cycles déjà passés changeraient');
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
}

test('« En cours et à venir » garde le tableau ; « Terminées » range les anciennes paies par année et par mois', async ({ page }) => {
  await preparer(page);
  await voirTout(page);
  await expect(page.getByRole('button', { name: 'En cours et à venir' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tr[data-cycle="2027-01-14"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voir les paies précédentes' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Terminées' }).click();
  const annee = page.getByTestId('choix-annee');
  await expect(annee).toHaveValue('2026');
  await expect(page.getByTestId('mois-historique')).toHaveCount(12);
  await expect(page.getByTestId('mois-historique').first()).toContainText('Décembre 2026');
  // Une paie d'il y a plus d'un an : deux gestes.
  await annee.selectOption('2025');
  await expect(page.getByTestId('mois-historique')).toHaveCount(2);
  const paie = page.locator('[data-testid="paie-terminee"][data-cycle="2025-11-20"]');
  await expect(paie).toContainText('Paie du 20 nov.');
  await expect(paie).toContainText('Terminée');
  await expect(paie).toContainText('2 à vérifier');
  await paie.click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre.getByRole('heading', { level: 2 })).toHaveText('Paie du jeudi 20 novembre 2025');
  // Les mécanismes habituels restent là : confirmer la paie, avec « Annuler ».
  await fenetre.getByRole('button', { name: 'Confirmer la paie' }).click();
  await expect(fenetre.getByTestId('ligne-paie')).toContainText('Confirmée le 14 janv.');
  await expect(paie).toContainText('1 à vérifier');
  await expect(paie).toContainText('Terminée');
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(paie).toContainText('2 à vérifier');
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);

  // Au clavier : la ligne prend le focus et s'ouvre avec Entrée.
  await page.locator('[data-testid="paie-terminee"][data-cycle="2025-12-04"]').focus();
  await page.keyboard.press('Enter');
  await expect(fenetre.getByRole('heading', { level: 2 })).toHaveText('Paie du jeudi 4 décembre 2025');
  await page.keyboard.press('Escape');

  // Une seule zone défilante, même dans l'historique.
  const pageDefile = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
  expect(pageDefile).toBe(false);
});

test('le rappel « à vérifier » mène aux paies terminées concernées, avec l’année proposée', async ({ page }) => {
  await preparer(page);
  await page.getByTestId('a-verifier-avant').getByRole('button', { name: 'Les retrouver dans les paies terminées' }).click();
  await expect(page.getByRole('tab', { name: 'Toutes mes paies' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('filtre-a-verifier')).toBeChecked();
  await expect(page.getByTestId('choix-annee')).toHaveValue('2026');
  // L'option de chaque année dit combien il reste à vérifier.
  await expect(page.getByTestId('choix-annee').locator('option[value="2025"]')).toContainText('à vérifier');
  // Sans le filtre, les paies « Rien à vérifier » apparaissent aussi.
  await page.getByTestId('filtre-a-verifier').uncheck();
  await expect(page.getByTestId('paie-terminee').first()).toBeVisible();
});
