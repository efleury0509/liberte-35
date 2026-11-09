import { expect, test, type Page } from '@playwright/test';

// Étape 8 : la carte Visa, dans l'aperçu en mémoire. Données fictives.
// Aujourd'hui = 15 janvier 2027 ; profil aux deux semaines dès le 7 janvier.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const NOM = 'Visa (fictive)';

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

async function ajouterCarte(page: Page) {
  await nav(page, 'Dettes');
  await page.getByRole('button', { name: 'Ajouter ma carte' }).click();
  const f = page.getByTestId('formulaire-ajout-carte');
  await f.getByLabel('Nom de la carte').fill(NOM);
  await f.getByLabel('Prochaine échéance').fill('2027-02-11');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('enregistre')).toContainText(`Ajouter la carte « ${NOM} »`);
}

async function ajouterReleve(page: Page) {
  await page.getByRole('button', { name: 'Ajouter un relevé…' }).click();
  const f = page.getByTestId('formulaire-releve');
  await f.getByLabel('Date du relevé').fill('2027-01-20');
  await f.getByLabel('Nouveau solde ($)').fill('1240');
  await f.getByLabel('Paiement minimum ($)').fill('35');
  await f.getByLabel('Date d’échéance').fill('2027-02-11');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('releve')).toHaveCount(1);
}

const detail = async (page: Page, cycle: string) => {
  await page.locator(`tr[data-cycle="${cycle}"]`).getByRole('button', { name: 'Détails' }).click();
  return page.getByTestId('detail-cycle');
};

