import { expect, test, type Page } from '@playwright/test';

// V1 lot 4 : Mes paies. Paie actuelle et suivante côte à côte, 3e et 4e en
// aperçu, détail complet dans le tableau, formulaires en fenêtre centrée,
// actions secondaires compactes. Données fictives ; aujourd'hui : 10 janv. 2027.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-10');
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nom').fill('Loyer');
  await f.getByLabel('Montant ($, facultatif)').fill('1100');
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill('2027-01-15');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
}

test('paie actuelle et suivante côte à côte : revenus − dépenses prévues = disponible ; 3e et 4e en aperçu', async ({ page }) => {
  await preparer(page);
  const cartes = page.getByTestId('paie-principale');
  await expect(cartes).toHaveCount(2);
  await expect(cartes.first()).toContainText('Paie actuelle');
  await expect(cartes.first().getByTestId('equation')).toContainText($('Revenus 2 100,00 $'));
  await expect(cartes.first().getByTestId('equation')).toContainText($('Dépenses prévues 1 100,00 $'));
  await expect(cartes.first().getByTestId('montant-cle')).toHaveText($('1 000,00 $'));
  await expect(cartes.first()).toContainText('Loyer');
  await expect(cartes.nth(1)).toContainText('Paie suivante');
  await expect(page.getByTestId('paie-apercu')).toHaveCount(2);
  // Les mêmes chiffres que le tableau : rien n'est recalculé à part.
  await expect(page.locator('tr[data-cycle="2027-01-07"]').getByTestId('disponible')).toHaveText($('1 000,00 $'));
});

test('« Voir le détail complet » ouvre le cycle ; « Corriger » s’ouvre dans une fenêtre ; actions secondaires compactes', async ({ page }) => {
  await preparer(page);
  await page.getByTestId('paie-principale').first().getByRole('button', { name: /Voir le détail complet/ }).click();
  const detail = page.getByTestId('detail-cycle');
  await expect(detail).toContainText('Cycle du jeudi 7 janvier 2027');
  await detail.getByRole('button', { name: 'Confirmer Loyer' }).click();
  const loyer = detail.locator('tr', { hasText: 'Loyer' });
  await expect(loyer.getByRole('button', { name: 'Annuler la confirmation' })).toHaveClass(/action-secondaire/);
  await loyer.getByRole('button', { name: 'Corriger' }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre).toContainText('Corriger « Loyer »');
  await expect(fenetre).toContainText('Paie du 7 janv.');
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  await expect(page.getByTestId('paie-principale').first()).toContainText('Payé');
});

test('« Ma paie » : changer le salaire s’ouvre dans une fenêtre, Abandonner ne change rien', async ({ page }) => {
  await preparer(page);
  await page.getByRole('button', { name: 'Changer le salaire à partir d’une date' }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre).toContainText('Ma paie · Aux deux semaines');
  await fenetre.getByLabel('Nouveau salaire net ($)').fill('2500');
  await fenetre.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await expect(page.getByTestId('salaire-actuel')).toHaveText($('2 100,00 $'));
});
