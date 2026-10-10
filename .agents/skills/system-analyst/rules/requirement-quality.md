# Requirement Quality Rules

This document defines quality criteria for requirements and related analysis artifacts.

The quality criteria depend on the artifact type. Do not apply Use Case completeness criteria to Functional Requirements or vice versa.

---

## 1. General quality principles

A good analysis artifact should be:

- unambiguous;
- understandable;
- consistent with domain terminology;
- traceable;
- testable where applicable;
- free from unjustified assumptions;
- sufficiently complete for its artifact type;
- independent from implementation details unless an implementation constraint is explicitly required.

---

# 2. Unambiguous

An artifact is unambiguous when it has one reasonable interpretation.

Avoid vague expressions such as:

- normally;
- quickly;
- appropriately;
- as soon as possible;
- if necessary;
- etc.;
- user-friendly;
- reasonable;
- sufficient.

If the exact meaning is unknown, do not invent it.

Instead:

- identify the ambiguity;
- create an Open Question when clarification is required;
- record the relevant Business Rule when the rule is known.

### Example

Weak:

> The system should quickly process the order.

Better:

> The system shall create the order within 5 seconds after the user submits it.

If the required time is unknown, do not invent `5 seconds`. Create an Open Question.

---

# 3. Atomicity

A Functional Requirement should describe one independently meaningful behavior.

Split a requirement when its parts can be:

- changed independently;
- tested independently;
- traced independently;
- assigned to different business rules;
- accepted or rejected independently.

### Example

Weak:

> The system shall create an order, calculate its price, send an email and generate an invoice.

This may contain several independent behaviors:

- create order;
- calculate order price;
- notify the user;
- generate invoice.

Do not split statements artificially when the behaviors form one inseparable capability.

---

# 4. Testability

A requirement should allow an objective determination of whether it has been satisfied.

Avoid requirements that cannot produce a meaningful pass/fail result.

Weak:

> The system shall provide convenient order management.

Better:

> The system shall allow a manager to cancel an order that has not been shipped.

Acceptance Criteria should provide concrete observable conditions when necessary.

---

# 5. Completeness depends on artifact type

Completeness must be evaluated according to the purpose of the artifact.

Do not require every artifact to contain actors, scenarios, preconditions, postconditions and acceptance criteria.

---

## 5.1 Business Requirement completeness

A Business Requirement should provide, where known:

- the business need, problem or opportunity;
- the desired business outcome;
- the rationale or business value;
- relevant constraints or rules;
- relevant relationships to Functional Requirements;
- relevant Open Questions.

Do not invent business goals or expected outcomes that were not established.

---

## 5.2 Functional Requirement completeness

A Functional Requirement should provide, where applicable:

- the required system behavior;
- the object or subject affected by the behavior;
- relevant conditions under which the behavior applies;
- the expected result;
- applicable Business Rules;
- relevant dependencies;
- relevant Open Questions.

A Functional Requirement does **not** need to contain:

- a complete interaction scenario;
- actor dialogue;
- a main flow;
- alternative flows;
- exception flows;
- detailed preconditions and postconditions.

Those belong primarily to the related Use Case when such a Use Case exists.

### Example

Good FR:

> The system shall prevent cancellation of an order after the order has been shipped.

The detailed interaction can be described by a related Use Case.

---

## 5.3 Use Case completeness

A Use Case should provide, where applicable:

- goal;
- primary actor;
- supporting actors/systems;
- trigger;
- preconditions;
- main scenario;
- alternative scenarios;
- exception scenarios;
- postconditions;
- applicable Business Rules;
- related Functional Requirements;
- relevant Acceptance Criteria;
- relevant Open Questions.

Not every Use Case requires all sections to contain content. If a concept is not applicable, do not invent it.

---

## 5.4 Business Rule completeness

A Business Rule should provide:

- the rule itself;
- the context in which it applies;
- related Functional Requirements and/or Use Cases;
- exceptions where applicable;
- relevant examples where they clarify the rule;
- Open Questions if the rule is not fully established.

A Business Rule should express business policy or logic, not merely repeat a Functional Requirement.

---

## 5.5 Acceptance Criteria completeness

Acceptance Criteria should define observable conditions sufficient to determine whether the related behavior is acceptable.

Use Given/When/Then when it improves clarity:

```text
Given ...
When ...
Then ...
```

Criteria should describe observable behavior rather than implementation details.

---

## 5.6 Open Question completeness

An Open Question should identify:

- the specific unresolved issue;
- why the answer matters;
- related artifacts;
- possible options, when meaningful;
- the final decision once resolved.

Never silently resolve an Open Question by inventing an answer.

---

# 6. Implementation independence

Functional Requirements should describe **what** the system must do rather than **how** it will be implemented.

Avoid implementation details such as:

- database table names;
- class names;
- variable names;
- SQL queries;
- internal algorithms;
- specific API endpoints;
- framework-specific mechanisms.