test('F1, C1, C2, C4 : la carte se crée sans montant ; son échéance est « À compléter » dans Mes paies, avec la raison', async ({ page }) => {
  await preparer(page);
  await ajouterCarte(page);
  const fiche = page.getByTestId('fiche-carte');
  await expect(fiche).toContainText('Montant de chaque échéance : à choisir à chaque relevé');
  await expect(fiche.getByTestId('solde-actuel')).toHaveText('À compléter');
  await expect(fiche.getByTestId('utilisation')).toHaveText('À compléter');
  await expect(fiche.getByTestId('a-choisir')).toHaveText('Échéance du 11 févr. 2027 : montant à choisir dans Mes paies.');

  await nav(page, 'Mes paies');
  await expect(page.getByText(NOM)).toHaveCount(0); // pas parmi les Revenus et dépenses
  const d = await detail(page, '2027-02-04');
  const ligne = d.locator('tr[data-dette="carte"]');
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText(`Paiement — ${NOM} (dû le 11 févr.)`);
  await expect(ligne.locator('td.montant')).toHaveText('−À compléter');
  await expect(d.getByTestId('raison-a-completer')).toHaveText(`Il manque : Paiement — ${NOM} (11 févr.).`);

  await d.getByRole('button', { name: 'Voir la carte' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dettes');
  await expect(page.getByTestId('fiche-carte')).toBeVisible();
});

test('R1, A1, O2 : relevé, choix rapides dans « Ajuster », suivi du relevé', async ({ page }) => {
  await preparer(page);
  await ajouterCarte(page);
  await ajouterReleve(page);
  const r = page.getByTestId('releve');
  await expect(r).toContainText($('Nouveau solde : 1 240,00 $'));
  await expect(r.getByTestId('planifies')).toContainText('À compléter');
  await expect(page.getByTestId('phrase-echeance')).toHaveText('Liberté 35 ne vérifie pas si un paiement a été reçu à temps : seul ton relevé suivant le dit.');

  await nav(page, 'Mes paies');
  const d = await detail(page, '2027-02-04');
  await d.locator('tr[data-dette="carte"]').getByRole('button', { name: /^Ajuster/ }).click();
  const f = page.getByTestId('formulaire-occurrence');
  await expect(f.getByTestId('choix-rapides')).toContainText($('Minimum : 35,00 $'));
  await f.getByRole('button', { name: $('Solde du relevé : 1 240,00 $') }).click();
  await expect(f.getByLabel('Montant cette fois ($)')).toHaveValue('1240,00');
  await f.getByLabel('Montant cette fois ($)').fill('940');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(d.locator('tr[data-dette="carte"] td.montant')).toHaveText($('−940,00 $'));
  await expect(d.getByTestId('raison-a-completer')).toHaveCount(0);

  await d.getByRole('button', { name: 'Voir la carte' }).first().click();
  const s = page.getByTestId('releve');
  await expect(s.getByTestId('planifies')).toContainText($('940,00 $'));
  await expect(s.getByTestId('constat-minimum')).toHaveText('Minimum : serait atteint si les paiements planifiés sont faits.');
  await expect(s.getByTestId('constat-solde')).toHaveText($('Nouveau solde : à la date d’échéance du relevé (11 févr. 2027), après les paiements confirmés et planifiés d’ici là, il resterait 300,00 $.'));
});

test('X1, O1, G2 : paiement supplémentaire depuis Mes paies, rattaché au relevé ; objectif informatif', async ({ page }) => {
  await preparer(page);
  await ajouterCarte(page);
  await ajouterReleve(page);
  await page.getByRole('button', { name: 'Mettre à jour le solde actuel…' }).click();
  const fs = page.getByTestId('formulaire-solde-carte');
  await fs.getByLabel('Solde actuel ($)').fill('1410');
  await fs.getByLabel('En date du (vide : aujourd’hui)').fill('2027-01-25');
  await fs.getByRole('button', { name: 'Enregistrer' }).click();

  await nav(page, 'Mes paies');
  const d = await detail(page, '2027-01-21');
  await d.getByRole('button', { name: '+ Paiement supplémentaire' }).click();
  const f = page.getByTestId('formulaire-supplement');
  await f.getByLabel('Montant ($)').fill('300');
  await f.getByLabel('Date').fill('2027-01-27');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const ligne = d.locator('tr[data-dette="carte"]');
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText(`Paiement supplémentaire — ${NOM} (dû le 27 janv.)`);
  await ligne.getByRole('button', { name: /^Confirmer autrement/ }).click();
  const fc = page.getByTestId('formulaire-confirmation');
  await fc.getByLabel('Montant reçu ou payé ($)').fill('300');
  await fc.getByLabel('Date').fill('2027-01-27');
  await fc.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne.getByTestId('statut')).toContainText('Confirmé le 27 janv.');

  await d.getByRole('button', { name: 'Voir la carte' }).click();
  await expect(page.getByTestId('releve').getByTestId('confirmes')).toContainText($('27 janv. 2027 — 300,00 $ (supplémentaire)'));
  await page.getByLabel('Réduire mon solde actuel').check();
  await expect(page.getByTestId('en-tete-objectif')).toHaveText($('Solde actuel : 1 410,00 $ (ta mise à jour du 25 janv. 2027)'));
  await expect(page.getByTestId('fiche-carte')).toContainText($('Paiements confirmés depuis cette mise à jour : 300,00 $'));
  await expect(page.getByTestId('fiche-carte')).not.toContainText('1 110');
  await expect(page.getByTestId('fiche-carte')).not.toContainText(`1${ESP}110`);
});

test('V6, V7 (0.8.1) : la date dans le bandeau ; supprimer un supplément non confirmé, puis « Annuler » le rétablit', async ({ page }) => {
  await preparer(page);
  await ajouterCarte(page);
  await nav(page, 'Mes paies');
  const d = await detail(page, '2027-01-21');
  await d.getByRole('button', { name: '+ Paiement supplémentaire' }).click();
  const f = page.getByTestId('formulaire-supplement');
  await f.getByLabel('Montant ($)').fill('300');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('enregistre')).toContainText($(`Enregistré : Paiement supplémentaire — ${NOM} : 300,00 $ le 21 janv. 2027.`));
  const ligne = d.locator('tr[data-dette="carte"]');
  await expect(ligne).toHaveCount(1);
  await ligne.getByRole('button', { name: /^Ajuster/ }).click();
  await page.getByTestId('formulaire-occurrence').getByRole('button', { name: 'Supprimer ce paiement…' }).click();
  await expect(ligne).toHaveCount(0);
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText(`Paiement supplémentaire — ${NOM} (dû le 21 janv.)`);
  await expect(ligne.locator('td.montant')).toHaveText($('−300,00 $'));
});
