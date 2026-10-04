import { Alert, Button, Checkbox, IconButton, LoadingScreen, Modal, SearchBar } from '@open-ent/react';
import { IconDelete, IconUser, IconUsers } from '@open-ent/react/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ShareAction, ShareBatch, ShareJson } from '../api';

/** Niveaux de droit (ordre croissant) — communs agenda / événement. */
const LEVELS = [
  { key: 'calendar.read', defaultLabel: 'Lecture' },
  { key: 'calendar.contrib', defaultLabel: 'Contribution' },
  { key: 'calendar.manager', defaultLabel: 'Gestion' },
];

type Kind = 'group' | 'user';
interface Row {
  id: string;
  kind: Kind;
  label: string;
  levels: Set<string>;
}

/** Icône du destinataire : groupe ou personne. */
function RecipientIcon({ kind }: { kind: Kind }) {
  return kind === 'group' ? <IconUsers /> : <IconUser />;
}

/**
 * Partage d'une ressource (agenda OU événement) via le modèle entcore batch.
 * Générique : les fonctions `getShare`/`shareBatch` déterminent la ressource ciblée.
 */
export function ShareDialog({
  resourceId,
  resourceName,
  title,
  getShare,
  shareBatch,
  onClose,
}: {
  resourceId: string;
  resourceName: string;
  title: string;
  getShare: (id: string) => Promise<ShareJson>;
  shareBatch: (id: string, batch: ShareBatch) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const shareQuery = useQuery({
    queryKey: ['calendar', 'share', resourceId],
    queryFn: () => getShare(resourceId),
  });

  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');

  const levelLabel = (key: string, fallback: string) => t(key, { defaultValue: fallback });

  const actionsByLevel = useMemo(() => {
    const m = new Map<string, ShareAction>();
    shareQuery.data?.actions.forEach((a) => m.set(a.displayName, a));
    return m;
  }, [shareQuery.data]);

  const initialRows = useMemo<Row[]>(() => {
    const data = shareQuery.data;
    if (!data) return [];
    const active = (checked: string[], lvl: string) =>
      (actionsByLevel.get(lvl)?.name ?? []).every((n) => checked.includes(n));
    const out: Row[] = [];
    const push = (kind: Kind, id: string, label: string, checked: string[]) =>
      out.push({
        id,
        kind,
        label,
        levels: new Set(LEVELS.map((l) => l.key).filter((k) => active(checked, k))),
      });
    Object.entries(data.groups.checked).forEach(([id, ch]) =>
      push('group', id, data.groups.visibles.find((v) => v.id === id)?.name ?? id, ch),
    );
    Object.entries(data.users.checked).forEach(([id, ch]) =>
      push('user', id, data.users.visibles.find((v) => v.id === id)?.username ?? id, ch),
    );
    return out;
  }, [shareQuery.data, actionsByLevel]);

  const current = rows ?? initialRows;

  const candidates = useMemo(() => {
    const data = shareQuery.data;
    if (!data || search.trim().length < 1) return [];
    const q = search.trim().toLowerCase();
    const present = new Set(current.map((r) => r.id));
    const groups = data.groups.visibles
      .filter((g) => !present.has(g.id) && (g.name ?? '').toLowerCase().includes(q))
      .map((g) => ({ id: g.id, kind: 'group' as Kind, label: g.name ?? g.id }));
    const users = data.users.visibles
      .filter((u) => !present.has(u.id) && (u.username ?? '').toLowerCase().includes(q))
      .map((u) => ({ id: u.id, kind: 'user' as Kind, label: u.username ?? u.id }));
    return [...groups, ...users].slice(0, 12);
  }, [shareQuery.data, search, current]);

  const toggleLevel = (id: string, lvl: string) =>
    setRows(
      current.map((r) => {
        if (r.id !== id) return r;
        const levels = new Set(r.levels);
        if (levels.has(lvl)) levels.delete(lvl);
        else levels.add(lvl);
        return { ...r, levels };
      }),
    );
  const addRecipient = (c: { id: string; kind: Kind; label: string }) => {
    setRows([...current, { ...c, levels: new Set(['calendar.read']) }]);
    setSearch('');
  };
  const removeRow = (id: string) => setRows(current.filter((r) => r.id !== id));

  const saveMut = useMutation({
    mutationFn: async () => {
      const batch = {
        users: {} as Record<string, string[]>,
        groups: {} as Record<string, string[]>,
        bookmarks: {},
      };
      current.forEach((r) => {
        if (r.levels.size === 0) return;
        const acts = new Set<string>();
        r.levels.forEach((lvl) =>
          (actionsByLevel.get(lvl)?.name ?? []).forEach((n) => acts.add(n)),
        );
        (r.kind === 'group' ? batch.groups : batch.users)[r.id] = [...acts];
      });
      await shareBatch(resourceId, batch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'share', resourceId] });
      onClose();
    },
  });

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{title}</Modal.Header>
      <Modal.Subtitle>{resourceName}</Modal.Subtitle>
      <Modal.Body>
        {shareQuery.isLoading && <LoadingScreen position={false} />}
        {shareQuery.isError && (
          <Alert type="warning">{t('calendar.error', { defaultValue: 'Une erreur est survenue.' })}</Alert>
        )}

        {shareQuery.data && (
          <>
            <div className="mb-16 position-relative">
              <SearchBar
                size="md"
                isVariant
                value={search}
                placeholder={t('calendar.share.search', {
                  defaultValue: 'Rechercher un groupe ou une personne…',
                })}
                onChange={(e) => setSearch(e.target.value)}
              />
              {candidates.length > 0 && (
                <ul className="agenda-suggestions list-unstyled mt-2 mb-0">
                  {candidates.map((c) => (
                    <li key={`${c.kind}-${c.id}`}>
                      <button
                        type="button"
                        className="btn btn-ghost-tertiary d-flex align-items-center gap-8 text-start w-100 px-12 py-8"
                        onClick={() => addRecipient(c)}
                      >
                        <RecipientIcon kind={c.kind} />
                        {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {current.length === 0 ? (
              <p className="text-gray-700">
                {t('calendar.share.empty', {
                  defaultValue: 'Aucun partage. Recherchez un destinataire ci-dessus.',
                })}
              </p>
            ) : (
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th scope="col">{t('calendar.share.recipient', { defaultValue: 'Destinataire' })}</th>
                    {LEVELS.map((l) => (
                      <th scope="col" key={l.key} className="text-center">
                        {levelLabel(l.key, l.defaultLabel)}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="visually-hidden">
                        {t('calendar.delete', { defaultValue: 'Supprimer' })}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((r) => (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td>
                        <span className="d-flex align-items-center gap-8">
                          <RecipientIcon kind={r.kind} />
                          {r.label}
                        </span>
                      </td>
                      {LEVELS.map((l) => (
                        <td key={l.key} className="text-center">
                          <Checkbox
                            checked={r.levels.has(l.key)}
                            aria-label={`${r.label} — ${levelLabel(l.key, l.defaultLabel)}`}
                            onChange={() => toggleLevel(r.id, l.key)}
                          />
                        </td>
                      ))}
                      <td className="text-end">
                        <IconButton
                          type="button"
                          color="danger"
                          variant="ghost"
                          size="sm"
                          icon={<IconDelete />}
                          aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${r.label}`}
                          onClick={() => removeRow(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {saveMut.isError && (
              <Alert type="warning" className="mt-16">
                {t('calendar.error', { defaultValue: 'Une erreur est survenue.' })}
              </Alert>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color="primary"
          variant="filled"
          isLoading={saveMut.isPending}
          disabled={!shareQuery.data}
          onClick={() => saveMut.mutate()}
        >
          {t('calendar.share.submit', { defaultValue: 'Partager' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ShareDialog;
