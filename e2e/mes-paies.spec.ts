import { expect, test, type Page } from '@playwright/test';

const ESP = ' ';
const ouvrirMesPaies = async (page: Page, jour = '2027-05-20') => {
  await page.goto(`/?aujourdhui=${jour}`);
  await page.getByRole('button', { name: 'Mes paies' }).click();
};
/** Bouton « Enregistrer » d'un formulaire (pas celui de l'aperçu). */
const enregistrer = (page: Page) => page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
const enregistrerApercu = (page: Page) => page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();

test('profil sans montant : aperçu (le calendrier touche tout), puis « À compléter » partout', async ({ page }) => {
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await enregistrer(page);
  await expect(page.getByTestId('apercu')).toContainText('À vérifier avant d’enregistrer');
  await expect(page.getByTestId('consequences')).toContainText('À compléter');
  await enregistrerApercu(page);
  await expect(page.getByTestId('description-profil')).toHaveText('Aux deux semaines, à partir du jeudi 7 janvier 2027');
  await expect(page.getByTestId('salaire-actuel')).toHaveText('À compléter');
  await expect(page.getByTestId('disponible').first()).toHaveText('À compléter');
});

async function creerProfil(page: Page) {
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await enregistrer(page);
  await enregistrerApercu(page);
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$`);
}

test('changement de salaire dans le passé : aperçu avant et après', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-07-01');
  await creerProfil(page);
  await page.getByRole('button', { name: 'Changer le salaire à partir d’une date' }).click();
  await page.getByLabel('À partir du').fill('2027-06-10');
  await page.getByLabel('Nouveau salaire net ($)').fill('2 180');
  await enregistrer(page);
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Salaire net à partir du jeudi 10 juin 2027');
  await expect(apercu).toContainText(`2${ESP}100,00${ESP}$`);
  await expect(apercu).toContainText(`2${ESP}180,00${ESP}$`);
  await expect(apercu).toContainText('Les paies d’avant le jeudi 10 juin 2027 ne changent pas.');
  await enregistrerApercu(page);
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}180,00${ESP}$`);
});

test('salaire futur : enregistré directement, sans aperçu (C)', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-02-10');
  await creerProfil(page);
  await page.getByRole('button', { name: 'Changer le salaire à partir d’une date' }).click();
  await page.getByLabel('À partir du').fill('2027-03-01');
  await page.getByLabel('Nouveau salaire net ($)').fill('2200');
  await enregistrer(page);
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('enregistre')).toContainText('Changer le salaire à partir d’une date');
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(`2${ESP}200,00${ESP}$`);
});

test('annuler un aperçu n’enregistre rien', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-07-01');
  await creerProfil(page);
  await page.getByRole('button', { name: 'Changer le salaire à partir d’une date' }).click();
  await page.getByLabel('À partir du').fill('2027-06-10');
  await page.getByLabel('Nouveau salaire net ($)').fill('3000');
  await enregistrer(page);
  await page.getByTestId('apercu').getByRole('button', { name: 'Abandonner' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$`);
});

test('seuil d’attention : direct, signal discret, puis « Annuler » rétablit (C1)', async ({ page }) => {
  await ouvrirMesPaies(page);
  await creerProfil(page);
  await page.getByRole('button', { name: 'Seuil d’attention' }).click();
  await page.getByLabel('Seuil d’attention ($, vide pour aucun)').fill('3000');
  await enregistrer(page);
  await expect(page.getByTestId('seuil')).toHaveText(`3${ESP}000,00${ESP}$`);
  await expect(page.getByTestId('signal').first()).toHaveText('À anticiper');
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('annule')).toContainText('Annulé');
  await expect(page.getByTestId('seuil')).toHaveText('aucun');
  await expect(page.getByTestId('signal')).toHaveCount(0);
});

test('paie déplacée : refusée au-delà de la suivante, acceptée entre les deux, toujours avec un aperçu (A11, Q11, 0.4.3)', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-04-10');
  await creerProfil(page);
  const ligne = page.locator('tr[data-cycle="2027-04-15"]');
  await ligne.getByRole('button', { name: 'Détails' }).click();
  await page.getByRole('button', { name: 'Modifier la date ou le montant de cette paie…' }).click();
  await page.getByLabel('Date réelle de versement').fill('2027-04-30');
  await page.getByTestId('fenetre-formulaire').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByTestId('fenetre-formulaire').getByTestId('erreur-saisie')).toContainText('entre la paie précédente et la suivante');

  await page.getByLabel('Date réelle de versement').fill('2027-04-16');
  await page.getByTestId('fenetre-formulaire').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  // Changer la date d'une paie : toujours un aperçu, même sans élément touché.
  await expect(page.getByTestId('apercu')).toContainText('Cycle de cette paie : 14 jours → 13 jours');
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  const deplacee = page.locator('tr[data-cycle="2027-04-16"]');
  await expect(deplacee).toContainText('prévue le 15 avr.');
  await expect(page.locator('tr[data-cycle="2027-04-29"]')).toBeVisible();
});

test('deux fois par mois : le 15 et le dernier jour', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-02-01');
  await page.getByLabel('Fréquence').selectOption('deuxFoisParMois');
  await page.getByLabel('Date de la première paie').fill('2027-01-15');
  await enregistrer(page);
  await expect(page.getByTestId('apercu')).toContainText('Deux fois par mois, le 15 et le dernier jour');
  await enregistrerApercu(page);
  await expect(page.locator('tr[data-cycle="2027-02-15"]')).toBeVisible();
  await expect(page.locator('tr[data-cycle="2027-02-28"]')).toBeVisible();
});

test('D : voir les paies suivantes, puis revenir au cycle actuel', async ({ page }) => {
  await ouvrirMesPaies(page, '2027-02-10');
  await creerProfil(page);
  const lignes = page.getByTestId('cycles').locator('tbody tr');
  await expect(lignes).toHaveCount(13);
  await expect(page.getByRole('button', { name: 'Revenir au cycle actuel' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voir les paies suivantes' }).click();
  await expect(lignes).toHaveCount(26);
  await page.getByRole('button', { name: 'Voir les paies suivantes' }).click();
  await expect(lignes).toHaveCount(39);
  // Septembre 2027 a trois paies : le 2, le 16 et le 30.
  for (const jour of ['2027-09-02', '2027-09-16', '2027-09-30']) await expect(page.locator(`tr[data-cycle="${jour}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Revenir au cycle actuel' }).click();
  await expect(lignes).toHaveCount(13);
  await expect(lignes.first()).toHaveAttribute('data-cycle', '2027-02-04');
});

test('le détail d’un cycle s’ouvre juste sous sa ligne, et se referme', async ({ page }) => {
  await page.goto('/?aujourdhui=2027-05-20');
  await page.getByRole('button', { name: 'Mes paies' }).click();
  await page.getByTestId('bouton-exemple').click();
  const ligne = page.locator('tr[data-cycle="2027-02-18"]');
  await ligne.getByRole('button', { name: 'Détails' }).click();
  await expect(page.locator('tr[data-cycle="2027-02-18"] + tr [data-testid="detail-cycle"]')).toBeVisible();
  await expect(page.getByTestId('detail-cycle')).toHaveCount(1);
  await ligne.getByRole('button', { name: 'Détails' }).click();
  await expect(page.getByTestId('detail-cycle')).toHaveCount(0);
});
