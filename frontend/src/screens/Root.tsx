import { Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { Outlet } from 'react-router-dom';

/** Gabarit commun : bandeau ENT du socle, chaque écran posant son propre AppHeader. */
export function Root() {
  const { init } = useEdificeClient();
  if (!init) return <LoadingScreen position={false} />;

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default Root;
