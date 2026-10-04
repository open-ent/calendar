import {
  Button,
  Checkbox,
  Dropdown,
  FormControl,
  Heading,
  Input,
  Label,
} from '@open-ent/react';
import {
  IconDelete,
  IconEdit,
  IconGlobe,
  IconOptions,
  IconPlus,
  IconShare,
} from '@open-ent/react/icons';
import { CSSProperties, FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Calendar } from '../api';
import { CalendarRights } from '../rights';
import { calendarColor } from '../utils';

/** Une action du menu d'un agenda. */
interface RowAction {
  key: string;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
}

/** Une ligne d'agenda : case à cocher (visibilité), pastille de couleur, titre, menu d'actions. */
function CalendarRow({
  calendar,
  checked,
  onToggle,
  subtitle,
  actions,
}: {
  calendar: Calendar;
  checked: boolean;
  onToggle: () => void;
  subtitle?: string;
  actions: RowAction[];
}) {
  const { t } = useTranslation(['calendar', 'common']);

  return (
    <li className="d-flex align-items-center justify-content-between gap-4 py-4">
      <label className="agenda-calendar-label d-flex align-items-center gap-8 overflow-hidden m-0">
        <Checkbox checked={checked} onChange={onToggle} aria-label={calendar.title} />
        <span
          aria-hidden="true"
          className="agenda-swatch"
          style={{ '--agenda-color': calendarColor(calendar.color) } as CSSProperties}
        />
        <span className="text-truncate">
          {calendar.title}
          {subtitle && <span className="small text-gray-700"> ({subtitle})</span>}
        </span>
      </label>
      {actions.length > 0 && (
        <div className="flex-shrink-0">
          <Dropdown placement="bottom-end">
            <Dropdown.Trigger
              variant="ghost"
              size="sm"
              hideCarret
              icon={<IconOptions />}
              aria-label={`${t('calendar.actions', { defaultValue: 'Actions' })} : ${calendar.title}`}
            />
            <Dropdown.Menu>
              {actions.map((a) => (
                <Dropdown.Item key={a.key} icon={a.icon} onClick={a.onClick}>
                  {a.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      )}
    </li>
  );
}

/** Titre de section de la barre latérale, avec son action d'ajout optionnelle. */
function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-24">
      <Heading level="h2" headingStyle="h5" className="mb-8">
        {title}
      </Heading>
      {children}
      {action && <div className="mt-8">{action}</div>}
    </section>
  );
}

export interface CalendarSidebarProps {
  myCalendars: Calendar[];
  /** Agendas d'établissement, section dédiée comme dans l'IHM AngularJS. */
  structureCalendars: Calendar[];
  /** Agendas de groupe, section dédiée comme dans l'IHM AngularJS. */
  groupCalendars: Calendar[];
  sharedCalendars: Calendar[];
  externalCalendars: Calendar[];
  isLoading: boolean;
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
  onEdit: (calendar: Calendar) => void;
  onShare: (calendar: Calendar) => void;
  onDelete: (calendar: Calendar) => void;
  onPortalPublish: (calendar: Calendar) => void;
  /** Droits de l'usager sur un agenda : seules les actions permises sont proposées. */
  rightsOf: (calendar: Calendar) => CalendarRights;
  /** L'usager a-t-il le droit de workflow « créer un agenda » ? */
  canCreateCalendar: boolean;
  /** Identifiant de l'usager, pour ne pas répéter son nom sur ses propres agendas. */
  myOwnerId: string;
  /** Formulaire d'ajout d'un agenda externe (flux ICS). */
  externalForm: {
    isOpen: boolean;
    title: string;
    url: string;
    isPending: boolean;
    isError: boolean;
    /** Droit d'ajouter un flux externe (même droit de workflow que créer un agenda). */
    canAdd: boolean;
    onOpenChange: (open: boolean) => void;
    onTitleChange: (value: string) => void;
    onUrlChange: (value: string) => void;
    onSubmit: () => void;
  };
}

/** Barre latérale : mes agendas, ceux partagés avec moi, et les flux externes. */
export function CalendarSidebar({
  myCalendars,
  structureCalendars,
  groupCalendars,
  sharedCalendars,
  externalCalendars,
  isLoading,
  isVisible,
  onToggle,
  onCreate,
  onEdit,
  onShare,
  onDelete,
  onPortalPublish,
  rightsOf,
  canCreateCalendar,
  myOwnerId,
  externalForm,
}: CalendarSidebarProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const emptyLabel = t('calendar.shared.none', { defaultValue: "Pas d'agenda" });
  const publishLabel = t('calendar.portalpublish.title', {
    defaultValue: 'Publier sur le portail public',
  });

  /** Publier sur le portail : réservé aux agendas d'établissement qu'on peut gérer. */
  const publishAction = (c: Calendar, rights: CalendarRights): RowAction[] =>
    c.type === 'structure' && rights.manage
      ? [{ key: 'publish', label: publishLabel, icon: <IconGlobe />, onClick: () => onPortalPublish(c) }]
      : [];

  const actionsFor = (c: Calendar): RowAction[] => {
    const rights = rightsOf(c);
    const actions: RowAction[] = [...publishAction(c, rights)];
    if (rights.share) {
      actions.push({
        key: 'share',
        label: t('calendar.share', { defaultValue: 'Partager' }),
        icon: <IconShare />,
        onClick: () => onShare(c),
      });
    }
    if (rights.manage) {
      actions.push({
        key: 'edit',
        label: t('calendar.edit', { defaultValue: 'Éditer un agenda' }),
        icon: <IconEdit />,
        onClick: () => onEdit(c),
      });
    }
    if (rights.remove) {
      actions.push({
        key: 'delete',
        label: t('calendar.delete', { defaultValue: 'Supprimer' }),
        icon: <IconDelete />,
        onClick: () => onDelete(c),
      });
    }
    return actions;
  };

  const submitExternal = (e: FormEvent) => {
    e.preventDefault();
    if (externalForm.title.trim() && externalForm.url.trim()) externalForm.onSubmit();
  };

  return (
    <aside className="agenda-sidebar col-12 col-lg-3 py-16 pe-lg-16">
      <SidebarSection
        title={t('calendar.mycalendars', { defaultValue: 'Mes agendas' })}
        action={
          canCreateCalendar && (
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              leftIcon={<IconPlus />}
              onClick={onCreate}
            >
              {t('calendar.new', { defaultValue: 'Créer un agenda' })}
            </Button>
          )
        }
      >
        {isLoading ? (
          <p className="small text-gray-700 m-0">
            {t('calendar.loading', { defaultValue: 'Chargement…' })}
          </p>
        ) : (
          <ul className="list-unstyled m-0">
            {myCalendars.length === 0 && <li className="small text-gray-700">{emptyLabel}</li>}
            {myCalendars.map((c) => (
              <CalendarRow
                key={c._id}
                calendar={c}
                checked={isVisible(c._id)}
                onToggle={() => onToggle(c._id)}
                actions={actionsFor(c)}
              />
            ))}
          </ul>
        )}
      </SidebarSection>

      {structureCalendars.length > 0 && (
        <SidebarSection
          title={t('calendar.structure.calendars', { defaultValue: "Agendas de l'établissement" })}
        >
          <ul className="list-unstyled m-0">
            {structureCalendars.map((c) => (
              <CalendarRow
                key={c._id}
                calendar={c}
                checked={isVisible(c._id)}
                onToggle={() => onToggle(c._id)}
                subtitle={c.owner?.userId === myOwnerId ? undefined : c.owner?.displayName}
                actions={actionsFor(c)}
              />
            ))}
          </ul>
        </SidebarSection>
      )}

      {groupCalendars.length > 0 && (
        <SidebarSection
          title={t('calendar.group.calendars', { defaultValue: 'Agendas de groupe' })}
        >
          <ul className="list-unstyled m-0">
            {groupCalendars.map((c) => (
              <CalendarRow
                key={c._id}
                calendar={c}
                checked={isVisible(c._id)}
                onToggle={() => onToggle(c._id)}
                subtitle={c.owner?.userId === myOwnerId ? undefined : c.owner?.displayName}
                actions={actionsFor(c)}
              />
            ))}
          </ul>
        </SidebarSection>
      )}

      <SidebarSection title={t('calendar.sharedcalendars', { defaultValue: 'Agendas partagés' })}>
        <ul className="list-unstyled m-0">
          {sharedCalendars.length === 0 && <li className="small text-gray-700">{emptyLabel}</li>}
          {sharedCalendars.map((c) => (
            <CalendarRow
              key={c._id}
              calendar={c}
              checked={isVisible(c._id)}
              onToggle={() => onToggle(c._id)}
              subtitle={c.owner?.displayName}
              actions={actionsFor(c)}
            />
          ))}
        </ul>
      </SidebarSection>

      <SidebarSection
        title={t('calendar.externalcalendars', { defaultValue: 'Agendas externes' })}
        action={
          externalForm.canAdd && !externalForm.isOpen && (
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              leftIcon={<IconPlus />}
              onClick={() => externalForm.onOpenChange(true)}
            >
              {t('calendar.add.external.calendar', { defaultValue: 'Ajouter un agenda externe' })}
            </Button>
          )
        }
      >
        <ul className="list-unstyled m-0">
          {externalCalendars.length === 0 && <li className="small text-gray-700">{emptyLabel}</li>}
          {externalCalendars.map((c) => (
            <CalendarRow
              key={c._id}
              calendar={c}
              checked={isVisible(c._id)}
              onToggle={() => onToggle(c._id)}
              actions={actionsFor(c)}
            />
          ))}
        </ul>

        {externalForm.isOpen && (
          <form className="mt-12 d-flex flex-column gap-8" onSubmit={submitExternal}>
            <FormControl id="external-title">
              <Label>{t('calendar.external.title', { defaultValue: "Titre de l'agenda" })}</Label>
              <Input
                type="text"
                size="sm"
                value={externalForm.title}
                onChange={(e) => externalForm.onTitleChange(e.target.value)}
              />
            </FormControl>
            <FormControl id="external-url">
              <Label>{t('calendar.external.url', { defaultValue: 'URL du flux ICS' })}</Label>
              <Input
                type="url"
                size="sm"
                value={externalForm.url}
                onChange={(e) => externalForm.onUrlChange(e.target.value)}
              />
            </FormControl>
            {externalForm.isError && (
              <p className="small text-danger m-0" role="alert">
                {t('calendar.external.error', {
                  defaultValue: 'Ajout refusé (URL non autorisée par la plateforme ?).',
                })}
              </p>
            )}
            <div className="d-flex gap-8">
              <Button
                type="submit"
                color="primary"
                variant="filled"
                size="sm"
                isLoading={externalForm.isPending}
                disabled={!externalForm.title.trim() || !externalForm.url.trim()}
              >
                {t('calendar.add', { defaultValue: "Ajouter l'agenda" })}
              </Button>
              <Button
                type="button"
                color="tertiary"
                variant="ghost"
                size="sm"
                onClick={() => externalForm.onOpenChange(false)}
              >
                {t('calendar.cancel', { defaultValue: 'Annuler' })}
              </Button>
            </div>
          </form>
        )}
      </SidebarSection>
    </aside>
  );
}

export default CalendarSidebar;
