import { expect, test, type Page } from '@playwright/test';

const ESP = ' ';
const ouvrirMesPaies = async (page: Page, jour = '2027-05-20') => {
  await page.goto(`/?aujourdhui=${jour}`);
  await page.getByRole('button', { name: 'Mes paies' }).click();
};

test('profil sans montant : tout reste « À compléter », rien n’est inventé', async ({ page }) => {
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByTestId('consequences')).toContainText('À compléter');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('description-profil')).toHaveText('Aux deux semaines, à partir du jeudi 7 janvier 2027');
  await expect(page.getByTestId('salaire-actuel')).toHaveText('À compléter');
  await expect(page.getByTestId('disponible').first()).toHaveText('À compléter');
});

async function creerProfil(page: Page) {
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$`);
}

test('changement de salaire daté : aperçu avant et après, puis confirmation', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-07-01');
  await creerProfil(page);
  await page.getByRole('button', { name: 'Changer le salaire à partir d’une date' }).click();
  await page.getByLabel('À partir du').fill('2027-06-10');
  await page.getByLabel('Nouveau salaire net ($)').fill('2 180');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Salaire net à partir du jeudi 10 juin 2027');
  await expect(apercu).toContainText(`2${ESP}100,00${ESP}$`);
  await expect(apercu).toContainText(`2${ESP}180,00${ESP}$`);
  await expect(apercu).toContainText('Les paies d’avant le jeudi 10 juin 2027 ne changent pas.');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}180,00${ESP}$`);
});

test('annuler un aperçu n’enregistre rien', async ({ page }) => {
  await ouvrirMesPaies(page);
  await creerProfil(page);
  await page.getByRole('button', { name: 'Seuil d’attention' }).click();
  await page.getByLabel('Seuil d’attention ($, vide pour aucun)').fill('3000');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('seuil')).toHaveText('aucun');
  await expect(page.getByTestId('signal')).toHaveCount(0);
});

test('seuil d’attention : les cycles sous le seuil sont signalés avec discrétion', async ({ page }) => {
  await ouvrirMesPaies(page);
  await creerProfil(page);
  await page.getByRole('button', { name: 'Seuil d’attention' }).click();
  await page.getByLabel('Seuil d’attention ($, vide pour aucun)').fill('3000');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('seuil')).toHaveText(`3${ESP}000,00${ESP}$`);
  await expect(page.getByTestId('signal').first()).toHaveText('À anticiper');
});

test('paie déplacée : refusée au-delà de la suivante, acceptée entre les deux (A11, Q11)', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-04-10');
  await creerProfil(page);
  const ligne = page.locator('tr[data-cycle="2027-04-15"]');
  await ligne.getByRole('button', { name: 'Détails' }).click();
  await page.getByLabel('Date réelle de versement').fill('2027-04-30');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByTestId('erreur-saisie')).toContainText('entre la paie précédente et la suivante');

  await page.getByLabel('Date réelle de versement').fill('2027-04-16');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByTestId('consequences')).toContainText('les paies suivantes gardent leurs dates');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  const deplacee = page.locator('tr[data-cycle="2027-04-16"]');
  await expect(deplacee).toContainText('déplacée');
  await expect(page.locator('tr[data-cycle="2027-04-29"]')).toBeVisible();
});

test('deux fois par mois : le 15 et le dernier jour', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-02-01');
  await page.getByLabel('Fréquence').selectOption('deuxFoisParMois');
  await page.getByLabel('Date de la première paie').fill('2027-01-15');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByTestId('apercu')).toContainText('Deux fois par mois, le 15 et le dernier jour');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('tr[data-cycle="2027-02-15"]')).toBeVisible();
  await expect(page.locator('tr[data-cycle="2027-02-28"]')).toBeVisible();
});
