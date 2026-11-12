import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// V1 lot 3 : Épargne. Comptes côte à côte, synthèse sans double comptage,
// formulaires en fenêtre centrée, « Déplacer de l'argent », première
// affectation à la création d'une réserve. Données fictives.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const CELI = 'CELI urgence';
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();
const fiche = (page: Page) => page.getByTestId('compte').filter({ has: page.getByRole('heading', { name: CELI }) });
const reserve = (page: Page, nom: string) => page.locator(`[data-reserve="${nom}"]`);
const fenetre = (page: Page) => page.getByTestId('fenetre-formulaire');

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-02');
  await ouvrirMesPaies(page);
  await nav(page, 'Épargne');
  await page.getByRole('button', { name: 'Ajouter un compte' }).click();
  await expect(fenetre(page)).toBeVisible();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Type').selectOption({ label: 'CELI' });
  await f.getByLabel('Nom (facultatif)').fill(CELI);
  await f.getByLabel('Solde de départ ($, facultatif)').fill('2000');
  await f.getByLabel('En date du').fill('2027-01-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fenetre(page)).toHaveCount(0);
}

test('les formulaires s’ouvrent dans une fenêtre centrée ; Abandonner et Échap ferment sans rien enregistrer', async ({ page }) => {
  await preparer(page);
  await fiche(page).getByRole('button', { name: 'Fluctuation…' }).click();
  await expect(fenetre(page)).toContainText('Fluctuation');
  await expect(fenetre(page)).toContainText(`${CELI} · valeur suivie`);
  await page.getByTestId('formulaire-fluctuation').getByLabel('Gain (+) ou perte (−) ($)').fill('100');
  await fenetre(page).getByRole('button', { name: 'Abandonner' }).last().click();
  await expect(fenetre(page)).toHaveCount(0);
  await fiche(page).getByRole('button', { name: 'Retrait…' }).click();
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toHaveCount(0);
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 000,00 $'));
});

test('une erreur de saisie s’affiche dans la fenêtre, qui reste ouverte', async ({ page }) => {
  await preparer(page);
  await fiche(page).getByRole('button', { name: 'Retrait…' }).click();
  await page.getByTestId('formulaire-retrait').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fenetre(page).getByTestId('erreur-saisie')).toBeVisible();
  await expect(page.getByTestId('erreur-saisie')).toHaveCount(1);
});

test('nouvelle réserve avec première affectation, puis « Déplacer de l’argent » ; synthèse : dont réservé', async ({ page }) => {
  await preparer(page);
  await page.getByRole('button', { name: 'Nouvelle réserve…' }).click();
  const f = page.getByTestId('formulaire-reserve');
  await f.getByLabel('Nom').fill('Fonds d’urgence');
  await f.getByLabel('Cible ($, facultative)').fill('3000');
  await f.getByTestId('premiere-affectation').fill('1200');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('avec une première affectation');
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(reserve(page, 'Fonds d’urgence').getByTestId('solde-reserve')).toHaveText($('1 200,00 $'));
  await expect(page.getByTestId('total-reserve')).toHaveText($('1 200,00 $'));
  await expect(page.getByTestId('total-non-reserve')).toHaveText($('800,00 $'));
  await expect(page.getByTestId('total-epargne')).toContainText($('Total suivi : 2 000,00 $'));

  await fiche(page).getByRole('button', { name: 'Déplacer de l’argent…' }).click();
  const d = page.getByTestId('formulaire-deplacer');
  await d.getByLabel('De').selectOption({ label: $('Réserve « Fonds d’urgence » (1 200,00 $)') });
  await d.getByLabel('Vers').selectOption({ label: 'Non réservé' });
  await d.getByLabel('Montant ($)').fill('200');
  await d.getByRole('button', { name: 'Voir l’aperçu' }).click();
  if (await apercu.isVisible()) await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('total-reserve')).toHaveText($('1 000,00 $'));
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 000,00 $'));
  await expect(fiche(page).getByTestId('progression')).toContainText('33 %');
});
