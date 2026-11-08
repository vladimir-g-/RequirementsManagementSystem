# Requirements Elicitation

This document defines how the System Analyst extracts requirements and
analysis information from natural-language input.

The input may be:

- a business request;
- a user story;
- an informal description;
- a conversation;
- a process description;
- a Use Case;
- an existing requirement;
- a bug description;
- source code behavior;
- API documentation;
- UI description;
- test scenario;
- change request.

The input is not necessarily a requirement itself.

The analyst must first extract the information contained in the input
and then classify it into appropriate analysis artifacts.

---

# 1. Fundamental principle

Do not transform user input directly into a Functional Requirement.

First perform:

```text
Input
  ↓
Extract information
  ↓
Separate facts, intentions and assumptions
  ↓
Identify system behavior
  ↓
Identify business rules
  ↓
Identify interactions
  ↓
Identify acceptance conditions
  ↓
Identify missing information
  ↓
Classify artifacts
  ↓
Search existing artifacts
  ↓
Propose changes
```

The same user statement may contain several different artifact types.

---

# 2. Extract information before classifying it

First identify the semantic content of the request.

Look for:

- business goals;
- desired outcomes;
- actors;
- system actions;
- user actions;
- triggers;
- conditions;
- constraints;
- calculations;
- decisions;
- state changes;
- data;
- notifications;
- integrations;
- exceptions;
- expected results;
- acceptance conditions;
- assumptions;
- unresolved questions.

Do not decide the artifact type while extracting information.

First understand what the user is saying.

---

# 3. Separate facts from assumptions

Classify extracted information as:

### Explicit fact

Directly stated by the user or supported by an authoritative project
source.

Example:

> "The user has to enter a password."

This is explicit.

### Inference

A conclusion that follows reasonably from the available information.

Example:

> If the system authenticates a user, a failed authentication result
> must exist.

An inference must not automatically become a requirement.

### Assumption

Information that may be true but has not been confirmed.

Example:

> "We assume that the account is locked after three failed attempts."

Do not convert assumptions into approved requirements.

### Unknown

Information required to complete the analysis but not available.

Create an Open Question when the unknown affects system behavior.

---

# 4. Identify the business intent

Determine whether the input contains a business need or desired outcome.

Ask:

- Why is this functionality needed?
- What business problem does it solve?
- What business outcome is expected?
- Who benefits from it?
- Is the statement describing a business objective rather than
  system behavior?

If the input contains business intent, consider a Business Requirement.

### Example

User:

> "Клиенты должны иметь возможность отменять заказ до начала
> комплектации."

Possible Business Requirement:

> The business needs to allow customers to cancel eligible orders
> before fulfillment begins.

The business requirement describes the desired capability from the
business perspective.

It does not yet specify all system behavior.

---

# 5. Identify functional behavior

Look for statements describing what the system must do.

Typical indicators:

- the system shall;
- the system must;
- the application should;
- the system allows;
- the system prevents;
- the system calculates;
- the system creates;
- the system changes;
- the system sends;
- the system validates;
- the system displays.

Translate the behavior into Functional Requirements when appropriate.

### Example

Input:

> "После отмены заказа система должна изменить его статус на
> Cancelled."

Functional Requirement:

> The system shall change the order status to `Cancelled` after the
> order is successfully cancelled.

Do not include the entire user interaction in the FR.

---

# 6. Identify business rules

Look for rules that constrain behavior independently of a specific
interaction.

Typical indicators:

- only if;
- must not;
- cannot;
- maximum;
- minimum;
- exactly;
- at least;
- no later than;
- before;
- after;
- according to;
- based on;
- depending on.

### Example

Input:

> "Заказ можно отменить только до начала комплектации."

Business Rule:

> An order may be cancelled only before fulfillment begins.

This rule can potentially apply to several Functional Requirements and
Use Cases.

Do not duplicate the same rule in every artifact.

Do not consider busines limitations as validation rules automatically.

---

# 7. Identify Use Cases

A Use Case is indicated when the input describes an actor interacting
with the system to achieve a goal.

Typical structure:

```text
Actor
  ↓
Action
  ↓
System response
  ↓
Actor action
  ↓
System response
```

### Example

Input:

> "Менеджер открывает заказ, нажимает 'Отменить', система показывает
> форму с причиной отмены. Менеджер указывает причину и подтверждает."

