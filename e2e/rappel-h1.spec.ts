import { expect, test } from '@playwright/test';

// H1 : le rappel « à vérifier » couvre tout l'historique. Données fictives :
// un calendrier commencé deux ans et demi avant aujourd'hui, rien de confirmé.
test('le rappel compte les paies non confirmées de plus de 200 jours', async ({ page }) => {
  await page.goto('/?aujourdhui=2027-06-10');
  await page.getByLabel('Date de la première paie').fill('2025-01-02');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  const rappel = page.getByTestId('a-verifier-avant');
  // Du 2 janv. 2025 au 20 mai 2027 : 63 paies aux deux semaines avant le cycle actuel (3 juin),
  // toutes « À vérifier » (une date passée ne vaut jamais confirmation). L'ancienne limite en comptait une quinzaine.
  await expect(rappel).toContainText('63 éléments à vérifier dans les paies précédentes');
});
