# Project Instructions

## 1. Requirements-Driven Development

This project follows a requirements-driven development approach.

- Approved requirements are the source of truth for system functionality.
- Functional implementation must be based on approved requirements stored in the project's requirements repository.
- Before implementing a feature, identify and review the relevant requirements and related artifacts.
- Consider associated Business Rules (BRL), Validation Rules (VR), and Acceptance Criteria (AC).
- Do not invent missing business requirements or silently resolve ambiguities.

## 2. Separation of Responsibilities

- Use the `system-analyst` skill for requirements elicitation, analysis, specification, modification, validation, and traceability.
- Use the coding agent's capabilities for software design, implementation, debugging, refactoring, and testing.
- Do not modify approved requirements without explicit user authorization.
- If implementation reveals a requirements gap, report it and request clarification.

## 3. Software Development

- Analyze the existing architecture and coding conventions before making changes.
- Follow established project architecture and coding conventions.
- Implement only the functionality covered by the approved requirements.
- Create or update tests to verify implemented behavior.
- Verify implementation against relevant Acceptance Criteria.

## 4. Reporting

When completing an implementation task, report:
- Requirements implemented.
- Files created or modified.
- Tests executed and their results.
- Unresolved issues and deviations from requirements.
