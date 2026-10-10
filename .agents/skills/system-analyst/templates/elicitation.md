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
- validation rule.

Classify accordingly.

---

# 20. Handle user stories

A User Story normally contains:

```text
As a <role>
I want <capability>
So that <benefit>
```

Do not automatically store the User Story as a