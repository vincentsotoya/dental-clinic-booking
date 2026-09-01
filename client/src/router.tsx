// The route table.
//
// Public routes sit at the top level; anything a patient's own data appears on
// sits under `RequireAuth`. Nesting is what makes that structural rather than
// a check each screen has to remember to perform — a route added inside the
// guarded branch is guarded because of where it is written.
//
// Home, Services, Dentists and the booking flow are their own task; this table
// grows a line each as they arrive.

import { createBrowserRouter } from 'react-router'
import App from './App'
import { RequireAuth } from './auth/RequireAuth'
import MyAppointments from './routes/MyAppointments'
import SignIn from './routes/SignIn'

export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/sign-in', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [{ path: '/appointments', element: <MyAppointments /> }],
  },
])
