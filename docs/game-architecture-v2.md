# Plizzy Game Architecture V2 (Proposal)

## Goal
Turn user prompts into playable, reliable games without restricting creativity to predefined interaction types.

## Proposed flow
1. **Intent planner** interprets the requested game, mechanics, win conditions, and multiplayer needs.
2. **Game designer** produces a versioned, declarative game specification (state, actions, rules, UI hints).
3. **Validator** checks schema, reachable win/loss states, action legality, and basic simulation cases; failed checks return actionable feedback to the designer.
4. **Deterministic runtime** owns authoritative state transitions and scoring. Generated content cannot execute arbitrary server code.
5. **Renderer** maps specification components and state to mobile-first React Native UI. It chooses interaction patterns from mechanics, not from a fixed game-type label.
6. **Room service** synchronizes validated actions and broadcasts authoritative state to participants using Supabase.

## Design constraints
- Keep game rules separate from visual presentation.
- Version specifications and runtime contracts for reproducible sessions.
- Validate all player actions server-side; do not trust client-calculated scores.
- Bound generation attempts, token spend, and execution complexity.
- Trace planning, generation, validation, and retries with Langfuse.
- Start with a small supported mechanic set and expand through composable primitives, not a growing catalog of hard-coded game templates.

## Next decision
Prototype one puzzle (Sudoku) and one social multiplayer game against this contract before committing to a full rewrite.

> This document is a proposal only. No runtime behavior changes are included in this PR.
