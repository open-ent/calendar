import { Button } from '@open-ent/react';
import { IconCalendar } from '@open-ent/react/icons';
import { ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { downloadIcs, googleCalendarUrl, outlookCalendarUrl, toShareable } from '../addToCalendar';
import { CalendarEvent } from '../api';

/* Pictogrammes des trois agendas, dessinés ici (pas de dépendance) : ils servent seulement à
   reconnaître la cible d'un coup d'œil. */
const GoogleIcon = () => (
  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <rect x="3" y="3" width="34" height="34" rx="5" fill="#fff" stroke="#dadce0" />
    <path d="M3 30h7v7H8a5 5 0 0 1-5-5z" fill="#1e8e3e" />
    <path d="M30 3h2a5 5 0 0 1 5 5v2h-7z" fill="#1967d2" />
    <path d="M30 10h7v20h-7z" fill="#fbbc04" />
    <path d="M10 30h20v7H10z" fill="#34a853" />
    <path d="M30 30h7l-7 7z" fill="#ea4335" />
    <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a73e8" fontFamily="Arial, sans-serif">
      31
    </text>
  </svg>
);

const AppleIcon = ({ day }: { day: number }) => (
  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <rect x="3" y="3" width="34" height="34" rx="7" fill="#fff" stroke="#d1d1d6" />
    <path d="M3 10a7 7 0 0 1 7-7h20a7 7 0 0 1 7 7v2H3z" fill="#ff3b30" />
    <text x="20" y="31" textAnchor="middle" fontSize="16" fill="#1c1c1e" fontFamily="-apple-system, Helvetica, Arial, sans-serif">
      {day}
    </text>
  </svg>
);

const OutlookIcon = () => (
  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <rect x="14" y="6" width="23" height="28" rx="3" fill="#28a8ea" />
    <path d="M14 18l11.5 7L37 18v13a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#0078d4" />
    <rect x="3" y="11" width="19" height="19" rx="3" fill="#0a5fb4" />
    <ellipse cx="12.5" cy="20.5" rx="4.5" ry="5.5" fill="none" stroke="#fff" strokeWidth="2.4" />
  </svg>
);

function Tile({ icon, label, href, onClick }: { icon: ReactNode; label: string; href?: string; onClick?: () => void }) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
    </>
  );
  return href ? (
    <a className="add-to-calendar-tile" href={href} target="_blank" rel="noopener noreferrer" data-add-to-calendar={label}>
      {content}
    </a>
  ) : (
    <button type="button" className="add-to-calendar-tile" onClick={onClick} data-add-to-calendar={label}>
      {content}
    </button>
  );
}

/**
 * « Ajouter à mon agenda » : un bouton qui déplie, dans la fiche de l'événement, les trois
 * agendas courants. Un clic ouvre l'agenda choisi sur l'événement pré-rempli (Google, Outlook)
 * ou télécharge le fichier que Calendrier propose d'ajouter (Apple). Pas de modale imbriquée :
 * le panneau se déplie à l'intérieur de celle de l'événement.
 *
 * Les valeurs envoyées sont celles de l'événement ENREGISTRÉ, pas d'éventuelles modifications
 * en cours dans le formulaire.
 */
export function AddToCalendar({ event }: { event: CalendarEvent }) {
  const { t } = useTranslation(['calendar', 'common']);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const shareable = toShareable(event);

  return (
    <div className="add-to-calendar mb-12">
      <Button
        type="button"
        color="secondary"
        variant="ghost"
        leftIcon={<IconCalendar />}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {t('calendar.addto.button', { defaultValue: 'Ajouter à mon agenda' })}
      </Button>

      {open && (
        <div id={panelId} className="add-to-calendar-panel" role="group" aria-label={t('calendar.addto.button', { defaultValue: 'Ajouter à mon agenda' })}>
          <p className="small text-gray-700 mb-12">
            {t('calendar.addto.help', {
              defaultValue: 'Ajoutez cet événement à votre agenda personnel pour ne pas l’oublier.',
            })}
          </p>
          <div className="add-to-calendar-tiles">
            <Tile icon={<GoogleIcon />} label="Google" href={googleCalendarUrl(shareable)} />
            <Tile icon={<AppleIcon day={shareable.start.getDate()} />} label="Apple" onClick={() => downloadIcs(shareable)} />
            <Tile icon={<OutlookIcon />} label="Outlook" href={outlookCalendarUrl(shareable)} />
          </div>
          <button type="button" className="add-to-calendar-ics" onClick={() => downloadIcs(shareable)} data-add-to-calendar="ics">
            {t('calendar.addto.ics', { defaultValue: 'Autre agenda : télécharger le fichier .ics' })}
          </button>
          {event.isRecurrent && (
            <p className="small text-gray-700 mt-8 mb-0">
              {t('calendar.addto.recurrent', {
                defaultValue: 'Seule cette occurrence est ajoutée, pas toute la série.',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
