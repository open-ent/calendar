import {
  Button,
  Checkbox,
  FormControl,
  Heading,
  IconButton,
  Input,
  Label,
  Tooltip,
} from '@open-ent/react';
import { IconDelete, IconEdit, IconGlobe, IconPlus, IconShare } from '@open-ent/react/icons';
import { CSSProperties, FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Calendar } from '../api';
import { calendarColor } from '../utils';

/** Une ligne d'agenda : case à cocher (visibilité), pastille de couleur, titre, actions. */
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
  actions?: ReactNode;
}) {
  return (
    <li className="d-flex align-items-center justify-content-between gap-8 py-4">
      <div className="d-flex align-items-center gap-8 overflow-hidden">
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
      </div>
      {actions && <div className="d-flex gap-2 flex-shrink-0">{actions}</div>}
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
      <div className="d-flex align-items-center justify-content-between gap-8 mb-8">
        <Heading level="h2" headingStyle="h5" className="m-0">
          {title}
        </Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface CalendarSidebarProps {
  myCalendars: Calendar[];
  sharedCalendars: Calendar[];
  externalCalendars: Calendar[];
  isLoading: boolean;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onCreate: () => void;
  onEdit: (calendar: Calendar) => void;
  onShare: (calendar: Calendar) => void;
  onDelete: (calendar: Calendar) => void;
  onPortalPublish: (calendar: Calendar) => void;
  /** Formulaire d'ajout d'un agenda externe (flux ICS). */
  externalForm: {
    isOpen: boolean;
    title: string;
    url: string;
    isPending: boolean;
    isError: boolean;
    onOpenChange: (open: boolean) => void;
    onTitleChange: (value: string) => void;
    onUrlChange: (value: string) => void;
    onSubmit: () => void;
  };
}

/** Barre latérale : mes agendas, ceux partagés avec moi, et les flux externes. */
export function CalendarSidebar({
  myCalendars,
  sharedCalendars,
  externalCalendars,
  isLoading,
  hidden,
  onToggle,
  onCreate,
  onEdit,
  onShare,
  onDelete,
  onPortalPublish,
  externalForm,
}: CalendarSidebarProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const emptyLabel = t('calendar.shared.none', { defaultValue: "Pas d'agenda" });
  const publishLabel = t('calendar.portalpublish.title', {
    defaultValue: 'Publier sur le portail public',
  });

  const submitExternal = (e: FormEvent) => {
    e.preventDefault();
    if (externalForm.title.trim() && externalForm.url.trim()) externalForm.onSubmit();
  };

  return (
    <aside className="agenda-sidebar col-12 col-lg-3 py-16 pe-lg-16">
      <SidebarSection
        title={t('calendar.mycalendars', { defaultValue: 'Mes agendas' })}
        action={
          <Button
            type="button"
            color="tertiary"
            variant="ghost"
            size="sm"
            leftIcon={<IconPlus />}
            onClick={onCreate}
          >
            {t('calendar.new', { defaultValue: 'Nouveau' })}
          </Button>
        }
      >
        {isLoading ? (
          <p className="small text-gray-700 m-0">
            {t('calendar.loading', { defaultValue: 'Chargement…' })}
          </p>
        ) : (
          <ul className="list-unstyled m-0">
            {myCalendars.length === 0 && (
              <li className="small text-gray-700">{emptyLabel}</li>
            )}
            {myCalendars.map((c) => (
              <CalendarRow
                key={c._id}
                calendar={c}
                checked={!hidden.has(c._id)}
                onToggle={() => onToggle(c._id)}
                actions={
                  <>
                    {c.type === 'structure' && (
                      <Tooltip message={publishLabel} placement="top">
                        <IconButton
                          type="button"
                          color="tertiary"
                          variant="ghost"
                          size="sm"
                          icon={<IconGlobe />}
                          aria-label={`${publishLabel} ${c.title}`}
                          onClick={() => onPortalPublish(c)}
                        />
                      </Tooltip>
                    )}
                    <Tooltip message={t('calendar.share', { defaultValue: 'Partager' })} placement="top">
                      <IconButton
                        type="button"
                        color="tertiary"
                        variant="ghost"
                        size="sm"
                        icon={<IconShare />}
                        aria-label={`${t('calendar.share', { defaultValue: 'Partager' })} ${c.title}`}
                        onClick={() => onShare(c)}
                      />
                    </Tooltip>
                    <Tooltip message={t('calendar.edit', { defaultValue: 'Modifier' })} placement="top">
                      <IconButton
                        type="button"
                        color="tertiary"
                        variant="ghost"
                        size="sm"
                        icon={<IconEdit />}
                        aria-label={`${t('calendar.edit', { defaultValue: 'Modifier' })} ${c.title}`}
                        onClick={() => onEdit(c)}
                      />
                    </Tooltip>
                    <Tooltip message={t('calendar.delete', { defaultValue: 'Supprimer' })} placement="top">
                      <IconButton
                        type="button"
                        color="danger"
                        variant="ghost"
                        size="sm"
                        icon={<IconDelete />}
                        aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${c.title}`}
                        onClick={() => onDelete(c)}
                      />
                    </Tooltip>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </SidebarSection>

      <SidebarSection title={t('calendar.sharedcalendars', { defaultValue: 'Agendas partagés' })}>
        <ul className="list-unstyled m-0">
          {sharedCalendars.length === 0 && <li className="small text-gray-700">{emptyLabel}</li>}
          {sharedCalendars.map((c) => (
            <CalendarRow
              key={c._id}
              calendar={c}
              checked={!hidden.has(c._id)}
              onToggle={() => onToggle(c._id)}
              subtitle={c.owner?.displayName}
              actions={
                c.type === 'structure' ? (
                  <Tooltip message={publishLabel} placement="top">
                    <IconButton
                      type="button"
                      color="tertiary"
                      variant="ghost"
                      size="sm"
                      icon={<IconGlobe />}
                      aria-label={`${publishLabel} ${c.title}`}
                      onClick={() => onPortalPublish(c)}
                    />
                  </Tooltip>
                ) : null
              }
            />
          ))}
        </ul>
      </SidebarSection>

      <SidebarSection
        title={t('calendar.externalcalendars', { defaultValue: 'Agendas externes' })}
        action={
          <Button
            type="button"
            color="tertiary"
            variant="ghost"
            size="sm"
            leftIcon={<IconPlus />}
            onClick={() => externalForm.onOpenChange(!externalForm.isOpen)}
          >
            {t('calendar.external.add', { defaultValue: 'Ajouter' })}
          </Button>
        }
      >
        {externalForm.isOpen && (
          <form className="mb-12 d-flex flex-column gap-8" onSubmit={submitExternal}>
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
            <Button
              type="submit"
              color="primary"
              variant="filled"
              size="sm"
              isLoading={externalForm.isPending}
              disabled={!externalForm.title.trim() || !externalForm.url.trim()}
            >
              {t('calendar.external.save', { defaultValue: "Ajouter l'agenda externe" })}
            </Button>
          </form>
        )}
        <ul className="list-unstyled m-0">
          {externalCalendars.length === 0 && <li className="small text-gray-700">{emptyLabel}</li>}
          {externalCalendars.map((c) => (
            <CalendarRow
              key={c._id}
              calendar={c}
              checked={!hidden.has(c._id)}
              onToggle={() => onToggle(c._id)}
              actions={
                <Tooltip message={t('calendar.delete', { defaultValue: 'Supprimer' })} placement="top">
                  <IconButton
                    type="button"
                    color="danger"
                    variant="ghost"
                    size="sm"
                    icon={<IconDelete />}
                    aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${c.title}`}
                    onClick={() => onDelete(c)}
                  />
                </Tooltip>
              }
            />
          ))}
        </ul>
      </SidebarSection>
    </aside>
  );
}

export default CalendarSidebar;
