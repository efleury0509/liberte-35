import { expect, test, type Page } from '@playwright/test';
import { voirTout } from './onglets';

// Illustrations — Dettes (maquette A approuvée) : le paysage panoramique à
// droite du titre, entier ; « Solde actuel » sur toute la largeur de la carte,
// le complément sur sa propre ligne, même texte. Données fictives.
const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Mes paies');
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await nav(page, 'Dettes');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  const f = page.getByTestId('formulaire-ajout-pret');
  await f.getByLabel('Nom du prêt').fill('Prêt auto (fictif)');
  await f.getByLabel('Versement ($)').fill('205');
  await f.getByLabel('Fréquence').selectOption({ label: 'Aux deux semaines' });
  await f.getByLabel('Prochain versement').fill('2027-01-14');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  // Un solde déclaré le 10 janv., puis le versement du 14 confirmé : « payés depuis ».
  await page.getByRole('button', { name: /^Actions — prêt/ }).click();
  await page.getByRole('button', { name: 'Compléter les renseignements…' }).click();
  const r = page.getByTestId('formulaire-renseignements');
  await r.getByLabel('Solde ($)').fill('9800');
  await r.getByLabel('Solde au').fill('2027-01-10');
  await r.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(r).toHaveCount(0);
  await nav(page, 'Mes paies');
  await voirTout(page);
  await page.locator('tr[data-cycle="2027-01-07"]').getByRole('button', { name: 'Détails' }).click();
  await voirTout(page);
  await page.getByTestId('detail-cycle').locator('tr[data-dette="oui"]').getByRole('button', { name: 'Confirmer Prêt auto (fictif)' }).click();
  await page.keyboard.press('Escape');
  await nav(page, 'Dettes');
  await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0));
}

async function paysage(page: Page) {
  const img = page.getByTestId('illustration-dettes').getByRole('img', { name: /Liberté financière/ });
  await expect(img).toBeVisible();
  const m = await img.evaluate((i: HTMLImageElement) => ({ n: [i.naturalWidth, i.naturalHeight], r: i.getBoundingClientRect().toJSON() }));
  expect(m.n).toEqual([2172, 724]);
  expect(Math.abs(m.r.width / m.r.height - 3)).toBeLessThan(0.02); // ni déformé ni recadré
  return m.r as DOMRect;
}

async function verifier(page: Page, largeurAttendue: number) {
  const r = await paysage(page);
  expect(Math.abs(r.width - largeurAttendue)).toBeLessThan(3);
  const titre = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(titre.x + titre.width).toBeLessThan(r.x);
  // Les prêts et la colonne de droite commencent sous le paysage.
  for (const sel of ['.colonnes', '[data-pret]', 'aside']) {
    const b = (await page.locator(sel).first().boundingBox())!;
    expect(b.y, sel).toBeGreaterThanOrEqual(r.y + r.height - 1);
  }
  await expect(page.locator('.en-tete-section .zone-illustration')).toHaveCount(0);
  const { sw, cw } = await page.locator('main').evaluate((x) => ({ sw: x.scrollWidth, cw: x.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  // Solde actuel : toute la largeur de la carte, montant puis complément, même texte.
  const dd = page.getByTestId('solde-actuel-carte');
  await expect(dd).toHaveText($('9 800,00 $ au 10 janv. 2027 — 205,00 $ payés depuis, répartition à compléter'));
  await expect(dd.locator('.solde-montant')).toHaveText($('9 800,00 $ au 10 janv. 2027'));
  await expect(dd.locator('.solde-suite')).toContainText($('205,00 $ payés depuis, répartition à compléter'));
  const carte = (await page.locator('[data-pret] article').first().boundingBox())!;
  const bloc = (await page.locator('.solde-actuel').first().boundingBox())!;
  expect(bloc.width).toBeGreaterThan(carte.width * 0.8);
  const montant = await dd.locator('.solde-montant').evaluate((e) => e.getClientRects().length);
  expect(montant).toBe(1); // le montant tient sur une ligne
}

test('1280 × 800 : panorama 540 × 180 à droite du titre ; solde actuel lisible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparer(page);
  await verifier(page, 540);
});

test('1024 × 640 : panorama réduit, entier ; rien ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await preparer(page);
  await verifier(page, 704 * 0.58);
});