This contains a Use Case:

> Cancel Order

with an interaction sequence.

Do not convert each step automatically into an FR.

Instead, identify which steps represent independently required system
behavior.

---

# 8. Extract scenarios

Within a Use Case, distinguish:

### Main scenario

The normal successful flow.

### Alternative scenario

A valid variation of the flow.

Example:

> Customer cancels an order using the standard cancellation process.

Alternative:

> Customer cancels an order without providing an optional comment.

### Exception scenario

The intended flow cannot continue because of an error or invalid
condition.

Example:

> Cancellation is requested after fulfillment has started.

Do not create a new Use Case for every alternative or exception.

Create a separate Use Case only when the actor's goal or interaction
context is materially different.

---

# 9. Identify acceptance conditions

Look for statements describing how the behavior can be verified.

Typical indicators:

- "должно быть";
- "в результате";
- "если ..., то ...";
- "после этого";
- "пользователь должен увидеть";
- "заказ должен иметь статус...";
- "операция считается успешной, если...".

These may become Acceptance Criteria.

### Example

Input:

> "Если заказ отменён успешно, пользователь должен увидеть сообщение
> 'Заказ отменён', а статус заказа должен стать Cancelled."

Possible Acceptance Criteria:

```text
Given the order is eligible for cancellation
When the cancellation succeeds
Then the order status is Cancelled
And the user sees a cancellation confirmation
```

Acceptance Criteria should be observable.

---

# 10. Identify Open Questions

Create an Open Question when:

- the behavior is ambiguous;
- two interpretations are possible;
- an important business rule is missing;
- an exception is unspecified;
- a value is required but unknown;
- the source contains contradictory information;
- an implementation decision depends on an unresolved business decision.

### Example

Input:

> "После трёх неправильных попыток пользователь блокируется."

Possible questions:

- What constitutes an incorrect attempt?
- Does the counter reset after successful authentication?
- How long does the lock last?
- Can an administrator unlock the account?
- Does the lock apply to the account or the current session?

Do not invent these answers.

---

# 11. Split compound statements

A single sentence may contain multiple independent requirements.

Example:

> "При создании заказа система проверяет наличие товара, рассчитывает
> стоимость доставки, резервирует товар и отправляет письмо клиенту."

Potential Functional Requirements:

```text
FR-XXXX — Check product availability
FR-XXXX — Calculate delivery cost
FR-XXXX — Reserve product
FR-XXXX — Send order notification
```

Whether these should actually be separate requirements depends on whether
the behaviors can be independently changed, tested or traced.

Do not split mechanically.

Use functional independence as the main criterion.

---

# 12. Do not split one behavior unnecessarily

Avoid artificial fragmentation.

Input:

> "Система должна установить статус заказа в Cancelled после успешной
> отмены."

This is normally one Functional Requirement.

Do not create:

```text
FR-001 Change order status
FR-002 Set status to Cancelled
```

unless the two behaviors have independent meaning in the domain.

---

# 13. Distinguish behavior from business rules

Consider:

> "Система не должна позволять отменять заказ после начала
> комплектации."

This contains:

### Functional behavior

The system shall prevent cancellation.

### Business rule

Cancellation is not permitted after fulfillment begins.

Depending on the project model, both may be documented separately:

```text
FR-XXXX
The system shall prevent cancellation of an order when fulfillment
has started.

constrained-by

BRL-XXXX
An order cannot be cancelled after fulfillment has started.
```

Do not create a Business Rule automatically if the condition is purely
technical rather than business/domain-specific.

---

# 14. Distinguish system behavior from implementation

Input:

> "При нажатии кнопки система должна сделать SQL UPDATE таблицы orders."

The SQL statement is implementation detail.

Extract the functional behavior:

> The system shall change the order status.

Do not include SQL, class names, database tables, endpoints or
framework-specific details in a Functional Requirement unless the
implementation detail itself is an explicit constraint.

---

# 15. Distinguish requirements from UI descriptions

Input:

> "На странице заказа должна быть синяя кнопка 'Отменить'."

Possible interpretations:

- Functional behavior: user can initiate cancellation.
- UI requirement: a button must exist.
- Visual design constraint: button is blue.