Unless the implementation detail itself is an explicit requirement or constraint.

### Example

Implementation-dependent:

> The system shall insert the order into the `orders` table.

Implementation-independent:

> The system shall store the created order so that it can subsequently be retrieved.

Technical requirements and constraints may be documented separately when they are genuinely required.

---

# 7. Requirement language

Use normative language for mandatory behavior:

> The system shall ...

Use:

> The user can ...

when describing an available interaction or capability rather than defining a normative system requirement.

Avoid using `should` for mandatory requirements because it creates ambiguity about whether the behavior is required.

---

# 8. Business Rules vs Functional Requirements

Do not merge Business Rules and Functional Requirements merely because they describe related behavior.

A Business Rule expresses a business policy, condition, restriction, calculation or decision.

A Functional Requirement expresses what the system must do in response to that rule.

### Example

Business Rule:

> An order cannot be cancelled after it has been shipped.

Functional Requirement:

> The system shall reject cancellation of an order after it has been shipped.

The same Business Rule may constrain multiple Functional Requirements and Use Cases.

---

# 9. Use Cases vs Functional Requirements

A Use Case describes an interaction between an actor and the system to achieve a goal.

A Functional Requirement describes required system behavior.

Do not put an entire Use Case flow into a Functional Requirement.

### Example

FR:

> The system shall allow a manager to cancel an eligible order.

UC:

> Manager cancels an order.

The Use Case may contain:

1. Manager selects an order.
2. System displays order details.
3. Manager requests cancellation.
4. System checks cancellation rules.
5. System cancels the order.

The Use Case may realize one or more Functional Requirements.

---

# 10. Acceptance Criteria vs Requirements

Acceptance Criteria specify observable conditions used to determine whether related behavior is acceptable.

Do not treat Acceptance Criteria as a replacement for Functional Requirements.

Example:

FR:

> The system shall prevent cancellation of shipped orders.

AC:

```text
Given an order has been shipped
When the manager attempts to cancel the order
Then the system rejects the cancellation
```

---

# 11. Terminology consistency

Use the same term for the same domain concept.

Before creating or modifying an artifact:

1. Check the glossary.
2. Reuse an existing domain term where appropriate.
3. Do not introduce synonyms for an existing concept without a reason.
4. If a new domain concept is important, ambiguous or repeatedly used, consider adding it to the glossary.

For example, do not use all of the following interchangeably unless they are explicitly different concepts:

- customer;
- client;
- buyer;
- purchaser.

If they represent different concepts, define the distinction in the glossary.

---

# 12. Hidden assumptions

Do not convert assumptions into requirements.

Distinguish:

- Confirmed information;
- Inferred information;
- Assumed information;
- Unknown information.

If an assumption affects system behavior and has not been confirmed, record it as an Open Question when appropriate.

---

# 13. Contradictions

When two artifacts contradict each other:

1. Do not silently choose one.
2. Identify the contradiction.
3. Determine whether one artifact supersedes the other based on explicit project information.
4. Otherwise create or update an Open Question.
5. Do not mark the resulting interpretation as Approved without confirmation.

---

# 14. Quality review checklist

Before considering an artifact complete, check:

### General

- [ ] Correct artifact type
- [ ] Correct and stable ID
- [ ] Clear title
- [ ] Unambiguous wording
- [ ] Consistent terminology
- [ ] No unjustified assumptions
- [ ] No contradictions
- [ ] Relevant dependencies identified
- [ ] Relevant Open Questions identified

### Functional Requirements

- [ ] Describes required system behavior
- [ ] Atomic
- [ ] Testable
- [ ] Implementation-independent
- [ ] Applicable Business Rules identified
- [ ] Related Use Cases identified where applicable
- [ ] Acceptance Criteria identified where applicable

### Use Cases

- [ ] Clear actor goal
- [ ] Primary actor identified
- [ ] Trigger identified
- [ ] Preconditions identified where applicable
- [ ] Main scenario defined
- [ ] Alternative scenarios considered
- [ ] Exception scenarios considered
- [ ] Postconditions identified
- [ ] Related FRs identified
- [ ] Applicable BRLs identified

### Business Requirements

- [ ] Business need identified
- [ ] Desired outcome identified
- [ ] Rationale identified where known
- [ ] Related FRs identified where applicable

### Business Rules

- [ ] Rule expresses business logic/policy
- [ ] Scope is clear
- [ ] Exceptions identified where applicable
- [ ] Related artifacts identified

### Acceptance Criteria

- [ ] Observable
- [ ] Testable
- [ ] Related artifact identified
- [ ] Expected result is clear

### Open Questions

- [ ] Question is specific
- [ ] Context is clear
- [ ] Impact is understood
- [ ] No invented answer

---

# 15. Final principle

The purpose of quality review is not to maximize the number of fields filled in.

The purpose is to ensure that each artifact accurately represents its intended semantic role and can be understood, traced, changed and verified without introducing unsupported assumptions.