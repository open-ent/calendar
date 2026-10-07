import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, Calendar } from '../api';

/**
 * Agendas cochés dans la barre latérale, mémorisés d'une session à l'autre.
 *
 * Même préférence (`/userbook/preference/calendar`, clé `selectedCalendars`) que l'IHM
 * AngularJS, avec la même convention : la liste enregistrée EST la liste des agendas
 * visibles. Un agenda absent de la préférence est donc masqué — sauf tant qu'aucune
 * préférence n'a jamais été enregistrée, où tout est visible.
 */
export function useCalendarVisibility(calendars: Calendar[]) {
  const preferenceQuery = useQuery({
    queryKey: ['calendar', 'preference'],
    queryFn: api.getPreference,
    staleTime: Infinity,
  });

  // `null` = préférence pas encore connue : on affiche tout en attendant.
  const [visible, setVisible] = useState<Set<string> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || preferenceQuery.isPending) return;
    loaded.current = true;
    const selected = preferenceQuery.data?.selectedCalendars;
    if (selected) setVisible(new Set(selected));
  }, [preferenceQuery.isPending, preferenceQuery.data]);

  const persist = useCallback((next: Set<string>) => {
    setVisible(next);
    // L'affichage ne doit pas dépendre de la réussite de l'enregistrement.
    void api.savePreference({ selectedCalendars: [...next] }).catch(() => undefined);
  }, []);

  const isVisible = useCallback(
    (id: string) => (visible === null ? true : visible.has(id)),
    [visible],
  );

  const toggle = useCallback(
    (id: string) => {
      // Première bascule sans préférence connue : on part de « tout visible ».
      const current = visible ?? new Set(calendars.map((c) => c._id));
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [visible, calendars, persist],
  );

  /** Rend visible un agenda qu'on vient de créer ou d'ajouter. */
  const reveal = useCallback(
    (id: string) => {
      if (visible === null || visible.has(id)) return;
      persist(new Set(visible).add(id));
    },
    [visible, persist],
  );

  return { isVisible, toggle, reveal };
}

export default useCalendarVisibility;
