// Montants de Liberté 35.
//
// Règle d'or : un montant est un nombre ENTIER de cents. Tous les calculs
// intermédiaires (taux, répartitions) se font en fractions exactes avec des
// entiers sans limite (BigInt), jamais en virgule flottante : 2,675 $ arrondi
// donne bien 2,68 $ (cas M11), et non 2,67 $.
//
// Arrondi (règle Q1) : au cent le plus proche ; un demi-cent exact s'éloigne
// de zéro (10,005 $ → 10,01 $ ; −10,005 $ → −10,01 $).

export type Cents = number;

const ESPACE = ' '; // insécable : un montant ne se coupe pas en fin de ligne
const MOINS = '−'; // signe moins typographique

export class ErreurMontant extends Error {}

function verifierCents(c: Cents): bigint {
  if (!Number.isSafeInteger(c)) {
    throw new ErreurMontant(`Montant invalide : ${c} n'est pas un nombre entier de cents.`);
  }
  return BigInt(c);
}

function versCents(b: bigint): Cents {
  const n = Number(b);
  if (!Number.isSafeInteger(n)) {
    throw new ErreurMontant('Montant trop grand pour être représenté exactement.');
  }
  return n;
}

/** Arrondit la fraction numerateur / denominateur à l'entier le plus proche (Q1). */
export function arrondirFraction(numerateur: bigint, denominateur: bigint): bigint {
  if (denominateur === 0n) throw new ErreurMontant('Division par zéro.');
  if (denominateur < 0n) {
    numerateur = -numerateur;
    denominateur = -denominateur;
  }
  const negatif = numerateur < 0n;
  const absolu = negatif ? -numerateur : numerateur;
  const quotient = absolu / denominateur;
  const reste = absolu % denominateur;
  const arrondi = 2n * reste >= denominateur ? quotient + 1n : quotient;
  return negatif ? -arrondi : arrondi;
}

/** Lit un nombre décimal écrit à la québécoise ou à l'anglaise : « 1 234,56 », « 1234.56 », « -2,675 ». */
export function lireDecimal(texte: string): { numerateur: bigint; denominateur: bigint } {
  const propre = texte.replace(/[\s  ]/g, '').replace(',', '.').replace(MOINS, '-');
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(propre);
  if (!m) throw new ErreurMontant(`« ${texte} » n'est pas un nombre.`);
  const [, signe, entiers, decimales = ''] = m;
  const denominateur = 10n ** BigInt(decimales.length);
  const absolu = BigInt(entiers + decimales);
  return { numerateur: signe === '-' ? -absolu : absolu, denominateur };
}

/** Convertit un montant en dollars écrit en texte (« 2,675 ») en cents arrondis (268). */
export function arrondirDecimal(dollars: string): Cents {
  const { numerateur, denominateur } = lireDecimal(dollars);
  return versCents(arrondirFraction(numerateur * 100n, denominateur));
}

export function additionner(...montants: Cents[]): Cents {
  return versCents(montants.reduce((total, c) => total + verifierCents(c), 0n));
}

/**
 * Applique un taux en pour cent (« 19,99 ») à un montant, divisé au besoin
 * (12 pour un mois d'un taux annuel). Le résultat est arrondi une seule fois.
 */
export function appliquerTaux(montant: Cents, tauxPourCent: string, diviseur = 1): Cents {
  if (!Number.isSafeInteger(diviseur) || diviseur <= 0) {
    throw new ErreurMontant('Le diviseur doit être un entier positif.');
  }
  const taux = lireDecimal(tauxPourCent);
  const numerateur = verifierCents(montant) * taux.numerateur;
  const denominateur = taux.denominateur * 100n * BigInt(diviseur);
  return versCents(arrondirFraction(numerateur, denominateur));
}

/**
 * Répartit un total selon des poids entiers, sans perdre ni créer un cent.
 * Règle Q5 : chaque part reçoit sa valeur arrondie vers le bas ; les cents
 * restants vont aux parts qui ont perdu le plus, puis, à égalité, dans l'ordre.
 * Un total négatif est réparti comme son opposé, puis changé de signe.
 */
export function repartir(total: Cents, poids: readonly number[]): Cents[] {
  const t = verifierCents(total);
  if (poids.length === 0) throw new ErreurMontant('Aucune part à répartir.');
  const p = poids.map((x) => {
    if (!Number.isSafeInteger(x) || x < 0) throw new ErreurMontant('Les poids doivent être des entiers positifs ou nuls.');
    return BigInt(x);
  });
  const somme = p.reduce((a, b) => a + b, 0n);
  if (somme === 0n) throw new ErreurMontant('La somme des poids ne peut pas être nulle.');

  const negatif = t < 0n;
  const absolu = negatif ? -t : t;
  const parts = p.map((x) => (absolu * x) / somme);
  const restes = p.map((x, i) => ({ i, reste: (absolu * x) % somme }));
  let manquants = absolu - parts.reduce((a, b) => a + b, 0n);
  restes.sort((a, b) => (a.reste === b.reste ? a.i - b.i : a.reste > b.reste ? -1 : 1));
  for (const { i } of restes) {
    if (manquants === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    manquants -= 1n;
  }
  return parts.map((x) => versCents(negatif ? -x : x));
}

function grouperMilliers(chiffres: string): string {
  return chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
}

/** Affichage détaillé, au cent près : « 12 345,67 $ », « −45,00 $ ». */
export function formaterMontant(montant: Cents): string {
  const c = verifierCents(montant);
  const absolu = c < 0n ? -c : c;
  const dollars = grouperMilliers((absolu / 100n).toString());
  const sous = (absolu % 100n).toString().padStart(2, '0');
  return `${c < 0n ? MOINS : ''}${dollars},${sous}${ESPACE}$`;
}

/** Affichage de résumé, au dollar près (arrondi Q1) : « 12 346 $ ». */
export function formaterMontantResume(montant: Cents): string {
  const dollars = arrondirFraction(verifierCents(montant), 100n);
  const absolu = dollars < 0n ? -dollars : dollars;
  return `${dollars < 0n ? MOINS : ''}${grouperMilliers(absolu.toString())}${ESPACE}$`;
}
