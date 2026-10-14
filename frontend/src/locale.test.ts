import { afterEach, describe, expect, it } from 'vitest';

import { dateLocale, dayLabels, dayShort, DEFAULT_LOCALE, setLanguage } from './locale';
import { periodLabel } from './utils';

afterEach(() => setLanguage('fr'));

describe('setLanguage', () => {
  it('traduit un code de langue ENT en locale complète', () => {
    setLanguage('en');
    expect(dateLocale()).toBe('en-GB');
    setLanguage('fr');
    expect(dateLocale()).toBe(DEFAULT_LOCALE);
  });

  it('reprend tel quel un code déjà régionalisé', () => {
    setLanguage('pt-BR');
    expect(dateLocale()).toBe('pt-BR');
  });

  it('ignore une langue vide : la session n’est pas encore chargée', () => {
    setLanguage('en');
    setLanguage(undefined);
    setLanguage('');
    expect(dateLocale()).toBe('en-GB');
  });
});

describe('jours de la semaine', () => {
  it('rend le français inchangé, initiale en capitale et sans point', () => {
    setLanguage('fr');
    expect(dayLabels()).toEqual([
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche',
    ]);
    expect(dayShort()).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  });

  it('suit la langue de la session', () => {
    setLanguage('en');
    expect(dayLabels()[0]).toBe('Monday');
    expect(dayShort()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('formatage des dates', () => {
  it('suit la langue de la session', () => {
    const cursor = new Date('2026-11-18T12:00:00');
    setLanguage('fr');
    expect(periodLabel(cursor, 'month')).toBe('novembre 2026');
    setLanguage('en');
    expect(periodLabel(cursor, 'month')).toBe('November 2026');
    expect(periodLabel(cursor, 'fortnight')).toContain('16 Nov');
  });
});
