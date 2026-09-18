// The route table.
//
// Public routes sit under `PublicLayout`, which carries the nav and footer;
// anything a patient's own data appears on sits under `RequireAuth`. Nesting is
// what makes both structural rather than a check each screen has to remember to
// perform — a route added inside the guarded branch is guarded because of where
// it is written.
//
// The booking flow is public up to its last step: availability is public, and a
// visitor should reach a real time before being asked who they are. The confirm
// step asks for sign-in itself, carrying the whole booking in its URL.

import { createBrowserRouter } from 'react-router'
import AdminCalendar from './admin/AdminCalendar'
import AdminTimeOff from './admin/AdminTimeOff'
import AdminWorkingHours from './admin/AdminWorkingHours'
import AdminHome from './routes/AdminHome'
import { RequireAuth } from './auth/RequireAuth'
import PublicLayout from './routes/PublicLayout'
import Book from './booking/Book'
import BookingConfirmed from './routes/BookingConfirmed'
import Home from './routes/Home'
import Services from './routes/Services'
import Dentists from './routes/Dentists'
import MyAppointments from './routes/MyAppointments'
import NotFound from './routes/NotFound'
import Profile from './routes/Profile'
import Reschedule from './reschedule/Reschedule'
import SignIn from './routes/SignIn'
import SignUp from './routes/SignUp'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/services', element: <Services /> },
      { path: '/dentists', element: <Dentists /> },
      { path: '/book', element: <Book /> },
      // Nested rather than a sibling list: a patient's own data still gets
      // the nav and footer, which the standalone version of this route did
      // not — the critique's complaint, closed by nesting rather than by
      // each guarded screen carrying its own chrome.
      {
        element: <RequireAuth />,
        children: [
          { path: '/appointments', element: <MyAppointments /> },
          { path: '/appointments/:id/confirmed', element: <BookingConfirmed /> },
          { path: '/appointments/:id/reschedule', element: <Reschedule /> },
          { path: '/profile', element: <Profile /> },
        ],
      },
      // Last, and public: an unknown URL is not a reason to ask who someone is.
      { path: '*', element: <NotFound /> },
    ],
  },
  // Outside `PublicLayout` too: the clinic's own nav has nothing an admin
  // wants, the same reasoning that keeps sign-in and sign-up out of it. Phase
  // 7's later screens — the calendar, working hours, time off, closures,
  // confirm/complete/no-show — nest under this same guard.
  {
    element: <RequireAuth roles={['ADMIN']} />,
    children: [
      { path: '/admin', element: <AdminHome /> },
      { path: '/admin/calendar', element: <AdminCalendar /> },
      { path: '/admin/working-hours', element: <AdminWorkingHours /> },
      { path: '/admin/time-off', element: <AdminTimeOff /> },
    ],
  },
  // Outside `PublicLayout`: a screen whose whole job is one short form does
  // not want a nav offering four ways to leave it. Both carry `?next=`.
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-up', element: <SignUp /> },
])
