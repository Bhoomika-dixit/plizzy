# Generated Game Validation Checklist

Use this checklist before publishing any AI-generated Plizzy game.

## Specification
- [ ] Game objective and win/loss conditions are explicit.
- [ ] Initial state and allowed player actions are defined.
- [ ] Game specification conforms to a versioned schema.

## Rules and gameplay
- [ ] Invalid actions are rejected without changing game state.
- [ ] At least one successful game path can be simulated.
- [ ] Terminal states stop further gameplay actions.
- [ ] Scoring and turn order are deterministic.

## Multiplayer and safety
- [ ] The server is authoritative for state and scoring.
- [ ] Players cannot act on behalf of another player.
- [ ] Repeated or out-of-order actions are handled safely.
- [ ] Generated content respects runtime resource limits.

## Observability
- [ ] Generation, validation failures, and retries are traceable.
- [ ] Failed validation returns actionable feedback for regeneration.

This is a proposal for a future automated validation gate, not a claim that the checks are currently implemented.
