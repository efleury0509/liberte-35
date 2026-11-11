import { expect, test, type Page } from "@playwright/test";

// V1 lot 5 : Dépenses, Dettes et Paramètres. Aperçu en mémoire, données fictives.
const nav = (page: Page, nom: string) =>
  page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: nom, exact: true })
    .click();

async function preparer(page: Page) {
  await page.goto("/?aujourdhui=2027-01-15");
  await page.getByRole("button", { name: "Mes paies" }).click();
  await page.getByLabel("Date de la première paie").fill("2027-01-07");
  await page.getByLabel("Montant net habituel ($, facultatif)").fill("2100");
  await page
    .locator("form")
    .getByRole("button", { name: "Enregistrer" })
    .first()
    .click();
  await page
    .getByTestId("apercu")
    .getByRole("button", { name: "Enregistrer" })
    .click();
  await expect(page.getByTestId("description-profil")).toBeVisible();
}

async function ajouterDepense(
  page: Page,
  nom: string,
  montant: string,
  genre: "Fixe" | "Enveloppe variable",
) {
  await page
    .getByRole("button", { name: "Ajouter un revenu ou une dépense" })
    .click();
  const f = page.getByTestId("formulaire-element");
  await f.getByLabel("Nature").selectOption({ label: "Dépense" });
  await f.getByLabel("Nom").fill(nom);
  await f.getByLabel("Montant ($, facultatif)").fill(montant);
  await f.getByLabel("Genre").selectOption({ label: genre });
  await f.getByLabel("Quand").selectOption({
    label: genre === "Fixe" ? "Chaque mois" : "1re paie du mois",
  });
  if (genre === "Fixe") await f.getByLabel("Date").fill("2027-02-01");
  await f.getByRole("button", { name: "Enregistrer" }).click();
}

test("Dépenses : régulières, enveloppes et à prévoir regroupées, avec des filtres", async ({
  page,
}) => {
  await preparer(page);
  await ajouterDepense(page, "Loyer (fictif)", "1200", "Fixe");
  await ajouterDepense(page, "Épicerie (fictive)", "300", "Enveloppe variable");
  await nav(page, "Dépenses");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dépenses");
  await expect(page.getByTestId("panneau-fixes")).toContainText(
    "Loyer (fictif)",
  );
  await expect(page.getByTestId("panneau-enveloppes")).toContainText(
    "Épicerie (fictive)",
  );
  await expect(
    page.getByRole("complementary", { name: "Les 12 prochains mois" }),
  ).toContainText("Aucune dépense à prévoir");

  await page.getByRole("button", { name: /^Enveloppes/ }).click();
  await expect(
    page.getByRole("button", { name: /^Enveloppes/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("panneau-enveloppes")).toContainText(
    "Épicerie (fictive)",
  );
  await expect(page.getByTestId("panneau-fixes")).toHaveCount(0);

  await page.getByRole("button", { name: /^Régulières/ }).click();
  await expect(page.getByTestId("panneau-fixes")).toContainText(
    "Loyer (fictif)",
  );
  await expect(page.getByTestId("panneau-enveloppes")).toHaveCount(0);

  // Dans Dépenses, on n'ajoute que des dépenses : pas de choix « Revenu ».
  await page
    .getByRole("button", { name: "Ajouter une dépense régulière" })
    .click();
  const ajout = page.getByTestId("formulaire-element");
  await expect(ajout.getByLabel("Nature")).toHaveCount(0);
  await expect(ajout.getByLabel("Genre")).toHaveValue("fixe");
  await ajout.getByRole("button", { name: "Abandonner", exact: true }).click();

  // La gestion d'une dépense s'ouvre dans une fenêtre centrée, qu'on peut abandonner.
  await page
    .getByTestId("panneau-fixes")
    .getByRole("listitem")
    .filter({ hasText: "Loyer" })
    .getByRole("button", { name: "Gérer" })
    .click();
  const fenetre = page.getByTestId("fenetre-formulaire");
  await expect(fenetre).toContainText("Gérer « Loyer (fictif) »");
  await page.keyboard.press("Escape");
  await expect(fenetre).toHaveCount(0);
});

test("Dettes : rythme du versement, prochains paiements, progression « À compléter »", async ({
  page,
}) => {
  await preparer(page);
  await nav(page, "Dettes");
  await page.getByRole("button", { name: "Ajouter un prêt" }).click();
  const fenetre = page.getByTestId("fenetre-formulaire");
  await expect(fenetre).toContainText("Ajouter un prêt");
  const f = page.getByTestId("formulaire-ajout-pret");
  await f.getByLabel("Nom du prêt").fill("Prêt auto (fictif)");
  await f.getByLabel("Versement ($)").fill("205");
  await f.getByLabel("Fréquence").selectOption({ label: "À chaque paie" });
  await f.getByLabel("Prochain versement").fill("2027-01-21");
  await f.getByRole("button", { name: "Enregistrer" }).click();
  await expect(fenetre).toHaveCount(0);

  const pret = page
    .locator("[data-pret]")
    .filter({ hasText: "Prêt auto (fictif)" });
  await expect(pret).toContainText("Par paie");
  const prochains = page.getByTestId("prochains-paiements");
  await expect(prochains).toContainText("Prêt auto (fictif)");
  await expect(prochains).toContainText("Par paie");
  // Aucun pourcentage inventé : la part de capital n'est pas calculable.
  const progression = page.getByTestId("progression-dettes");
  await expect(progression).toContainText("À compléter");
  await expect(progression).not.toContainText("%");

  // Les actions secondaires sont dans le menu « Actions » ; leurs formulaires en fenêtre.
  await pret.getByRole("button", { name: /^Actions — prêt/ }).click();
  await page.getByRole("button", { name: "Changer le versement…" }).click();
  await expect(fenetre).toContainText(
    "Changer le versement — Prêt auto (fictif)",
  );
  await fenetre
    .getByRole("button", { name: "Abandonner", exact: true })
    .click();
  await expect(fenetre).toHaveCount(0);

  // Une carte de crédit : mensuelle, distincte des prêts.
  await page.getByRole("button", { name: "Ajouter ma carte" }).click();
  const fc = page.getByTestId("formulaire-ajout-carte");
  await fc.getByLabel("Nom de la carte").fill("Visa (fictive)");
  await fc.getByLabel("Prochaine échéance").fill("2027-02-11");
  await fc.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("fiche-carte")).toContainText("Mensuel");
  await expect(prochains).toContainText("Visa (fictive)");
});

test("Paramètres : onglets par catégorie, utilisables au clavier", async ({
  page,
}) => {
  await page.goto("/?aujourdhui=2027-01-15");
  await nav(page, "Paramètres");
  const sauvegardes = page.getByRole("tab", { name: "Sauvegardes locales" });
  await expect(sauvegardes).toHaveAttribute("aria-selected", "true");
  await sauvegardes.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Exporter mes données" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Exporter mes données…" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("etat-installation")).toBeVisible();
});
