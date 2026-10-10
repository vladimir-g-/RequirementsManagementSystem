# Requirement Change Management

## Classification of changes

Every requested change should first be classified.

### Clarification

The meaning does not change; wording becomes more precise.

Keep the same requirement ID.

### Correction

The existing requirement contains an error.

Keep the same ID and record the correction.

### Extension

Additional behavior is added to the same functional responsibility.

Normally keep the same ID.

Check whether related requirements are affected.

### Behavioral change

The system must behave differently.

Keep the same ID if it remains the same functional responsibility.

Record the previous and new behavior when the difference is significant.

### New functionality

A new independent capability is introduced.

Create a new requirement.

### Removal

A capability is no longer required.

Do not delete the requirement.

Change status to `Deprecated` and record the reason.

## Before changing

Always check:

1. Related requirements.
2. Business rules.
3. Open questions.
4. Glossary.
5. API references.
6. Data references.
7. Test references.

## After changing

Always:

1. Update the requirement.
2. Update change history.
3. Update related links.
4. Search for references to the changed requirement.
5. Check for contradictions.
6. Identify potentially affected artifacts.

## Approval

Do not mark a requirement `Approved` based solely on the user's request
to modify it unless the user explicitly confirms that the resulting
requirement is approved.