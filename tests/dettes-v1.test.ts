// V1 lot 5 : le rythme d'un versement distingue les paiements par paie des
// paiements mensuels (cahier V1, 5.5). Aucune règle de calcul ne change.
import { describe, expect, it } from "vitest";
import { rythmePret } from "../src/actions/prets";

const avec = (frequence: Record<string, unknown>) => ({
  frequence: frequence as never,
});

describe("V1 lot 5 — rythme des versements", () => {
  it("par paie, mensuel, hebdomadaire, aux deux semaines", () => {
    expect(rythmePret(avec({ type: "chaquePaie" }))).toBe("Par paie");
    expect(rythmePret(avec({ type: "mois", n: 1, depart: "2027-01-15" }))).toBe(
      "Mensuel",
    );
    expect(
      rythmePret(avec({ type: "semaines", n: 1, depart: "2027-01-07" })),
    ).toBe("Hebdomadaire");
    expect(
      rythmePret(avec({ type: "semaines", n: 2, depart: "2027-01-07" })),
    ).toBe("Aux deux semaines");
  });
  it("une règle inconnue reste nommée prudemment", () => {
    expect(rythmePret(avec({ type: "ponctuelle", date: "2027-01-07" }))).toBe(
      "Selon sa règle",
    );
  });
});