Do not automatically treat visual design as Functional Requirement.

If the project manages UI requirements separately, classify it
accordingly.

If UI requirements are outside the scope of this skill, retain the
information as context or an Open Question.

---

# 16. Distinguish requirements from technical constraints

Input:

> "Для реализации нужно использовать Redis."

This is not a Functional Requirement.

It may be:

- a technical constraint;
- an architecture decision;
- an implementation requirement.

Do not create `FR-XXXX` unless the project explicitly treats technical
constraints as functional requirements.

---

# 17. Extract state transitions

Pay special attention to state-related statements.

Example:

> "После оплаты заказ переходит в статус Paid."

Extract:

- entity: Order;
- event: Payment successful;
- previous state: potentially Pending;
- new state: Paid.

Possible artifacts:

```text
FR:
The system shall change the order status to Paid after successful
payment.

BRL:
An order can enter Paid only after successful payment confirmation.
```

Create both only if the business rule is meaningful independently of
the specific implementation.

---

# 18. Extract calculations and decision logic

When input contains calculations:

> "Стоимость доставки = базовый тариф + 10% если вес больше 20 кг."

Separate:

### Functional Requirement

The system shall calculate delivery cost.

### Business Rule

If package weight exceeds 20 kg, a 10% surcharge applies.

### Calculation

Delivery cost = base tariff + applicable surcharge.

Do not hide important business logic inside a large FR.

---

# 19. Handle negative requirements

Negative requirements describe what the system must not do.

Examples:

> The system shall not allow cancellation after fulfillment starts.

> The system shall reject an order with an invalid product quantity.

Negative requirements are valid Functional Requirements.

Determine whether the negative condition is:

- functional behavior;
- business rule;
- security constraint;
- data validation rule.

Classify accordingly.

---

# 20. Handle user stories

A User Story normally contains:

```text
As a <role>
I want <capability>
So that <benefit>
```

Do not automatically store the User Story as a Functional Requirement.

Extract:
- actor/role;
- desired capability;
- business value;
- candidate Functional Requirements;
- candidate Use Case;
- Open Questions.
Example:
As a customer, I want to cancel my order so that I can correct
mistakes before fulfillment.

Possible extraction:
```text
BR:
Customer needs the ability to cancel eligible orders.

FR:
The system shall allow a customer to cancel an eligible order.

UC:
Cancel Order.

OQ:
Which order statuses are eligible for cancellation?
```

# 21. Handle bug reports
A bug report describes observed behavior, not necessarily required
behavior.

Example:
>"После отмены заказа статус остаётся Processing."

Do not automatically create:
>FR: The system shall change status to Cancelled.

First determine:
- Is the observed behavior actually a defect?
- What should the correct behavior be?
- Is there an existing requirement defining expected behavior?
- Is the requirement outdated?
- Is this an implementation bug?
If an existing FR already defines the expected behavior, the bug may be
an implementation defect rather than a new requirement.

# 22. Handle change requests
A change request should be analyzed against existing artifacts.

Example:
>"Теперь заказ можно отменять и после оплаты."

Do not immediately create a new FR.

First search for:
- existing cancellation requirements;
- business rules defining eligible statuses;
- cancellation Use Case;
- acceptance criteria;
- related payment requirements.
Then determine whether this is:
- clarification;
- correction;
- extension;
- behavioral change;
- new functionality.

# 23. Preserve source intent
When formalizing natural language:
- preserve the user's intended meaning;
- improve precision;
- remove ambiguity where possible;
- do not introduce new business behavior;
- do not silently add assumptions.
If clarification changes the meaning, ask the user.

# 24. Confidence and uncertainty
When information is inferred rather than explicitly stated, distinguish it
from confirmed information.

Use:
- Confirmed
- Inferred
- Assumed
- Unknown
Do not put Inferred or Assumed information into an Approved
requirement without confirmation.

# 25. Reusable Rules and Constraints

## Single Source of Truth

When the same business rule, validation rule, calculation or constraint applies in multiple places, define it once as a reusable artifact and reference it wherever it applies.

The goal is to maintain one authoritative definition of each rule and avoid duplicating its complete specification across Functional Requirements, Use Cases, Acceptance Criteria or other artifacts.

Do not confuse the fact that the system checks a condition with the type of that condition. Classify rules by their meaning, not by the technical mechanism used to enforce them.

