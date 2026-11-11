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
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
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
  await f.getByRole('button', { name: 'Enregistrer' }).click();
}

// V1 lot 5 : les dépenses régulières se gèrent dans la section « Dépenses ».
const naviguer = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();
const fenetre = (page: Page) => page.getByTestId('fenetre-formulaire');

const enregistrerApercu = (page: Page) => page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();

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

test('ajouter une dépense fixe : enregistrée directement, « Annuler » la retire (C, C1)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Loyer', montant: '1200', quand: 'Chaque mois', date: '2027-03-01' });
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('enregistre')).toContainText('Ajouter une dépense');
  await expect(page.locator('tr[data-cycle="2027-02-18"] [data-testid="disponible"]')).toHaveText(dollars('900,00'));
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('tr[data-cycle="2027-02-18"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
  await naviguer(page, 'Dépenses');
  await expect(page.getByTestId('panneau-fixes')).not.toContainText('Loyer');
});

test('ajouter une dépense qui touche le passé : aperçu avec avertissement', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Rattrapage', montant: '50', quand: 'Une seule fois', date: '2027-01-12' });
  await expect(page.getByTestId('consequences')).toContainText('des cycles déjà passés changeraient');
  await enregistrerApercu(page);
  await naviguer(page, 'Dépenses');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Rattrapage');
});

test('ajouter une enveloppe « 1re paie » : dès le cycle actuel, sans aperçu, disponible non estimé', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Épicerie', montant: '300', genre: 'Enveloppe variable', quand: '1re paie du mois' });
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('1 800,00'));
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(dollars('1 800,00'));
  await naviguer(page, 'Dépenses');
  await expect(page.getByTestId('panneau-enveloppes')).toContainText('Épicerie');
  await expect(page.getByTestId('panneau-fixes')).not.toContainText('Épicerie');
});

test('un revenu incertain est affiché mais ne change pas le disponible (A3)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nature: 'Revenu', nom: 'Remboursement', montant: '800', quand: 'Une seule fois', date: '2027-03-10', incertain: true });
  await expect(page.getByTestId('bloc-revenus')).toContainText('Remboursement');
  await expect(page.getByTestId('bloc-revenus')).toContainText('Incertain');
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
  await expect(page.locator('tr[data-cycle="2027-03-04"]')).toContainText('non compté');
});

test('un revenu certain estimé rend le disponible « Estimation » (Q14)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nature: 'Revenu', nom: 'Pige', montant: '300', quand: 'Une seule fois', date: '2027-02-25', estime: true });
  const m2 = page.locator('tr[data-cycle="2027-02-18"] [data-testid="disponible"]');
  await expect(m2).toContainText(dollars('2 400,00'));
  await expect(m2).toContainText('Estimation');
});

test('changer un montant à partir d’une date (direct), puis supprimer (aperçu)', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Gym', montant: '40', quand: 'Chaque mois', date: '2027-02-05' });

  await naviguer(page, 'Dépenses');
  const gym = page.getByTestId('panneau-fixes').getByRole('listitem').filter({ hasText: 'Gym' });
  await gym.getByRole('button', { name: 'Gérer' }).click();
  await expect(fenetre(page)).toContainText('Gérer « Gym »');
  await fenetre(page).getByRole('button', { name: 'Changer le montant à partir d’une date' }).click();
  await fenetre(page).getByLabel('À partir du').fill('2027-03-01');
  await fenetre(page).getByLabel('Nouveau montant ($)').fill('45');
  await fenetre(page).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(fenetre(page)).toHaveCount(0);
  await naviguer(page, 'Mes paies');
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('2 060,00'));
  await expect(page.locator('tr[data-cycle="2027-03-04"] [data-testid="disponible"]')).toHaveText(dollars('2 055,00'));

  await naviguer(page, 'Dépenses');
  await gym.getByRole('button', { name: 'Gérer' }).click();
  await fenetre(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByTestId('apercu')).toContainText('Supprimer « Gym »');
  await expect(page.getByTestId('apercu')).toContainText('Le journal garde la trace de cette suppression.');
  await enregistrerApercu(page);
  await expect(page.getByTestId('panneau-fixes')).not.toContainText('Gym');
  await naviguer(page, 'Mes paies');
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
});

test('saisie invalide : message clair, rien n’est enregistré', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: '', montant: '20', quand: 'Chaque mois', date: '2027-03-01' });
  await expect(page.getByTestId('erreur-saisie')).toContainText('Donne un nom');
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('enregistre')).toHaveCount(0);
});

