// Cas témoins M1 à M13, validés le 8 novembre 2026 (onglet « Étape 2 — Cas témoins »).
// Règles Q1 (demi-cent : on s'éloigne de zéro) et Q5 (cent restant : plus grand
// reste, puis ordre).

import { describe, expect, it } from 'vitest';
import {
  additionner,
  appliquerTaux,
  arrondirDecimal,
  formaterMontant,
  formaterMontantResume,
  repartir,
} from '../../src/noyau/montants';

const ESP = ' '; // espace insécable : le montant ne se coupe jamais en fin de ligne
const MOINS = '−'; // vrai signe moins typographique

describe('Montants — cas témoins', () => {
  it('M1 : 0,10 $ + 0,20 $ = 0,30 $ exactement', () => {
    expect(additionner(10, 20)).toBe(30);
    expect(additionner(arrondirDecimal('0,10'), arrondirDecimal('0,20'))).toBe(30);
  });

  it('M2 : affichage détaillé de 12 345,67 $', () => {
    expect(formaterMontant(1_234_567)).toBe(`12${ESP}345,67${ESP}$`);
  });

  it('M3 : affichage d’un montant négatif de 45 $', () => {
    expect(formaterMontant(-4_500)).toBe(`${MOINS}45,00${ESP}$`);
  });

  it('M4 : le même 12 345,67 $ dans un résumé', () => {
    expect(formaterMontantResume(1_234_567)).toBe(`12${ESP}346${ESP}$`);
  });

  it('M5 : arrondir 10,004 $', () => {
    expect(arrondirDecimal('10,004')).toBe(1_000);
  });

  it('M6 : arrondir 10,005 $ (Q1)', () => {
    expect(arrondirDecimal('10,005')).toBe(1_001);
  });

  it('M7 : arrondir −10,005 $ (Q1)', () => {
    expect(arrondirDecimal('-10,005')).toBe(-1_001);
  });

  it('M8 : répartir 10,00 $ en trois parts égales (Q5)', () => {
    expect(repartir(1_000, [1, 1, 1])).toEqual([334, 333, 333]);
  });

  it('M9 : répartir 50,00 $ en deux tiers et un tiers', () => {
    expect(repartir(5_000, [2, 1])).toEqual([3_333, 1_667]);
  });

  it('M10 : additionner 26 paies de 2 100,00 $', () => {
    expect(additionner(...Array<number>(26).fill(210_000))).toBe(5_460_000);
    expect(formaterMontant(5_460_000)).toBe(`54${ESP}600,00${ESP}$`);
  });

  it('M11 : arrondir 2,675 $ (piège de la virgule flottante)', () => {
    expect(arrondirDecimal('2,675')).toBe(268);
    // Démonstration du piège évité : l'arrondi intégré de JavaScript donne 2,67 $.
    expect((2.675).toFixed(2)).toBe('2.67');
  });

  it('M12 : 1 % de 100,50 $ = 1,005 $, arrondi à 1,01 $', () => {
    expect(appliquerTaux(10_050, '1')).toBe(101);
    expect(arrondirDecimal('1,005')).toBe(101);
    // Le piège évité : l'arrondi intégré de JavaScript donne 1,00 $.
    expect((1.005).toFixed(2)).toBe('1.00');
  });

  it('M13 : intérêt d’un mois à 19,99 % par an sur 1 234,56 $', () => {
    expect(appliquerTaux(123_456, '19,99', 12)).toBe(2_057);
  });
});

describe('Montants — invariants', () => {
  it('une répartition redonne toujours exactement le total', () => {
    for (let total = -2_000; total <= 2_000; total += 7) {
      for (const poids of [[1], [1, 1], [1, 1, 1], [2, 1], [5, 3, 2], [1, 0, 1], [7, 11, 13, 17]]) {
        const parts = repartir(total, poids);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts).toHaveLength(poids.length);
      }
    }
  });

  it('une part de poids nul reçoit zéro', () => {
    expect(repartir(1_000, [1, 0, 1])).toEqual([500, 0, 500]);
  });

  it('égalité de restes : le cent va à la première part dans l’ordre (Q5)', () => {
    expect(repartir(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(repartir(-1_000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it('refuse un montant qui n’est pas un nombre entier de cents', () => {
    expect(() => formaterMontant(10.5)).toThrow();
    expect(() => additionner(0.1, 0.2)).toThrow();
  });

  it('refuse un texte qui n’est pas un montant', () => {
    expect(() => arrondirDecimal('dix dollars')).toThrow();
    expect(() => arrondirDecimal('')).toThrow();
  });

  it('accepte le point comme la virgule, et les espaces de milliers', () => {
    expect(arrondirDecimal('1 234,56')).toBe(123_456);
    expect(arrondirDecimal('1234.56')).toBe(123_456);
  });

  it('affiche zéro et les petits montants correctement', () => {
    expect(formaterMontant(0)).toBe(`0,00${ESP}$`);
    expect(formaterMontant(5)).toBe(`0,05${ESP}$`);
    expect(formaterMontant(-5)).toBe(`${MOINS}0,05${ESP}$`);
    expect(formaterMontantResume(50)).toBe(`1${ESP}$`);
    expect(formaterMontantResume(-150)).toBe(`${MOINS}2${ESP}$`);
  });

  it('un taux est appliqué exactement, sans dérive sur de gros montants', () => {
    expect(appliquerTaux(99_999_999_999, '0,01')).toBe(10_000_000);
  });
});
