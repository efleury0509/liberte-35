import { expect, test, type Page } from '@playwright/test';

// Lot 1 : priorité de remboursement (choisie à la main) et « Solde réduit de
// X % depuis le départ ». Données fictives ; aujourd'hui : 15 févr. 2027.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-02-15');
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await nav(page, 'Dettes');
  for (const [nom, solde] of [
    ['Prêt auto (fictif)', '9800'],
    ['Prêt perso (fictif)', ''],
  ] as const) {
    await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
    const f = page.getByTestId('formulaire-ajout-pret');
    await f.getByLabel('Nom du prêt').fill(nom);
    await f.getByLabel('Versement ($)').fill('205');
    await f.getByLabel('Fréquence').selectOption({ label: 'À chaque paie' });
    await f.getByLabel('Prochain versement').fill('2027-02-18');
    if (solde) {
      await f.getByText('Autres renseignements').click();
      await f.getByLabel('Solde ($)').fill(solde);
      await f.getByLabel('Solde au').fill('2027-01-02');
    }
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    if (await page.getByTestId('apercu').count()) await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('fenetre-formulaire')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Ajouter ma carte' }).click();
  const fc = page.getByTestId('formulaire-ajout-carte');
  await fc.getByLabel('Nom de la carte').fill('Visa (fictive)');
  await fc.getByLabel('Prochaine échéance').fill('2027-03-11');
  await fc.getByRole('button', { name: 'Enregistrer' }).click();
}

test('priorité : aucune inventée, ordre choisi à la main, « Annuler », sans changer les prochains paiements', async ({ page }) => {
  await preparer(page);
  const panneau = page.getByTestId('priorite-dettes');
  await expect(panneau).toContainText('Aucune priorité choisie.');
  await expect(page.getByText(/^Priorité \d/)).toHaveCount(0);
  const prochains = await page.getByTestId('prochains-paiements').textContent();

  await panneau.getByRole('button', { name: 'Choisir un ordre…' }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre).toContainText('Ordre de priorité des dettes');
  await fenetre.getByRole('button', { name: 'Monter « Visa (fictive) »' }).click();
  await fenetre.getByRole('button', { name: 'Monter « Visa (fictive) »' }).click();
  await expect(fenetre.getByTestId('ordre-priorite').locator('li').first()).toContainText('Visa (fictive)');
  await fenetre.getByRole('button', { name: 'Enregistrer cet ordre' }).click();
  await expect(fenetre).toHaveCount(0);
  await expect(panneau.locator('ol li')).toHaveText(['Visa (fictive)', 'Prêt auto (fictif)', 'Prêt perso (fictif)']);
  await expect(page.getByTestId('fiche-carte')).toContainText('Priorité 1');
  await expect(page.locator('[data-pret]').filter({ hasText: 'Prêt perso (fictif)' })).toContainText('Priorité 3');
  // Un repère seulement : les prochains paiements sont identiques.
  await expect(page.getByTestId('prochains-paiements')).toHaveText(prochains!);

  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(panneau).toContainText('Aucune priorité choisie.');
  await expect(page.getByTestId('fiche-carte')).not.toContainText('Priorité 1');
});

test('« Solde réduit de X % » : seulement avec deux soldes déclarés, sans parler de capital', async ({ page }) => {
  await preparer(page);
  const progression = page.getByTestId('progression-dettes');
  const auto = progression.locator('[data-pret-progression]').filter({ hasText: 'Prêt auto (fictif)' });
  const perso = progression.locator('[data-pret-progression]').filter({ hasText: 'Prêt perso (fictif)' });
  await expect(auto).toContainText('À compléter');
  await expect(auto).toContainText('Un seul solde déclaré');
  await expect(perso).toContainText('Aucun solde déclaré.');

  await page.locator('[data-pret]').filter({ hasText: 'Prêt auto (fictif)' }).getByRole('button', { name: 'Mettre à jour le solde…' }).click();
  const f = page.getByTestId('formulaire-solde');
  await f.getByLabel('Date du solde').fill('2027-02-10');
  await f.getByLabel('Solde ($)').fill('9000');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  // (9 800 − 9 000) / 9 800 = 8,16 % → 8 %, arrondi vers le bas.
  await expect(auto).toContainText('Solde réduit de 8 % depuis le départ');
  await expect(auto).toContainText('La part de capital remboursé reste à compléter');
  await expect(progression).not.toContainText('capital remboursé de');
});
