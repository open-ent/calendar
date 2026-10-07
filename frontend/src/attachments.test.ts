import { describe, expect, it } from 'vitest';

import { EventAttachment } from './api';
import {
  addAttachments,
  addResource,
  attachmentLabel,
  decodeFileName,
  flattenOwner,
  parseMediacentreFrames,
  repairAttachment,
  toAttachment,
  toResource,
} from './attachments';

describe('propriétaire imbriqué des pièces jointes', () => {
  it('remet à plat un owner imbriqué, tel qu’on en trouve en base', () => {
    // Forme réellement observée sur l'ENT local : cinq niveaux d'emboîtement.
    const owner = {
      userId: {
        userId: {
          userId: { userId: { userId: 'ec847027', displayName: 'SHAFY001 Emaël' } },
        },
      },
    };
    expect(flattenOwner(owner)).toEqual({ userId: 'ec847027', displayName: 'SHAFY001 Emaël' });
  });

  it('accepte un owner déjà sain', () => {
    expect(flattenOwner({ userId: 'u1', displayName: 'Alice' })).toEqual({
      userId: 'u1',
      displayName: 'Alice',
    });
  });

  it('accepte un owner réduit à une chaîne', () => {
    expect(flattenOwner('u1')).toEqual({ userId: 'u1', displayName: '' });
  });

  it('ne boucle pas sur une donnée absurde', () => {
    expect(flattenOwner(undefined)).toEqual({ userId: '', displayName: '' });
    expect(flattenOwner({})).toEqual({ userId: '', displayName: '' });
  });

  it('répare la pièce jointe sans toucher au reste', () => {
    const a = {
      _id: 'd1',
      name: 'Birdie',
      metadata: { filename: 'Birdie.jpg' },
      owner: { userId: { userId: 'u1', displayName: 'Alice' } },
    } as EventAttachment;
    const repaired = repairAttachment(a);
    expect(repaired.owner).toEqual({ userId: 'u1', displayName: 'Alice' });
    expect(repaired.name).toBe('Birdie');
    expect(repaired.metadata).toEqual({ filename: 'Birdie.jpg' });
  });
});

describe('ajout de pièces jointes', () => {
  const file = (id: string) => ({ _id: id, name: `f${id}`, eType: 'file', owner: 'u1' });

  it('construit la forme attendue par le backend', () => {
    const a = toAttachment(file('d1'))!;
    expect(a._id).toBe('d1');
    expect(a.link).toBe('/workspace/document/d1');
    expect(a.owner).toEqual({ userId: 'u1', displayName: '' });
    expect(a.shared).toEqual([]);
  });

  it('ignore un fichier sans identifiant', () => {
    expect(toAttachment({ name: 'orphelin' })).toBeNull();
  });

  it('n’ajoute pas deux fois le même document et compte les doublons', () => {
    const existing = [toAttachment(file('d1'))!];
    const r = addAttachments(existing, [toAttachment(file('d1'))!, toAttachment(file('d2'))!]);
    expect(r.attachments.map((a) => a._id)).toEqual(['d1', 'd2']);
    expect(r.added).toBe(1);
    expect(r.duplicates).toBe(1);
  });

  it('dédoublonne aussi à l’intérieur d’une même sélection', () => {
    const r = addAttachments([], [toAttachment(file('d1'))!, toAttachment(file('d1'))!]);
    expect(r.attachments).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });
});

describe('nom de fichier', () => {
  it('décode un nom encodé', () => {
    expect(decodeFileName('Compte%20rendu.pdf')).toBe('Compte rendu.pdf');
  });

  it('laisse tel quel un encodage bancal plutôt que d’échouer', () => {
    expect(decodeFileName('100%.pdf')).toBe('100%.pdf');
  });

  it('préfère le nom de fichier au titre', () => {
    const a = { _id: 'd1', name: 'Birdie', metadata: { filename: 'Birdie%20(1).jpg' } } as EventAttachment;
    expect(attachmentLabel(a)).toBe('Birdie (1).jpg');
    expect(attachmentLabel({ _id: 'd2', name: 'Sans méta' } as EventAttachment)).toBe('Sans méta');
  });
});

describe('ressources du médiacentre', () => {
  it('ramène une ressource à ce que le backend stocke', () => {
    const r = toResource({ id: 'ark:/1', title: 'Manuel', link: 'https://x', image: 'https://i' })!;
    expect(r).toEqual({
      type: 'mediacentre',
      id: 'ark:/1',
      name: 'Manuel',
      url: 'https://x',
      image: 'https://i',
    });
  });

  it('se rabat sur le lien quand il n’y a pas d’identifiant', () => {
    expect(toResource({ title: 'Sans id', link: 'https://x' })?.id).toBe('https://x');
    expect(toResource({})).toBeNull();
  });

  it('n’ajoute pas deux fois la même ressource', () => {
    const r1 = toResource({ id: 'a', title: 'A' })!;
    const first = addResource([], r1);
    expect(first.added).toBe(true);
    const second = addResource(first.resources, r1);
    expect(second.added).toBe(false);
    expect(second.resources).toHaveLength(1);
  });
});

describe('réponse du médiacentre', () => {
  it('agrège les ressources de plusieurs sources', () => {
    const r = parseMediacentreFrames([
      { status: 'ok', data: { resources: [{ id: '1' }, { id: '2' }] } },
      { status: 'ok', data: { resources: [{ id: '3' }] } },
    ]);
    expect(r.resources).toHaveLength(3);
    expect(r.allFailed).toBe(false);
  });

  it('distingue « aucun résultat » de « recherche en échec »', () => {
    // Cas réellement observé en local : les quatre sources en erreur (index injoignable).
    const ko = parseMediacentreFrames([
      { status: 'ko', error: { source: 'fr.openent.mediacentre.source.GAR', error: 'refusée' } },
      { status: 'ko', error: { source: 'fr.openent.mediacentre.source.PMB', error: 'refusée' } },
    ]);
    expect(ko.allFailed).toBe(true);
    expect(ko.failedSources).toEqual(['GAR', 'PMB']);

    const vide = parseMediacentreFrames([{ status: 'ok', data: { resources: [] } }]);
    expect(vide.allFailed).toBe(false);
    expect(vide.resources).toEqual([]);
  });

  it('tolère une réponse vide ou inattendue', () => {
    expect(parseMediacentreFrames([]).allFailed).toBe(false);
    expect(parseMediacentreFrames([{}]).resources).toEqual([]);
  });
});
