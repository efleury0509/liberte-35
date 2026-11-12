import { expect, test, type Page } from '@playwright/test';
import { voirTout, ouvrirMesPaies } from './onglets';

// V1 lot 6a : une seule zone défilante (la zone principale) ; la page ne
// défile jamais et la barre latérale reste en place.
async function verifier(page: Page, section: string) {
  const mesure = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    main.scrollTop = main.scrollHeight;
    window.scrollTo(0, 10_000);
    const nav = document.querySelector('nav[aria-label="Navigation principale"]')!.getBoundingClientRect();
    return {
      page: document.documentElement.scrollHeight,
      fenetre: window.innerHeight,
      defilementPage: window.scrollY,
      haut: Math.round(nav.top),
      bas: Math.round(nav.bottom),
      principale: main.scrollHeight > main.clientHeight,
    };
  });
  expect(mesure.page, `${section} : la page ne dépasse pas la fenêtre`).toBeLessThanOrEqual(mesure.fenetre);
  expect(mesure.defilementPage, `${section} : la page ne défile pas`).toBe(0);
  expect(mesure.haut, `${section} : la barre reste en haut`).toBe(0);
  expect(mesure.bas, `${section} : la barre occupe toute la hauteur`).toBe(mesure.fenetre);
  return mesure;
}

test('une seule zone défilante, la barre latérale fixe, sur chaque section', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?aujourdhui=2027-01-10');
  await ouvrirMesPaies(page);
  await page.getByRole('button', { name: 'Voir l’exemple fictif' }).click();
  await expect(page.getByTestId('paie-principale').first()).toBeVisible();
  expect((await verifier(page, 'Mes prochaines paies (exemple)')).principale).toBe(true);
  await voirTout(page);
  await expect(page.locator('tr[data-cycle]').first()).toBeVisible();
  expect((await verifier(page, 'Toutes mes paies (exemple)')).principale).toBe(true);
  for (const section of ['Dépenses', 'Épargne', 'Dettes', 'Paramètres']) {
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: section, exact: true }).click();
    await verifier(page, section);
  }
});
