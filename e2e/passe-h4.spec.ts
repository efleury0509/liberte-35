import { expect, test, type Page } from '@playwright/test';

// H4 : une modification de règle qui touche une paie passée, même très
// ancienne, passe par un aperçu ; « Abandonner » ne change rien.
// Données fictives ; aujourd'hui : 10 juin 2027 ; calendrier depuis le 2 janv. 2025.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-06-10');
  await page.getByLabel('Date de la première paie').fill('2025-01-02');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nom').fill('Gym (fictif)');
  await f.getByLabel('Montant ($, facultatif)').fill('40');
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill('2025-01-05');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
}

test('une suspension en février 2025 (plus de deux ans) passe par un aperçu ; « Abandonner » ne change rien', async ({ page }) => {
  await preparer(page);
  const rappel = page.getByTestId('a-verifier-avant');
  const avant = await rappel.textContent();
  await nav(page, 'Dépenses');
  await page.getByTestId('panneau-fixes').getByRole('listitem').filter({ hasText: 'Gym' }).getByRole('button', { name: 'Gérer' }).click();
  const gestion = page.getByTestId('fenetre-formulaire');
  await gestion.getByRole('button', { name: 'Suspendre' }).click();
  await gestion.getByLabel('Du').fill('2025-02-01');
  await gestion.getByLabel('Au (inclus)').fill('2025-02-28');
  await gestion.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Attention : des cycles déjà passés changeraient (la paie du jeudi 30 janvier 2025).');
  await apercu.getByRole('button', { name: 'Abandonner' }).click();
  await expect(apercu).toHaveCount(0);
  await expect(page.getByTestId('enregistre')).toHaveCount(0);
  // La fenêtre « Gérer » reste ouverte : on la referme sans rien enregistrer.
  await gestion.getByRole('button', { name: 'Abandonner sans enregistrer' }).click();
  await nav(page, 'Mes paies');
  // Rien n'a bougé : le gym de février 2025 est toujours à vérifier.
  await expect(rappel).toHaveText(avant!);
});

test('changer le calendrier : l’aperçu chiffre le redécoupage des paies passées ; « Abandonner » garde le calendrier', async ({ page }) => {
  await preparer(page);
  await page.getByRole('button', { name: 'Modifier le calendrier de paie' }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await fenetre.getByLabel('Fréquence').selectOption({ label: 'Une fois par mois' });
  await fenetre.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Le calendrier de paie est recalculé en entier');
  await expect(apercu).toContainText(/Attention : ce changement redécoupe tes paies passées\. \d+ paies passées changent de période ; \d+ opérations passées changent de paie\./);
  await apercu.getByRole('button', { name: 'Abandonner' }).click();
  await expect(apercu).toHaveCount(0);
  await expect(page.getByTestId('description-profil')).toHaveText('Aux deux semaines, à partir du jeudi 2 janvier 2025');
});
