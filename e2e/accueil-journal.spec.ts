import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// 0.16.0 : Accueil et journal. Aperçu en mémoire, données fictives.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function configurer(page: Page, jour: string, depart = '2027-01-07') {
  await page.goto(`/?aujourdhui=${jour}`);
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill(depart);
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
}

async function ajouterCarte(page: Page, echeance: string) {
  await nav(page, 'Dettes');
  await page.getByRole('button', { name: 'Ajouter ma carte' }).click();
  const f = page.getByTestId('formulaire-ajout-carte');
  await f.getByLabel('Nom de la carte').fill('Visa (fictive)');
  await f.getByLabel('Prochaine échéance').fill(echeance);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('fenetre-formulaire')).toHaveCount(0);
}

test('l’application s’ouvre sur l’Accueil ; sans paie, rien d’inventé ; la loutre est entière', async ({ page }) => {
  await page.goto('/?aujourdhui=2027-01-02');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour !');
  await expect(page.getByTestId('date-accueil')).toHaveText(/Samedi\s*2 janvier/);
  await expect(page.getByTestId('phrase-accueil')).toHaveText('Configure ta paie pour voir où tu en es.');
  await expect(page.getByTestId('carte-accueil')).toHaveCount(0);
  const loutre = page.getByRole('img', { name: /Une loutre à lunettes roses/ });
  await expect(loutre).toBeVisible();
  const { naturel, affiche } = await loutre.evaluate((img: HTMLImageElement) => ({
    naturel: [img.naturalWidth, img.naturalHeight],
    affiche: img.getBoundingClientRect().width / img.getBoundingClientRect().height,
  }));
  expect(naturel).toEqual([1671, 941]);
  expect(Math.abs(affiche - 1671 / 941)).toBeLessThan(0.01); // ni déformée ni recadrée
  await page.getByRole('button', { name: 'Configurer ma paie' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes paies');
  await expect(page.getByLabel('Date de la première paie')).toBeVisible();
});

test('À surveiller sous la bienvenue ; mêmes chiffres que Mes paies ; les liens ouvrent la bonne paie', async ({ page }) => {
  await configurer(page, '2027-01-16');
  await ajouterCarte(page, '2027-01-25');
  await ouvrirMesPaies(page);
  const dispoMesPaies = await page.getByTestId('paie-principale').first().getByTestId('montant-cle').textContent();

  await nav(page, 'Accueil');
  await expect(page.getByTestId('phrase-accueil')).toHaveText('Ta paie actuelle va du 7 au 20 janvier. 2 points méritent un coup d’œil, juste en dessous.');
  const bandeau = page.getByTestId('bandeau-surveiller');
  await expect(bandeau.locator('li')).toHaveText([
    /1 élément à vérifier dans ta paie actuelle · Le voir/,
    /Montant de l’échéance « Visa \(fictive\) » à choisir pour le 25 janv\. · Le choisir/,
  ]);
  // Sans défilement : À surveiller vient juste après la bienvenue, avant les paies.
  const yBandeau = (await bandeau.boundingBox())!.y;
  const yCartes = (await page.getByTestId('carte-accueil').first().boundingBox())!.y;
  expect(yBandeau).toBeLessThan(yCartes);
  expect(yBandeau).toBeLessThan(page.viewportSize()!.height);

  const cartes = page.getByTestId('carte-accueil');
  await expect(cartes).toHaveCount(2);
  await expect(cartes.nth(0)).toContainText('Paie actuelle');
  await expect(cartes.nth(1)).toContainText('Prochaine paie');
  await expect(cartes.nth(0).getByTestId('montant-cle')).toHaveText(dispoMesPaies!);
  // Prévu, confirmé et manquant restent distincts.
  await expect(cartes.nth(0)).toContainText('1 à vérifier');
  await expect(cartes.nth(1).getByTestId('montant-cle')).toHaveText('À compléter');
  await expect(cartes.nth(1).getByTestId('manque')).toContainText('Visa (fictive)');
  await expect(page.getByText('ce n’est pas le solde de ton compte')).toBeVisible();
  await expect(page.getByTestId('bientot')).toContainText('Montant à choisir');

  await bandeau.getByRole('button', { name: 'Le choisir' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes paies');
  await expect(page.getByTestId('fenetre-formulaire')).toContainText('Visa (fictive)');
  await page.keyboard.press('Escape');

  await nav(page, 'Accueil');
  await page.getByTestId('bandeau-surveiller').getByRole('button', { name: 'Le voir' }).click();
  await expect(page.getByTestId('fenetre-formulaire')).toContainText('Paie du jeudi 7 janvier 2027');
});

test('« Les retrouver » mène aux paies terminées à vérifier, même anciennes', async ({ page }) => {
  await configurer(page, '2027-03-10');
  await nav(page, 'Accueil');
  const bandeau = page.getByTestId('bandeau-surveiller');
  await expect(bandeau).toContainText('éléments à vérifier dans des paies précédentes');
  await bandeau.getByRole('button', { name: 'Les retrouver' }).click();
  await expect(page.getByRole('tab', { name: 'Toutes mes paies' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('filtre-a-verifier')).toBeChecked();
  await expect(page.getByTestId('mois-historique').first()).toBeVisible();
});

test('tout en ordre : message apaisant, aucun bandeau d’alerte', async ({ page }) => {
  await configurer(page, '2027-01-02');
  await nav(page, 'Accueil');
  await expect(page.getByTestId('phrase-accueil')).toHaveText('Ta première paie arrive le 7 janvier. Tout est en ordre : rien ne t’attend pour l’instant.');
  await expect(page.getByTestId('rien-a-surveiller')).toBeVisible();
  await expect(page.getByTestId('bandeau-surveiller')).toHaveCount(0);
  await expect(page.getByTestId('carte-accueil').nth(0)).toContainText('Première paie à venir');
});

test('journal : derniers changements, onglet Journal, filtres, entrée telle qu’enregistrée, annulation', async ({ page }) => {
  await configurer(page, '2027-01-16');
  await ajouterCarte(page, '2027-01-25');
  // Un changement annulé tout de suite : il reste au journal, repéré.
  await page.getByRole('button', { name: 'Annuler' }).click();
  await nav(page, 'Accueil');
  const derniers = page.getByTestId('derniers-changements');
  await expect(derniers.locator('li')).toHaveCount(3);
  await expect(derniers.locator('li').first()).toContainText('Aujourd’hui,');
  await derniers.getByRole('button', { name: 'Voir le journal' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paramètres');
  await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
  const journal = page.getByTestId('journal');
  await expect(journal.getByRole('heading', { level: 3 }).first()).toHaveText('Aujourd’hui — samedi 16 janvier');
  await expect(journal.getByTestId('entree-journal').first()).toContainText('Annulé');
  await expect(journal).toContainText('Profil de paie — calendrier');
  await expect(journal).not.toContainText('2027-01-07'); // dates lisibles

  await journal.getByRole('button', { name: 'Dettes', exact: true }).click();
  await expect(journal.getByTestId('entree-journal')).toHaveCount(2);
  await expect(journal.getByTestId('entree-journal').locator('.pastille').first()).toHaveText('Dettes');
  await journal.getByTestId('entree-journal').last().getByRole('button', { name: /telle qu’enregistrée/ }).click();
  await expect(journal.getByTestId('entree-brute')).toContainText('Mes dettes');
  await journal.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await expect(journal.getByTestId('journal-vide')).toHaveText('Aucun changement dans cette section.');
  await expect(journal.getByRole('button', { name: 'Voir les changements plus anciens' })).toHaveCount(0);
});
