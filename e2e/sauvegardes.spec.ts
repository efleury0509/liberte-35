// Étape 6 : Paramètres → Sauvegardes, restauration, export, avis unique,
// et correctif « À partir du… ». Aperçu en mémoire, données fictives.
import { expect, test, type Page } from '@playwright/test';

const ESP = ' ';
const JOUR = '2026-11-08';

const ouvrir = async (page: Page, simuler?: string) => {
  await page.goto(`/?aujourdhui=${JOUR}${simuler ? `&simuler=${simuler}` : ''}`);
};
const section = (page: Page, nom: string) =>
  page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom }).click();

async function creerProfil(page: Page) {
  await section(page, 'Mes paies');
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('description-profil')).toBeVisible();
}

test('Q26 : premier salaire dans le futur, « à partir du… » plutôt que « À compléter »', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$ à partir du 7 janv. 2027`);
});

test('R1 : sans changement, aucune copie ; après un changement, la copie du jour apparaît', async ({ page }) => {
  await ouvrir(page);
  await section(page, 'Paramètres');
  await expect(page.getByTestId('derniere-copie')).toHaveText(
    'Aucune copie pour l’instant : elle sera faite quelques secondes après ton prochain changement.',
  );
  await creerProfil(page);
  await section(page, 'Paramètres');
  await expect(page.getByTestId('derniere-copie')).toContainText('Dernière copie : aujourd’hui à');
  await expect(page.getByTestId('derniere-copie')).toContainText(', vérifiée.');
  const copies = page.getByTestId('copies-du-jour').getByRole('listitem');
  await expect(copies).toHaveCount(1);
  await expect(copies.first()).toContainText('Aujourd’hui — à jour à');
  await expect(copies.first()).toContainText('2 changements au journal');
});

test('R8, Re2, Re3, Re7 : copie illisible, aperçu, annuler, restaurer puis revenir en arrière', async ({ page }) => {
  await ouvrir(page, 'copies');
  await creerProfil(page);
  await section(page, 'Paramètres');

  const copies = page.getByTestId('copies-du-jour').getByRole('listitem');
  await expect(copies).toHaveCount(3);
  // R8 : la copie d'hier est illisible, sans bouton « Restaurer… ».
  const hier = page.locator('[data-copie="jour-2026-11-07.sqlite"]');
  await expect(hier.getByTestId('illisible')).toContainText('illisible');
  await expect(hier.getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('precautions')).toContainText('Avant la mise à niveau de la structure du 20 oct.');

  // Re2 : l'aperçu montre la copie, son contenu et ce qui sera retiré.
  const avantHier = page.locator('[data-copie="jour-2026-11-06.sqlite"]');
  await avantHier.getByRole('button', { name: /Restaurer/ }).click();
  const apercu = page.getByTestId('apercu-restauration');
  await expect(apercu).toContainText('Restaurer la copie du 6 nov.');
  // L'aperçu vient à l'écran et reçoit le focus (il s'ouvre sous la liste).
  await expect(apercu).toBeFocused();
  await expect(apercu).toBeInViewport();
  await expect(apercu).toContainText('Elle contient : paie pas encore configurée');
  await expect(apercu).toContainText('Depuis cette copie, 2 changements ont été faits. Ils seront retirés :');
  await expect(apercu.getByTestId('retires')).toContainText('Profil de paie');
  await expect(apercu).toContainText('Une copie de l’état actuel sera gardée');

  // Re3 : annuler ne change rien.
  await apercu.getByRole('button', { name: 'Annuler' }).click();
  await expect(apercu).toHaveCount(0);
  await section(page, 'Mes paies');
  await expect(page.getByTestId('description-profil')).toBeVisible();

  // Restaurer pour de vrai.
  await section(page, 'Paramètres');
  await avantHier.getByRole('button', { name: /Restaurer/ }).click();
  await apercu.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByTestId('restaure')).toContainText('Restauré : la copie du 6 nov.');
  await expect(page.getByTestId('restaure')).toContainText('L’état d’avant est gardé');
  const precaution = page.getByTestId('precautions').getByRole('listitem').first();
  await expect(precaution).toContainText('Avant la restauration d’aujourd’hui à');
  await section(page, 'Mes paies');
  await expect(page.getByRole('heading', { name: 'Configurer ma paie' })).toBeVisible();

  // Re7 : la copie de précaution ramène l'état d'avant.
  await section(page, 'Paramètres');
  await precaution.getByRole('button', { name: /Restaurer/ }).click();
  await expect(apercu).toContainText('Restaurer la copie de précaution d’aujourd’hui');
  await expect(apercu).toContainText('2 changements absents aujourd’hui reviendront.');
  await apercu.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByTestId('restaure')).toBeVisible();
  await section(page, 'Mes paies');
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$ à partir du 7 janv. 2027`);
});

