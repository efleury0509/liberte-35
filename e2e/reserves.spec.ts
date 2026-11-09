import { expect, test, type Page } from '@playwright/test';

// Étape A : réserves et dépenses à prévoir, dans l'aperçu en mémoire. Données fictives.
// Aujourd'hui = 2 janvier 2027 ; paies aux deux semaines dès le 7 janvier.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const CELI = 'CELI urgence';

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-02');
  await page.getByRole('button', { name: 'Mes paies' }).click();
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('description-profil')).toBeVisible();
  await nav(page, 'Épargne');
  await page.getByRole('button', { name: 'Ajouter un compte' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Type').selectOption({ label: 'CELI' });
  await f.getByLabel('Nom (facultatif)').fill(CELI);
  await f.getByLabel('Solde de départ ($, facultatif)').fill('2000');
  await f.getByLabel('En date du').fill('2027-01-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('enregistre')).toContainText('Ajouter le compte');
}

const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom }).click();
const fiche = (page: Page) => page.getByTestId('compte').filter({ has: page.getByRole('heading', { name: CELI }) });
const reserve = (page: Page, nom: string) => page.locator(`[data-reserve="${nom}"]`);
const enregistrerApercu = (page: Page) => page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();

async function nouvelleReserve(page: Page, nom: string, cible: string) {
  await fiche(page).getByRole('button', { name: 'Nouvelle réserve…' }).click();
  const f = page.getByTestId('formulaire-reserve');
  await f.getByLabel('Nom').fill(nom);
  await f.getByLabel('Cible ($, facultative)').fill(cible);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(reserve(page, nom)).toBeVisible();
}

async function affecter(page: Page, nom: string, montant: string) {
  // V1 : les actions secondaires d'une réserve sont dans son menu « Actions ».
  await reserve(page, nom).getByRole('button', { name: /^Actions/ }).click();
  await reserve(page, nom).getByRole('button', { name: 'Affecter…' }).click();
  const f = page.getByTestId('formulaire-affecter');
  await f.getByLabel('Montant ($)').fill(montant);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(reserve(page, nom).getByTestId('solde-reserve')).toHaveText($(`${montant},00 $`.replace(/^(\d)(\d{3}),/, '$1 $2,')));
}

test('R1, R3, O1, O3 : une réserve découpe la valeur ; dépassement, puis « Ajuster mes réserves » au prorata', async ({ page }) => {
  await preparer(page);
  await expect(fiche(page).getByTestId('non-reserve')).toHaveText($('2 000,00 $'));
  await nouvelleReserve(page, 'Fonds d’urgence', '3000');
  await affecter(page, 'Fonds d’urgence', '1500');
  await expect(fiche(page).getByTestId('non-reserve')).toHaveText($('500,00 $'));
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 000,00 $'));

  await fiche(page).getByRole('button', { name: 'Fluctuation…' }).click();
  const f = page.getByTestId('formulaire-fluctuation');
  await f.getByLabel('Gain (+) ou perte (−) ($)').fill('-700');
  await f.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await enregistrerApercu(page);
  await expect(fiche(page).getByTestId('depassement')).toContainText($('200,00 $'));
  await reserve(page, 'Fonds d’urgence').getByRole('button', { name: /^Actions/ }).click();
  await expect(reserve(page, 'Fonds d’urgence').getByRole('button', { name: 'Affecter…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(reserve(page, 'Fonds d’urgence').getByRole('button', { name: 'Affecter…' })).toHaveCount(0);

  await fiche(page).getByRole('button', { name: 'Ajuster mes réserves…' }).click();
  const a = page.getByTestId('formulaire-ajuster');
  await a.getByLabel('Réduire toutes, au prorata').check();
  await a.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await enregistrerApercu(page);
  await expect(fiche(page).getByTestId('depassement')).toHaveCount(0);
  await expect(reserve(page, 'Fonds d’urgence').getByTestId('solde-reserve')).toHaveText($('1 300,00 $'));
  await expect(fiche(page).getByTestId('non-reserve')).toHaveText($('0,00 $'));
});

test('P1, P2 : contribution répartie ; confirmée dans Mes paies, la part arrive dans la réserve', async ({ page }) => {
  await preparer(page);
  await fiche(page).getByRole('button', { name: 'Ajouter une contribution récurrente…' }).click();
  const c = page.getByTestId('formulaire-contribution');
  await c.getByLabel('Montant ($)').fill('150');
  await c.getByLabel('Fréquence').selectOption({ label: 'À chaque paie' });
  await c.getByLabel('Première contribution le').fill('2027-01-07');
  await c.getByRole('button', { name: 'Enregistrer' }).click();
  await nouvelleReserve(page, 'Fonds d’urgence', '3000');
  await page.getByTestId('repartitions').getByRole('button', { name: 'Répartir…', exact: true }).click();
  const r = page.getByTestId('formulaire-repartir');
  await r.getByLabel('Fonds d’urgence ($)').fill('100');
  await r.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('repartition')).toHaveText($('100,00 $ → « Fonds d’urgence »'));

  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  const ligne = page.getByTestId('detail-cycle').locator('tr[data-epargne="contribution"]');
  await expect(ligne).toHaveCount(1);
  await ligne.getByRole('button', { name: `Confirmer Contribution — ${CELI}` }).click();
  await expect(ligne.getByTestId('statut')).toContainText('Confirmé');

  await nav(page, 'Épargne');
  await fiche(page).getByRole('button', { name: 'Voir le détail' }).click();
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 150,00 $'));
  await expect(reserve(page, 'Fonds d’urgence').getByTestId('solde-reserve')).toHaveText($('100,00 $'));
  await expect(fiche(page).getByTestId('non-reserve')).toHaveText($('2 050,00 $'));
});

test('D4, U1, U5 : Pneus couverts par leur réserve ; payés avec un seul aperçu ; annuler rétablit tout', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Dépenses à prévoir');
  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Nom').fill('Pneus');
  await f.getByLabel('Estimation ($, facultative)').fill('900');
  await f.getByLabel('Fréquence').selectOption({ label: 'Chaque année' });
  await f.getByLabel('Prochaine date').fill('2027-04-15');
  await f.getByLabel('Créer une réserve liée dans').selectOption({ label: CELI });
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const dep = page.locator('[data-depense="Pneus"]');
  await expect(dep.getByTestId('couverture')).toHaveText($('non couverte : 900,00 $ depuis le disponible'));
  await expect(dep.getByTestId('suggestion')).toHaveText($('129,00 $ par paie (7 paies)'));
  await expect(page.getByTestId('douze-mois')).toContainText('avril 2027');

  await dep.getByRole('button', { name: 'Voir le compte' }).click();
  await expect(page.getByRole('heading', { name: 'Épargne', level: 1 })).toBeVisible();
  await expect(reserve(page, 'Pneus')).toBeVisible();
  await affecter(page, 'Pneus', '900');

  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-04-15"]').getByRole('button', { name: 'Détails' }).click();
  const ligne = page.getByTestId('detail-cycle').locator('tr[data-a-prevoir="oui"]');
  await expect(ligne).toContainText('Pneus');
  await expect(ligne.getByTestId('couverture-ligne')).toHaveText('couverte par la réserve');
  await ligne.getByRole('button', { name: 'Confirmer Pneus' }).click();
  const apercu = page.getByTestId('apercu');
  // V1 : la fenêtre propose la source ; changer de source ne fait que recalculer l'aperçu.
  await expect(apercu.getByTestId('source-reserve')).toBeChecked();
  await apercu.getByTestId('source-paie').check();
  await expect(apercu).not.toContainText(`Retrait de « ${CELI} »`);
  await expect(ligne.getByTestId('couverture-ligne')).toHaveText('couverte par la réserve');
  await apercu.getByTestId('source-reserve').check();
  await expect(apercu).toContainText('Réserve « Pneus »');
  await expect(apercu).toContainText(`Retrait de « ${CELI} »`);
  await enregistrerApercu(page);
  await expect(ligne.getByTestId('couverture-ligne')).toHaveText($('payée avec la réserve : 900,00 $'));
  await nav(page, 'Épargne');
  await fiche(page).getByRole('button', { name: 'Voir le détail' }).click();
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('1 100,00 $'));

  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-04-15"]').getByRole('button', { name: 'Détails' }).click();
  await page.getByTestId('detail-cycle').locator('tr[data-a-prevoir="oui"]').getByRole('button', { name: 'Annuler la confirmation' }).click();
  await expect(page.getByTestId('apercu')).toContainText('y revient');
  await expect(page.getByTestId('apercu')).toHaveAttribute('data-variante', 'annulation');
  await page.getByTestId('apercu').getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await nav(page, 'Épargne');
  await fiche(page).getByRole('button', { name: 'Voir le détail' }).click();
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 000,00 $'));
  await expect(reserve(page, 'Pneus').getByTestId('solde-reserve')).toHaveText($('900,00 $'));
});

