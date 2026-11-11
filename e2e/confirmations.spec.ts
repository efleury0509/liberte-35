import { expect, test, type Page } from '@playwright/test';

// Étape 5 : confirmations, dans l'aperçu en mémoire. Aujourd'hui = 10 mars 2027.
const ESP = ' ';
const dollars = (t: string) => t.replace(/ /g, ESP) + `${ESP}$`;

async function enregistrer(page: Page, zone = page.locator('body')) {
  await zone.getByRole('button', { name: 'Enregistrer' }).first().click();
  if (await page.getByTestId('apercu').count()) await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
}

async function ajouter(page: Page, o: { nature?: string; nom: string; montant: string; genre?: string; quand: string; date?: string; incertain?: boolean }) {
  await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
  const f = page.getByTestId('formulaire-element');
  await f.getByLabel('Nature').selectOption({ label: o.nature ?? 'Dépense' });
  await f.getByLabel('Nom').fill(o.nom);
  await f.getByLabel('Montant ($, facultatif)').fill(o.montant);
  if (o.genre) await f.getByLabel('Genre').selectOption({ label: o.genre });
  if (o.incertain) await f.getByLabel('Revenu incertain').check();
  await f.getByLabel('Quand').selectOption({ label: o.quand });
  if (o.date) await f.getByLabel('Date').fill(o.date);
  await enregistrer(page, f);
}

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-03-10');
  await page.getByRole('button', { name: 'Mes paies' }).click();
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await enregistrer(page);
  await ajouter(page, { nom: 'Loyer', montant: '1200', quand: 'Chaque mois', date: '2027-01-01' });
  await ajouter(page, { nom: 'Épicerie', montant: '300', genre: 'Enveloppe variable', quand: '1re paie du mois' });
  await ajouter(page, { nature: 'Revenu', nom: 'Remboursement', montant: '800', quand: 'Une seule fois', date: '2027-03-08', incertain: true });
}

const ligneCycle = (page: Page, debut: string) => page.locator(`tr[data-cycle="${debut}"]`);
async function details(page: Page, debut: string) {
  // Aujourd'hui = 10 mars : les cycles de février sont des cycles précédents.
  if ((await ligneCycle(page, debut).count()) === 0) await page.getByRole('button', { name: 'Voir les paies précédentes' }).click();
  const b = ligneCycle(page, debut).getByRole('button', { name: 'Détails' });
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  return page.getByTestId('detail-cycle');
}

test('le tableau des cycles est juste sous « Ma paie », avant les listes', async ({ page }) => {
  await preparer(page);
  const tableau = (await page.getByTestId('cycles').boundingBox())!.y;
  const revenus = (await page.getByTestId('bloc-revenus').boundingBox())!.y;
  expect(tableau).toBeLessThan(revenus);
});

test('confirmer d’un clic, puis « Annuler » : retour exact à « À vérifier »', async ({ page }) => {
  await preparer(page);
  // Cycles précédents : une phrase discrète les signale.
  await expect(page.getByTestId('a-verifier-avant')).toContainText('éléments à vérifier dans les cycles précédents');
  await page.getByTestId('a-verifier-avant').getByRole('button', { name: 'Les afficher' }).click();
  // M2 (18 févr.) : paie et loyer du 1er mars sont à vérifier.
  await expect(ligneCycle(page, '2027-02-18').getByTestId('a-verifier')).toHaveText('2 à vérifier');
  const detail = await details(page, '2027-02-18');
  const loyer = detail.locator('tr[data-ligne]', { hasText: 'Loyer' });
  await expect(loyer.getByTestId('statut')).toHaveText('À vérifier');
  await loyer.getByRole('button', { name: 'Confirmer Loyer' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(loyer.getByTestId('statut')).toHaveText('Confirmé le 10 mars');
  await expect(ligneCycle(page, '2027-02-18').getByTestId('a-verifier')).toHaveText('1 à vérifier');
  await expect(page.getByTestId('enregistre')).toContainText('Enregistré : Confirmer « Loyer » (1er mars).');
  await expect(page.getByTestId('enregistre')).not.toContainText('..');
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(loyer.getByTestId('statut')).toHaveText('À vérifier');
  await expect(ligneCycle(page, '2027-02-18').getByTestId('a-verifier')).toHaveText('2 à vérifier');
});

test('confirmer autrement : la date du jour est proposée ; la paie reçue différente change le disponible', async ({ page }) => {
  await preparer(page);
  const detail = await details(page, '2027-03-04');
  await detail.getByTestId('ligne-paie').getByRole('button', { name: 'Confirmer autrement…' }).click();
  const f = page.getByTestId('formulaire-confirmation');
  await expect(f.getByLabel('Date')).toHaveValue('2027-03-10');
  await expect(f.getByLabel('Montant reçu ou payé ($)')).toHaveValue('2100,00');
  await f.getByLabel('Montant reçu ou payé ($)').fill('2050');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(detail.getByTestId('ligne-paie')).toContainText('Confirmée le 10 mars');
  await expect(detail.getByTestId('ligne-paie')).toContainText(`prévue ${dollars('2 100,00')}`);
  // M3 : paie 2 050 − épicerie 300 ; le remboursement incertain n'est pas compté.
  await expect(ligneCycle(page, '2027-03-04').getByTestId('disponible')).toHaveText(dollars('1 750,00'));
});

test('un revenu incertain compte dès que sa réception est confirmée ; corriger, puis annuler', async ({ page }) => {
  await preparer(page);
  const detail = await details(page, '2027-03-04');
  const remb = detail.locator('tr[data-ligne]', { hasText: 'Remboursement' });
  await expect(remb).toContainText('non compté (incertain)');
  await remb.getByRole('button', { name: 'Confirmer autrement…' }).click();
  const f = page.getByTestId('formulaire-confirmation');
  await f.getByLabel('Montant reçu ou payé ($)').fill('812,35');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligneCycle(page, '2027-03-04').getByTestId('disponible')).toHaveText(dollars('2 612,35'));
  await remb.getByRole('button', { name: 'Corriger' }).click();
  await expect(f.getByLabel('Montant reçu ou payé ($)')).toHaveValue('812,35');
  await f.getByLabel('Montant reçu ou payé ($)').fill('800');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligneCycle(page, '2027-03-04').getByTestId('disponible')).toHaveText(dollars('2 600,00'));
  await remb.getByRole('button', { name: 'Annuler la confirmation' }).click();
  // V1 : revenir sur un paiement passe toujours par la fenêtre sobre.
  const fenetre = page.getByTestId('apercu');
  await expect(fenetre).toHaveAttribute('data-variante', 'annulation');
  await fenetre.getByRole('button', { name: 'Conserver le paiement' }).click();
  await expect(fenetre).toHaveCount(0);
  await expect(ligneCycle(page, '2027-03-04').getByTestId('disponible')).toHaveText(dollars('2 600,00'));
  await remb.getByRole('button', { name: 'Annuler la confirmation' }).click();
  await fenetre.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(remb).toContainText('non compté (incertain)');
  await expect(ligneCycle(page, '2027-03-04').getByTestId('disponible')).toHaveText(dollars('1 800,00'));
});

