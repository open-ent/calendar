import { RouteObject, createHashRouter } from 'react-router-dom';

import { Agenda } from './screens/Agenda';
import { Root } from './screens/Root';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [{ index: true, element: <Agenda /> }],
  },
];

// Hash router : l'app est servie sous `/calendar` (route serveur unique `@Get("")`), le routage se fait
// dans le fragment (`/calendar#/…`). Évite les 404 sur accès direct / rechargement (F5) des sous-routes,
// que le `createBrowserRouter` provoquait faute de fallback SPA côté backend. CCTP 51C.
export const router = createHashRouter(routes);
