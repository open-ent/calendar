import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, Calendar } from '../api';

interface Visibility {
  /** Agendas cochés. */
  selected: Set<string>;
  /** Agendas déjà connus au dernier enregistrement. */
  known: Set<string>;
}

/**
 * Agendas cochés dans la barre latérale, mémorisés d'une session à l'autre.
 *
 * La préférence est celle de l'IHM AngularJS (`/userbook/preference/calendar`, clé
 * `selectedCalendars`), pour que la sélection suive d'une interface à l'autre. On y ajoute
 * `knownCalendars`, qu'elle ignore : sans lui, un agenda APPARU depuis le dernier enregistrement
 * — créé ailleurs, ou qu'on vient de vous partager — serait masqué, puisqu'il ne figure pas dans
 * la liste des cochés. Un agenda inconnu est donc visible ; seul un agenda explicitement décoché
 * reste masqué.
 */
export function useCalendarVisibility(calendars: Calendar[]) {
  const preferenceQuery = useQuery({
    queryKey: ['calendar', 'preference'],
    queryFn: api.getPreference,
    staleTime: Infinity,
  });

  // `null` = préférence pas encore connue : on affiche tout en attendant.
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || preferenceQuery.isPending) return;
    loaded.current = true;
    const pref = preferenceQuery.data;
    if (!pref) return;
    setVisibility({
      selected: new Set(pref.selectedCalendars),
      // Préférence écrite par l'AngularJS (sans `knownCalendars`) : on considère connus les
      // agendas cochés, les autres étant alors traités comme nouveaux et donc visibles.
      known: new Set(pref.knownCalendars ?? pref.selectedCalendars),
    });
  }, [preferenceQuery.isPending, preferenceQuery.data]);

  const isVisible = useCallback(
    (id: string) => {
      if (visibility === null) return true;
      return visibility.selected.has(id) || !visibility.known.has(id);
    },
    [visibility],
  );

  const persist = useCallback(
    (selected: Set<string>) => {
      const known = new Set(calendars.map((c) => c._id));
      setVisibility({ selected, known });
      // L'affichage ne doit pas dépendre de la réussite de l'enregistrement.
      void api
        .savePreference({ selectedCalendars: [...selected], knownCalendars: [...known] })
        .catch(() => undefined);
    },
    [calendars],
  );

  const toggle = useCallback(
    (id: string) => {
      // On repart de ce qui est RÉELLEMENT affiché : les agendas encore inconnus de la
      // préférence sont visibles, et doivent le rester après la bascule d'un autre.
      const current = new Set(calendars.filter((c) => isVisible(c._id)).map((c) => c._id));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      persist(current);
    },
    [calendars, isVisible, persist],
  );

  /** Rend visible un agenda qu'on vient de créer ou d'ajouter. */
  const reveal = useCallback(
    (id: string) => {
      if (isVisible(id)) return;
      const current = new Set(calendars.filter((c) => isVisible(c._id)).map((c) => c._id));
      current.add(id);
      persist(current);
    },
    [calendars, isVisible, persist],
  );

  return { isVisible, toggle, reveal };
}

export default useCalendarVisibility;
