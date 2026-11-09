import { expect, test, type Page } from '@playwright/test';

// Étape 7a : les prêts au quotidien, dans l'aperçu en mémoire. Données fictives.
// Aujourd'hui = 15 janvier 2027 ; profil aux deux semaines dès le 7 janvier.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);

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

async function ajouterPretMinimal(page: Page) {
  await nav(page, 'Mes dettes');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  const f = page.getByTestId('formulaire-ajout-pret');
  await f.getByLabel('Nom du prêt').fill('Prêt auto (fictif)');
  await f.getByLabel('Versement ($)').fill('205');
  await f.getByLabel('Fréquence').selectOption({ label: 'Aux deux semaines' });
  await f.getByLabel('Prochain versement').fill('2027-01-14');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
}

test('F1, C1, C4 : un prêt créé avec quatre renseignements apparaît dans Mes paies', async ({ page }) => {
  await preparer(page);
  await ajouterPretMinimal(page);
  await expect(page.getByTestId('enregistre')).toContainText('Enregistré : Ajouter le prêt « Prêt auto (fictif) »');
  const fiche = page.getByTestId('fiche-pret');
  await expect(fiche.getByTestId('versement')).toHaveText($('205,00 $ — aux deux semaines'));
  await expect(fiche.getByTestId('prochain-versement')).toHaveText($('205,00 $ le 28 janv. 2027'));
  for (const id of ['solde-actuel', 'solde-initial', 'capital-rembourse', 'taux', 'methode', 'echeance-finale']) {
    await expect(fiche.getByTestId(id)).toHaveText('À compléter');
  }
  await expect(fiche.getByTestId('minimum')).toHaveText('Identique au versement');

  // C7 : le prêt n'est pas parmi les dépenses fixes de Mes paies.
  await nav(page, 'Mes paies');
  await expect(page.getByText('Prêt auto (fictif)')).toHaveCount(0);
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  const ligne = page.getByTestId('detail-cycle').locator('tr[data-dette="oui"]');
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText('Paiement — Prêt auto (fictif) (dû le 14 janv.)');
  await expect(ligne.getByTestId('statut')).toHaveText('À vérifier');
});

test('C5, P4, H0, F4, S3 : confirmer dans Mes paies, voir l’historique, compléter, mettre à jour le solde', async ({ page }) => {
  await preparer(page);
  await ajouterPretMinimal(page);
  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  const ligne = page.getByTestId('detail-cycle').locator('tr[data-dette="oui"]');
  await ligne.getByRole('button', { name: 'Confirmer Prêt auto (fictif)' }).click();
  await expect(ligne.getByTestId('statut')).toContainText('Confirmé le');

  // « Voir le prêt » ouvre la fiche dans Mes dettes.
  await ligne.getByRole('button', { name: 'Voir le prêt' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes dettes');
  const fiche = page.getByTestId('fiche-pret');
  const versement = fiche.getByTestId('ligne-versement');
  await expect(versement).toHaveCount(1);
  await expect(versement).toContainText('14 janv. 2027');
  await expect(versement.locator('td').nth(0)).toHaveText($('205,00 $'));
  await expect(versement.locator('td').nth(1)).toHaveText($('205,00 $'));
  await expect(versement.locator('td').nth(2)).toHaveText($('0,00 $'));
  await expect(versement.locator('td').nth(3)).toHaveText('À compléter');
  await expect(fiche.getByTestId('paye-depuis-ajout')).toHaveText($('Payé depuis l’ajout : 205,00 $'));

  // F4 : compléter plus tard ; la ligne confirmée ne change pas.
  await page.getByRole('button', { name: 'Compléter les renseignements…' }).click();
  const r = page.getByTestId('formulaire-renseignements');
  await r.getByLabel('Taux annuel (%)').fill('6,49');
  await r.getByLabel('Solde ($)').fill('17500');
  await r.getByLabel('Solde au').fill('2027-01-14');
  await r.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fiche.getByTestId('taux')).toHaveText('6,49 %');
  await expect(fiche.getByTestId('solde-initial')).toHaveText($('17 500,00 $ au 14 janv. 2027'));
  await expect(fiche.getByTestId('solde-actuel')).toHaveText($('17 500,00 $ au 14 janv. 2027'));
  await expect(versement.locator('td').nth(3)).toHaveText('À compléter');

  // S3 : mise à jour du solde, ligne distincte, nouvelle référence.
  await page.getByRole('button', { name: 'Mettre à jour le solde…' }).click();
  const s = page.getByTestId('formulaire-solde');
  await s.getByLabel('Date du solde').fill('2027-01-15');
  await s.getByLabel('Solde ($)').fill('17300');
  await s.getByLabel('Note (facultative)').fill('relevé');
  await s.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fiche.getByTestId('ligne-solde').last()).toContainText($('Solde mis à jour : 17 300,00 $ (relevé)'));
  await expect(fiche.getByTestId('solde-actuel')).toHaveText($('17 300,00 $ au 15 janv. 2027'));
  await expect(versement).toHaveCount(1);
  // « Annuler » défait la mise à jour.
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(fiche.getByTestId('solde-actuel')).toHaveText($('17 500,00 $ au 14 janv. 2027'));
});

