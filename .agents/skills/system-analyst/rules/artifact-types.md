# Artifact Types

## Business Requirement — BR

### Purpose

Describes a business need, business objective or desired business
outcome.

### Answers

> Why is the capability needed?

### Example

> The company must allow customers to cancel eligible orders before
> fulfillment begins.

A Business Requirement does not describe detailed system behavior.

---

## Functional Requirement — FR

### Purpose

Describes required behavior or capability of the system.

### Answers

> What must the system do?

### Example

> The system shall allow a customer to cancel an eligible order.

Another example:

> The system shall prevent cancellation of an order after fulfillment
> has started.

A Functional Requirement must describe system behavior, not merely a
business goal.

---

## Business Rule — BRL

### Purpose

Describes a business policy, rule, constraint or decision logic.

### Answers

> What business rule determines or constrains the behavior?

### Example

> An order may be cancelled only before fulfillment begins.

The same Business Rule may constrain multiple functional requirements
and use cases.

---

## Use Case — UC

### Purpose

Describes interaction between an actor and the system to achieve a goal.

### Answers

> How does an actor interact with the system to achieve a goal?

### Example

> UC-001 — Cancel Order

Actor:

Customer

Goal:

Cancel an eligible order.

A Use Case can be related to multiple Functional Requirements.

---

## Scenario — SC

### Purpose

Describes one specific path through a Use Case.

### Types

- Main
- Alternative
- Exception

### Example

Main scenario:

1. Customer selects an eligible order.
2. Customer selects Cancel.
3. System requests confirmation.
4. Customer confirms.
5. System changes the order status.

An alternative scenario may describe what happens when cancellation is
not permitted.

---

## Acceptance Criteria — AC

### Purpose

Defines observable conditions that must be satisfied for functionality
to be accepted.

### Answers

> How do we know that the required behavior has been implemented
> correctly?

### Example

Given an order has not entered fulfillment,

When the customer cancels the order,

Then the system changes the order status to `Cancelled`.

Acceptance Criteria should be testable.

---

## Open Question — OQ

### Purpose

Records unresolved information required to complete the analysis.

### Example

> Is cancellation allowed after payment but before fulfillment?

An Open Question must not be silently answered by the agent.

---

# Classification rule

When the same user statement contains information belonging to several
artifact types, separate the information.

Example:

"Клиент может отменить оплаченный заказ до начала комплектации.
При отмене система должна вернуть деньги и установить статус
Cancelled."

Possible artifacts:

- BR — business need for cancellation;
- BRL — cancellation is allowed only before fulfillment;
- FR — system allows cancellation;
- FR — system initiates refund;
- FR — system changes order status;
- UC — Cancel Order;
- SC — successful cancellation.

Do not put all of this into one Functional Requirement.

# Artifact discovery principle

Artifact type and artifact origin are different concepts.

An artifact can be discovered from another artifact without becoming
subordinate to it.

For example:

```text
User description
      ↓
Use Case
      ↓
Functional Requirements
```

may occur during requirements elicitation.

Later, the specification may establish:

```text
Functional Requirement
      ↓
realized-by
      ↓
Use Case
```

These statements are not contradictory.

The first describes the **discovery process**.

The second describes the **semantic relationship between artifacts**.

Do not encode the chronological discovery process as a traceability
relationship unless that relationship has independent analytical
meaning.

---

# Example

User says:

> "Менеджер открывает заказ, нажимает 'Отменить', указывает причину,
> после чего заказ становится отменённым."

Possible elicitation:

```text
UC:
Cancel Order

FR:
The system shall allow a manager to initiate order cancellation.

FR:
The system shall require a cancellation reason.

FR:
The system shall change the order status to Cancelled after successful
cancellation.

AC:
Given the cancellation is successful
When the manager confirms cancellation
Then the order status is Cancelled.
```

The Use Case and Functional Requirements were discovered from the same
user statement.

There is no requirement to treat the Use Case as the parent of the
Functional Requirements or vice versa.

The appropriate semantic relationships should be established
independently.