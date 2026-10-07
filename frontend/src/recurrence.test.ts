import { describe, expect, it } from 'vitest';

import {
  defaultRecurrence,
  isOneDayEvent,
  isValidEnd,
  isoWeekday,
  lengthsCompatible,
  occurrences,
  Recurrence,
  WeekDays,
} from './recurrence';

/** Date locale lisible, pour comparer les occurrences sans se battre avec le fuseau. */
const local = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const starts = (occ: { startMoment: string }[]) => occ.map((o) => local(o.startMoment));

const weekDays = (...days: number[]): WeekDays => {
  const w: WeekDays = {};
  for (let d = 1; d <= 7; d += 1) w[String(d)] = days.includes(d);
  return w;
};

// 2026-11-16 est un lundi.
const MONDAY_9H = new Date(2026, 10, 16, 9, 0).toISOString();
const MONDAY_10H = new Date(2026, 10, 16, 10, 0).toISOString();

const base: Recurrence = {
  type: 'every_day',
  every: 1,
  week_days: weekDays(1),
  end_type: 'after',
  end_after: 3,
};

describe('isoWeekday', () => {
  it('compte lundi = 1 et dimanche = 7', () => {
    expect(isoWeekday(new Date(2026, 10, 16))).toBe(1);
    expect(isoWeekday(new Date(2026, 10, 22))).toBe(7);
  });
});

describe('récurrence quotidienne', () => {
  it('répète N fois en conservant l’heure', () => {
    expect(starts(occurrences(MONDAY_9H, MONDAY_10H, base))).toEqual([
      '2026-11-16 09:00',
      '2026-11-17 09:00',
      '2026-11-18 09:00',
    ]);
  });

  it('respecte le pas « tous les N jours »', () => {
    const r = { ...base, every: 3, end_after: 3 };
    expect(starts(occurrences(MONDAY_9H, MONDAY_10H, r))).toEqual([
      '2026-11-16 09:00',
      '2026-11-19 09:00',
      '2026-11-22 09:00',
    ]);
  });

  it('s’arrête à la date de fin, celle-ci incluse', () => {
    const r: Recurrence = {
      ...base,
      end_type: 'on',
      end_on: new Date(2026, 10, 18, 0, 0).toISOString(),
    };
    expect(starts(occurrences(MONDAY_9H, MONDAY_10H, r))).toEqual([
      '2026-11-16 09:00',
      '2026-11-17 09:00',
      '2026-11-18 09:00',
    ]);
  });

  it('conserve la durée de l’événement', () => {
    const occ = occurrences(MONDAY_9H, MONDAY_10H, base);
    occ.forEach((o) => {
      expect(new Date(o.endMoment).getTime() - new Date(o.startMoment).getTime()).toBe(3600000);
    });
  });
});

describe('récurrence hebdomadaire', () => {
  it('produit chaque jour coché, dans l’ordre de la semaine', () => {
    const r: Recurrence = {
      type: 'every_week',
      every: 1,
      week_days: weekDays(1, 3, 5),
      end_type: 'after',
      end_after: 4,
    };
    expect(starts(occurrences(MONDAY_9H, MONDAY_10H, r))).toEqual([
      '2026-11-16 09:00', // lundi
      '2026-11-18 09:00', // mercredi
      '2026-11-20 09:00', // vendredi
      '2026-11-23 09:00', // lundi suivant
    ]);
  });

  it('ignore les jours déjà passés de la première semaine', () => {
    // L'événement démarre un mercredi, mais lundi est aussi coché.
    const wednesday = new Date(2026, 10, 18, 9, 0).toISOString();
    const r: Recurrence = {
      type: 'every_week',
      every: 1,
      week_days: weekDays(1, 3),
      end_type: 'after',
      end_after: 3,
    };
    expect(starts(occurrences(wednesday, wednesday, r))).toEqual([
      '2026-11-18 09:00', // mercredi, le lundi de cette semaine est derrière nous
      '2026-11-23 09:00', // lundi suivant
      '2026-11-25 09:00', // mercredi suivant
    ]);
  });

  it('saute les semaines selon le pas', () => {
    const r: Recurrence = {
      type: 'every_week',
      every: 2,
      week_days: weekDays(1),
      end_type: 'after',
      end_after: 3,
    };
    expect(starts(occurrences(MONDAY_9H, MONDAY_10H, r))).toEqual([
      '2026-11-16 09:00',
      '2026-11-30 09:00',
      '2026-12-14 09:00',
    ]);
  });

  it('ne produit rien si aucun jour n’est coché', () => {
    const r: Recurrence = { ...base, type: 'every_week', week_days: weekDays() };
    expect(occurrences(MONDAY_9H, MONDAY_10H, r)).toEqual([]);
  });

  it('garde l’heure affichée au passage à l’heure d’hiver', () => {
    // 2026-10-25 : changement d'heure en France. Une série hebdomadaire doit rester à 09:00.
    const beforeDst = new Date(2026, 9, 19, 9, 0).toISOString(); // lundi 19 octobre
    const r: Recurrence = {
      type: 'every_week',
      every: 1,
      week_days: weekDays(1),
      end_type: 'after',
      end_after: 3,
    };
    expect(starts(occurrences(beforeDst, beforeDst, r))).toEqual([
      '2026-10-19 09:00',
      '2026-10-26 09:00',
      '2026-11-02 09:00',
    ]);
  });
});

