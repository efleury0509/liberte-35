import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// H3 : mini-bilan d'une paie terminée, en tête de sa grande fenêtre.
// Données fictives ; aujourd'hui : 10 mars 2027 ; paies aux deux semaines depuis le 7 janv.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);

async function ajouter(page: Page, nom: string, montant: string, date: string) {
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nom').fill(nom);
  await f.getByLabel('Montant ($, facultatif)').fill(montant);
  await f.getByLabel('Quand').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Date').fill(date);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  // Des paies passées changent : aperçu.
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
}

test('le bilan d’une paie terminée : prévu et confirmé côte à côte, à vérifier, « À compléter », jamais un solde', async ({ page }) => {
  await page.goto('/?aujourdhui=2027-03-10');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await ajouter(page, 'Loyer (fictif)', '1100', '2027-01-15');
  await ajouter(page, 'Internet (fictif)', '', '2027-01-18');

  // La paie actuelle n'a pas de bilan : elle n'est pas terminée.
  await page.getByTestId('paie-principale').first().getByRole('button', { name: /Voir le détail complet/ }).click();
  await expect(page.getByTestId('fenetre-formulaire').getByTestId('detail-cycle')).toBeVisible();
  await expect(page.getByTestId('bilan-paie')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Toutes mes paies' }).click();
  await page.getByRole('button', { name: 'Terminées' }).click();
  await page.locator('[data-testid="paie-terminee"][data-cycle="2027-01-07"]').click();
  const bilan = page.getByTestId('bilan-paie');
  await expect(bilan).toContainText('Terminée');
  await expect(bilan).toContainText('3 à vérifier');
  const revenus = bilan.getByTestId('bilan-revenus');
  await expect(revenus.getByTestId('prevu')).toHaveText($('2 100,00 $'));
  await expect(revenus.getByTestId('confirme')).toContainText('Aucune confirmation');
  await expect(revenus.getByTestId('confirme')).toContainText('0 sur 1 opération');
  // Internet n'a pas de montant : le total prévu des sorties est « À compléter », jamais 0.
  await expect(bilan.getByTestId('bilan-sorties').getByTestId('prevu')).toHaveText('À compléter');
  await expect(bilan.getByTestId('bilan-a-verifier')).toContainText('la paie du 7 janv.');
  await expect(bilan.getByTestId('bilan-a-verifier')).toContainText('Loyer (fictif) (15 janv.)');
  await expect(bilan).toContainText('ce n’est pas le solde de ton compte');
  await expect(bilan).not.toContainText('Écart');

  // Confirmer avec les mécanismes habituels : le bilan suit.
  const fenetre = page.getByTestId('fenetre-formulaire');
  await fenetre.getByRole('button', { name: 'Confirmer la paie' }).click();
  await expect(revenus.getByTestId('confirme')).toContainText($('2 100,00 $'));
  await expect(revenus.getByTestId('confirme')).toContainText('1 sur 1 opération');
  await fenetre.getByRole('button', { name: 'Confirmer Loyer (fictif)' }).click();
  const sorties = bilan.getByTestId('bilan-sorties');
  await expect(sorties.getByTestId('confirme')).toContainText($('1 100,00 $'));
  await expect(sorties.getByTestId('confirme')).toContainText('1 sur 2 opérations');
  await expect(sorties.getByTestId('prevu')).toHaveText('À compléter');
  await expect(bilan.getByTestId('bilan-a-verifier')).toHaveText('À vérifier : Internet (fictif) (18 janv.).');
  await expect(bilan).toContainText('1 à vérifier');
});
