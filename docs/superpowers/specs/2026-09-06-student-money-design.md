# Student money planning — design

Built 2026-09-06. First slice of the student workstation (INTRO.md §2.1,
"Finance & funding").

## What it answers

Two different questions that students and agents routinely conflate:

1. **Can I afford this course?** Total cost over the whole degree against what
   the student can raise.
2. **Will a visa officer accept my money?** A separate, rule-based check with
   its own threshold, its own cap, and its own holding period.

Answering these together is how applications get refused. They are modelled and
displayed separately.

## Shape

`/student` became a workstation home; course search moved to `/student/find`.
Sections are entries in a route table (`student/StudentApp.tsx`), so adding
applications, documents or a planner is a table row, not another branch.

## Modules

| Module | Responsibility |
|---|---|
| `student/reference.ts` | Living costs, visa fee, health surcharge, maintenance thresholds, work rights. Reached only through accessors. |
| `student/costs.ts` | Cost as a list of typed `CostLine`s over the full course length. |
| `student/funding.ts` | Funding position, permitted work income, maintenance check, currency swing. |
| `student/MoneyPage.tsx` | The section. |
| `student/Workstation.tsx` | The home, composed of panels. |

## Three seams, deliberately placed

1. **Reference data behind accessors.** `reference.ts` exports functions, never
   its tables. Moving these to an API touches that one file.
2. **Cost as a list, not fields.** Adding dependants, an accommodation deposit
   or a second visa application is a new `CostLine`, not a model change.
3. **Routes as data.** New sections are rows in `ROUTES`.

## The honesty rule

Living costs, visa charges and maintenance thresholds are **not crawled**. Every
such figure carries `origin: 'reference'` plus its source and the month it was
checked, and renders visually distinct from a figure read off a university page.
Showing reference data in the same language as cited data would break the
promise the product rests on.

## Deliberately excluded

- **No affordability score.** A named gap ("£4,200 short"), matching the entry
  requirement idiom. A percentage is the black box the spec forbids.
- **Work income is never counted toward maintenance.** Reported separately and
  labelled, because this is the point students are most often misled on.
- **No visa check outside the UK.** `hasVisaRules()` gates it; other countries
  get costs and an explicit "not modelled yet".

## Known limits

- Living cost is charged for 12 months a year. Conservative for an international
  student; the detail line states the assumption so it can be challenged.
- Fixture fees are GBP for every country, so reference costs are GBP throughout.
  Real data needs per-country currency.
- Reference figures are hard-coded and dated. Making them a crawl target — with
  the same provenance as course data — is its own slice.

## Tests

`student/money.test.ts`: multi-year totals, part-time durations, missing fee,
origin separation, named gap, maintenance nine-month cap, the London rate,
tuition already paid, unmodelled countries, currency swing.