test('« Tout confirmer » : un aperçu rapide qui nomme les exclus, puis plus rien à vérifier', async ({ page }) => {
  await preparer(page);
  const detail = await details(page, '2027-03-04');
  await detail.getByRole('button', { name: 'Tout confirmer…' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu).toContainText('Tout confirmer — cycle du 4 mars');
  await expect(apercu).toContainText('Exclu : Épicerie (enveloppe, jamais réconciliée).');
  await expect(apercu).toContainText('Exclu : Remboursement (revenu incertain : à confirmer individuellement).');
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  // Seul le revenu incertain, dû le 8 mars, reste à vérifier : il demande une confirmation individuelle.
  await expect(ligneCycle(page, '2027-03-04').getByTestId('a-verifier')).toHaveText('1 à vérifier');
  await expect(detail.getByTestId('ligne-paie')).toContainText('Confirmée le 10 mars');
});

test('une enveloppe n’a pas de bouton « Confirmer » ; « N’a pas eu lieu » sur un élément à vérifier', async ({ page }) => {
  await preparer(page);
  const detail = await details(page, '2027-02-18');
  await expect(detail.locator('tr[data-ligne]', { hasText: 'Épicerie' })).toHaveCount(0);
  const m3 = await details(page, '2027-03-04');
  const epicerie = m3.locator('tr[data-ligne]', { hasText: 'Épicerie' });
  await expect(epicerie.getByTestId('statut')).toHaveText('Enveloppe');
  await expect(epicerie.getByRole('button', { name: /Confirmer/ })).toHaveCount(0);
  const d2 = await details(page, '2027-02-18');
  const loyer = d2.locator('tr[data-ligne]', { hasText: 'Loyer' });
  await loyer.getByRole('button', { name: 'N’a pas eu lieu' }).click();
  await expect(loyer.getByTestId('statut')).toHaveText('retirée cette fois');
});

test('protection : une suspension qui effacerait un loyer confirmé est refusée, avec une explication', async ({ page }) => {
  await preparer(page);
  const detail = await details(page, '2027-02-18');
  await detail.locator('tr[data-ligne]', { hasText: 'Loyer' }).getByRole('button', { name: 'Confirmer Loyer' }).click();
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Dépenses', exact: true }).click();
  const loyer = page.getByTestId('panneau-fixes').getByRole('listitem').filter({ hasText: 'Loyer' });
  await loyer.getByRole('button', { name: 'Gérer' }).click();
  const gestion = page.getByTestId('fenetre-formulaire');
  await gestion.getByRole('button', { name: 'Suspendre' }).click();
  await gestion.getByLabel('Du').fill('2027-03-01');
  await gestion.getByLabel('Au (inclus)').fill('2027-03-31');
  await gestion.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByTestId('erreur-saisie')).toContainText('ferait disparaître une opération confirmée : « Loyer » du 1er mars');
  await expect(page.getByTestId('apercu')).toHaveCount(0);
});