### 1. Identify reusable rules and constraints

During elicitation and analysis, look for rules and constraints that may be reused, including:

- data validation rules:
  - mandatory and optional fields;
  - allowed values and value ranges;
  - data formats and length limits;
  - field-level and cross-field validation conditions;
  - data consistency conditions;
- business policies and decision logic:
  - business eligibility conditions;
  - restrictions and prohibitions;
  - conditions under which an operation is permitted;
  - state transition conditions;
- calculation rules:
  - formulas;
  - rounding rules;
  - calculation parameters;
  - conditions affecting calculation results;
- other constraints that affect multiple requirements or Use Cases.

Do not classify a rule solely by keywords such as "must", "shall not", "maximum", "minimum" or "only if". Determine what the rule actually describes.

### 2. Distinguish rule types

Use the following distinction when classifying reusable rules.

#### Business Rule (BRL)

A Business Rule defines a business policy, restriction, condition or decision logic that governs business operations.

Examples:

- An order cannot be cancelled after it has been shipped.
- A customer is eligible for a discount if their total purchases exceed a specified amount.
- A payment can be refunded only within 30 days of the transaction.

Use `BRL` when the condition expresses business policy or domain logic, rather than merely defining whether data is valid.

#### Validation Rule (VR)

A Validation Rule defines conditions that determine whether a value, field or combination of data is valid.

Examples:

- The `Name` field must not exceed 200 characters.
- The `Email` field must contain a value in the required format.
- The `StartDate` must not be later than the `EndDate`.
- The `Status` field may contain only values from a specified set.

Use `VR` for data validity conditions, including field-level and cross-field validation.

A Validation Rule defines what data is considered valid. It does not, by itself, define how the system must respond when the data is invalid.

#### Functional Requirement (FR)

A Functional Requirement describes the system behavior associated with applying a rule, including the behavior when a rule is violated.

For example:

- The system shall reject customer creation if the supplied `Name` value violates `VR-001`.
- The system shall prevent order cancellation when the condition defined in `BRL-001` is met.

The rule and the system behavior must not be confused:

- `VR` defines the data validity condition.
- `BRL` defines the business policy or decision condition.
- `FR` defines what the system must do.

#### Technical constraints

A technical constraint describes an implementation, platform, integration or architecture limitation.

Do not automatically classify technical constraints as `BRL` or `VR`.

For example, a database column type or an API protocol limitation is not necessarily a business validation rule. If the project defines a separate artifact type for technical constraints, use it. Otherwise, document the constraint in the appropriate project artifact.

### 3. Decide when to create a separate reusable artifact

Create a separate `BRL` or `VR` artifact when at least one of the following applies:

- the rule is referenced by multiple Functional Requirements or Use Cases;
- the rule has independent semantic meaning and should be managed separately;
- the rule is likely to be reused in other parts of the system;
- changing the rule should not require editing multiple copies of its definition;
- the rule is important enough to require explicit traceability and impact analysis.

Do not create a separate artifact for every simple condition or validation check.

If a condition is local to one requirement, is not independently meaningful and is unlikely to be reused, it may remain directly in that requirement or its Acceptance Criteria.

The decision to create a separate artifact should depend on its semantic meaning, reuse potential and maintenance needs — not merely on whether the same phrase or value appears more than once.

### 4. Specify Validation Rules precisely

When defining a `VR`, make the validation condition unambiguous and testable.

Consider the following aspects where applicable:

- **Scope:** the entity, field or fields to which the rule applies.
- **Applicability:** the operations or contexts in which validation is required, such as creation, update, import or API requests.
- **Validation condition:** the exact predicate that determines whether the data is valid.
- **Boundaries:** minimum and maximum values, inclusivity or exclusivity of limits, units of measurement.
- **Missing and empty values:** distinguish between an omitted field, `null`, an empty string and a whitespace-only value where relevant.
- **Allowed values:** define the permitted values or the source of the allowed-value set.
- **Normalization:** specify whether trimming, case conversion or other normalization is performed before validation, if this affects the result.
- **Cross-field conditions:** describe dependencies and consistency conditions between multiple fields.

Do not invent missing validation details. If the available information does not define a boundary, format, normalization rule or other important condition, record it as an Open Question (`OQ`).

