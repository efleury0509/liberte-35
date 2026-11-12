import type { Page } from '@playwright/test';

// V1 lot 6b : Mes paies a deux onglets. Le tableau des cycles est dans
// « Toutes mes paies » ; les cartes, « Ma paie » et les revenus dans
// « Mes prochaines paies ». Sans effet si l'onglet est déjà choisi.
async function choisir(page: Page, nom: string) {
  const onglet = page.getByRole('tab', { name: nom, exact: true });
  if ((await onglet.count()) === 0) return;
  if ((await onglet.getAttribute('aria-selected')) !== 'true') await onglet.click();
}
export const voirTout = (page: Page) => choisir(page, 'Toutes mes paies');
export const voirProchaines = (page: Page) => choisir(page, 'Mes prochaines paies');
