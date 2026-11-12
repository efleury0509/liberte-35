import { expect, test, type Page } from '@playwright/test';

// Illustrations — Épargne (maquette B approuvée) : la loutre jardinière à
// droite des totaux, entière ; comptes deux par ligne ; en fenêtre étroite,
// totaux puis comptes puis loutre, sans débordement.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Épargne');
  for (const [type, nom, solde] of [
    ['CELI', 'CELI (fictif)', '1900'],
    ['REER', 'REER (fictif)', '3000'],
  ] as const) {
    await page.getByRole('button', { name: 'Ajouter un compte' }).click();
    const f = page.getByTestId('formulaire-ajout');
    await f.getByLabel('Type').selectOption({ label: type });
    await f.getByLabel('Nom (facultatif)').fill(nom);
    await f.getByLabel('Solde de départ ($, facultatif)').fill(solde);
    await f.getByLabel('En date du').fill('2027-01-01');
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('formulaire-ajout')).toHaveCount(0);
  }
  await expect(page.getByTestId('compte')).toHaveCount(2);
  // La fiche du dernier compte créé s'ouvre (pleine largeur) : on la referme.
  await page.getByTestId('compte').getByRole('button', { name: 'Masquer' }).click();
  await expect(page.getByTestId('compte').getByRole('button', { name: 'Masquer' })).toHaveCount(0);
}

async function loutreEntiere(page: Page) {
  const img = page.getByTestId('illustration-epargne').getByRole('img', { name: /Une loutre jardinière arrose des pots/ });
  await img.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  const m = await img.evaluate((i: HTMLImageElement) => ({ n: [i.naturalWidth, i.naturalHeight], r: i.getBoundingClientRect() }));
  expect(m.n).toEqual([1672, 941]);
  expect(Math.abs(m.r.width / m.r.height - 1672 / 941)).toBeLessThan(0.01); // ni déformée ni recadrée
  return m.r;
}

async function sansDebordement(page: Page) {
  const { sw, cw } = await page.locator('main').evaluate((m) => ({ sw: m.scrollWidth, cw: m.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  const largeur = page.viewportSize()!.width;
  for (const b of await page.locator('main button:visible').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(largeur);
  }
}

test('1280 × 800 : la loutre à droite des totaux, comptes deux par ligne, sans soleil d’en-tête', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page);
  await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0));
  const r = await loutreEntiere(page);
  expect(Math.round(r.width)).toBe(360);
  const totaux = (await page.getByTestId('total-epargne').boundingBox())!;
  expect(Math.abs(totaux.y - r.y)).toBeLessThan(2); // côte à côte, alignés en haut
  expect(Math.abs(totaux.y + totaux.height - (r.y + r.height))).toBeLessThan(2); // même hauteur
  expect(totaux.x + totaux.width).toBeLessThan(r.x);
  await expect(page.getByTestId('total-epargne')).toContainText('Ce total n’est pas de l’argent disponible');
  const comptes = page.getByTestId('compte');
  const [a, b] = [(await comptes.nth(0).boundingBox())!, (await comptes.nth(1).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); // deux par ligne
  expect(a.y).toBeGreaterThan(r.y + r.height);
  await expect(page.locator('.en-tete-section .zone-illustration')).toHaveCount(0);
  await sansDebordement(page);
});

test('1024 × 640 : totaux, puis comptes, puis la loutre entière, sans débordement', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await preparer(page);
  await sansDebordement(page);
  const totaux = (await page.getByTestId('total-epargne').boundingBox())!;
  const dernier = (await page.getByTestId('compte').last().boundingBox())!;
  const r = await loutreEntiere(page);
  const totaux2 = (await page.getByTestId('total-epargne').boundingBox())!;
  const dernier2 = (await page.getByTestId('compte').last().boundingBox())!;
  expect(totaux.y).toBeLessThan(dernier.y);
  expect(r.y).toBeGreaterThan(dernier2.y + dernier2.height - 1); // l'information d'abord
  expect(totaux2.y).toBeLessThan(r.y);
  expect(r.width).toBeLessThanOrEqual(520.5);
  expect(r.x + r.width).toBeLessThanOrEqual(1024);
  await sansDebordement(page);
});
