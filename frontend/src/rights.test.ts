import { describe, expect, it } from 'vitest';

import { Calendar, CalendarEvent } from './api';
import { calendarRights, eventRights, RESOURCE } from './rights';

const ME = 'u-moi';
const AUTRE = 'u-autre';
const MON_GROUPE = 'g-mien';

/** Entrée de partage entcore : un destinataire, puis une action par clé à `true`. */
const partage = (cible: { userId?: string; groupId?: string }, ...actions: string[]) =>
  Object.assign({ ...cible }, ...actions.map((a) => ({ [a]: true })));

const agenda = (over: Partial<Calendar> = {}): Calendar => ({
  _id: 'c1',
  title: 'Agenda',
  owner: { userId: ME, displayName: 'Moi' },
  ...over,
});

const droits = (c: Calendar) => calendarRights(c, ME, [MON_GROUPE]);

describe('droits sur un agenda', () => {
  it('le propriétaire peut tout faire', () => {
    expect(droits(agenda())).toEqual({ contrib: true, manage: true, share: true, remove: true });
  });

  it('un agenda sans partage ni appartenance ne donne aucun droit', () => {
    expect(droits(agenda({ owner: { userId: AUTRE, displayName: 'Autre' } }))).toEqual({
      contrib: false,
      manage: false,
      share: false,
      remove: false,
    });
  });

  it('un partage nominatif en contribution ouvre l’écriture, pas la gestion', () => {
    const c = agenda({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ userId: ME }, RESOURCE.contrib)],
    });
    expect(droits(c)).toEqual({ contrib: true, manage: false, share: false, remove: false });
  });

  it('un partage à un de mes groupes compte comme un partage à moi', () => {
    const c = agenda({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ groupId: MON_GROUPE }, RESOURCE.contrib)],
    });
    expect(droits(c).contrib).toBe(true);
  });

  it('un partage à un groupe dont je ne suis pas ne donne rien', () => {
    const c = agenda({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ groupId: 'g-autre' }, RESOURCE.contrib)],
    });
    expect(droits(c).contrib).toBe(false);
  });

  it('la gestion emporte la contribution, le partage et la suppression', () => {
    const c = agenda({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ userId: ME }, RESOURCE.manage)],
    });
    expect(droits(c)).toEqual({ contrib: true, manage: true, share: true, remove: true });
  });

  it('un agenda externe est en lecture seule, son propriétaire pouvant seul le retirer', () => {
    expect(droits(agenda({ isExternal: true }))).toEqual({
      contrib: false,
      manage: false,
      share: false,
      remove: true,
    });
    const autrui = agenda({ isExternal: true, owner: { userId: AUTRE, displayName: 'Autre' } });
    expect(droits(autrui).remove).toBe(false);
  });
});

describe('droits sur un événement', () => {
  const evenement = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
    _id: 'e1',
    title: 'Événement',
    startMoment: '2026-11-16T09:00:00.000Z',
    endMoment: '2026-11-16T10:00:00.000Z',
    calendar: ['c1'],
    owner: { userId: ME, displayName: 'Moi' },
    ...over,
  });

  const contexte = (...calendars: Calendar[]) => {
    const byId = new Map(calendars.map((c) => [c._id, c]));
    const rights = new Map(calendars.map((c) => [c._id, calendarRights(c, ME, [MON_GROUPE])]));
    return { byId, rights };
  };

  const evalue = (e: CalendarEvent, ...calendars: Calendar[]) => {
    const { byId, rights } = contexte(...calendars);
    return eventRights(e, byId, rights, ME, [MON_GROUPE]);
  };

  it('tout est permis dans un agenda que je gère', () => {
    expect(evalue(evenement(), agenda())).toEqual({ edit: true, share: true, remove: true });
  });

  it('rien n’est permis si l’agenda m’est inconnu', () => {
    expect(evalue(evenement({ calendar: ['c-inconnu'] }), agenda())).toEqual({
      edit: false,
      share: false,
      remove: false,
    });
  });

  it('un événement d’un agenda externe n’est jamais modifiable', () => {
    expect(evalue(evenement(), agenda({ isExternal: true }))).toEqual({
      edit: false,
      share: false,
      remove: false,
    });
  });

  it('on retient le droit le plus faible parmi les agendas qui portent l’événement', () => {
    // Publié dans un agenda que je gère ET dans un où je ne suis que lecteur : pas modifiable.
    const lecture = agenda({ _id: 'c2', owner: { userId: AUTRE, displayName: 'Autre' } });
    const e = evenement({ calendar: ['c1', 'c2'] });
    expect(evalue(e, agenda(), lecture).edit).toBe(false);
  });

  it('un contributeur ne touche que ses propres événements', () => {
    const contrib = agenda({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ userId: ME }, RESOURCE.contrib)],
    });
    expect(evalue(evenement(), contrib).edit).toBe(true);
    const aAutrui = evenement({ owner: { userId: AUTRE, displayName: 'Autre' } });
    expect(evalue(aAutrui, contrib).edit).toBe(false);
  });

  it('un partage posé sur l’événement restreint un non-propriétaire', () => {
    const gere = agenda({ owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ userId: ME }, RESOURCE.manage)] });
    const e = evenement({
      owner: { userId: AUTRE, displayName: 'Autre' },
      shared: [partage({ userId: ME }, RESOURCE.updateEvent)],
    });
    // Modification accordée, mais ni partage ni suppression.
    expect(evalue(e, gere)).toEqual({ edit: true, share: false, remove: false });
  });

  it('le partage de l’événement ne restreint jamais son propriétaire', () => {
    const e = evenement({ shared: [partage({ userId: AUTRE }, RESOURCE.updateEvent)] });
    expect(evalue(e, agenda())).toEqual({ edit: true, share: true, remove: true });
  });
});
