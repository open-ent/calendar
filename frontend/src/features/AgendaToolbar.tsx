import { Button, IconButton } from '@open-ent/react';
import { IconRafterLeft, IconRafterRight } from '@open-ent/react/icons';
import { useTranslation } from 'react-i18next';

import { AgendaView } from '../utils';

export interface AgendaToolbarProps {
  view: AgendaView;
  periodLabel: string;
  onViewChange: (view: AgendaView) => void;
  onShift: (direction: number) => void;
  onToday: () => void;
}

/** Bascule de vue (Jour / Semaine / Mois / Liste) et navigation dans la période. */
export function AgendaToolbar({
  view,
  periodLabel,
  onViewChange,
  onShift,
  onToday,
}: AgendaToolbarProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const views: { value: AgendaView; label: string }[] = [
    { value: 'day', label: t('calendar.view.day', { defaultValue: 'Jour' }) },
    { value: 'week', label: t('calendar.view.week', { defaultValue: 'Semaine' }) },
    { value: 'month', label: t('calendar.view.month', { defaultValue: 'Mois' }) },
    { value: 'list', label: t('calendar.view.list', { defaultValue: 'Liste' }) },
  ];

  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-12 mb-16">
      <ul className="nav nav-tabs" role="tablist" aria-label={t('calendar.views', { defaultValue: 'Vues' })}>
        {views.map((v) => (
          <li className="nav-item" key={v.value} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={view === v.value}
              className={`nav-link ${view === v.value ? 'selected' : ''}`}
              onClick={() => onViewChange(v.value)}
            >
              {v.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="d-flex align-items-center gap-8">
        <IconButton
          type="button"
          color="tertiary"
          variant="ghost"
          icon={<IconRafterLeft />}
          aria-label={t('calendar.prev', { defaultValue: 'Période précédente' })}
          onClick={() => onShift(-1)}
        />
        <span className="agenda-period fw-bold text-capitalize text-center">
          {periodLabel}
        </span>
        <IconButton
          type="button"
          color="tertiary"
          variant="ghost"
          icon={<IconRafterRight />}
          aria-label={t('calendar.next', { defaultValue: 'Période suivante' })}
          onClick={() => onShift(1)}
        />
        <Button type="button" color="tertiary" variant="outline" size="sm" onClick={onToday}>
          {t('calendar.today', { defaultValue: "Aujourd'hui" })}
        </Button>
      </div>
    </div>
  );
}

export default AgendaToolbar;
