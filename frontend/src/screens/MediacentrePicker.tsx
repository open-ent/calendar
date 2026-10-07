import { Alert, Button, LoadingScreen, Modal, SearchBar } from '@open-ent/react';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, EventResource, MediacentreResource } from '../api';
import { MediacentreSearchResult, parseMediacentreFrames, toResource } from '../attachments';

export interface MediacentrePickerProps {
  /** Ressources déjà attachées, pour signaler celles qui le sont déjà. */
  attached: EventResource[];
  onAdd: (resource: EventResource) => boolean;
  onClose: () => void;
}

/**
 * Recherche et ajout de ressources du médiacentre. La fenêtre reste ouverte après un ajout,
 * pour en enchaîner plusieurs — c'est le comportement de la lightbox AngularJS.
 */
export function MediacentrePicker({ attached, onAdd, onClose }: MediacentrePickerProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MediacentreSearchResult | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const searchMut = useMutation({
    mutationFn: async (q: string) => parseMediacentreFrames(await api.searchMediacentre(q)),
    onSuccess: setResult,
  });

  const search = () => {
    const q = query.trim();
    if (!q) return;
    setJustAdded(null);
    searchMut.mutate(q);
  };

  const isAttached = (r: MediacentreResource) => {
    const id = r.id != null ? String(r.id) : r.link || r.title || '';
    return attached.some((a) => a.type === 'mediacentre' && String(a.id) === id);
  };

  const add = (r: MediacentreResource) => {
    const resource = toResource(r);
    if (!resource) return;
    const added = onAdd(resource);
    setJustAdded(
      added
        ? t('calendar.event.resources.mediacentre.added', { defaultValue: 'Ressource ajoutée.' })
        : t('calendar.event.attachment.already.added', {
            defaultValue: 'Cette ressource est déjà attachée.',
          }),
    );
  };

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('calendar.event.resources.add.mediacentre', {
          defaultValue: 'Ajouter une ressource du médiacentre',
        })}
      </Modal.Header>
      <Modal.Body>
        <form
          className="d-flex gap-8 align-items-start mb-16"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div className="flex-fill">
            <SearchBar
              size="md"
              isVariant
              value={query}
              placeholder={t('calendar.event.resources.mediacentre.search.placeholder', {
                defaultValue: 'Rechercher une ressource dans le médiacentre',
              })}
              onChange={(e) => setQuery(e.target.value)}
              // La SearchBar « variante » du socle n'émet pas de soumission : la touche Entrée
              // ne déclencherait rien sans ce relais.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
            />
          </div>
          <Button
            type="submit"
            color="primary"
            variant="filled"
            isLoading={searchMut.isPending}
            disabled={!query.trim()}
          >
            {t('calendar.event.resources.mediacentre.search', { defaultValue: 'Rechercher' })}
          </Button>
        </form>

        {justAdded && (
          <Alert type="info" className="mb-16">
            {justAdded}
          </Alert>
        )}

        {searchMut.isPending && <LoadingScreen position={false} />}

        {searchMut.isError && (
          <Alert type="warning">
            {t('calendar.event.resources.mediacentre.error', {
              defaultValue: 'La recherche dans le médiacentre a échoué.',
            })}
          </Alert>
        )}

        {/* Toutes les sources en erreur : ce n'est pas « aucun résultat », c'est une panne —
            médiacentre non configuré ou index injoignable. Le dire évite un vide trompeur. */}
        {result?.allFailed && (
          <Alert type="warning">
            {t('calendar.event.resources.mediacentre.sources.down', {
              defaultValue:
                'Aucune source du médiacentre n’a répondu ([[sources]]). La recherche n’a pas pu aboutir.',
              sources: result.failedSources.join(', '),
            })}
          </Alert>
        )}

        {result && !result.allFailed && result.resources.length === 0 && !searchMut.isPending && (
          <p className="text-gray-700">
            {t('calendar.event.resources.mediacentre.noresult', {
              defaultValue: 'Aucune ressource trouvée.',
            })}
          </p>
        )}

        {!result && !searchMut.isPending && (
          <p className="text-gray-700">
            {t('calendar.event.resources.mediacentre.empty', {
              defaultValue: 'Saisissez un terme puis lancez la recherche.',
            })}
          </p>
        )}

        {result && result.resources.length > 0 && (
          <>
            {result.failedSources.length > 0 && (
              <p className="small text-gray-700">
                {t('calendar.event.resources.mediacentre.partial', {
                  defaultValue: 'Certaines sources n’ont pas répondu ([[sources]]).',
                  sources: result.failedSources.join(', '),
                })}
              </p>
            )}
            <ul className="list-unstyled m-0 d-flex flex-column gap-8">
              {result.resources.map((r, i) => (
                <li
                  key={`${r.id ?? r.link ?? i}`}
                  className="card bg-white p-8 d-flex flex-row align-items-center justify-content-between gap-8"
                >
                  <span className="d-flex align-items-center gap-8 overflow-hidden">
                    {r.image && (
                      <img src={r.image} alt="" aria-hidden className="agenda-resource-thumb" />
                    )}
                    <span className="text-truncate">{r.title || r.link}</span>
                  </span>
                  <Button
                    type="button"
                    color="tertiary"
                    variant="outline"
                    size="sm"
                    disabled={isAttached(r)}
                    onClick={() => add(r)}
                  >
                    {isAttached(r)
                      ? t('calendar.event.resources.attached', { defaultValue: 'Déjà ajoutée' })
                      : t('calendar.add', { defaultValue: 'Ajouter' })}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.close', { defaultValue: 'Fermer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default MediacentrePicker;
