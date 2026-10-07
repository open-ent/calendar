import { LoadingScreen } from '@open-ent/react';
import type { EditorInstance } from '@open-ent/react/editor';
import { lazy, Suspense } from 'react';

/**
 * Éditeur riche de la description, chargé à la demande.
 *
 * `@open-ent/react/editor` embarque tiptap et ses extensions : plus d'un méga-octet, pour une
 * fonction qui ne sert qu'à l'ouverture d'un formulaire ou d'une fiche d'événement. Le charger
 * paresseusement garde le bundle de l'agenda léger, la grille étant ce qu'on affiche en premier.
 */
const Editor = lazy(() =>
  import('@open-ent/react/editor').then((m) => ({ default: m.Editor })),
);

export interface DescriptionEditorProps {
  content: string;
  /** `edit` pour saisir, `read` pour afficher le HTML existant. */
  mode: 'edit' | 'read';
  id?: string;
  onChange?: (html: string) => void;
}

export function DescriptionEditor({ content, mode, id, onChange }: DescriptionEditorProps) {
  return (
    <Suspense fallback={<LoadingScreen position={false} />}>
      <Editor
        id={id}
        content={content}
        mode={mode}
        focus={false}
        variant={mode === 'read' ? 'ghost' : 'outline'}
        visibility="protected"
        onContentChange={
          onChange
            ? ({ editor }: { editor: EditorInstance }) =>
                onChange(editor.isEmpty ? '' : editor.getHTML())
            : undefined
        }
      />
    </Suspense>
  );
}

export default DescriptionEditor;
