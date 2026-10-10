import { describe, expect, it } from 'vitest';

import {
  daySpan,
  fortnightDays,
  isMultiDay,
  isoUtcToLocalInput,
  isSameDay,
  isSameMonth,
  isWithinRange,
  localInputToIsoUtc,
  monthGrid,
  occupiesDay,
  parseEdtLocalDateTime,
  parseRbsUtcDateTime,
  periodLabel,
  readableCause,
  recurrenceSummary,
  shiftCursor,
  startOfWeek,
  toDateOnly,
  weekDays,
} from './utils';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('semaine', () => {
  it('startOfWeek ramène au lundi', () => {
    expect(ymd(startOfWeek(new Date('2026-11-18T12:00:00')))).toBe('2026-11-16'); // mercredi -> lundi
    expect(ymd(startOfWeek(new Date('2026-11-22T12:00:00')))).toBe('2026-11-16'); // dimanche -> lundi
  });
  it('weekDays renvoie 7 jours lundi→dimanche', () => {
    const days = weekDays(startOfWeek(new Date('2026-11-18T12:00:00')));
    expect(days).toHaveLength(7);
    expect(ymd(days[0])).toBe('2026-11-16');
    expect(ymd(days[6])).toBe('2026-11-22');
  });
});

describe('quinzaine', () => {
  // Même cadrage que côté AngularJS (`libs/infra-front/src/ts/calendar.ts`, increment
  // `fortnight`) : démarre un lundi, navigue par pas de 14 jours.
  it('fortnightDays renvoie 14 jours lundi→dimanche sur deux semaines', () => {
    const days = fortnightDays(startOfWeek(new Date('2026-11-18T12:00:00')));
    expect(days).toHaveLength(14);
    expect(ymd(days[0])).toBe('2026-11-16');
    expect(ymd(days[6])).toBe('2026-11-22');
    expect(ymd(days[7])).toBe('2026-11-23');
    expect(ymd(days[13])).toBe('2026-11-29');
  });

  it('shiftCursor avance/recule de 14 jours en vue quinzaine', () => {
    const cursor = new Date('2026-11-18T12:00:00');
    expect(ymd(shiftCursor(cursor, 'fortnight', 1))).toBe('2026-12-02');
    expect(ymd(shiftCursor(cursor, 'fortnight', -1))).toBe('2026-11-04');
  });

  it('periodLabel couvre toute la plage de 14 jours', () => {
    const label = periodLabel(new Date('2026-11-18T12:00:00'), 'fortnight');
    expect(label).toContain('16 nov.');
    expect(label).toContain('29 nov. 2026');
  });
});

describe('isSameDay', () => {
  it('compare le jour civil local', () => {
    expect(isSameDay('2026-11-16T09:00:00.000Z', new Date('2026-11-16T20:00:00'))).toBe(true);
    expect(isSameDay('2026-11-17T09:00:00.000Z', new Date('2026-11-16T20:00:00'))).toBe(false);
  });
});

describe('grille mensuelle', () => {
  it('monthGrid renvoie 42 jours débutant un lundi', () => {
    const grid = monthGrid(new Date('2026-11-15T12:00:00'));
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1); // lundi
    // novembre 2026 : le 1er est un dimanche -> la grille démarre le lundi 26 oct.
    expect(ymd(grid[0])).toBe('2026-10-26');
  });
  it('isSameMonth compare le mois civil', () => {
    expect(isSameMonth(new Date('2026-11-30'), new Date('2026-11-01'))).toBe(true);
    expect(isSameMonth(new Date('2026-12-01'), new Date('2026-11-01'))).toBe(false);
  });
});

describe('conversions datetime-local ↔ ISO UTC', () => {
  it('aller-retour cohérent', () => {
    const local = '2026-09-10T10:00';
    const iso = localInputToIsoUtc(local);
    expect(iso).toMatch(/Z$/);
    expect(isoUtcToLocalInput(iso)).toBe(local);
  });
  it('renvoie une chaîne vide pour une entrée absente/invalide', () => {
    expect(localInputToIsoUtc('')).toBe('');
    expect(isoUtcToLocalInput(undefined)).toBe('');
    expect(isoUtcToLocalInput('pas-une-date')).toBe('');
  });
});

