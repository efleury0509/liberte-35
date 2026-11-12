import { expect, test, type Page } from '@playwright/test';
import { voirTout } from './onglets';

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
  await voirTout(page);
  await expect(page.locator('tr[data-cycle="2027-01-07"]').getByTestId('disponible')).toHaveText($('1 000,00 $'));
});

test('V1 lot 6b : « Voir le détail complet » ouvre la paie dans une grande fenêtre ; une action y prend la place du détail, sans fenêtre superposée', async ({ page }) => {
  await preparer(page);
  await page.getByTestId('paie-principale').first().getByRole('button', { name: /Voir le détail complet/ }).click();
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre).toHaveCount(1);
  await expect(fenetre.getByRole('heading', { level: 2 })).toHaveText('Paie du jeudi 7 janvier 2027');
  const detail = fenetre.getByTestId('detail-cycle');
  await detail.getByRole('button', { name: 'Confirmer Loyer' }).click();
  const loyer = detail.locator('tr', { hasText: 'Loyer' });
  await expect(loyer.getByTestId('statut')).toContainText('Confirmé le 10 janv.');
  await expect(loyer.getByRole('button', { name: 'Annuler la confirmation' })).toHaveClass(/action-secondaire/);
  await loyer.getByRole('button', { name: 'Corriger' }).click();
  // Le formulaire remplace le détail dans la même fenêtre.
  await expect(fenetre).toHaveCount(1);
  const incrustee = page.getByTestId('fenetre-incrustee');
  await expect(incrustee).toContainText('Corriger « Loyer »');
  await expect(detail.locator('table')).toHaveCount(0);
  await expect(incrustee.getByRole('button', { name: '← Retour au détail de la paie' })).toBeVisible();
  // Échap referme d'abord le formulaire seul, puis la fenêtre.
  await page.keyboard.press('Escape');
  await expect(incrustee).toHaveCount(0);
  await expect(detail.locator('table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  await expect(page.getByTestId('paie-principale').first()).toContainText('Payé');
});

test('V1 lot 6b : une opération de la carte s’ouvre dans la fenêtre, à la souris ou au clavier, avec ses actions', async ({ page }) => {
  await preparer(page);
  const carte = page.getByTestId('paie-principale').first();
  const ligne = carte.getByTestId('ligne-cliquable').filter({ hasText: 'Loyer' });
  await ligne.focus();
  await page.keyboard.press('Enter');
  const fenetre = page.getByTestId('fenetre-formulaire');
  await expect(fenetre.getByRole('heading', { level: 2 })).toHaveText('« Loyer »');
  const operation = fenetre.getByTestId('detail-operation');
  await expect(operation).toContainText($('−1 100,00 $'));
  await expect(operation).toContainText('vendredi 15 janvier 2027');
  await expect(operation).toContainText('À venir');
  // « Ajuster » : le formulaire prend la place du détail de l'opération.
  await operation.getByRole('button', { name: 'Ajuster Loyer pour cette fois' }).click();
  const incrustee = page.getByTestId('fenetre-incrustee');
  await expect(incrustee).toContainText('Ajuster « Loyer » pour cette fois');
  await incrustee.getByRole('button', { name: '← Retour au détail de l’opération' }).click();
  await expect(operation).toBeVisible();
  // Confirmer : le mécanisme habituel, sans quitter la fenêtre.
  await operation.getByRole('button', { name: 'Confirmer Loyer' }).click();
  await expect(operation).toContainText('Confirmé le 10 janv.');
  await expect(page.getByTestId('enregistre')).toContainText('Enregistré : Confirmer « Loyer »');
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(operation).toContainText('À venir');
  await operation.getByTestId('voir-toute-la-paie').click();
  await expect(fenetre.getByTestId('detail-cycle')).toBeVisible();
  await fenetre.getByRole('button', { name: 'Abandonner sans enregistrer' }).click();
  await expect(fenetre).toHaveCount(0);
});

test('V1 lot 6b : « + N autres opérations » donne le nombre exact et ouvre le détail complet', async ({ page }) => {
  await preparer(page);
  const carte = page.getByTestId('paie-principale').first();
  // Cycle du 7 janv. : la paie et le loyer ; la carte montre le loyer.
  await expect(carte.getByTestId('ligne-cliquable')).toHaveCount(1);
  await expect(carte.getByTestId('autres-operations')).toHaveText('+ 1 autre opération');
  await carte.getByTestId('autres-operations').click();
  const detail = page.getByTestId('fenetre-formulaire').getByTestId('detail-cycle');
  await expect(detail.locator('tr[data-testid="ligne-paie"], tr[data-ligne]')).toHaveCount(2);
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
