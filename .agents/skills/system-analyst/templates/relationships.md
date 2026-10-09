# Artifact Relationships

Relationships describe how artifacts are connected.

A relationship does not imply a strict hierarchy.

## derived-from

The artifact was derived from another artifact or source.

Example:

`FR-001` derived-from `BR-001`

Use when a functional requirement originates from a business requirement.

---

## refines

The artifact adds precision to another artifact without necessarily
changing its fundamental intent.

Example:

`FR-002` refines `BR-001`

---

## realized-by

The required behavior is realized through another artifact.

Example:

`FR-001` realized-by `UC-001`

This relationship means that the Use Case describes interaction through
which the required functionality is realized or specified.

It does not mean that every Use Case is a Functional Requirement.

---

## detailed-by

An artifact provides a more detailed description of another artifact.

Example:

`UC-001` detailed-by `SC-001`

A Scenario is a particular path through the Use Case.

---

## constrained-by

A requirement or use case is constrained by a business rule.

Example:

`FR-001` constrained-by `BRL-001`

---

## verified-by

An artifact is verified by acceptance criteria or another verification
artifact.

Example:

`FR-001` verified-by `AC-001`

---

## related-to

Two artifacts are meaningfully related but no stronger relationship
applies.

Use sparingly.

---

## depends-on

An artifact cannot function correctly without another artifact or
capability.

Example:

`FR-010` depends-on `FR-003`

---

## impacts

A change to one artifact may affect another artifact.

Example:

`FR-003` impacts `UC-001`

This relationship is useful for change-impact analysis.

---

# Important distinction

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