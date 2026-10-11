# Claude Code Instructions

Read and follow `AGENTS.md` in this repository as the authoritative agent workflow and scope instructions.

In particular:

- The linked GitHub issue or explicitly approved task defines scope.
- Prefer the smallest clear implementation that satisfies acceptance criteria.
- During implementation, run only the smallest targeted deterministic checks relevant to the systems changed.
- Do not run the complete repository regression suite locally by default.
- Leave full repository verification to CI where available.
- Broaden local verification only when the issue explicitly requires it, targeted checks are insufficient, CI is unavailable, or the change affects a foundational system.
- Once implementation is committed, pushed, and handed off, stop unless explicitly asked to continue.

Do not reconstruct or use the retired universal/vendored agent workflow.
