import { expect, test, type Locator, type Page } from '@playwright/test';
import { ouvrirMesPaies } from './onglets';

// Menu « Actions » : jamais coupé par sa carte ni masqué par les éléments
// voisins ; chaque choix est réellement atteignable. Données fictives.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

/** Chaque bouton du menu ouvert est visible en entier et reçoit le clic à son centre. */
async function menuAtteignable(page: Page, declencheur: Locator) {
  await declencheur.click();
  const liste = page.locator('.liste[role="group"]');
  await expect(liste).toBeVisible();
  const boutons = await liste.getByRole('button').all();
  expect(boutons.length).toBeGreaterThan(0);
  const vue = page.viewportSize()!;
  for (const b of boutons) {
    const ok = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      // Bords gauche et droit, haut et bas, centre (hors coins arrondis).
      const mx = (r.left + r.right) / 2;
      const my = (r.top + r.bottom) / 2;
      const coins = [
        [r.left + 12, my],
        [r.right - 12, my],
        [mx, r.top + 3],
        [mx, r.bottom - 3],
        [mx, my],
      ];
      const rates = coins
        .map(([x, y]) => document.elementFromPoint(x!, y!))
        .filter((t) => !(t !== null && (t === el || el.contains(t))))
        .map((t) => (t ? `${t.tagName}.${t.className}` : 'rien'));
      return rates.length === 0 ? true : rates.join(', ');
    });
    expect(ok, (await b.textContent()) ?? "").toBe(true);
    const r = (await b.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(vue.height);
    expect(r.x + r.width).toBeLessThanOrEqual(vue.width);
  }
  await page.keyboard.press('Escape');
  await expect(liste).toHaveCount(0);
}

async function prets(page: Page) {
  await page.goto('/?aujourdhui=2027-01-15');
  await ouvrirMesPaies(page);
  await page.getByLabel('Date de la première paie').fill('2027-01-07');
  await page.getByLabel('Montant net habituel ($, facultatif)').fill('2100');
  await page.locator('form').getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await nav(page, 'Dettes');
  for (const [nom, freq] of [['Prêt auto (fictif)', 'Aux deux semaines'], ['perso - test (fictif)', 'Chaque mois']] as const) {
    await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
    const f = page.getByTestId('formulaire-ajout-pret');
    await f.getByLabel('Nom du prêt').fill(nom);
    await f.getByLabel('Versement ($)').fill('200');
    await f.getByLabel('Fréquence').selectOption({ label: freq });
    await f.getByLabel('Prochain versement').fill('2027-02-15');
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(f).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Ajouter ma carte' }).click();
  const c = page.getByTestId('formulaire-ajout-carte');
  await c.getByLabel('Nom de la carte').fill('Visa (fictive)');
  await c.getByLabel('Prochaine échéance').fill('2027-01-25');
  await c.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('fenetre-formulaire')).toHaveCount(0);
}

for (const [l, h] of [[1266, 800], [1024, 640]] as const) {
  test(`${l} × ${h} — Dettes : menus « Actions » des prêts et de la carte entièrement utilisables`, async ({ page }) => {
    await page.setViewportSize({ width: l, height: h });
    await prets(page);
    for (const nom of ['Prêt auto (fictif)', 'perso - test (fictif)']) {
      const d = page.getByRole('button', { name: `Actions — prêt « ${nom} »` });
      await d.scrollIntoViewIfNeeded();
      await menuAtteignable(page, d);
    }
    const carte = page.getByRole('button', { name: /^Actions — carte/ });
    await carte.scrollIntoViewIfNeeded();
    await menuAtteignable(page, carte);
  });

  test(`${l} × ${h} — près du bas de l'écran, le menu s'ouvre vers le haut`, async ({ page }) => {
    await page.setViewportSize({ width: l, height: h });
    await prets(page);
    const d = page.getByRole('button', { name: 'Actions — prêt « perso - test (fictif) »' });
    // Place le bouton tout en bas de la zone visible.
    await d.evaluate((el) => {
      const main = document.querySelector('main')!;
      const r = el.getBoundingClientRect();
      main.scrollBy(0, r.bottom - main.getBoundingClientRect().bottom + 12);
    });
    await menuAtteignable(page, d);
  });
}

test('le choix d’une action fonctionne toujours, et un clic ailleurs ferme le menu', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await prets(page);
  const d = page.getByRole('button', { name: 'Actions — prêt « perso - test (fictif) »' });
  await d.scrollIntoViewIfNeeded();
  await d.click();
  await page.getByRole('button', { name: 'Compléter les renseignements…' }).click();
  await expect(page.getByTestId('formulaire-renseignements')).toBeVisible();
  await page.keyboard.press('Escape');
  await d.click();
  await expect(page.locator('.liste[role="group"]')).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator('.liste[role="group"]')).toHaveCount(0);
});

test('Épargne : le menu « Actions » d’une réserve est entièrement utilisable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Épargne');
  await page.getByRole('button', { name: 'Ajouter un compte' }).click();
  const f = page.getByTestId('formulaire-ajout');
  await f.getByLabel('Type').selectOption({ label: 'CELI' });
  await f.getByLabel('Solde de départ ($, facultatif)').fill('2000');
  await f.getByLabel('En date du').fill('2027-01-01');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Nouvelle réserve…' }).click();
  const r = page.getByTestId('formulaire-reserve');
  await r.getByLabel('Nom').fill('Pneus (fictifs)');
  await r.getByTestId('premiere-affectation').fill('100');
  await r.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  const d = page.getByRole('button', { name: /^Actions — réserve/ });
  await d.scrollIntoViewIfNeeded();
  await menuAtteignable(page, d);
});