describe('garde-fous', () => {
  it('plafonne le nombre d’occurrences au maximum accepté par le serveur', () => {
    const r = { ...base, end_after: 10000 };
    expect(occurrences(MONDAY_9H, MONDAY_10H, r)).toHaveLength(364);
  });

  it('ne produit rien sur des dates invalides', () => {
    expect(occurrences('pas-une-date', MONDAY_10H, base)).toEqual([]);
  });

  it('ne produit rien pour zéro occurrence demandée', () => {
    expect(occurrences(MONDAY_9H, MONDAY_10H, { ...base, end_after: 0 })).toEqual([]);
  });
});

describe('validation', () => {
  const start = new Date(MONDAY_9H);
  const end = new Date(MONDAY_10H);

  it('refuse une fin de récurrence antérieure à la fin de l’événement', () => {
    const r: Recurrence = {
      ...base,
      end_type: 'on',
      end_on: new Date(2026, 10, 15).toISOString(),
    };
    expect(isValidEnd(start, end, r)).toBe(false);
  });

  it('accepte une fin de récurrence postérieure', () => {
    const r: Recurrence = {
      ...base,
      end_type: 'on',
      end_on: new Date(2026, 10, 20).toISOString(),
    };
    expect(isValidEnd(start, end, r)).toBe(true);
  });

  it('respecte les bornes STRICTES du serveur (1 < end_after < 365)', () => {
    // `EventHelper#isRecurrentEndDateValid` refuse end_after <= 1 et >= 365, en 401.
    expect(isValidEnd(start, end, { ...base, end_after: 1 })).toBe(false);
    expect(isValidEnd(start, end, { ...base, end_after: 2 })).toBe(true);
    expect(isValidEnd(start, end, { ...base, end_after: 364 })).toBe(true);
    expect(isValidEnd(start, end, { ...base, end_after: 365 })).toBe(false);
  });

  it('refuse un événement plus long que sa période de répétition', () => {
    const longEnd = new Date(2026, 10, 30, 10, 0); // 15 jours
    const weekly: Recurrence = { ...base, type: 'every_week', every: 1 };
    expect(lengthsCompatible(start, longEnd, weekly)).toBe(false);
    expect(lengthsCompatible(start, longEnd, { ...weekly, every: 3 })).toBe(true);
  });

  it('accepte toujours un événement d’une seule journée', () => {
    expect(lengthsCompatible(start, end, base)).toBe(true);
    expect(isOneDayEvent(start, end)).toBe(true);
  });
});

describe('defaultRecurrence', () => {
  it('coche le jour de l’événement et propose une fin au lendemain', () => {
    const r = defaultRecurrence(new Date(2026, 10, 18, 9, 0), true);
    expect(r.type).toBe('every_day');
    expect(r.week_days['3']).toBe(true); // mercredi
    expect(local(r.end_on as string)).toBe('2026-11-19 00:00');
  });

  it('impose l’hebdomadaire pour un événement sur plusieurs jours', () => {
    expect(defaultRecurrence(new Date(2026, 10, 16, 9, 0), false).type).toBe('every_week');
  });
});
