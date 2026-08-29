# Insurance details are recorded but never priced against

A Patient stores an insurance provider and member ID, because a real clinic collects them. Nothing
in the system reads those fields to change what anyone is charged: every Service has one cash price
and every Patient pays it.

Real adjudication — eligibility checks, coverage percentages, annual maximums, pre-authorisation,
claim submission — is a larger domain than the whole of the rest of this project. A half-modelled
version would be actively misleading, implying a correctness the code does not have.

## Consequences

Invoice totals are the sum of the Services delivered, full stop. If insurance is ever added, it
belongs behind its own boundary with its own vocabulary, not as a discount column on Invoice.
