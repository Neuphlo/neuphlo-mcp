# Operating Rules

The hub succeeds only if each record has an owner and teams stop maintaining competing copies.

## Ownership

| Record | Accountable owner | Contributors | Approval expectation |
|---|---|---|---|
| Signal | Submitter until triage | Any function | No approval to submit |
| Customer insight | Product/Research insight owner | Support, Sales, Data | Validate evidence and scope |
| Decision | Named decision owner | Affected functions | Owner accepts; approvers follow local authority |
| Initiative | Product lead | Engineering, Design, GTM | Product lead owns current narrative |
| Release | Release owner | Product, Support, Sales, Marketing | Claims and readiness explicitly approved |
| Brief | Brief owner | Source-record owners | Derived facts must link to sources |

## Cadence

- **Continuous:** Anyone may submit a signal.
- **Weekly:** A cross-functional triage owner closes, links, merges, or promotes new signals.
- **Weekly:** Initiative owners update records only when state, risk, evidence, or next action changed.
- **Before release:** Support, Sales, and Marketing readiness sections are completed from one release packet.
- **Monthly:** Leadership reviews changed outcomes, decisions, risks, and explicit asks.
- **Quarterly:** Archive stale material, review vocabulary, permissions, and usefulness metrics.

## Writing rules

1. Put the conclusion and change summary first.
2. Separate fact, interpretation, decision, and commitment.
3. Name an owner and a review date for anything expected to remain current.
4. Link to source evidence; do not paste sensitive raw customer data.
5. Link to canonical records rather than duplicating their content.
6. State what changed when updating a record.
7. Use explicit uncertainty: `hypothesis`, `low`, `medium`, or `high` confidence.
8. Never turn an unapproved request or forecast into a roadmap promise.

## Triage outcomes

Every inbox signal receives one outcome:

- `linked` — attached as evidence to an existing insight or initiative.
- `promoted` — used to create or strengthen an insight.
- `duplicate` — linked to the canonical signal or insight.
- `deferred` — retained with a review date and reason.
- `closed` — no further action, with a short reason.

Triage is not prioritization. It ensures evidence becomes findable and does not silently disappear.

## Definition of current

A record is considered current when:

- it has an accountable owner;
- its lifecycle status is valid;
- its `updated` date reflects the latest meaningful change;
- its `review_by` date has not passed; and
- its links resolve to canonical records.

MCP validation should report violations without silently inventing missing ownership or approvals.

