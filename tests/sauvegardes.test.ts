// Étape 6 : textes de Paramètres → Sauvegardes, et correctif « À partir du… ».
// Données fictives.
import { describe, expect, it } from 'vitest';
import {
  lignesApercu,
  libelleCopie,
  libelleMoment,
  messageExport,
  resumeTexte,
  texteDerniereCopie,
  titreApercu,
  type PartiesLocales,
} from '../src/actions/sauvegardes';
import { salaireAffiche } from '../src/actions/paie';
import { dateCivile } from '../src/noyau/dates';
import type { ApercuRestauration, CopieListee, ResumeCopie } from '../src/lib/plateforme';

// Montréal en novembre : UTC−5.
const montreal: PartiesLocales = (iso) => {
  const d = new Date(Date.parse(iso) - 5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: dateCivile(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`),
    heure: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
};
const JOUR = dateCivile('2026-11-08');

const resume = (r: Partial<ResumeCopie> = {}): ResumeCopie => ({
  paieConfiguree: true,
  salaires: 1,
  elements: 3,
  confirmations: 4,
  entreesJournal: 12,
  ...r,
});

describe('libelleMoment', () => {
  it('aujourd’hui, hier, cette année, une autre année — en heure locale', () => {
    expect(libelleMoment('2026-11-08T21:32:00Z', JOUR, montreal)).toBe('aujourd’hui à 16 h 32');
    // 1 h 30 UTC le 9 : encore le 8 au soir à Montréal.
    expect(libelleMoment('2026-11-09T01:30:00Z', JOUR, montreal)).toBe('aujourd’hui à 20 h 30');
    expect(libelleMoment('2026-11-07T14:05:00Z', JOUR, montreal)).toBe('hier à 9 h 05');
    expect(libelleMoment('2026-11-01T02:40:00Z', JOUR, montreal)).toBe('31 oct. à 21 h 40');
    expect(libelleMoment('2025-12-01T15:00:00Z', JOUR, montreal)).toBe('1er déc. 2025 à 10 h 00');
  });
});

describe('texteDerniereCopie', () => {
  it('dit quand la dernière copie a réussi', () => {
    expect(
      texteDerniereCopie(
        { derniereCopie: { nom: 'jour-2026-11-08.sqlite', jour: '2026-11-08', horodatage: '2026-11-08T21:32:00Z' }, erreur: null, enAttente: false },
        JOUR,
        montreal,
      ),
    ).toBe('Dernière copie : aujourd’hui à 16 h 32, vérifiée.');
  });
  it('sans copie, explique quand elle viendra', () => {
    expect(texteDerniereCopie({ derniereCopie: null, erreur: null, enAttente: false }, JOUR, montreal)).toBe(
      'Aucune copie pour l’instant : elle sera faite quelques secondes après ton prochain changement.',
    );
  });
});

describe('resumeTexte', () => {
  it('accorde les nombres', () => {
    expect(resumeTexte(resume())).toBe('3 éléments · 4 confirmations · 12 changements au journal');
    expect(resumeTexte(resume({ elements: 1, confirmations: 0, entreesJournal: 1 }))).toBe(
      '1 élément · aucune confirmation · 1 changement au journal',
    );
    expect(resumeTexte(resume({ paieConfiguree: false, elements: 0, confirmations: 0, entreesJournal: 0 }))).toBe(
      'paie pas encore configurée · aucun élément · aucune confirmation · aucun changement au journal',
    );
  });
  it('Lot 1 : le début du calendrier rend la copie reconnaissable', () => {
    expect(resumeTexte(resume({ debutPaies: '2025-01-02' }))).toBe('paies depuis le 2 janv. 2025 · 3 éléments · 4 confirmations · 12 changements au journal');
    expect(resumeTexte(resume({ debutPaies: null }))).toBe('3 éléments · 4 confirmations · 12 changements au journal');
  });
});

const copie = (c: Partial<CopieListee>): CopieListee => ({
  source: { genre: 'jour', nom: 'jour-2026-11-06.sqlite' },
  nom: 'jour-2026-11-06.sqlite',
  jour: '2026-11-06',
  horodatage: '2026-11-07T02:40:00Z',
  motif: null,
  lisible: true,
  raison: null,
  versionSchema: 5,
  resume: resume(),
  ...c,
});

describe('libelleCopie', () => {
  it('copie du jour : la journée, puis l’heure de la dernière mise à jour', () => {
    expect(libelleCopie(copie({}), JOUR, montreal)).toBe('Journée du 6 nov. — à jour à 21 h 40');
    expect(
      libelleCopie(copie({ jour: '2026-11-08', horodatage: '2026-11-08T21:32:00Z' }), JOUR, montreal),
    ).toBe('Aujourd’hui — à jour à 16 h 32');
  });
  it('copie de précaution : pourquoi elle a été faite', () => {
    const p = copie({ source: { genre: 'precaution', nom: 'x' }, jour: null, horodatage: '2026-11-08T20:30:00Z' });
    expect(libelleCopie({ ...p, motif: 'restauration' }, JOUR, montreal)).toBe(
      'Avant la restauration d’aujourd’hui à 15 h 30',
    );
    expect(libelleCopie({ ...p, motif: 'miseANiveau', horodatage: '2026-10-20T15:00:00Z' }, JOUR, montreal)).toBe(
      'Avant la mise à niveau de la structure du 20 oct. à 10 h 00',
    );
  });
});

const apercu = (a: Partial<ApercuRestauration> = {}): ApercuRestauration => ({
  source: { genre: 'jour', nom: 'jour-2026-11-06.sqlite' },
  nom: 'jour-2026-11-06.sqlite',
  horodatage: '2026-11-07T02:40:00Z',
  versionSchema: 5,
  miseANiveau: false,
  resume: resume(),
  nombreRetires: 7,
  retires: [
    { horodatage: '2026-11-08T20:00:00Z', section: 'Mes paies', objet: 'Dépense « Loyer »', champ: 'confirmation du 2026-12-01' },
    { horodatage: '2026-11-08T19:00:00Z', section: 'Mes paies', objet: 'Salaire net', champ: 'à partir du 2027-01-07' },
  ],
  nombreRetrouves: 0,
  ...a,
});

describe('Aperçu de la restauration (Re2)', () => {
  it('titre selon la source', () => {
    expect(titreApercu(apercu(), JOUR, montreal)).toBe('Restaurer la copie du 6 nov. (à jour à 21 h 40)');
    expect(
      titreApercu(apercu({ source: { genre: 'precaution', nom: 'avant-restauration-20261108203000.sqlite' }, horodatage: '2026-11-08T20:30:00Z' }), JOUR, montreal),
    ).toBe('Restaurer la copie de précaution d’aujourd’hui à 15 h 30');
    expect(titreApercu(apercu({ source: { genre: 'fichier', chemin: 'E:\\ma copie.sqlite' }, nom: 'ma copie.sqlite' }), JOUR, montreal)).toBe(
      'Restaurer « ma copie.sqlite »',
    );
  });

  it('contenu, changements retirés et note de précaution', () => {
    const l = lignesApercu(apercu());
    expect(l.contenu).toBe('Elle contient : 3 éléments · 4 confirmations · 12 changements au journal.');
    expect(l.intro).toBe('Depuis cette copie, 7 changements ont été faits. Ils seront retirés :');
    expect(l.retires).toEqual([
      'Dépense « Loyer » — confirmation du 2026-12-01',
      'Salaire net — à partir du 2027-01-07',
    ]);
    expect(l.suite).toBe('… et 5 autres.');
    expect(l.notes).toEqual([
      'Une copie de l’état actuel sera gardée dans les copies de précaution : tu pourras revenir en arrière.',
    ]);
  });

  it('rien de retiré, changements retrouvés, mise à niveau', () => {
    const l = lignesApercu(apercu({ nombreRetires: 0, retires: [], nombreRetrouves: 1, miseANiveau: true, versionSchema: 4 }));
    expect(l.intro).toBe('Aucun changement fait depuis cette copie ne sera retiré.');
    expect(l.retires).toEqual([]);
    expect(l.suite).toBeNull();
    expect(l.notes[0]).toBe('1 changement absent aujourd’hui reviendra.');
    expect(l.notes[1]).toBe(
      'Cette copie vient d’une structure plus ancienne (4) : elle sera mise à niveau, avec sa propre copie de précaution.',
    );
    const un = lignesApercu(apercu({ nombreRetires: 1, retires: apercu().retires.slice(0, 1) }));
    expect(un.intro).toBe('Depuis cette copie, 1 changement a été fait. Il sera retiré :');
    expect(un.suite).toBeNull();
  });
});

describe('messageExport (E5, E7)', () => {
  it('dit où l’export a été enregistré', () => {
    const base = {
      chemin: 'E:\\Sauvegardes\\liberte-35-export-2026-11-08.zip',
      nomFichier: 'liberte-35-export-2026-11-08.zip',
      fichiers: [],
      resume: resume(),
      vide: false,
    };
    expect(messageExport(base)).toBe('Export enregistré : E:\\Sauvegardes\\liberte-35-export-2026-11-08.zip');
    expect(messageExport({ ...base, vide: true })).toBe(
      'Export enregistré : E:\\Sauvegardes\\liberte-35-export-2026-11-08.zip. Il ne contient que les en-têtes : aucune donnée pour l’instant.',
    );
  });
});

describe('Salaire net en vigueur (Q26)', () => {
  const salaires = [
    { aPartirDu: dateCivile('2027-01-07'), montant: 210_000 },
    { aPartirDu: dateCivile('2027-06-03'), montant: 215_000 },
  ];
  it('premier salaire dans le futur : « à partir du… » plutôt que « À compléter »', () => {
    expect(salaireAffiche(salaires, dateCivile('2026-11-08'))).toBe('2\u00a0100,00\u00a0$ à partir du 7 janv. 2027');
  });
  it('salaire en vigueur : le montant seul', () => {
    expect(salaireAffiche(salaires, dateCivile('2027-02-01'))).toBe('2\u00a0100,00\u00a0$');
    expect(salaireAffiche(salaires, dateCivile('2027-06-03'))).toBe('2\u00a0150,00\u00a0$');
  });
  it('aucun salaire : toujours « À compléter »', () => {
    expect(salaireAffiche([], dateCivile('2026-11-08'))).toBe('À compléter');
  });
});
