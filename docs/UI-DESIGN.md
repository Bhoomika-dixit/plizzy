# Plizzy interface

The product uses a soft lavender, mint and apricot palette, rounded typography, tactile buttons and a clear sequence of actions. The original spark character and accompanying illustrations are vector artwork in `app/components/play-art.tsx`.

## Shared structure

- `app/globals.css` defines colors, typography, spacing, buttons, fields, focus states and navigation.
- `app/components/app-shell.tsx` provides the desktop sidebar, page header and mobile bottom navigation. Route layouts share this shell across the main product screens.
- Screen-specific presentation stays in CSS modules. Generated games retain their own canvas colors inside the Plizzy frame.
- Loading boundaries, empty states, error recovery, reduced-motion support and keyboard-operated mode/account selectors are included.

## Product flows

Home offers a short play list and routes into creation, rooms and the library. Discover contains editable idea starters rather than pretending that templates are already generated games. Selecting an idea opens its prompt in the studio.

Creation has two steps: player mode and name, then the game idea. Returning to the first step preserves the title and idea. Waiting states are indeterminate unless a real backend stage is supplied. Room-setup recovery remains available for a game that was already saved.

The library supports title search, mode filters and sorting. Multiplayer rooms put the active round first, with a selectable game shelf and named members and scores. Authentication, profile editing and photo upload use the existing account flows.

## Manual review

1. Check Home, Discover, Create, Library, Rooms, Profile and a saved game on desktop and at 390px width. Confirm there is no horizontal page overflow and that fixed navigation does not obscure the last action.
2. Filter Discover, open an idea, edit it, go back a step and continue. Confirm the draft survives.
3. Search and filter the library; clear an empty search and open a saved game or room.
4. Use two demo accounts in a room. Select a game, start a round, verify player names, turn feedback, inputs and results.
5. Check sign-in and account creation form validation without creating an unnecessary account. Check mode and account selectors with the keyboard.
6. Run TypeScript, ESLint, the production build, multiplayer regression tests and the secret audit before merging.

No database schema changes or new component-library dependencies are required for this design.
