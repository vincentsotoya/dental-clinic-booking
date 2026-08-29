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
A person who receives care. Distinct from the User account used to log in — one User, one Patient.
_Avoid_: Client, customer, account

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

### Money

**Invoice**:
A request for payment raised against a Patient once an Appointment is completed. Amounts are
always integer cents.
_Avoid_: Bill, charge, statement
