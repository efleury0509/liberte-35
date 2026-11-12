import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// Illustrations — Dépenses (maquette A approuvée) : la loutre gestionnaire en
// tête de la colonne de droite, entière ; aucun débordement à 1024 px.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('description-profil')).toBeVisible();
  for (const [nom, montant, genre] of [
    ['Loyer (fictif)', '1100', 'Fixe'],
    ['Cellulaire (fictif)', '55', 'Fixe'],
    ['Épicerie (fictive)', '300', 'Enveloppe variable'],
  ] as const) {
    await page.getByRole('button', { name: 'Ajouter un revenu ou une dépense' }).click();
    const f = page.getByTestId('formulaire-element');
    await f.getByLabel('Nature').selectOption({ label: 'Dépense' });
    await f.getByLabel('Nom').fill(nom);
    await f.getByLabel('Montant ($, facultatif)').fill(montant);
    await f.getByLabel('Genre').selectOption({ label: genre });
    await f.getByLabel('Quand').selectOption({ label: genre === 'Fixe' ? 'Chaque mois' : '1re paie du mois' });
    if (genre === 'Fixe') await f.getByLabel('Date').fill('2027-02-01');
    await f.getByRole('button', { name: 'Enregistrer' }).click();
  }
  await nav(page, 'Dépenses');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Cellulaire (fictif)');
}

async function loutreEntiere(page: Page) {
  const img = page.getByTestId('illustration-depenses').getByRole('img', { name: /Une loutre en coton ouaté mauve/ });
  await img.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  const m = await img.evaluate((i: HTMLImageElement) => ({ n: [i.naturalWidth, i.naturalHeight], r: i.getBoundingClientRect() }));
  expect(m.n).toEqual([1671, 941]);
  expect(Math.abs(m.r.width / m.r.height - 1671 / 941)).toBeLessThan(0.01); // ni déformée ni recadrée
  return m.r;
}

async function sansDebordement(page: Page) {
  const main = page.locator('main');
  const { sw, cw } = await main.evaluate((m) => ({ sw: m.scrollWidth, cw: m.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  const largeur = page.viewportSize()!.width;
  for (const b of await page.locator('main button:visible').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(largeur);
  }
}

test('1280 × 800 : la loutre en tête de la colonne de droite, sans soleil d’en-tête, listes à leur place', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page);
  const r = await loutreEntiere(page);
  expect(Math.round(r.width)).toBe(360);
  const douze = (await page.getByRole('complementary', { name: 'Les 12 prochains mois' }).locator('article').boundingBox())!;
  expect(r.y + r.height).toBeLessThan(douze.y); // au-dessus de « Les 12 prochains mois »
  // Les listes commencent à côté de l'illustration, sans être repoussées.
  const fixes = (await page.getByTestId('panneau-fixes').boundingBox())!;
  expect(Math.abs(fixes.y - r.y)).toBeLessThan(60);
  expect(fixes.x + fixes.width).toBeLessThan(r.x);
  await expect(page.locator('.en-tete-section .zone-illustration')).toHaveCount(0);
  await expect(page.getByTestId('illustration-depenses').getByRole('img')).toHaveCount(1);
  await sansDebordement(page);
});

test('1024 × 640 : aucune carte ni bouton coupé, la loutre entière après les listes', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await preparer(page);
  await sansDebordement(page);
  for (const id of ['panneau-fixes', 'panneau-enveloppes']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(1024);
  }
  const r = await loutreEntiere(page);
  expect(r.width).toBeLessThanOrEqual(520.5);
  expect(r.x + r.width).toBeLessThanOrEqual(1024);
  const fixes = (await page.getByTestId('panneau-fixes').boundingBox())!;
  expect(r.y).toBeGreaterThan(fixes.y); // l'information d'abord
  await sansDebordement(page);
});
