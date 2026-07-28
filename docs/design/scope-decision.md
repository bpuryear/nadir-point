# Scope decision

**This supersedes §10 of the original build brief where they conflict. Every stream codes
to this document.**

The brief originally excluded a list of systems. The project owner has since asked for
Beta Decay's *depth of systems*, which requires relaxing part of that list — but
selectively, and with one explicit carve-out.

---

## Now IN scope — build these

| System | What it means here |
|---|---|
| **Items and equipment** | Distinct from hardpoint modules. Consumables, one-shot devices, components that modify how a module behaves. The Everspace-2 lesson: a device that *changes what you can do* is worth more than a device that adds 8% damage. |
| **Materials and refit economy, with real scarcity** | Salvage already yields parts, not currency. Materials must be genuinely scarce so repair, refit and breaking a part down are competing claims on the same pool. Scarcity is what makes the salvage-integrity tension pay off — a reactor kill costing you materials should *hurt*. |
| **Perks and progression, tied to the hull** | Progression attaches to the **ship**, never to a separate character sheet. The hull accumulates capability. This preserves the brief's original intent (§10 excluded "character progression separate from the ship") while adding the depth that was missing. |
| **Objectives** | Repeatable, generated, systemic. Things the world asks of you that interact with the faction war, salvage and travel. **Not** a story campaign and **not** hand-authored missions. |

## Still OUT of scope — do not build

- **Crew and officers — explicitly excluded by the owner.** No crew roster, no officer
  assignment, no personnel effects, no morale. If a researched system depends on crew,
  find a non-crew mechanism or drop it.
- Campaign, story, hand-authored missions
- Ship interiors, walking around
- Trading and commodity markets *as a price-speculation game*. Materials are a **sink**,
  not a market. There is no buying low and selling high.
- Multiplayer
- Base building
- Procedural multi-system generation — one deeply built system, as before
- Fleet construction and shipyards

## Priority

**Systems first, then polish.** Land the gameplay systems and the UI that makes them
legible; spend remaining effort on visual polish afterwards. Depth is the larger gap
against the reference games. The visual gap is narrower than it was and is now well
understood — see `docs/review/acceptance.md`.

This does not license shipping ugly systems. A system the player cannot read is not a
system, so each one ships with the UI that makes it legible.

---

## The design test every new system must pass

Beta Decay's depth works because it simulates specific things in detail and abstracts
everything else, rather than simulating everything. Before building any system, answer:

1. **What decision does this create?** If the player never chooses anything different
   because of it, it is a stat, not a system.
2. **What does it interlock with?** A system that touches nothing is a side panel.
   Salvage integrity is good because it reaches back into how you fight.
3. **What does it abstract?** Say explicitly what is *not* simulated, and why that is the
   right line.
4. **Can the player see it?** Hidden state that changes outcomes is a bug, not depth.

A system that cannot answer all four does not get built.