test('Q30 : restaurer depuis un fichier choisi ailleurs, avec le même aperçu', async ({ page }) => {
  await ouvrir(page, 'copies');
  await section(page, 'Paramètres');
  await page.getByRole('button', { name: 'Restaurer depuis un fichier…' }).click();
  await expect(page.getByTestId('apercu-restauration')).toContainText('Restaurer « ma copie.sqlite »');
});

test('Q32 : un export choisi pour une restauration est refusé avec une explication', async ({ page }) => {
  await ouvrir(page, 'fichier-export');
  await section(page, 'Paramètres');
  await page.getByRole('button', { name: 'Restaurer depuis un fichier…' }).click();
  await expect(page.getByTestId('refus-restauration')).toHaveText(
    'Ce fichier est un export (.zip) : un export ne se restaure pas. Choisis une copie de sauvegarde (.sqlite).',
  );
  await expect(page.getByTestId('apercu-restauration')).toHaveCount(0);
});

test('E5, E7 : exporter dit où le fichier a été enregistré, et s’il est vide', async ({ page }) => {
  await ouvrir(page);
  await section(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Exporter mes données' }).click();
  await expect(page.getByText('L’export n’est pas chiffré : garde-le en lieu sûr.')).toBeVisible();
  await page.getByRole('button', { name: 'Exporter mes données…' }).click();
  await expect(page.getByTestId('exporte')).toHaveText(
    'Export enregistré : Documents\\liberte-35-apercu-export-2026-11-08.zip. Il ne contient que les en-têtes : aucune donnée pour l’instant.',
  );
  await creerProfil(page);
  await section(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Exporter mes données' }).click();
  await page.getByRole('button', { name: 'Exporter mes données…' }).click();
  await expect(page.getByTestId('exporte')).toHaveText('Export enregistré : Documents\\liberte-35-apercu-export-2026-11-08.zip');
});

test('R6 : un échec de copie donne un seul avis, et les données restent enregistrées', async ({ page }) => {
  await ouvrir(page, 'echec-copie');
  await creerProfil(page);
  const avis = page.getByTestId('avis-copie');
  await expect(avis).toContainText('n’a pas pu être faite');
  await expect(avis).toContainText('Tes données sont bien enregistrées');
  await avis.getByRole('button', { name: 'Fermer l’avis' }).click();
  await expect(avis).toHaveCount(0);
  // Un deuxième échec ne redonne pas d'avis.
  await page.getByRole('button', { name: 'Seuil d’attention' }).click();
  await page.getByLabel('Seuil d’attention ($, vide pour aucun)').fill('300');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByTestId('enregistre')).toBeVisible();
  await expect(avis).toHaveCount(0);
  await section(page, 'Paramètres');
  await expect(page.getByTestId('erreur-copie')).toContainText('n’a pas pu être faite');
  await expect(avis).toHaveCount(0);
  await section(page, 'Mes paies');
  await expect(page.getByTestId('salaire-actuel')).toHaveText(`2${ESP}100,00${ESP}$ à partir du 7 janv. 2027`);
});
