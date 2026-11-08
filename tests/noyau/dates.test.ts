// Cas témoins D1 à D5. Les dates sont des « dates civiles » (AAAA-MM-JJ),
// sans heure ni fuseau horaire : un changement d'heure ne peut pas les décaler.

import { describe, expect, it } from 'vitest';
import {
  ajouterJours,
  ajouterMois,
  dateCivile,
  ecartEnJours,
  formaterDateCourte,
  formaterDateLongue,
  jourDeLaSemaine,
} from '../../src/noyau/dates';

describe('Dates — cas témoins', () => {
  it('D1 : 2027-01-07 en détail', () => {
    expect(formaterDateLongue(dateCivile('2027-01-07'))).toBe('jeudi 7 janvier 2027');
  });

  it('D2 : 2027-09-30 en court', () => {
    expect(formaterDateCourte(dateCivile('2027-09-30'))).toBe('30 sept.');
  });

  it('D3 : paies autour du passage à l’heure d’été (14 mars 2027)', () => {
    const avant = dateCivile('2027-03-04');
    const apres = ajouterJours(avant, 14);
    expect(apres).toBe('2027-03-18');
    expect(ecartEnJours(avant, apres)).toBe(14);
    expect(jourDeLaSemaine(apres)).toBe('jeudi');
  });

  it('D4 : paies autour du retour à l’heure normale (7 novembre 2027)', () => {
    expect(ajouterJours(dateCivile('2027-11-11'), 14)).toBe('2027-11-25');
  });

  it('D5 : 2028-02-29 en détail', () => {
    expect(formaterDateLongue(dateCivile('2028-02-29'))).toBe('mardi 29 février 2028');
  });
});

describe('Dates — règles générales', () => {
  it('le premier du mois s’écrit « 1er »', () => {
    expect(formaterDateLongue(dateCivile('2027-01-01'))).toBe('vendredi 1er janvier 2027');
    expect(formaterDateCourte(dateCivile('2027-04-01'))).toBe('1er avr.');
  });

  it('les douze abréviations de mois', () => {
    const attendues = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    attendues.forEach((abr, i) => {
      const mois = String(i + 1).padStart(2, '0');
      expect(formaterDateCourte(dateCivile(`2027-${mois}-15`))).toBe(`15 ${abr}`);
    });
  });

  it('une date inexistante devient le dernier jour du mois', () => {
    expect(ajouterMois(dateCivile('2027-01-31'), 1)).toBe('2027-02-28');
    expect(ajouterMois(dateCivile('2028-01-31'), 1)).toBe('2028-02-29');
    expect(ajouterMois(dateCivile('2027-01-31'), 3)).toBe('2027-04-30');
  });

  it('refuse une date invalide', () => {
    expect(() => dateCivile('2027-02-29')).toThrow();
    expect(() => dateCivile('2027-13-01')).toThrow();
    expect(() => dateCivile('7 janvier 2027')).toThrow();
  });

  it('les jours s’enchaînent sur 400 ans sans erreur', () => {
    let d = dateCivile('2000-01-01');
    let n = 0;
    while (d < '2400-01-01') {
      d = ajouterJours(d, 1);
      n += 1;
    }
    expect(n).toBe(146_097); // nombre exact de jours dans un cycle grégorien de 400 ans
    expect(ecartEnJours(dateCivile('2000-01-01'), dateCivile('2400-01-01'))).toBe(146_097);
  });

  it('ajouter des jours négatifs revient en arrière', () => {
    expect(ajouterJours(dateCivile('2027-03-01'), -1)).toBe('2027-02-28');
    expect(ajouterJours(dateCivile('2028-03-01'), -1)).toBe('2028-02-29');
  });
});
