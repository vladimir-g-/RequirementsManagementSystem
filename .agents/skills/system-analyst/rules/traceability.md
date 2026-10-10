# Requirements Traceability Rules

Traceability describes meaningful relationships between project artifacts.

## Relationship types

### Derived from

The requirement was derived from another artifact.

Example:

`FR-0012` → Derived from → `BRD-005`

### Depends on

The requirement depends on another requirement.

Example:

`FR-0012` → Depends on → `FR-0008`

### Impacts

Changing one requirement may affect another.

Example:

`FR-0012` → Impacts → `FR-0018`

### Related

The requirements concern the same functional area but neither directly
depends on the other.

### Implements

An implementation component implements the requirement.

### Verified by

A test or verification artifact verifies the requirement.

## Rules

Create a traceability link only when the relationship is meaningful.

When a requirement changes:

1. Find direct references to the requirement.
2. Find requirements that depend on it.
3. Identify potentially affected requirements.
4. Distinguish confirmed impact from potential impact.
5. Do not modify unrelated requirements automatically.

## Impact levels

Use:

- `Direct` — behavior explicitly depends on the changed requirement.
- `Potential` — change may affect the artifact and requires analysis.
- `None` — no meaningful impact identified.

Never claim an impact is certain when it has only been inferred.