Keep the validation condition separate from the system's reaction to invalid data.

For example:

- `VR` defines that the `Name` field must not exceed 200 characters.
- `FR` defines that the system rejects the submitted data when this condition is violated.
- `AC` defines an observable condition confirming that the system behaves as required.

Details such as error messages, response formats, validation timing, whether all errors or only the first error are returned, and whether saving is blocked belong to the relevant Functional Requirements and Acceptance Criteria when they are in scope.

### 5. Define the rule once and reference it

Create a separate reusable artifact for each distinct rule.

Use an existing artifact if it already expresses the same rule with the same meaning and scope.

Do not create duplicate rules merely because they are used in different operations.

At the same time, do not merge rules solely because they contain the same numeric value or similar wording. For example, a 200-character limit for a customer name and a 200-character limit for a product description may have different meanings, ownership or change conditions.

Other artifacts must reference the reusable rule by its ID and link.

They may briefly explain how the rule applies in the current context, but must not redefine or duplicate its complete specification.

Use the appropriate reference section:

- `Business rules` for `BRL` references.
- `Validation rules` for `VR` references.

### 6. Example

Suppose the system uses the `Name` field in customer creation and update operations.

Instead of repeating the validation condition in every requirement, define it once:

**VR-001 — Customer name length**

Validation rule:

> The value of the customer's `Name` field must not exceed 200 characters.

Then reference it from the relevant artifacts.

**FR-001 — Create customer**

Validation rules:

- [VR-001 — Customer name length](../validation-rules/VR-001.md)

**FR-002 — Update customer**

Validation rules:

- [VR-001 — Customer name length](../validation-rules/VR-001.md)

**UC-003 — Register customer**

Validation rules:

- [VR-001 — Customer name length](../validation-rules/VR-001.md)

If the system must reject the operation when the validation condition is violated, describe that behavior in the relevant Functional Requirement and Acceptance Criteria.

### 7. Maintain consistency and traceability

When a reusable rule changes:

1. Update its definition in one place.
2. Find all artifacts that reference it.
3. Assess the impact of the change on related Functional Requirements, Use Cases and Acceptance Criteria.
4. Determine whether the change affects system behavior or only clarifies the rule.
5. Update affected artifacts where necessary.
6. Check for contradictions and outdated copies of the previous rule.
7. Validate the consistency of all affected artifacts.

Do not silently create a second rule if an existing rule already expresses the same condition and scope.

If two similar rules may have different meanings, applicability or ownership, clarify their differences before merging them.

A change to a reusable rule must not automatically be treated as a change to system behavior. Analyze the impact first and update Functional Requirements or Acceptance Criteria if their specified behavior is affected.

### 8. Avoid unnecessary decomposition

Do not extract every repeated phrase, number or condition into a separate artifact.

Create a reusable artifact when it has independent semantic meaning, represents a shared constraint or needs to be managed independently.

Do not split one coherent business policy into multiple artificial rules merely to increase reuse.

The objective is to maintain one authoritative definition of each reusable rule, preserve traceability and simplify change management — not to maximize the number of artifacts.

# 26. Elicitation output
Before applying non-trivial changes, the analysis should be expressible
in the following form:
```text
## Understanding

{{What the request means}}

## Extracted information

### Business intent

- ...

### System behavior

- ...

### Business rules

- ...

### Interaction

- ...

### Acceptance conditions

- ...

### Unknowns

- ...

## Classification

- BR-XXXX - ...
- FR-XXXX - ...
- BRL-XXXX - ...
- VR-XXXX - ...
- UC-XXXX - ...
- AC-XXXX - ...
- OQ-XXXX - ...

## Existing artifacts

- ...

## Proposed changes

- ...

## Potential conflicts

- ...

## Open questions

- ...
```
The exact format may be shortened for simple requests.

# 27. Final principle
The analyst's job is not to convert every sentence into a requirement.

The analyst's job is to discover the underlying system model.

Prefer:
```text
User statement
      ↓
Semantic analysis
      ↓
Facts / intentions / assumptions
      ↓
Artifact classification
      ↓
Existing model
      ↓
Traceability
      ↓
Proposed change
```
over:
```text
User statement
      ↓
FR.md
```

The quality of the analysis is more important than the number of
artifacts created.