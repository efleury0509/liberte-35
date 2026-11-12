import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// 0.19.1 : un nom long dans le titre d'une carte passe à la ligne au lieu
// d'être coupé, sans déplacer montants ni boutons hors de la carte.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();
const LONG = 'CELI — Fonds d’urgence (fictif)';
const TRES_LONG = 'CELI — Fonds d’urgence pour les imprévus de la maison et de l’auto (fictif)';

async function titresEntiers(page: Page) {
  const cartes = page.locator('article.carte-v1');
  const n = await cartes.count();
  const lignes: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const carte = cartes.nth(i);
    if (!(await carte.isVisible())) continue;
    const c = (await carte.boundingBox())!;
    const titre = carte.locator('header .titre-pastille');
    const t = (await titre.boundingBox())!;
    const m = await titre.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, texte: e.textContent!, h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) }));
    expect(m.sw, m.texte).toBeLessThanOrEqual(m.cw + 1); // rien de coupé
    expect(t.x + t.width, m.texte).toBeLessThanOrEqual(c.x + c.width);
    lignes[m.texte] = Math.round((m.h - 8) / m.lh);
    // Tout le contenu de la carte reste dans la carte.
    for (const el of await carte.locator('.corps button:visible, .corps [data-testid="valeur"], .badge').all()) {
      const b = (await el.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
      expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
    }
  }
  const { sw, cw } = await page.locator('main').evaluate((x) => ({ sw: x.scrollWidth, cw: x.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  return lignes;
}

async function comptes(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Épargne');
  for (const [type, nom, solde] of [['CELI', LONG, '2000'], ['REER', TRES_LONG, '925']] as const) {
    await page.getByRole('button', { name: 'Ajouter un compte' }).click();
    const f = page.getByTestId('formulaire-ajout');
    await f.getByLabel('Type').selectOption({ label: type });
    await f.getByLabel('Nom (facultatif)').fill(nom);
    await f.getByLabel('Solde de départ ($, facultatif)').fill(solde);
    await f.getByLabel('En date du').fill('2027-01-01');
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('formulaire-ajout')).toHaveCount(0);
  }
  await page.getByTestId('compte').getByRole('button', { name: 'Masquer' }).click();
}

for (const [l, h] of [[1024, 640], [1266, 800]] as const)
  test(`Épargne ${l} px : noms de comptes longs entiers, sur deux lignes au besoin`, async ({ page }) => {
    await page.setViewportSize({ width: l, height: h });
    await comptes(page);
    const lignes = await titresEntiers(page);
    expect(lignes[LONG]).toBeLessThanOrEqual(2);
    // Le très long nom (77 caractères) reste entier, quitte à prendre 3 lignes.
    expect(lignes[TRES_LONG]).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('compte').first()).toContainText('2 000,00');
  });

test('Dettes 1024 px : un prêt au nom long reste entier, montants et boutons dans la carte', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?aujourdhui=2027-01-02');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await nav(page, 'Dettes');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  const f = page.getByTestId('formulaire-ajout-pret');
  await f.getByLabel('Nom du prêt').fill('Prêt auto familial — Caisse populaire du quartier (fictif)');
  await f.getByLabel('Versement ($)').fill('205');
  await f.getByLabel('Fréquence').selectOption({ label: 'Aux deux semaines' });
  await f.getByLabel('Prochain versement').fill('2027-01-14');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('formulaire-ajout-pret')).toHaveCount(0);
  await titresEntiers(page);
});

test('largeur normale : les titres courts restent une pilule sur une ligne', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?aujourdhui=2027-01-15');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  const lignes = await titresEntiers(page);
  for (const t of ['Paie actuelle', 'Prochaine paie']) expect(lignes[t]).toBe(1);
});
