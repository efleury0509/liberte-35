import { expect, test, type Page } from '@playwright/test';

// Parcours de l'étape 4 dans l'aperçu en mémoire (rien n'est enregistré).
const ESP = ' ';
const dollars = (texte: string) => texte.replace(/ /g, ESP) + `${ESP}$`;

async function ouvrir(page: Page, jour = '2027-02-10') {
  await page.goto(`/?aujourdhui=${jour}`);
  await page.getByRole('button', { name: 'Mes paies' }).click();
}

async function creerProfil(page: Page) {
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('salaire-actuel')).toHaveText(dollars('2 100,00'));
}

interface Ajout {
  nature?: 'Dépense' | 'Revenu';
  nom: string;
  montant: string;
  genre?: 'Fixe' | 'Enveloppe variable';
  quand: string;
  date?: string;
  incertain?: boolean;
  estime?: boolean;
}

async function ajouter(page: Page, a: Ajout) {
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nature').selectOption({ label: a.nature ?? 'Dépense' });
  await f.getByLabel('Nom').fill(a.nom);
  await f.getByLabel('Montant ($, facultatif)').fill(a.montant);
  if (a.genre) await f.getByLabel('Genre').selectOption({ label: a.genre });
  if (a.estime) await f.getByLabel('Montant estimé').check();
  if (a.incertain) await f.getByLabel('Revenu incertain').check();
  await f.getByLabel('Quand').selectOption({ label: a.quand });
  if (a.date) await f.getByLabel('Date').fill(a.date);
  await f.getByRole('button', { name: 'Voir l’aperçu' }).click();
}

test('exemple fictif de l’étape 4 : les cycles M1 à M4 et les deux panneaux', async ({ page }) => {
  await ouvrir(page, '2027-05-20');
  await page.getByTestId('bouton-exemple').click();
  await expect(page.getByTestId('bandeau-exemple')).toContainText('étape 4');
  await expect(page.getByTestId('cycles').locator('tbody tr')).toHaveCount(4);
  const dispo = (debut: string) => page.locator(`tr[data-cycle="${debut}"] [data-testid="disponible"]`);
  await expect(dispo('2027-02-04')).toContainText(dollars('1 465,00'));
  await expect(dispo('2027-02-04')).toContainText('Estimation');
  await expect(dispo('2027-02-18')).toContainText(dollars('1 160,00'));
  await expect(dispo('2027-03-04')).toHaveText(dollars('1 555,00'));
  await expect(dispo('2027-03-18')).toHaveText(dollars('2 135,00'));
  await expect(page.getByTestId('bloc-revenus')).toContainText('Remboursement d’impôt');
  await expect(page.getByTestId('bloc-revenus')).toContainText('Incertain');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Loyer');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Coupe de cheveux');
  await expect(page.getByTestId('panneau-enveloppes')).toContainText('Épicerie');
  await expect(page.getByTestId('panneau-enveloppes')).not.toContainText('Loyer');
  // M3 : le remboursement incertain est visible mais non compté (A3).
  await page.locator('tr[data-cycle="2027-03-04"]').getByRole('button', { name: 'Détails' }).click();
  const detail = page.getByTestId('detail-cycle');
  await expect(detail).toContainText('Remboursement d’impôt');
  await expect(detail).toContainText('non compté (incertain)');
  await expect(detail).toContainText('Coupe de cheveux');
  await expect(detail).not.toContainText('Gym');
  // L'exemple n'offre aucune modification.
  await expect(page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' })).toHaveCount(0);
});

test('ajouter une dépense fixe : aperçu, conséquence, panneau « Dépenses fixes »', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Loyer', montant: '1200', quand: 'Chaque mois', date: '2027-03-01' });
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Ajouter une dépense');
  await expect(apercu).toContainText(`Cycle du 18 févr. : disponible planifié ${dollars('2 100,00')} → ${dollars('900,00')}`);
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('panneau-fixes')).toContainText('Loyer');
  await expect(page.locator('tr[data-cycle="2027-02-18"] [data-testid="disponible"]')).toHaveText(dollars('900,00'));
});

test('ajouter une enveloppe : panneau « Enveloppes variables », disponible non estimé', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Épicerie', montant: '300', genre: 'Enveloppe variable', quand: '1re paie du mois' });
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('panneau-enveloppes')).toContainText('Épicerie');
  await expect(page.getByTestId('panneau-fixes')).not.toContainText('Épicerie');
  const m3 = page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]');
  await expect(m3).toHaveText(dollars('1 800,00'));
});

test('un revenu incertain est affiché mais ne change pas le disponible (A3)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nature: 'Revenu', nom: 'Remboursement', montant: '800', quand: 'Une seule fois', date: '2027-03-10', incertain: true });
  await expect(page.getByTestId('consequences')).toContainText('hors du disponible planifié');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('bloc-revenus')).toContainText('Remboursement');
  await expect(page.getByTestId('bloc-revenus')).toContainText('Incertain');
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
});

test('un revenu certain estimé rend le disponible « Estimation » (Q14)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nature: 'Revenu', nom: 'Pige', montant: '300', quand: 'Une seule fois', date: '2027-02-25', estime: true });
  await page.getByRole('button', { name: 'Confirmer' }).click();
  const m2 = page.locator('tr[data-cycle="2027-02-18"] [data-testid="disponible"]');
  await expect(m2).toContainText(dollars('2 400,00'));
  await expect(m2).toContainText('Estimation');
});

test('changer un montant à partir d’une date, puis supprimer : aperçu chaque fois', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Gym', montant: '40', quand: 'Chaque mois', date: '2027-02-05' });
  await page.getByRole('button', { name: 'Confirmer' }).click();

  const gym = page.getByTestId('panneau-fixes').getByRole('listitem').filter({ hasText: 'Gym' });
  await gym.getByRole('button', { name: 'Gérer' }).click();
  await page.getByRole('button', { name: 'Changer le montant à partir d’une date' }).click();
  await page.getByLabel('À partir du').fill('2027-03-01');
  await page.getByLabel('Nouveau montant ($)').fill('45');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByTestId('apercu')).toContainText('Les cycles d’avant le lundi 1er mars 2027 ne changent pas.');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('2 060,00'));
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(dollars('2 055,00'));

  await gym.getByRole('button', { name: 'Gérer' }).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByTestId('apercu')).toContainText('Supprimer « Gym »');
  await expect(page.getByTestId('apercu')).toContainText('Le journal garde la trace de cette suppression.');
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByTestId('panneau-fixes')).not.toContainText('Gym');
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
});

test('saisie invalide : message clair, rien n’est proposé', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: '', montant: '20', quand: 'Chaque mois', date: '2027-03-01' });
  await expect(page.getByTestId('erreur-saisie')).toContainText('Donne un nom');
  await expect(page.getByTestId('apercu')).toHaveCount(0);
});
