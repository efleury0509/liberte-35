import { expect, test, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// Illustrations — Mes paies (maquette A approuvée) : la loutre organisatrice à
// droite du titre et des boutons, entière, sans cadre ; cartes de paie côte à
// côte quand la place le permet, l'une sous l'autre sinon ; pas de débordement.
async function preparer(page: Page, exemple = true) {
  await page.goto('/?aujourdhui=2027-01-15');
  await ouvrirMesPaies(page);
  if (exemple) await page.getByTestId('bouton-exemple').click();
  else {
    await page.getByLabel('Date de la première paie').fill('2027-01-07');
    await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
    await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
    await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  }
  await expect(page.getByTestId('paie-principale').first()).toBeVisible();
  await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0));
}

async function loutre(page: Page) {
  const img = page.getByTestId('illustration-paies').getByRole('img', { name: /Une loutre organisatrice/ });
  await expect(img).toBeVisible();
  const m = await img.evaluate((i: HTMLImageElement) => {
    const s = getComputedStyle(i);
    const p = getComputedStyle(i.parentElement!);
    return { n: [i.naturalWidth, i.naturalHeight], r: i.getBoundingClientRect().toJSON(), ombre: s.boxShadow + p.boxShadow, bord: s.borderStyle + p.borderStyle, rayon: s.borderRadius };
  });
  expect(m.n).toEqual([1672, 941]);
  expect(Math.abs(m.r.width / m.r.height - 1672 / 941)).toBeLessThan(0.01);
  expect(m.ombre).toBe('nonenone'); // sans ombre
  expect(m.bord).toBe('nonenone'); // sans cadre
  return m.r as DOMRect;
}

async function sansChevauchement(page: Page, r: DOMRect) {
  for (const sel of ['h1', '[data-testid="bouton-exemple"]', '[role="tablist"]', '[data-testid="bandeau-exemple"]', '[data-testid="paie-principale"]']) {
    for (const el of await page.locator(sel).all()) {
      if (!(await el.isVisible())) continue;
      const b = (await el.boundingBox())!;
      const croise = b.x < r.x + r.width && r.x < b.x + b.width && b.y < r.y + r.height && r.y < b.y + b.height;
      expect(croise, sel).toBe(false);
    }
  }
  const { sw, cw } = await page.locator('main').evaluate((x) => ({ sw: x.scrollWidth, cw: x.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

test('1280 × 800 : la loutre à droite du titre, cartes côte à côte, aucune hauteur ajoutée', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page, false);
  const r = await loutre(page);
  expect(Math.round(r.width)).toBe(360);
  const titre = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(titre.x + titre.width).toBeLessThan(r.x);
  const cartes = page.getByTestId('paie-principale');
  const [a, b] = [(await cartes.nth(0).boundingBox())!, (await cartes.nth(1).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); // côte à côte
  expect(a.y).toBeGreaterThan(r.y + r.height);
  // Les cartes commencent sous les onglets, sans espace ajouté par la loutre.
  const onglets = (await page.getByRole('tablist').boundingBox())!;
  expect(a.y - (onglets.y + onglets.height)).toBeLessThan(40);
  await expect(page.locator('.en-tete-section .zone-illustration')).toHaveCount(0);
  await expect(page.locator('[data-testid="paie-principale"] [data-illustration]')).toHaveCount(0);
  await sansChevauchement(page, r);
});

test('1280 × 800, exemple fictif : le bandeau d’exemple reste à gauche de la loutre', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page);
  await sansChevauchement(page, await loutre(page));
});

test('1024 × 640 : cartes l’une sous l’autre, rien ne déborde, la loutre entière', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await preparer(page);
  const r = await loutre(page);
  await sansChevauchement(page, r);
  const cartes = page.getByTestId('paie-principale');
  const [a, b] = [(await cartes.nth(0).boundingBox())!, (await cartes.nth(1).boundingBox())!];
  expect(b.y).toBeGreaterThan(a.y + a.height - 1); // l'une sous l'autre
  for (const c of [a, b]) expect(c.x + c.width).toBeLessThanOrEqual(1024);
  for (const el of await page.locator('[data-testid="paie-principale"] button:visible').all()) {
    const x = (await el.boundingBox())!;
    expect(x.x + x.width).toBeLessThanOrEqual(1024);
  }
});

test('« Toutes mes paies » : l’historique commence sous la loutre', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page, false);
  await page.getByRole('tab', { name: 'Toutes mes paies' }).click();
  const r = await loutre(page);
  const panneau = (await page.locator('#panneau-paies-toutes').boundingBox())!;
  expect(panneau.y).toBeGreaterThanOrEqual(r.y + r.height - 1);
});
