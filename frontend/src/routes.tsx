import { RouteObject, createBrowserRouter } from 'react-router-dom';

import { Agenda } from './screens/Agenda';
import { Root } from './screens/Root';

// Réécrit à la racine du module (`/calendar` en prod). En dev, racine `/`.
export const basename = import.meta.env.PROD ? '/calendar' : '/';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [{ index: true, element: <Agenda /> }],
  },
];

export const router = createBrowserRouter(routes, { basename });