test('U4 : « Confirmer sans utiliser la réserve » laisse la réserve intacte', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Dépenses à prévoir');
  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Nom').fill('Pneus');
  await f.getByLabel('Estimation ($, facultative)').fill('900');
  await f.getByLabel('Fréquence').selectOption({ label: 'Chaque année' });
  await f.getByLabel('Prochaine date').fill('2027-04-15');
  await f.getByLabel('Créer une réserve liée dans').selectOption({ label: CELI });
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await nav(page, 'Épargne');
  await fiche(page).getByRole('button', { name: 'Voir le détail' }).click();
  await affecter(page, 'Pneus', '900');

  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-04-15"]').getByRole('button', { name: 'Détails' }).click();
  const ligne = page.getByTestId('detail-cycle').locator('tr[data-a-prevoir="oui"]');
  await ligne.getByRole('button', { name: 'Confirmer autrement…' }).click();
  const c = page.getByTestId('formulaire-confirmation');
  await c.getByTestId('source-paie').check();
  await c.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('apercu').getByTestId('source-paie')).toBeChecked();
  await enregistrerApercu(page);
  await expect(ligne.getByTestId('couverture-ligne')).toHaveText('payée depuis le disponible');
  await nav(page, 'Épargne');
  await fiche(page).getByRole('button', { name: 'Voir le détail' }).click();
  await expect(reserve(page, 'Pneus').getByTestId('solde-reserve')).toHaveText($('900,00 $'));
  await expect(fiche(page).getByTestId('valeur')).toHaveText($('2 000,00 $'));
});

test('L-1 : créer la réserve liée depuis une dépense déjà créée, en un geste', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Dépenses à prévoir');
  await page.getByRole('button', { name: 'Ajouter une dépense' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Nom').fill('Immatriculation');
  await f.getByLabel('Estimation ($, facultative)').fill('180');
  await f.getByLabel('Fréquence').selectOption({ label: 'Chaque année' });
  await f.getByLabel('Prochaine date').fill('2027-06-30');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const dep = page.locator('[data-depense="Immatriculation"]');
  await dep.getByRole('button', { name: 'Lier une réserve…' }).click();
  const l = page.getByTestId('formulaire-lien');
  await l.getByLabel('Réserve').selectOption({ label: `Nouvelle réserve « Immatriculation » dans ${CELI}` });
  await l.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dep).toContainText(`Réserve « Immatriculation » (${CELI})`);
  await expect(dep.getByTestId('suggestion')).toBeVisible();
});
