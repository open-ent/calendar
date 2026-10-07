// Pièces jointes (documents du workspace) et ressources du médiacentre d'un événement.
// Fonctions pures, hors React, pour rester testables.

import { EventAttachment, EventResource, MediacentreFrame, MediacentreResource } from './api';

/**
 * Propriétaire d'une pièce jointe, remis à plat.
 *
 * Les données existantes contiennent des `owner` imbriqués — `owner.userId.userId.userId…` —
 * jusqu'à cinq niveaux : l'IHM AngularJS re-sérialisait la pièce jointe à chaque enregistrement
 * et ré-emboîtait l'objet à chaque fois, jusqu'à faire échouer le backend. Elle ne ré-emboîte
 * plus, mais ne répare pas l'existant : on le fait ici, à l'enregistrement.
 */
export function flattenOwner(owner: unknown): { userId: string; displayName: string } {
  let current: unknown = owner;
  let displayName = '';

  // On descend tant que `userId` est lui-même un objet : la vraie valeur est au fond.
  for (let depth = 0; depth < 20; depth += 1) {
    if (typeof current === 'string') return { userId: current, displayName };
    if (!current || typeof current !== 'object') break;
    const node = current as { userId?: unknown; displayName?: unknown };
    if (typeof node.displayName === 'string' && node.displayName) displayName = node.displayName;
    if (typeof node.userId === 'string') return { userId: node.userId, displayName };
    if (node.userId === undefined) break;
    current = node.userId;
  }
  return { userId: '', displayName };
}

/** Remet à plat le propriétaire d'une pièce jointe sans toucher au reste. */
export function repairAttachment(attachment: EventAttachment): EventAttachment {
  return { ...attachment, owner: flattenOwner(attachment.owner) };
}

/** Élément du workspace tel que le renvoie la médiathèque du socle. */
export interface PickedWorkspaceFile {
  _id?: string;
  name?: string;
  title?: string;
  created?: unknown;
  eParent?: string | null;
  eType?: string;
  metadata?: Record<string, unknown>;
  version?: number;
  owner?: unknown;
  ownerName?: string;
}

/**
 * Convertit un fichier choisi dans la médiathèque en pièce jointe d'événement, dans la forme
 * qu'attend le backend (celle que produisait `Document.toJSON()` côté AngularJS).
 */
export function toAttachment(file: PickedWorkspaceFile): EventAttachment | null {
  if (!file?._id) return null;
  const name = file.name ?? file.title ?? '';
  return {
    _id: file._id,
    name,
    title: file.title ?? name,
    created: typeof file.created === 'string' ? file.created : new Date().toISOString(),
    eParent: file.eParent ?? null,
    eType: file.eType ?? 'file',
    metadata: file.metadata ?? {},
    version: file.version ?? 0,
    link: `/workspace/document/${file._id}`,
    icon: `/workspace/document/${file._id}`,
    owner: {
      userId: flattenOwner(file.owner).userId,
      displayName: file.ownerName ?? flattenOwner(file.owner).displayName,
    },
    shared: [],
  };
}

/** Ajoute les nouvelles pièces jointes, en ignorant celles déjà présentes (même `_id`). */
export function addAttachments(
  current: EventAttachment[],
  incoming: EventAttachment[],
): { attachments: EventAttachment[]; added: number; duplicates: number } {
  const seen = new Set(current.map((a) => a._id));
  const toAdd: EventAttachment[] = [];
  let duplicates = 0;
  incoming.forEach((a) => {
    if (seen.has(a._id)) {
      duplicates += 1;
      return;
    }
    seen.add(a._id);
    toAdd.push(a);
  });
  return { attachments: [...current, ...toAdd], added: toAdd.length, duplicates };
}

/** Le nom de fichier est stocké encodé : on le rend lisible, sans échouer sur un encodage bancal. */
export function decodeFileName(filename: string | undefined): string {
  if (!filename) return '';
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

/** Nom affichable d'une pièce jointe : le nom du fichier, sinon son titre. */
export function attachmentLabel(attachment: EventAttachment): string {
  const filename = attachment.metadata?.filename;
  return decodeFileName(typeof filename === 'string' ? filename : undefined) || attachment.name || attachment.title || attachment._id;
}

/** Une ressource du médiacentre, ramenée à ce que le backend stocke. */
export function toResource(resource: MediacentreResource): EventResource | null {
  const id = resource.id != null ? String(resource.id) : resource.link || resource.title;
  if (!id) return null;
  return {
    type: 'mediacentre',
    id,
    name: resource.title || resource.link || id,
    url: resource.link || resource.url || '',
    image: resource.image || '',
  };
}

/** Ajoute une ressource si elle n'est pas déjà attachée. */
export function addResource(
  current: EventResource[],
  resource: EventResource,
): { resources: EventResource[]; added: boolean } {
  const already = current.some((r) => r.type === resource.type && String(r.id) === String(resource.id));
  if (already) return { resources: current, added: false };
  return { resources: [...current, resource], added: true };
}

/** Résultat d'une recherche médiacentre : ressources trouvées et sources en échec. */
export interface MediacentreSearchResult {
  resources: MediacentreResource[];
  /** Sources qui ont répondu en erreur (médiacentre non configuré, index injoignable…). */
  failedSources: string[];
  /** Toutes les sources interrogées ont échoué : la recherche n'a pas pu aboutir. */
  allFailed: boolean;
}

/**
 * Agrège les trames renvoyées par `/mediacentre/search`. Chaque source répond sa propre trame :
 * soit `{status:'ok', data:{resources}}`, soit `{status:'ko', error:{source, error}}`. Distinguer
 * « aucun résultat » de « la recherche a échoué » évite d'annoncer un vide trompeur.
 */
export function parseMediacentreFrames(frames: MediacentreFrame[]): MediacentreSearchResult {
  const list = Array.isArray(frames) ? frames : [];
  const resources: MediacentreResource[] = [];
  const failedSources: string[] = [];

  list.forEach((frame) => {
    if (frame?.status === 'ko' || frame?.error) {
      const source = frame?.error?.source ?? '';
      failedSources.push(source.split('.').pop() || source);
      return;
    }
    (frame?.data?.resources ?? []).forEach((r) => resources.push(r));
  });

  return {
    resources,
    failedSources,
    allFailed: list.length > 0 && failedSources.length === list.length,
  };
}
