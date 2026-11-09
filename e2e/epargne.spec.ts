import { expect, test, type Page } from '@playwright/test';

// Étape 9 : Mon épargne, dans l'aperçu en mémoire. Données fictives.
// Aujourd'hui = 15 janvier 2027 ; profil aux deux semaines dès le 7 janvier.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const CELI = 'CELI urgence';

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await page.getByRole('button', { name: 'Mes paies' }).click();
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('description-profil')).toBeVisible();
}

const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom }).click();

async function ajouterCompte(page: Page, type: string, nom: string, solde: string, le = '2027-01-01') {
  await page.getByRole('button', { name: 'Ajouter un compte' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Type').selectOption({ label: type });
  if (nom) await f.getByLabel('Nom (facultatif)').fill(nom);
  await f.getByLabel('Solde de départ ($, facultatif)').fill(solde);
  await f.getByLabel('En date du').fill(le);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('enregistre')).toContainText('Ajouter le compte');
}

const compte = (page: Page, nom: string) => page.getByTestId('compte').filter({ has: page.getByRole('heading', { name: nom }) });

test('T, S : comptes, valeur « À compléter » jamais 0 $, total avec comptes exclus', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Mon épargne');
  await ajouterCompte(page, 'CELI', CELI, '2000');
  await ajouterCompte(page, 'REER', '', '');
  await expect(compte(page, 'REER').getByTestId('valeur')).toHaveText('À compléter');
  await expect(compte(page, CELI).getByTestId('valeur')).toHaveText($('2 000,00 $'));
  const total = page.getByTestId('total-epargne');
  await expect(total).toContainText($('Total suivi : 2 000,00 $'));
  await expect(total.getByTestId('total-exclus')).toHaveText('Non compté : REER (à compléter).');
  await expect(total).toContainText('Ce total n’est pas de l’argent disponible dans tes cycles de paie.');
});

test('C, V : contribution à chaque paie dans Mes paies ; confirmée, elle s’ajoute à la valeur suivie', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Mon épargne');
  await ajouterCompte(page, 'CELI', CELI, '2000');
  const fiche = compte(page, CELI);
  await fiche.getByRole('button', { name: 'Ajouter une contribution récurrente…' }).click();
  const f = page.getByTestId('formulaire-contribution');
  await f.getByLabel('Montant ($)').fill('100');
  await f.getByLabel('Fréquence').selectOption({ label: 'À chaque paie' });
  await f.getByLabel('Première contribution le').fill('2027-01-07');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fiche.getByTestId('contributions')).toContainText($('100,00 $'));

  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  const detail = page.getByTestId('detail-cycle');
  const ligne = detail.locator('tr[data-epargne="contribution"]');
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText(`Contribution — ${CELI}`);
  await expect(page.getByText(`Contribution — ${CELI}`)).toHaveCount(1); // pas parmi les Revenus et dépenses
  await ligne.getByRole('button', { name: `Confirmer Contribution — ${CELI}` }).click();
  await expect(ligne.getByTestId('statut')).toContainText('Confirmé');

  await nav(page, 'Mon épargne');
  await expect(compte(page, CELI).getByTestId('valeur')).toHaveText($('2 100,00 $'));
});

test('F3, M2 : valeur en ligne → fluctuation proposée avec aperçu ; transfert sans effet sur le total', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Mon épargne');
  await ajouterCompte(page, 'CELI', CELI, '2000');
  await ajouterCompte(page, 'Compte épargne', '', '0');
  const celi = compte(page, CELI);
  await celi.getByRole('button', { name: 'Voir le détail' }).click();
  await celi.getByRole('button', { name: 'Fluctuation…' }).click();
  const f = page.getByTestId('formulaire-fluctuation');
  await expect(f).toContainText('Ajouter un gain ou une perte à la valeur suivie.');
  await expect(f.getByLabel('Date')).toHaveValue('2027-01-15');
  await f.getByLabel('J’entre la valeur affichée en ligne').check();
  await f.getByLabel('Valeur affichée en ligne ($)').fill('2060');
  await f.getByRole('button', { name: 'Voir l’aperçu' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText($('+60,00 $'));
  await expect(celi.getByTestId('valeur')).toHaveText($('2 000,00 $'));
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(celi.getByTestId('valeur')).toHaveText($('2 060,00 $'));

  await celi.getByRole('button', { name: 'Transfert…' }).click();
  const t = page.getByTestId('formulaire-transfert');
  await t.getByLabel('Vers le compte').selectOption({ label: 'Compte épargne' });
  await t.getByLabel('Montant ($)').fill('500');
  await t.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(celi.getByTestId('valeur')).toHaveText($('1 560,00 $'));
  await expect(compte(page, 'Compte épargne').getByTestId('valeur')).toHaveText($('500,00 $'));
  await expect(page.getByTestId('total-epargne')).toContainText($('Total suivi : 2 060,00 $'));
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(celi.getByTestId('valeur')).toHaveText($('2 060,00 $'));
});
