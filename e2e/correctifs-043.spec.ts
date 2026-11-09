import { expect, test, type Page } from '@playwright/test';

// Version 0.4.3 : parcours de la paie déplacée (corrections 1, 2, 3, 5).

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2026-11-08');
  await page.getByRole('button', { name: 'Mes paies' }).click();
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  if (await page.getByTestId('apercu').count()) await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('tr[data-cycle="2027-04-29"]')).toBeVisible();
}

async function deplacer(page: Page, ligne: string, date: string) {
  const b = page.locator(`tr[data-cycle="${ligne}"]`).getByRole('button', { name: 'Détails' });
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  const detail = page.getByTestId('detail-cycle');
  // Correction 1 : le formulaire de paie est replié tant qu'on ne le demande pas.
  await expect(detail.getByLabel('Date réelle de versement')).toHaveCount(0);
  await detail.getByRole('button', { name: 'Modifier la date ou le montant de cette paie…' }).click();
  // V1 : le formulaire s'ouvre dans une fenêtre centrée.
  const fenetre = page.getByTestId('fenetre-formulaire');
  await fenetre.getByLabel('Date réelle de versement').fill(date);
  await fenetre.getByRole('button', { name: 'Enregistrer', exact: true }).click();
}

test('déplacer la 3e paie d’avril : aperçu obligatoire, puis ligne bien visible avec sa date d’origine', async ({ page }) => {
  await preparer(page);
  await deplacer(page, '2027-04-29', '2027-05-10');
  // Correction 2 : toujours un aperçu, avec les durées en clair.
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Cycle de la paie du 15 avr. : 14 jours → 25 jours (du 15 avr. au 9 mai).');
  await expect(apercu).toContainText('Cycle de cette paie : 14 jours → 3 jours (du 10 mai au 12 mai).');
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  // Correction 3 : la paie déplacée reste repérable par sa date d'origine.
  const ligne = page.locator('tr[data-cycle="2027-05-10"]');
  await expect(ligne).toContainText('10 mai 2027');
  await expect(ligne).toContainText('prévue le 29 avr.');
  await expect(page.locator('[data-testid="cycles"] tbody tr[data-cycle]')).toHaveCount(13);
});

test('remettre la paie à sa date d’origine : aperçu, puis retour exact au calendrier', async ({ page }) => {
  await preparer(page);
  await deplacer(page, '2027-04-29', '2027-05-10');
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await deplacer(page, '2027-05-10', '2027-04-29');
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Cycle de cette paie : 3 jours → 14 jours (du 29 avr. au 12 mai).');
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  const ligne = page.locator('tr[data-cycle="2027-04-29"]');
  await expect(ligne).toContainText('29 avr. 2027');
  await expect(ligne).not.toContainText('prévue le');
});

test('le formulaire d’ajustement d’une ligne et celui de la paie ne s’affichent jamais ensemble (une fenêtre à la fois)', async ({ page }) => {
  await preparer(page);
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nature').selectOption({ label: 'Revenu' });
  await f.getByLabel('Nom').fill('Remboursement');
  await f.getByLabel('Montant ($, facultatif)').fill('500');
  await f.getByLabel('Quand').selectOption({ label: 'Une seule fois' });
  await f.getByLabel('Date').fill('2027-05-10');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await page.locator('tr[data-cycle="2027-04-29"]').getByRole('button', { name: 'Détails' }).click();
  const detail = page.getByTestId('detail-cycle');
  await detail.locator('tr', { hasText: 'Remboursement' }).getByRole('button', { name: 'Ajuster' }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre).toHaveCount(1);
  await expect(fenetre.getByLabel('Date prévue')).toBeVisible();
  await expect(page.getByLabel('Date réelle de versement')).toHaveCount(0);
  await fenetre.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await detail.getByRole('button', { name: 'Modifier la date ou le montant de cette paie…' }).click();
  await expect(fenetre).toHaveCount(1);
  await expect(fenetre.getByLabel('Date réelle de versement')).toBeVisible();
  await expect(page.getByLabel('Date prévue')).toHaveCount(0);
});

test('bandeaux : « Enregistré » se ferme à la demande, « Annulé » disparaît seul', async ({ page }) => {
  await preparer(page);
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nom').fill('Abonnement');
  await f.getByLabel('Montant ($, facultatif)').fill('20');
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill('2027-08-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const enregistre = page.getByTestId('enregistre');
  await expect(enregistre).toBeVisible();
  await enregistre.getByRole('button', { name: 'Fermer' }).click();
  await expect(enregistre).toHaveCount(0);

  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  await f.getByLabel('Nom').fill('Abonnement 2');
  await f.getByLabel('Montant ($, facultatif)').fill('20');
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill('2027-08-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('annule')).toBeVisible();
  await expect(page.getByTestId('annule')).toHaveCount(0, { timeout: 10_000 });
});
