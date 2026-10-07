import { Editor, type EditorInstance } from '@open-ent/react/editor';

/**
 * Éditeur riche de la description.
 *
 * Importé DIRECTEMENT, et non en `lazy` : suspendre à l'intérieur de la fenêtre modale du socle,
 * dont l'ouverture est animée par react-spring, lève une erreur React #321 et laisse la fenêtre
 * entière non rendue. C'est l'ouverture des écrans qui le consomment qui est différée, depuis
 * `Agenda` — la frontière `Suspense` est alors hors de toute modale.
 */

/**
 * Contenu initial de l'éditeur. Une chaîne VIDE le fait planter — erreur React #321 (appel de hook
 * invalide) levée depuis le paquet de l'éditeur, qui laisse la fenêtre entière non rendue : le
 * parcours « Nouvel événement » devenait inutilisable. On lui passe donc un paragraphe vide.
 */
function initialContent(content: string): string {
  return content && content.trim() ? content : '<p></p>';
}

export interface DescriptionEditorProps {
  content: string;
  /** `edit` pour saisir, `read` pour afficher le HTML existant. */
  mode: 'edit' | 'read';
  id?: string;
  onChange?: (html: string) => void;
}

export function DescriptionEditor({ content, mode, id, onChange }: DescriptionEditorProps) {
  return (
    <>
      <Editor
        id={id}
        content={initialContent(content)}
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
    </>
  );
}

export default DescriptionEditor;
