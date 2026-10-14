import { Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { Outlet } from 'react-router-dom';

import { setLanguage } from '../locale';

/** Gabarit commun : bandeau ENT du socle, chaque écran posant son propre AppHeader. */
export function Root() {
  const { init, currentLanguage } = useEdificeClient();

  // La locale de formatage des dates suit la langue de la session (cf. locale.ts). Elle est
  // posée pendant le rendu, et non dans un effet : les écrans sont montés sous ce composant
  // et formateraient leurs premières dates en français avant que l'effet ne s'exécute.
  setLanguage(currentLanguage);

  if (!init) return <LoadingScreen position={false} />;

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default Root;
