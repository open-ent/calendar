import { Modal } from '@open-ent/react';
import { IconRafterLeft, IconRafterRight } from '@open-ent/react/icons';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, AvailabilityResource, AvailabilitySlot } from '../api';
import {
  isWithinRange,
  parseEdtLocalDateTime,
  parseRbsUtcDateTime,
  startOfWeek,
  toDateOnly,
} from '../utils';

export interface AvailabilityStructure {
  id: string;
  name: string;
}

/**
 * Panneau « Disponibilités » : consultation en lecture seule des créneaux déjà occupés (Emploi du
 * temps + réservations RBS) sur les ressources d'un établissement, sans passer par le module
 * Réservation de ressources. Reprend le principe du panneau AngularJS (`availability.html` +
 * `$scope.availability` du contrôleur) — même vocabulaire (`mode: 'week' | 'day'`), un seul
 * aller-retour par source pour toute la période plutôt qu'un par ressource.
 */
export function AvailabilityDialog({
  structures,
  defaultStructureId,
  onClose,
}: {
  structures: AvailabilityStructure[];
  defaultStructureId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['calendar', 'common']);

  const [structureId, setStructureId] = useState(defaultStructureId ?? structures[0]?.id ?? '');
  const [selectedResourceId, setSelectedResourceId] = useState<'ALL' | number>('ALL');
  const [mode, setMode] = useState<'week' | 'day'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [pickedDate, setPickedDate] = useState(() => new Date());

  const resourcesQuery = useQuery({
    queryKey: ['calendar', 'availability', 'resources', structureId],
    queryFn: () => api.fetchAvailabilityResources(structureId),
    enabled: !!structureId,
  });
  const resources = useMemo(
    () => [...(resourcesQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [resourcesQuery.data],
  );
  const typeNames = useMemo(
    () => Array.from(new Set(resources.map((r) => r.typeName))).sort((a, b) => a.localeCompare(b)),
    [resources],
  );

  const rangeStart = mode === 'day' ? new Date(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate()) : weekStart;
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeStart.getDate() + (mode === 'day' ? 1 : 7));
  const startDateOnly = toDateOnly(rangeStart);
  const endDateOnly = toDateOnly(rangeEnd);

  // Un seul aller-retour par source pour TOUTE la structure sur la période — le filtrage par
  // ressource se fait ensuite côté client (slotsQuery n'est pas réinterrogé quand on change juste
  // de ressource sélectionnée), comme côté AngularJS.
  const slotsQuery = useQuery({
    queryKey: ['calendar', 'availability', 'slots', structureId, startDateOnly, endDateOnly],
    queryFn: async (): Promise<AvailabilitySlot[]> => {
      const resourceById = new Map(resources.map((r) => [r.id, r] as const));
      const roomNameToResource = new Map(
        resources.map((r) => [r.name.trim().toLowerCase(), r] as const),
      );
      const slots: AvailabilitySlot[] = [];

      try {
        const courses = await api.fetchAvailabilityCourses(structureId, startDateOnly, endDateOnly);
        courses.forEach((course) => {
          const start = parseEdtLocalDateTime(course.startDate);
          if (!isWithinRange(start, rangeStart, rangeEnd)) return;
          (course.roomLabels ?? []).forEach((roomLabel) => {
            // Correspondance par NOM (comme RBS checkEdtRoomConflict) : une salle EDT sans
            // ressource RBS du même nom n'apparaît simplement pas ici, jamais bloquant.
            const resource = roomNameToResource.get(String(roomLabel).trim().toLowerCase());
            if (!resource) return;
            slots.push({
              source: 'edt',
              start,
              end: parseEdtLocalDateTime(course.endDate),
              label: t('calendar.availability.source.edt', { defaultValue: 'Emploi du temps' }),
              resourceName: resource.name,
              resourceId: resource.id,
            });
          });
        });
      } catch {
        // Avertissement non bloquant : un souci de lecture EDT ne doit jamais empêcher
        // l'affichage des réservations RBS (même logique que RBS lui-même).
      }

      try {
        const bookings = await api.fetchAvailabilityBookings(startDateOnly, endDateOnly);
        bookings.forEach((booking) => {
          if (booking.status === 3 /* REFUSED */) return;
          const resource = resourceById.get(booking.resource_id);
          if (!resource) return;
          const start = parseRbsUtcDateTime(booking.start_date);
          if (!isWithinRange(start, rangeStart, rangeEnd)) return;
          slots.push({
            source: 'rbs',
            start,
            end: parseRbsUtcDateTime(booking.end_date),
            label:
              booking.booking_reason ||
              t('calendar.availability.source.rbs', { defaultValue: 'Réservation' }),
            resourceName: resource.name,
            resourceId: resource.id,
          });
        });
      } catch {
        // idem : ne jamais bloquer l'écran sur un souci de lecture RBS.
      }

      return slots.sort((a, b) => a.start.localeCompare(b.start));
    },
    enabled: !!structureId && resourcesQuery.isSuccess,
  });

  const slots = useMemo(
    () =>
      selectedResourceId === 'ALL'
        ? (slotsQuery.data ?? [])
        : (slotsQuery.data ?? []).filter((s) => s.resourceId === selectedResourceId),
    [slotsQuery.data, selectedResourceId],
  );

  const changeStructure = (id: string) => {
    setStructureId(id);
    setSelectedResourceId('ALL');
  };

  const changeWeek = (offsetWeeks: number) => {
    setMode('week');
    const next = new Date(weekStart);
    next.setDate(next.getDate() + offsetWeeks * 7);
    setWeekStart(next);
    setPickedDate(next);
  };

  // Choix direct d'une date : bascule en vue "ce jour", plus pertinent pour vérifier une
  // disponibilité ponctuelle qu'une navigation semaine par semaine.
  const changeDate = (value: string) => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    setPickedDate(d);
    setMode('day');
  };

  const loading = resourcesQuery.isLoading || slotsQuery.isLoading;
  const emptyKey =
    mode === 'week'
      ? selectedResourceId === 'ALL'
        ? 'calendar.availability.empty.all'
        : 'calendar.availability.empty'
      : selectedResourceId === 'ALL'
        ? 'calendar.availability.empty.all.day'
        : 'calendar.availability.empty.day';
  const emptyDefault =
    mode === 'week'
      ? selectedResourceId === 'ALL'
        ? 'Aucun créneau occupé cette semaine pour les ressources de l’établissement.'
        : 'Aucun créneau occupé cette semaine pour cette ressource.'
      : selectedResourceId === 'ALL'
        ? 'Aucun créneau occupé ce jour pour les ressources de l’établissement.'
        : 'Aucun créneau occupé ce jour pour cette ressource.';

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('calendar.availability.title', { defaultValue: 'Disponibilité des ressources' })}
      </Modal.Header>
      <Modal.Body>
        <p className="info small text-gray-700">
          {t('calendar.availability.help', {
            defaultValue:
              "Consultez les créneaux déjà occupés (emploi du temps et réservations) pour les ressources de l'établissement.",
          })}
        </p>

        {structures.length > 1 && (
          <div className="mb-16">
            <label className="form-label" htmlFor="availability-structure">
              {t('calendar.availability.pick.structure', { defaultValue: 'Établissement' })}
            </label>
            <select
              id="availability-structure"
              className="form-select"
              value={structureId}
              onChange={(e) => changeStructure(e.target.value)}
            >
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-16">
          <label className="form-label" htmlFor="availability-resource">
            {t('calendar.availability.pick.resource', { defaultValue: 'Choisir une ressource' })}
          </label>
          <select
            id="availability-resource"
            className="form-select"
            value={selectedResourceId === 'ALL' ? 'ALL' : String(selectedResourceId)}
            onChange={(e) => setSelectedResourceId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          >
            <option value="ALL">
              {t('calendar.availability.pick.resource.all', { defaultValue: 'Toutes les ressources' })}
            </option>
            {typeNames.map((typeName) => (
              <optgroup key={typeName} label={typeName}>
                {resources
                  .filter((r) => r.typeName === typeName)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="d-flex align-items-center flex-wrap gap-8 mb-16">
          <button
            type="button"
            className="btn btn-tertiary btn-ghost btn-sm"
            aria-label={t('calendar.availability.week.previous', { defaultValue: 'Semaine précédente' })}
            onClick={() => changeWeek(-1)}
          >
            <IconRafterLeft />
          </button>
          <span className="fw-bold">
            {mode === 'week'
              ? weekStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : pickedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          <button
            type="button"
            className="btn btn-tertiary btn-ghost btn-sm"
            aria-label={t('calendar.availability.week.next', { defaultValue: 'Semaine suivante' })}
            onClick={() => changeWeek(1)}
          >
            <IconRafterRight />
          </button>
          <label className="form-label ms-16 mb-0" htmlFor="availability-date">
            {t('calendar.availability.pick.date', { defaultValue: 'Aller à une date' })}
          </label>
          <input
            id="availability-date"
            type="date"
            className="form-control w-auto"
            value={toDateOnly(pickedDate)}
            onChange={(e) => changeDate(e.target.value)}
          />
        </div>

        {!loading && slots.length === 0 && (
          <p className="info">{t(emptyKey, { defaultValue: emptyDefault })}</p>
        )}

        {slots.length > 0 && (
          <table className="table">
            <tbody>
              {slots.map((slot, i) => (
                <tr key={`${slot.source}-${slot.resourceId}-${slot.start}-${i}`}>
                  {selectedResourceId === 'ALL' && <td>{slot.resourceName}</td>}
                  <td>
                    {new Date(slot.start).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </td>
                  <td>
                    {new Date(slot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {new Date(slot.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>{slot.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default AvailabilityDialog;

export type { AvailabilityResource };
