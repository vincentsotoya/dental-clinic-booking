# Dental Clinic Booking

A single-location dental practice's appointment system: patients browse treatments, book a
genuinely available slot online, and the clinic manages the schedule behind it. All patient data
in this repository is fictional and seeded.

## Language

### People

**Provider**:
Anyone who delivers care to a patient and therefore occupies a schedule of their own. Has a type:
`DENTIST` or `HYGIENIST`.
_Avoid_: Practitioner, Staff, Doctor, and — as a catch-all for anyone clinical — Dentist

**Dentist**:
A Provider of type `DENTIST`. Never a synonym for Provider in general.

**Hygienist**:
A Provider of type `HYGIENIST`. Delivers cleanings on an independent schedule; does not need a
Dentist present to be booked.

**Patient**:
A person who receives care. Distinct from the User account used to log in: a Patient has at most
one User, and may have none — the clinic charts walk-ins who never register.
_Avoid_: Client, customer, account

**User**:
A login identity. Carries a role and nothing clinical. A User with the patient role has exactly one
Patient; an Admin has none.
_Avoid_: Account, login, profile, member

**Admin**:
A User who runs the clinic's schedule — the front desk. Not a Provider: an Admin delivers no care
and occupies no schedule of their own, and a Provider does not automatically have a login.
_Avoid_: Staff, receptionist, manager, superuser

### Places and time

**Clinic**:
The single physical practice. Owns the operatories, the opening calendar, and one IANA timezone
(`America/New_York`).
_Avoid_: Practice, office, branch, location

**Operatory**:
A treatment room and its chair — a finite, physically bookable resource. An appointment consumes
one for its whole duration.
_Avoid_: Room, chair, surgery, suite

**Working Hours**:
The recurring weekly window during which a specific Provider is available to be booked.
_Avoid_: Shift, schedule, roster

**Time Off**:
A dated range during which one Provider is unavailable. Applies to that Provider only.
_Avoid_: Leave, holiday, absence

**Clinic Closure**:
A dated range during which the whole Clinic is shut and nobody can be booked.
_Avoid_: Holiday, blackout

### Booking

**Service**:
A treatment that can be booked, carrying its own duration, buffer and price. The unit a patient
chooses. Each Service is performed by exactly one type of Provider.
_Avoid_: Treatment, procedure, offering

**Buffer**:
Turnover and sterilisation time after a Service finishes, during which the Operatory and Provider
remain unavailable. Belongs to the Service — a root canal needs more than a checkup.
_Avoid_: Gap, padding, cleanup time

**Recall Interval**:
How many months should pass between a Patient's routine cleanings. What makes a Patient "due".
_Avoid_: Recare, checkup frequency

**Appointment**:
One Patient, one Provider, one Service, in one Operatory, over one time range. Confirmed the
moment it is created — there is no pending or held state.
_Avoid_: Booking, reservation, visit, slot

**Slot**:
A candidate start time that the availability engine has proven bookable, always naming a specific
Provider and Operatory — never "someone, somewhere." Becomes an Appointment only once written. A
Slot is computed, never stored.
_Avoid_: Opening, availability, free time

### Clinical records

**Treatment Record**:
What a Provider did during one completed Appointment, recorded by the Admin who closes the visit
out — the system has no Provider login to write it directly. Carries free-text notes and any Chart
Entries it produced.
_Avoid_: Chart note, visit note, procedure note

**Tooth**:
One of a Patient's 32 permanent teeth, identified by its universal number (1–32).
_Avoid_: FDI number, quadrant — this practice charts adults only, so there is no primary/deciduous
numbering to disambiguate against

**Chart Entry**:
One recorded condition of one Tooth at one point in time — decayed, filled, missing, crowned, and
so on — tied to the Treatment Record that produced it. Append-only: a Tooth's condition changing
is a new entry, never an edit to an old one, the same split as Appointment/AppointmentEvent.
_Avoid_: Update, edit, revision

**Tooth Chart**:
A Patient's current condition, tooth by tooth — the latest Chart Entry for each Tooth, derived and
never its own row.
_Avoid_: Bare "chart" — `getChartId` already uses that word informally for a Patient's whole
record; always say Tooth Chart in full so the two don't collide

**Record Access**:
One instance of an Admin viewing a Patient's Treatment Records or Tooth Chart. Logged on every
view, not only on a write — reading is the sensitive act.
_Avoid_: Audit trail, audit log — both name the mechanism; this names the event it logs

### Money

**Invoice**:
A request for payment raised against a Patient once an Appointment is completed. Amounts are
always integer cents.
_Avoid_: Bill, charge, statement
