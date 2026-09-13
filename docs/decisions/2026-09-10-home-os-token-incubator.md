# Incubate candidate Home OS tokens in Movement

- **Date:** 2026-09-10
- **Status:** Accepted candidate
- **Work item:** Public design-system backport
- **Class:** Design

## Decision

Movement will incubate the first reusable Home OS token contract while the
other planned applications are not yet ready for a cross-app specimen audit.
The contract is namespaced `--home-os-*`, versioned
`0.1.0-candidate.1`, and limited to ecosystem foundations and visual grammar.

The Night mode is the reference expression: rain-dark architectural surfaces,
warm document surfaces, structural brass, and scarce mineral light. Day mode is
specified as the same artifact uncovered in sunlight—not a mechanical color
inversion—with dark mineral inlays and deeper brass chosen for legibility.

Movement retains ownership of profile identity, activity colors, its cycle and
timer instruments, and all other domain components. Its existing
`--movement-*` variables remain compatibility aliases so this foundation can be
introduced without forcing a component rewrite.

## Why this is candidate work

The exploratory Home OS design language normally calls for a five-app specimen
audit before token values harden. The owner explicitly chose to incubate the
tokens here because those applications do not yet exist. Candidate status
preserves that limitation: no token becomes stable until it has been tested in
multiple apps, across relevant themes and surfaces, responsively, and for
accessibility.

## Constraints

- Components consume semantic roles; primitives are not the default component API.
- Shared role names describe function, not literal material.
- Brass orients; mineral light marks focus, presence, or transition.
- App identity and shared foundations remain separate layers.
- Audio behavior and assets are outside this change.

## Verification

The release check must verify that the token contract is loaded before Movement
styles, is available offline, retains its compatibility aliases, and maintains
WCAG AA contrast for shared text roles in both Night and Day modes.

## Acceptance criteria for the first slice

- Night and Day expose the same semantic token names.
- Shared text and orientation roles meet WCAG AA on their intended surfaces.
- Movement renders through compatibility aliases without a component rewrite.
- The token file loads before component CSS and is part of the offline shell.
- Movement's automated and browser checks pass.
- No audio configuration, behavior, migration, or asset changes are included.