test('A : ajuster une occurrence depuis le détail d’un cycle, la retirer, revenir à la règle', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Épicerie', montant: '300', genre: 'Enveloppe variable', quand: '1re paie du mois' });
  const mars = page.locator('tr[data-cycle="2027-03-04"]');
  await mars.getByRole('button', { name: 'Détails' }).click();
  const detail = page.getByTestId('detail-cycle');

  // Montant pour cette fois seulement.
  await detail.getByRole('button', { name: 'Ajuster Épicerie pour cette fois' }).click();
  const f = page.getByTestId('formulaire-occurrence');
  await f.getByLabel('Montant cette fois ($)').fill('350');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(detail).toContainText('ajusté');
  await expect(mars.locator('[data-testid="disponible"]')).toHaveText(dollars('1 750,00'));
  // Avril n'est pas touché, et la règle non plus.
  await expect(page.locator('tr[data-cycle="2027-04-01"] [data-testid="disponible"]')).toHaveText(dollars('1 800,00'));
  await naviguer(page, 'Dépenses');
  await expect(page.getByTestId('panneau-enveloppes')).toContainText('1 occurrence ajustée');
  await naviguer(page, 'Mes paies');
  await mars.getByRole('button', { name: 'Détails' }).click();

  // Retirer cette fois.
  await detail.getByRole('button', { name: 'Ajuster Épicerie pour cette fois' }).click();
  await f.getByRole('button', { name: 'Retirer cette fois' }).click();
  await expect(detail).toContainText('retirée cette fois');
  await expect(mars.locator('[data-testid="disponible"]')).toHaveText(dollars('2 100,00'));

  // Revenir à la règle.
  await detail.getByRole('button', { name: 'Ajuster Épicerie pour cette fois' }).click();
  await f.getByRole('button', { name: 'Revenir à la règle' }).click();
  await expect(detail).not.toContainText('ajusté');
  await expect(mars.locator('[data-testid="disponible"]')).toHaveText(dollars('1 800,00'));
  await naviguer(page, 'Dépenses');
  await expect(page.getByTestId('panneau-enveloppes')).not.toContainText('occurrence ajustée');
});

test('A : payer une dépense avec une autre paie, sans changer son échéance', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Loyer', montant: '1200', quand: 'Chaque mois', date: '2027-03-01' });
  const fevrier18 = page.locator('tr[data-cycle="2027-02-18"]');
  await fevrier18.getByRole('button', { name: 'Détails' }).click();
  await page.getByTestId('detail-cycle').getByRole('button', { name: 'Ajuster Loyer pour cette fois' }).click();
  const f = page.getByTestId('formulaire-occurrence');
  await f.getByLabel('Payée avec la paie du').selectOption('2027-02-04');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fevrier18.locator('[data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
  await expect(page.locator('tr[data-cycle="2027-02-04"] [data-testid="disponible"]')).toHaveText(dollars('900,00'));
  await page.locator('tr[data-cycle="2027-02-04"]').getByRole('button', { name: 'Détails' }).click();
  await expect(page.getByTestId('detail-cycle')).toContainText('Loyer (dû le 1er mars)');
  await expect(page.getByTestId('detail-cycle')).toContainText('payée avec cette paie');
});

test('B : changer la fréquence à partir d’une date (aperçu) ; « Modifier la règle… » ouvre l’élément', async ({ page }) => {
  await ouvrir(page);
  await creerProfil(page);
  await ajouter(page, { nom: 'Épicerie', montant: '300', genre: 'Enveloppe variable', quand: '1re paie du mois' });
  await page.locator('tr[data-cycle="2027-03-04"]').getByRole('button', { name: 'Détails' }).click();
  await page.getByTestId('detail-cycle').getByRole('button', { name: 'Ajuster Épicerie pour cette fois' }).click();
  await page.getByTestId('formulaire-occurrence').getByRole('button', { name: 'Modifier la règle…' }).click();
  // V1 lot 5 : on arrive dans Dépenses, la fenêtre « Gérer » de l'élément déjà ouverte.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépenses');
  const gestion = fenetre(page);
  await expect(gestion).toContainText('Gérer « Épicerie »');
  await gestion.getByRole('button', { name: 'Changer la fréquence à partir d’une date' }).click();
  await gestion.getByLabel('Nouvelle fréquence').selectOption({ label: 'À chaque paie' });
  await gestion.getByLabel('À partir du').fill('2027-04-01');
  await gestion.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Changer la fréquence de « Épicerie »');
  await expect(apercu).toContainText('Les occurrences d’avant le jeudi 1er avril 2027 ne changent pas.');
  await enregistrerApercu(page);
  const epicerie = page.getByTestId('panneau-enveloppes').getByRole('listitem').filter({ hasText: 'Épicerie' });
  await expect(epicerie).toContainText('à partir du 1er avr. : à chaque paie');
  await naviguer(page, 'Mes paies');
  await expect(page.locator('tr[data-cycle="2027-03-18"] [data-testid="disponible"]')).toHaveText(dollars('2 100,00'));
  for (const jour of ['2027-04-01', '2027-04-15', '2027-04-29']) {
    await expect(page.locator(`tr[data-cycle="${jour}"] [data-testid="disponible"]`)).toHaveText(dollars('1 800,00'));
  }
});
