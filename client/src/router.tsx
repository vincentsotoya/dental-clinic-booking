// The route table.
//
// Public routes sit under `PublicLayout`, which carries the nav and footer;
// anything a patient's own data appears on sits under `RequireAuth`. Nesting is
// what makes both structural rather than a check each screen has to remember to
// perform — a route added inside the guarded branch is guarded because of where
// it is written.
//
// The booking flow is its own task; this table grows a line when it arrives.

import { createBrowserRouter } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import PublicLayout from './routes/PublicLayout'
import Home from './routes/Home'
import Services from './routes/Services'
import Dentists from './routes/Dentists'
import MyAppointments from './routes/MyAppointments'
import SignIn from './routes/SignIn'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/services', element: <Services /> },
      { path: '/dentists', element: <Dentists /> },
    ],
  },
  { path: '/sign-in', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [{ path: '/appointments', element: <MyAppointments /> }],
  },
])