test('F2, E2 : fiche presque complète avec échéance finale ; F3 : refus clair', async ({ page }) => {
  await preparer(page);
  await nav(page, 'Mes dettes');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  const f = page.getByTestId('formulaire-ajout-pret');
  await f.getByLabel('Nom du prêt').fill('Prêt perso (fictif)');
  await f.getByLabel('Versement ($)').fill('150');
  await f.getByLabel('Fréquence').selectOption({ label: 'Chaque mois' });
  await f.getByLabel('Prochain versement').fill('2027-02-15');
  await f.getByText('Autres renseignements').click();
  await f.getByLabel('Minimum obligatoire ($, vide = le versement)').fill('185');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('erreur-saisie')).toHaveText($('Le minimum (185,00 $) dépasse le versement planifié (150,00 $).'));

  await f.getByLabel('Versement ($)').fill('200');
  await f.getByLabel('Taux annuel (%)').fill('9,90');
  await f.getByLabel('Échéance finale').fill('2029-12-15');
  await f.getByLabel('Solde ($)').fill('6000');
  await f.getByLabel('Solde au').fill('2027-01-15');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const fiche = page.getByTestId('fiche-pret');
  await expect(fiche.getByTestId('versement')).toHaveText($('200,00 $ — chaque mois, le 15'));
  await expect(fiche.getByTestId('minimum')).toHaveText($('185,00 $'));
  await expect(fiche.getByTestId('echeance-finale')).toHaveText('Dernier versement prévu : 15 déc. 2029 (échéance indiquée)');
  await expect(fiche.getByTestId('methode')).toHaveText('À compléter');
});

test('L2, L3 : marquer comme remboursé avec un aperçu ; D1 : supprimer avec un aperçu', async ({ page }) => {
  await preparer(page);
  await ajouterPretMinimal(page);
  await page.getByRole('button', { name: 'Marquer comme remboursé…' }).click();
  await page.getByTestId('formulaire-remboursement').getByLabel('Remboursé le').fill('2027-01-14');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Marquer « Prêt auto (fictif) » comme remboursé');
  await expect(apercu).toContainText($('205,00 $ aux deux semaines deviennent libres. L’app ne décide pas où va cet argent.'));
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  const liberees = page.getByTestId('dettes-liberees');
  await expect(liberees).toContainText('Dettes libérées (1)');
  await liberees.locator('summary').click();
  await expect(liberees.getByTestId('statut-pret')).toHaveText('Remboursé le 14 janv. 2027');
  await expect(page.getByText('Aucun prêt pour l’instant.')).toBeVisible();
  // « Annuler » ramène le prêt.
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('dettes-liberees')).toHaveCount(0);

  // La fiche est restée ouverte.
  await page.getByRole('button', { name: 'Supprimer…' }).click();
  await expect(page.getByTestId('apercu')).toContainText('Supprimer le prêt « Prêt auto (fictif) »');
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Aucun prêt pour l’instant.')).toBeVisible();
});

test('sans profil de paie, Mes dettes explique quoi faire', async ({ page }) => {
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Mes dettes');
  await expect(page.getByText('Crée d’abord ton profil de paie dans « Mes paies »')).toBeVisible();
});

test('7b-1 : prochains versements, somme prévue jusqu’à l’échéance, ce qui manque, journal', async ({ page }) => {
  await preparer(page);
  await ajouterPretMinimal(page);
  const fiche = page.getByTestId('fiche-pret');
  // Q49 : les 6 prochains, à partir d'aujourd'hui (15 janv.), comme dans Mes paies.
  const items = fiche.getByTestId('a-venir').getByRole('listitem');
  await expect(items).toHaveCount(6);
  await expect(items.first()).toContainText('28 janv. 2027');
  await expect(items.first()).toContainText($('205,00 $'));
  await expect(items.last()).toContainText('8 avr. 2027');
  // Sans échéance finale : aucun total ; ce qui manque est dit simplement.
  await expect(fiche.getByTestId('total-prevu')).toHaveCount(0);
  await expect(fiche.getByTestId('manque')).toHaveText(
    'Pour estimer la date de remboursement et les intérêts, il manque : le solde, le taux et la méthode d’intérêts du contrat.',
  );

  // Q50 : avec une échéance finale, la somme des versements prévus, clairement nommée.
  await page.getByRole('button', { name: 'Compléter les renseignements…' }).click();
  const f = page.getByTestId('formulaire-renseignements');
  await f.getByLabel('Échéance finale').fill('2027-03-11');
  await f.getByLabel('Taux annuel (%)').fill('6,49');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fiche.getByTestId('total-prevu')).toHaveText(
    $('Somme des versements prévus d’ici l’échéance du 11 mars 2027 : 4 versements, 820,00 $. Ce n’est ni le solde restant ni le coût total du prêt.'),
  );
  await expect(fiche.getByTestId('manque')).toHaveText(
    'Pour estimer la date de remboursement et les intérêts, il manque : le solde et la méthode d’intérêts du contrat.',
  );
  await expect(items).toHaveCount(4);

  // Q51 : la confirmation d'un versement s'inscrit sous « Prêt « … » ».
  await nav(page, 'Mes paies');
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  await page.getByTestId('detail-cycle').locator('tr[data-dette="oui"]').getByRole('button', { name: /^Confirmer/ }).first().click();
  await expect(page.getByTestId('enregistre')).toContainText('Confirmer « Prêt auto (fictif) »');
});
