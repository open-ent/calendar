import { describe, expect, it } from 'vitest';
import { calendarLabel } from './calendarLabel';

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

describe('calendarLabel', () => {
  it("ajoute le nom de l'établissement à un agenda d'établissement", () => {
    expect(calendarLabel({ title: "Agenda d'établissement", type: 'structure', structureName: 'CLG MORLAIX' }, t)).toBe(
      "Agenda de l'établissement CLG MORLAIX",
    );
  });

  it("garde le titre quand le nom de l'établissement n'est pas résolu", () => {
    expect(calendarLabel({ title: "Agenda d'établissement", type: 'structure' }, t)).toBe("Agenda d'établissement");
  });

  it('garde le titre des autres agendas, même avec un nom de structure', () => {
    expect(calendarLabel({ title: 'Mon agenda', type: 'personal', structureName: 'CLG' }, t)).toBe('Mon agenda');
    expect(calendarLabel({ title: 'Classe 501', type: 'group' }, t)).toBe('Classe 501');
  });
});
