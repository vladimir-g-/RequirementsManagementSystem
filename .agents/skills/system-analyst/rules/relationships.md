# Artifact Relationships

Relationships describe how artifacts are connected.

A relationship does not imply a strict hierarchy.

## `derived-from`

The artifact was derived from another artifact or source.

Example:

`FR-001` derived-from `BR-001`

Use when a functional requirement originates from a business requirement.

---

## `refines`

The artifact adds precision to another artifact without necessarily
changing its fundamental intent.

Example:

`FR-002` refines `BR-001`

---

## `realized-by`

The required behavior is realized through another artifact.

Example:

`FR-001` realized-by `UC-001`

This relationship means that the Use Case describes interaction through
which the required functionality is realized or specified.

It does not mean that every Use Case is a Functional Requirement.

---

## `detailed-by`

An artifact provides a more detailed description of another artifact.

Example:

`UC-001` detailed-by `SC-001`

A Scenario is a particular path through the Use Case.

---

## `constrained-by`

Indicates that an artifact is subject to a rule or constraint defined in another artifact.

Use this relationship when a Functional Requirement or Use Case must comply with a Business Rule or Validation Rule.

Supported target artifact types:

- `BRL` — Business Rule;
- `VR` — Validation Rule.

Examples:

**Functional Requirement constrained by Business Rule**

```text
FR-001 — Cancel order
constrained-by
BRL-001 — Order cancellation restrictions
```

The Functional Requirement describes the system behavior, while the Business Rule defines the business condition that restricts this behavior.

**Functional Requirement constrained by Validation Rule**

```text
FR-002 — Create customer
constrained-by
VR-001 — Customer name length
```

The Functional Requirement describes the system behavior when customer data is submitted, while the Validation Rule defines the conditions that determine whether the submitted data is valid.

**Use Case constrained by Validation Rule**

```text
UC-001 — Register customer
constrained-by
VR-001 — Customer name length
```

The Use Case references the validation condition applicable during the interaction.

Do not duplicate the complete definition of a Business Rule or Validation Rule in the referencing artifact.

---

## `verified-by`

Indicates that an artifact is verified by one or more Acceptance Criteria.

Use this relationship to connect a Functional Requirement or Use Case with Acceptance Criteria that define observable conditions for confirming the required behavior.

Examples:

```text
FR-001 — Create customer
verified-by
AC-001 — Customer creation with valid data
AC-002 — Customer creation with invalid data
```

Acceptance Criteria may verify that the system correctly enforces applicable Business Rules and Validation Rules.

For example, an Acceptance Criterion may confirm that the system rejects customer creation when the submitted name violates `VR-001`.

Do not confuse verification of system behavior with the definition of the rule itself:

- `VR` defines what data is valid.
- `FR` defines how the system behaves when data is submitted.
- `AC` defines how the required system behavior is verified.

---

## `related-to`

Two artifacts are meaningfully related but no stronger relationship
applies.

Use sparingly.

---

## `depends-on`

An artifact cannot function correctly without another artifact or
capability.

Example:

`FR-010` depends-on `FR-003`

---

## `impacts`

A change to one artifact may affect another artifact.

Example:

`FR-003` impacts `UC-001`

This relationship is useful for change-impact analysis.

---

# `Important distinction`

Do not infer relationship direction solely from document structure.

For example:

A Use Case can be used to discover Functional Requirements during
elicitation.

Therefore, during analysis, the relationship may be represented as:

`FR-001` realized-by `UC-001`

while the FR may originally have been discovered from the UC.

The direction of a traceability relationship describes the semantic
relationship between artifacts, not necessarily the chronological order
in which they were created.