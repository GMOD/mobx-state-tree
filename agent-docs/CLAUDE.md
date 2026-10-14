# Agent documentation

Top level is exactly this file. Everything else is filed:

- `architecture-decision-records/` — _why_, one per file, `NNNN-slug.md`. Read
  the relevant one before "simplifying" a design that looks accidental.
- Tried and declined → a sentence at the code that would re-try it, with the
  number. There is no rejected-ideas shelf.
- What a session did and which commits → git already holds it.

Cite a doc by its path, so a move is a grep. "State as of \<date\>" in a doc
means split it into the homes above. Add `reference/`, `ideas/`, `todo/` and
`handoffs/` when the first doc for one arrives.
