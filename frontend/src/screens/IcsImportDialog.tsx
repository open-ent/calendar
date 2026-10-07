import { Alert, Button, Modal, Table } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, IcsImportReport } from '../api';
import { formatDateTime, readableCause } from '../utils';

/**
 * Import d'un fichier iCalendar dans un agenda (`PUT /calendar/:id/ical`), suivi du compte
 * rendu : nombre d'événements créés et tableau de ceux que le serveur a refusés, avec la cause.
 * Même enchaînement que les deux lightbox « Import ICS » / « Rapport d'import » de l'AngularJS.
 */
export function IcsImportDialog({ calendar, onClose }: { calendar: Calendar; onClose: () => void }) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();

  const [fileName, setFileName] = useState('');
  const [ics, setIcs] = useState('');
  const [report, setReport] = useState<IcsImportReport | null>(null);

  const importMut = useMutation({
    mutationFn: () => api.importIcal(calendar._id, ics),
    onSuccess: (result) => {
      setReport(result);
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
    },
  });

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIcs(await file.text());
  };

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('calendar.import', { defaultValue: 'Importer' })}
      </Modal.Header>
      <Modal.Subtitle>{calendar.title}</Modal.Subtitle>
      <Modal.Body>
        {report ? (
          <>
            <Alert type={report.invalidEvents.length > 0 ? 'warning' : 'success'} className="mb-16">
              {report.createdEvents}{' '}
              {t('calendar.events.properly.imported', {
                defaultValue: 'événement(s) correctement importé(s)',
              })}
            </Alert>

            {report.invalidEvents.length > 0 && (
              <>
                <p className="fw-bold">
                  {report.invalidEvents.length}{' '}
                  {t('calendar.events.not.imported', { defaultValue: 'événement(s) non importé(s)' })}
                </p>
                <Table>
                  <thead>
                    <tr>
                      <th scope="col">{t('calendar.event.title', { defaultValue: 'Titre' })}</th>
                      <th scope="col">
                        {t('calendar.event.start.date', { defaultValue: 'Début' })}
                      </th>
                      <th scope="col">{t('calendar.event.end.date', { defaultValue: 'Fin' })}</th>
                      <th scope="col">
                        {t('calendar.event.error.cause', { defaultValue: 'Cause' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.invalidEvents.map((e, i) => (
                      <tr key={`${e.title ?? ''}-${e.startMoment ?? ''}-${i}`}>
                        <td>
                          {e.title || t('calendar.ical.event.no.title', { defaultValue: '(Sans titre)' })}
                        </td>
                        <td>{formatDateTime(e.startMoment)}</td>
                        <td>{formatDateTime(e.endMoment)}</td>
                        <td>
                          {readableCause(e.errorCause, (key) => t(key, { defaultValue: '' }))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </>
        ) : (
          <>
            <label className="form-label" htmlFor="ics-file">
              {t('calendar.ics.file.to.import', { defaultValue: 'Sélectionner un fichier iCal' })}
            </label>
            <input
              id="ics-file"
              type="file"
              accept=".ics,text/calendar"
              className="form-control"
              onChange={onPickFile}
            />
            {fileName && <p className="small text-gray-700 mt-8 mb-0">{fileName}</p>}

            {importMut.isError && (
              <Alert type="warning" className="mt-16">
                {t('calendar.notify.icsImportError', {
                  defaultValue: "Erreur d'importation du fichier ICS",
                })}
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {report
            ? t('calendar.close', { defaultValue: 'Fermer' })
            : t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        {!report && (
          <Button
            type="button"
            color="primary"
            variant="filled"
            isLoading={importMut.isPending}
            disabled={!ics}
            onClick={() => importMut.mutate()}
          >
            {t('calendar.import', { defaultValue: 'Importer' })}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default IcsImportDialog;
