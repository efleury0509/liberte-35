import { expect, test, type Page } from '@playwright/test';

// 0.22.0 : configuration guidée. Aperçu en mémoire, données fictives.
// « ?guide=premiere » simule une toute première utilisation ; sans ce
// paramètre, l'aperçu se comporte comme une installation déjà guidée.
const JOUR = '2026-11-12';
const PREMIERE = `/?guide=premiere&aujourdhui=${JOUR}`;
const nav = (page: Page, nom: string) => page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: nom, exact: true }).click();

async function enregistrerPaie(page: Page) {
  await page.getByTestId('commencer-configuration').click();
  await page.getByLabel('Date d’une paie récente').fill('2026-11-06');
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await page.getByTestId('apercu').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('apercu')).toHaveCount(0);
  await expect(page.getByTestId('guide-paie-en-place')).toBeVisible();
}

async function enregistrer(page: Page, formulaire: string) {
  await page.getByTestId(formulaire).getByRole('button', { name: 'Enregistrer' }).click();
  const apercu = page.getByTestId('apercu');
  if (await apercu.isVisible()) await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('fenetre-formulaire')).toHaveCount(0);
}

test('première utilisation : la bienvenue s’ouvre seule, avec la loutre entière, sans rien écrire', async ({ page }) => {
  await page.goto(PREMIERE);
  const bienvenue = page.getByTestId('guide-bienvenue');
  await expect(bienvenue).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue dans Liberté 35 !');
  // Plein écran : pas de barre latérale.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  const loutre = bienvenue.locator('img[data-illustration="loutre-bienvenue"]');
  const { naturel, affiche } = await loutre.evaluate((img: HTMLImageElement) => ({
    naturel: [img.naturalWidth, img.naturalHeight],
    affiche: img.getBoundingClientRect().width / img.getBoundingClientRect().height,
  }));
  expect(naturel).toEqual([1671, 941]);
  expect(Math.abs(affiche - 1671 / 941)).toBeLessThan(0.01);
});

