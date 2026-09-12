# Agent Instructions

## Scope

The GitHub issue or explicitly approved task is the source of scope.

Implement the requested change as written. Do not expand scope, redesign mechanics, or introduce unrelated cleanup unless explicitly authorized.

If the task cannot safely be completed within the approved scope, stop and report what decision or information is needed.

## Design authority

The owner retains authority over:

- gameplay rules and mechanics
- puzzle behavior and difficulty
- player-facing interaction design
- narrative and character decisions
- visual direction
- consequential architecture or scope changes

Implementation agents may identify concerns or alternatives but must not silently make these decisions.

## Implementation

Prefer the smallest clear change that satisfies the acceptance criteria.

Follow existing architecture and repository conventions unless the task explicitly authorizes changing them.

Do not modify unrelated systems merely because an alternative implementation appears cleaner.

## Verification

During implementation, run the smallest targeted deterministic checks relevant to the systems changed.

Do not run the complete repository regression suite by default.

Full repository verification should be performed by CI where available. Broader local verification is appropriate only when:

- the issue explicitly requires it;
- targeted checks cannot establish the requested behavior;
- CI is unavailable; or
- the change affects a foundational system where broader regression testing is necessary.

Never claim a check passed unless it was actually run.

Visual, interactive, or gameplay outcomes that cannot be established by automated tests require owner/playtest evaluation.

## Handoff

Before handoff:

- commit and push the implementation;
- identify the PR or branch;
- summarize what changed;
- report targeted checks run and their results;
- identify anything not verified;
- identify any remaining design, visual, or gameplay judgment required.

Do not approve or merge your own implementation.

Do not automatically launch another agent for review or adjudication.

Once the implementation is handed off, stop unless explicitly asked to continue.
