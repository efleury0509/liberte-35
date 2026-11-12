import { expect, test, type Page } from '@playwright/test';

// Épargne — bandeau des totaux adaptatif : à toutes les tailles et pour
// tous les montants, les trois montants restent entiers dans le bandeau,
// sans toucher la loutre. Données fictives.
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function preparer(page: Page, soldes: [string, string], reserve: string | null) {
  await page.goto('/?aujourdhui=2027-01-15');
  await nav(page, 'Épargne');
  for (const [i, solde] of soldes.entries()) {
    await page.getByRole('button', { name: 'Ajouter un compte' }).click();
    const f = page.getByTestId('formulaire-ajout');
    await f.getByLabel('Type').selectOption({ label: i === 0 ? 'CELI' : 'REER' });
    await f.getByLabel('Nom (facultatif)').fill(i === 0 ? 'CELI — Fonds d’urgence (fictif)' : 'REER (fictif)');
    await f.getByLabel('Solde de départ ($, facultatif)').fill(solde);
    await f.getByLabel('En date du').fill('2027-01-01');
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('formulaire-ajout')).toHaveCount(0);
    if (i === 0 && reserve) {
      await page.getByRole('button', { name: 'Nouvelle réserve…' }).click();
      const r = page.getByTestId('formulaire-reserve');
      await r.getByLabel('Nom').fill('Réserve (fictive)');
      await r.getByTestId('premiere-affectation').fill(reserve);
      await r.getByRole('button', { name: 'Enregistrer' }).click();
      await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByTestId('apercu')).toHaveCount(0);
    }
  }
  await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0));
}

async function verifier(page: Page) {
  const bandeau = page.getByTestId('total-epargne');
  await expect(bandeau).toContainText('Total suivi');
  await expect(bandeau).toContainText('dont réservé');
  await expect(bandeau).toContainText('dont non réservé');
  await page.waitForTimeout(150); // la disposition se recalcule après l'affichage
  const m = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="total-epargne"]') as HTMLElement;
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    const loutre = document.querySelector('[data-testid="illustration-epargne"] img')!.getBoundingClientRect();
    return {
      gauche: r.left + parseFloat(s.paddingLeft) - 0.5,
      droite: r.right - parseFloat(s.paddingRight) + 0.5,
      haut: r.top,
      bas: r.bottom,
      disposition: b.dataset.disposition,
      loutre: { left: loutre.left, top: loutre.top, width: loutre.width },
      montants: [...b.querySelectorAll('.kpi-montant')].map((x) => {
        const q = x.getBoundingClientRect();
        return { texte: x.textContent, left: q.left, right: q.right, top: q.top, bottom: q.bottom, coupe: (x as HTMLElement).scrollWidth > (x as HTMLElement).clientWidth + 1 };
      }),
    };
  });
  for (const x of m.montants) {
    expect(x.coupe, x.texte!).toBe(false);
    expect(x.left, x.texte!).toBeGreaterThanOrEqual(m.gauche);
    expect(x.right, x.texte!).toBeLessThanOrEqual(m.droite);
    expect(x.bottom, x.texte!).toBeLessThanOrEqual(m.bas);
    // Jamais sur la loutre quand elle est à côté.
    if (m.loutre.top < m.bas && m.loutre.left > m.gauche) expect(x.right).toBeLessThan(m.loutre.left);
  }
  // Aucun chevauchement entre montants.
  for (let i = 0; i < m.montants.length; i++)
    for (let j = i + 1; j < m.montants.length; j++) {
      const [a, b] = [m.montants[i]!, m.montants[j]!];
      const croise = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(croise).toBe(false);
    }
  return m;
}

const CAS: { nom: string; soldes: [string, string]; reserve: string | null }[] = [
  { nom: 'petits montants', soldes: ['1900', '0'], reserve: null },
  { nom: 'montants de l’utilisatrice', soldes: ['2000', '1235'], reserve: '1500' },
  { nom: 'montants élevés', soldes: ['1234567', '98765'], reserve: '765432' },
  { nom: 'montants très élevés', soldes: ['98765432', '1234567'], reserve: '45678901' },
];

for (const [l, h] of [[1266, 800], [1280, 800], [1024, 640], [1400, 900]] as const)
  for (const c of CAS)
    test(`${l} × ${h} — ${c.nom} : trois montants entiers dans le bandeau`, async ({ page }) => {
      await page.setViewportSize({ width: l, height: h });
      await preparer(page, c.soldes, c.reserve);
      const m = await verifier(page);
      // La loutre ne bouge pas : à droite des totaux (fenêtre large) ou après les comptes.
      if (l > 1180) expect(Math.round(m.loutre.width)).toBe(360);
      else expect(m.loutre.top).toBeGreaterThan(m.bas);
    });

test('la disposition suit la place : une ligne, puis deux lignes, sans rapetisser les chiffres', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await preparer(page, ['2000', '1235'], '1500');
  const large = await verifier(page);
  expect(large.disposition).toBe('ligne'); // bandeau pleine largeur : une ligne, note en dessous
  await page.setViewportSize({ width: 1266, height: 800 });
  const etroit = await verifier(page);
  expect(etroit.disposition).toBe('deux-lignes'); // à côté de la loutre : total, puis les deux autres
  const tailles = await page.getByTestId('total-epargne').locator('.kpi-montant').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
  expect(tailles).toEqual(['34px', '26px', '26px']);
});