test('une installation déjà guidée ou configurée ne voit jamais la bienvenue', async ({ page }) => {
  await page.goto(`/?aujourdhui=${JOUR}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour !');
  await expect(page.getByTestId('guide')).toHaveCount(0);
  await expect(page.getByTestId('reprise-configuration')).toHaveCount(0);
});

test('« Explorer d’abord » ferme le guide ; l’Accueil invite à le commencer', async ({ page }) => {
  await page.goto(PREMIERE);
  await page.getByTestId('explorer-dabord').click();
  await expect(page.getByTestId('guide')).toHaveCount(0);
  const reprise = page.getByTestId('reprise-configuration');
  await expect(reprise).toContainText('Configurer Liberté 35');
  await reprise.getByTestId('reprendre-configuration').click();
  await expect(page.getByTestId('guide-bienvenue')).toBeVisible();
});

test('étapes verrouillées : la raison est expliquée tant que la paie n’est pas enregistrée', async ({ page }) => {
  await page.goto(PREMIERE);
  await page.getByTestId('commencer-configuration').click();
  await expect(page.getByTestId('guide-continuer')).toBeDisabled();
  await expect(page.getByTestId('raison-continuer')).toHaveText('Enregistre ton calendrier de paie pour débloquer la suite.');
  for (const n of [3, 4, 5, 6]) {
    await expect(page.getByTestId(`frise-${n}`)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId(`frise-${n}`)).toHaveAttribute('title', /Disponible après ton calendrier de paie/);
  }
  await page.getByTestId('frise-4').click({ force: true });
  await expect(page.getByTestId('raison-verrou')).toContainText('Disponible après ton calendrier de paie');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ma paie');
});

test('Ma paie : paie en cours recommandée ; une date ancienne avertit des paies « à vérifier » ; rien sans confirmation', async ({ page }) => {
  await page.goto(PREMIERE);
  await page.getByTestId('commencer-configuration').click();
  await page.getByLabel('Date d’une paie récente').fill('2026-11-06');
  const choix = page.getByTestId('choix-depart');
  await expect(choix.getByRole('radio', { name: /Ma paie en cours — vendredi 6 novembre 2026/ })).toBeChecked();
  await expect(page.getByTestId('avertissement-anterieures')).toHaveCount(0);

  await choix.getByRole('radio', { name: /Une date plus ancienne/ }).check();
  await page.getByTestId('paie-ancienne').selectOption('2026-09-11');
  await expect(page.getByTestId('avertissement-anterieures')).toContainText('4 paies passées, du 11 sept. au 23 oct., apparaîtront « à vérifier »');

  // L'aperçu reprend l'avertissement ; « Abandonner » n'enregistre rien.
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  const apercu = page.getByTestId('apercu');
  await expect(apercu.getByTestId('consequences')).toContainText('4 paies passées');
  await apercu.getByRole('button', { name: 'Abandonner' }).click();
  await expect(page.getByTestId('guide-formulaire-paie')).toBeVisible();
  await expect(page.getByTestId('guide-continuer')).toBeDisabled();

  await choix.getByRole('radio', { name: /Ma paie en cours/ }).check();
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(apercu).toContainText('Aux deux semaines, à partir du vendredi 6 novembre 2026');
  await apercu.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByTestId('guide-paie-en-place')).toContainText('À compléter');
  await expect(page.getByTestId('guide-continuer')).toBeEnabled();
  await expect(page.getByTestId('frise-3')).toHaveAttribute('aria-disabled', 'false');
});

test('parcours complet : suggestions sans montant, ajouts enregistrés, sections vides neutres au récapitulatif', async ({ page }) => {
  await page.goto(PREMIERE);
  await enregistrerPaie(page);
  await page.getByTestId('guide-continuer').click();

  // Une suggestion remplit le nom seulement ; rien n'est créé avant « Enregistrer ».
  await page.getByTestId('suggestion').filter({ hasText: 'Internet' }).click();
  const f = page.getByTestId('formulaire-element');
  await expect(f.getByLabel('Nom')).toHaveValue('Internet');
  await expect(f.getByLabel('Montant ($, facultatif)')).toHaveValue('');
  await f.getByRole('button', { name: 'Abandonner' }).click();
  await expect(page.getByTestId('liste-depenses')).toHaveCount(0);

  await page.getByTestId('suggestion').filter({ hasText: 'Loyer' }).click();
  await f.getByLabel('Montant ($, facultatif)').fill('1150');
  await f.getByLabel('Date (la prochaine)').fill('2026-12-01');
  await enregistrer(page, 'formulaire-element');
  await page.getByTestId('suggestion').filter({ hasText: 'Internet' }).click();
  await f.getByLabel('Date (la prochaine)').fill('2026-11-25');
  await enregistrer(page, 'formulaire-element');
  const liste = page.getByTestId('liste-depenses');
  await expect(liste.getByRole('listitem')).toHaveCount(2);
  await expect(liste.getByRole('listitem').filter({ hasText: 'Internet' })).toContainText('À compléter');
  // « Annuler » juste après un ajout, comme ailleurs.
  await page.getByTestId('enregistre').getByRole('button', { name: 'Annuler' }).click();
  await expect(liste.getByRole('listitem')).toHaveCount(1);
  await page.getByTestId('suggestion').filter({ hasText: 'Internet' }).click();
  await f.getByLabel('Date (la prochaine)').fill('2026-11-25');
  await enregistrer(page, 'formulaire-element');

  // Dettes : aucune ; Épargne : un compte sans solde.
  await page.getByTestId('guide-continuer').click();
  await page.getByTestId('pas-de-dette').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon épargne');
  await page.getByRole('button', { name: '+ Ajouter un compte' }).click();
  const c = page.getByTestId('formulaire-compte');
  await c.getByLabel('Type').selectOption('celi');
  await c.getByLabel('Nom (facultatif)').fill('Fonds d’urgence (fictif)');
  await enregistrer(page, 'formulaire-compte');
  await page.getByTestId('guide-continuer').click();

  // Récapitulatif : deux compteurs ; les sections vides sont neutres.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Récapitulatif');
  await expect(page.getByTestId('nombre-enregistres')).toHaveText('4');
  // Montant net, Internet, solde du compte : les seuls vrais manques.
  await expect(page.getByTestId('nombre-a-completer')).toHaveText('3');
  const neutres = page.locator('[data-etat="aucun"]');
  await expect(neutres).toHaveCount(2);
  await expect(neutres.filter({ hasText: 'Prêts et carte de crédit' })).toContainText('Aucune pour l’instant');
  await expect(neutres.filter({ hasText: 'Autres revenus' })).toContainText('Aucun pour l’instant');
  await expect(neutres.locator('.a-completer')).toHaveCount(0);
  await expect(page.getByText('Terminer le guide ne veut pas dire que tout est complet.')).toBeVisible();

  // Terminer : retour à l'Accueil, plus d'invitation ; les données sont là.
  await page.getByTestId('terminer-guide').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour !');
  await expect(page.getByTestId('reprise-configuration')).toHaveCount(0);
  await expect(page.getByTestId('carte-accueil')).toHaveCount(2);
  await nav(page, 'Dépenses');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Loyer');
  await expect(page.getByTestId('panneau-fixes')).toContainText('Internet');
});

test('pause et reprise : rien n’est perdu, l’Accueil invite à reprendre à la bonne étape', async ({ page }) => {
  await page.goto(PREMIERE);
  await enregistrerPaie(page);
  await page.getByTestId('guide-continuer').click();
  await page.getByTestId('suggestion').filter({ hasText: 'Loyer' }).click();
  await page.getByTestId('formulaire-element').getByLabel('Date (la prochaine)').fill('2026-12-01');
  await enregistrer(page, 'formulaire-element');

  await page.getByTestId('quitter-guide').click();
  const pause = page.getByTestId('fenetre-pause');
  await expect(pause).toContainText('ton calendrier de paie');
  await expect(pause).toContainText('1 dépense régulière');
  await pause.getByRole('button', { name: 'Rester dans le guide' }).click();
  await expect(pause).toHaveCount(0);
  await page.getByTestId('quitter-guide').click();
  await page.getByTestId('confirmer-pause').click();

  const reprise = page.getByTestId('reprise-configuration');
  await expect(reprise).toContainText('Tu t’étais arrêtée à l’étape 3 sur 6 : Dépenses et revenus.');
  await reprise.getByTestId('reprendre-configuration').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dépenses régulières et autres revenus');
  await expect(page.getByTestId('liste-depenses')).toContainText('Loyer');

  // Un lien du récapitulatif met le guide en pause et ouvre la section.
  await page.getByTestId('frise-6').click();
  await page.getByRole('heading', { level: 2, name: /^Dettes/ }).getByRole('button').click();
  await expect(page.getByTestId('guide')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Dettes' })).toBeVisible();
  await nav(page, 'Accueil');
  await expect(page.getByTestId('reprise-configuration')).toContainText('étape 6 sur 6');

  // « Ne plus afficher ici » : l'invitation disparaît, le guide reste dans Paramètres.
  await page.getByTestId('masquer-reprise').click();
  await expect(page.getByTestId('reprise-configuration')).toHaveCount(0);
  await nav(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Installation' }).click();
  await page.getByTestId('ouvrir-guide').click();
  await expect(page.getByTestId('guide-bienvenue')).toBeVisible();
});

test('rouvert sur une installation configurée, le guide ajoute seulement : rien n’est modifié', async ({ page }) => {
  await page.goto(PREMIERE);
  await enregistrerPaie(page);
  await page.getByTestId('quitter-guide').click();
  await page.getByTestId('confirmer-pause').click();
  await nav(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Installation' }).click();
  await page.getByTestId('ouvrir-guide').click();
  // Reprise à l'étape retenue : la paie, déjà en place, sans formulaire de modification.
  await expect(page.getByTestId('guide-paie-en-place')).toContainText('Ton calendrier est en place');
  await expect(page.getByTestId('guide-formulaire-paie')).toHaveCount(0);
});