describe('événements sur plusieurs jours', () => {
  // Dates en heure locale : c'est le jour civil de l'usager qui compte dans les vues.
  const d = (s: string) => new Date(s).toISOString();
  const day = (s: string) => new Date(`${s}T12:00:00`);

  it("occupiesDay couvre chaque jour entre le début et la fin", () => {
    const start = d('2026-11-16T14:00:00');
    const end = d('2026-11-18T10:00:00');
    expect(occupiesDay(start, end, day('2026-11-15'))).toBe(false);
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(true); // jour entièrement couvert
    expect(occupiesDay(start, end, day('2026-11-18'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-19'))).toBe(false);
  });

  it("une fin à minuit pile ne déborde pas sur le jour suivant", () => {
    const start = d('2026-11-16T20:00:00');
    const end = d('2026-11-17T00:00:00');
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(false);
    expect(isMultiDay(start, end)).toBe(false);
  });

  it('un événement sur une seule journée reste sur son jour', () => {
    const start = d('2026-11-16T09:00:00');
    const end = d('2026-11-16T17:00:00');
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(false);
    expect(isMultiDay(start, end)).toBe(false);
  });

  it('daySpan situe le jour dans la série', () => {
    const start = d('2026-11-16T14:00:00');
    const end = d('2026-11-18T10:00:00');
    expect(daySpan(start, end, day('2026-11-16'))).toBe('start');
    expect(daySpan(start, end, day('2026-11-17'))).toBe('middle');
    expect(daySpan(start, end, day('2026-11-18'))).toBe('end');
    expect(daySpan(start, d('2026-11-16T17:00:00'), day('2026-11-16'))).toBe('single');
  });

  it('des dates incohérentes ne font pas disparaître l’événement', () => {
    const start = d('2026-11-16T14:00:00');
    expect(occupiesDay(start, d('2026-11-15T10:00:00'), day('2026-11-16'))).toBe(true); // fin avant début
    expect(occupiesDay(start, undefined, day('2026-11-16'))).toBe(true); // pas de fin
    expect(occupiesDay('pas-une-date', start, day('2026-11-16'))).toBe(false);
  });
});

describe('disponibilités (panneau EDT + RBS)', () => {
  it('toDateOnly formate en YYYY-MM-DD, zéro-paddé', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateOnly(new Date(2026, 10, 18))).toBe('2026-11-18');
  });

  // `edt/.../common/courses` renvoie une heure LOCALE sans zone — `new Date(...)` doit la
  // comprendre comme heure locale (comportement par défaut), pas comme UTC.
  it('parseEdtLocalDateTime convertit "YYYY-MM-DD HH:mm:ss" en heure locale comprise par Date', () => {
    const iso = parseEdtLocalDateTime('2026-11-18 09:00:00');
    expect(iso).toBe('2026-11-18T09:00:00');
    const d = new Date(iso);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  // `rbs/bookings/all` renvoie un TIMESTAMP déjà en UTC mais SANS indicateur de zone — sans le
  // 'Z' ajouté ici, `new Date(...)` l'interpréterait à tort comme une heure locale et décalerait
  // l'affichage d'1h/2h (cf. mémoire bug-fuseau-horaire-edt-import-rbs).
  it('parseRbsUtcDateTime ajoute le Z manquant', () => {
    expect(parseRbsUtcDateTime('2026-11-18 09:00:00')).toBe('2026-11-18T09:00:00Z');
    expect(new Date(parseRbsUtcDateTime('2026-11-18 09:00:00')).getUTCHours()).toBe(9);
  });

  it('parseRbsUtcDateTime ne double pas un suffixe de zone déjà présent', () => {
    expect(parseRbsUtcDateTime('2026-11-18T09:00:00Z')).toBe('2026-11-18T09:00:00Z');
    expect(parseRbsUtcDateTime('2026-11-18T09:00:00+02:00')).toBe('2026-11-18T09:00:00+02:00');
  });

  // Reproduit le bug constaté sur l'ENT local : `/rbs/bookings/all` renvoie aussi
  // l'enregistrement parent d'une série périodique, dont le début réel est hors de la semaine
  // affichée — sans ce filtre, son `end_date` (date de fin de récurrence, pas une heure réelle)
  // s'affichait comme un créneau "09:00-00:00" au lieu d'être écarté.
  it('isWithinRange exclut un créneau dont le début réel tombe hors de la période affichée', () => {
    const weekStart = new Date('2026-10-05T00:00:00');
    const weekEnd = new Date('2026-10-12T00:00:00');
    // Occurrence réelle de la semaine affichée : incluse.
    expect(isWithinRange('2026-10-05T07:00:00Z', weekStart, weekEnd)).toBe(true);
    // Enregistrement parent de la série, débutant 2 semaines plus tôt : exclu.
    expect(isWithinRange('2026-09-21T07:00:00Z', weekStart, weekEnd)).toBe(false);
    // Borne de fin exclusive.
    expect(isWithinRange('2026-10-12T00:00:00Z', weekStart, weekEnd)).toBe(false);
    expect(isWithinRange('2026-10-11T20:00:00Z', weekStart, weekEnd)).toBe(true);
  });
});

describe('readableCause (import ICS)', () => {
  // Le serveur renvoie, selon le chemin de code, soit une clé i18n soit le message brut d'une
  // exception Java — vérifié sur l'ENT local avec un .ics dont la fin précède le début.
  const noTranslation = () => '';
  const translateSlot = (key: string) =>
    key === 'calendar.ical.event.slot.problem' ? "Problème d'horaires." : '';

  it('traduit une clé i18n quand le serveur en renvoie une', () => {
    expect(readableCause('calendar.ical.event.slot.problem', translateSlot)).toBe(
      "Problème d'horaires.",
    );
  });

  it("retire le nom de classe devant un message d'exception Java", () => {
    const brut =
      'net.atos.entng.calendar.exception.UnhandledEventException: La date de fin doit être supérieure ou égale à la date de début.';
    expect(readableCause(brut, noTranslation)).toBe(
      'La date de fin doit être supérieure ou égale à la date de début.',
    );
  });

  it('garde un message déjà lisible tel quel', () => {
    expect(readableCause('Fichier illisible', noTranslation)).toBe('Fichier illisible');
  });

  it('ne renvoie rien sans cause', () => {
    expect(readableCause(undefined, noTranslation)).toBe('');
  });
});

describe('recurrenceSummary', () => {
  // Les traductions viennent du module ; ici on renvoie la clé pour vérifier la composition.
  const fr: Record<string, string> = {
    'calendar.recurrence.every.day': 'Tous les jours',
    'calendar.recurrence.every.week': 'Toutes les semaines',
    'calendar.recurrence.every': 'Tous les',
    'calendar.recurrence.every.female': 'Toutes les',
    'calendar.recurrence.days': 'jours',
    'calendar.recurrence.weeks': 'semaines',
    'calendar.recurrence.daymap.mon': 'Lu',
    'calendar.recurrence.daymap.wed': 'Me',
    'calendar.recurrence.end.after': 'Après',
    'calendar.recurrence.occurrences': 'occurrences',
    'calendar.recurrence.until': "jusqu'au",
  };
  const t = (key: string, o?: { defaultValue: string }) => fr[key] ?? o?.defaultValue ?? '';
  const days = (...d: number[]) => {
    const w: Record<string, boolean> = {};
    for (let i = 1; i <= 7; i += 1) w[String(i)] = d.includes(i);
    return w;
  };

  it('accorde le genre : « Toutes les 2 semaines », pas « Tous les »', () => {
    expect(
      recurrenceSummary(
        { type: 'every_week', every: 2, week_days: days(1), end_type: 'after', end_after: 4 },
        t,
      ),
    ).toBe('Toutes les 2 semaines · Lu · Après 4 occurrences');
  });

  it('utilise le libellé tout fait au pas de 1', () => {
    expect(
      recurrenceSummary(
        { type: 'every_week', every: 1, week_days: days(1, 3), end_type: 'after', end_after: 6 },
        t,
      ),
    ).toBe('Toutes les semaines · Lu, Me · Après 6 occurrences');
    expect(
      recurrenceSummary(
        { type: 'every_day', every: 1, week_days: days(), end_type: 'after', end_after: 3 },
        t,
      ),
    ).toBe('Tous les jours · Après 3 occurrences');
  });

  it('affiche la date de fin quand la série s’arrête à une date', () => {
    const summary = recurrenceSummary(
      {
        type: 'every_day',
        every: 1,
        week_days: days(),
        end_type: 'on',
        end_on: new Date(2026, 11, 12).toISOString(),
      },
      t,
    );
    expect(summary).toBe("Tous les jours · jusqu'au 12/12/2026");
  });
});
