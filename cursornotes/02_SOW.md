# Statement of Work (SOW) - PresentationDisplayHost Optimization

## 0. Purpose
These rules guide Cursor AI's autonomous work on this repository, ensuring continuity, transparency, and manageable iteration. (Copied from general instructions for context, actual SOW starts below).

## 1. Goal
Transform `PresentationDisplayHost` into a stable, efficient, and purely reactive display component that updates based on `postMessage` events from the main application (e.g., Educator Panel) without initiating excessive internal API requests, re-renders, or redundant listener initializations. The component should primarily manage its view state based on received data, not autonomously fetch core encounter data.

## 2. Deliverables
- [ ] **Optimized `PresentationDisplayHost`:**
    - [ ] `PresentationDisplayHost` primarily relies on data pushed via `postMessage` for encounter content.
    - [ ] Any direct data fetching within `PresentationDisplayHost` (if absolutely necessary for an initial state or fallback) is strictly controlled, minimal, and occurs only when essential (e.g., new `encounterId`, no data provided).
    - [ ] Elimination of unnecessary re-renders and re-initializations of `PresentationDisplayHost` and its `postMessage` listeners.
    - [ ] Robust checks within `PresentationDisplayHost` to prevent re-fetching/re-processing of already loaded or identical data/messages.
- [ ] **Stable Lifecycle Management:**
    - [ ] `useEffect` hooks in `PresentationDisplayHost` have precise dependencies to prevent superfluous executions.
    - [ ] Event listeners (especially `postMessage`) are correctly added and cleaned up to prevent memory leaks or multiple registrations causing redundant actions.
- [ ] **Reliable `postMessage` Communication:**
    - [ ] The main application (Educator Panel) sends `LOAD_ENCOUNTER_IN_DISPLAY` messages precisely when needed and not excessively.
    - [ ] `PresentationDisplayHost` implements comprehensive guards against processing redundant, out-of-order, or duplicate `postMessage` events.
- [ ] **Verification of Context Isolation:**
    - [ ] Confirmation that `EncounterContext` (and similar data-intensive contexts) are not being inadvertently accessed or influencing `PresentationDisplayHost`.
- [ ] **Reduced Network Load:**
    - [ ] The number of network requests originating from or triggered by `PresentationDisplayHost` during the problematic scenario (initial load + navigation via educator panel) is reduced to the absolute minimum (ideally, one fetch per unique encounter ID that needs to be displayed and isn't already cached/available).
- [ ] **Documentation:**
    - [ ] Brief notes in `/cursornotes/plan_PDH_Optimization.md` (created in Milestone 1) detailing key changes made to `PresentationDisplayHost` logic.

## 3. Out-of-scope
- Major refactoring of the `EncounterContext` itself (unless a direct, unavoidable interaction with `PresentationDisplayHost`'s issues is discovered).
- Fundamental changes to the backend API endpoints or database schema.
- Alterations to the overall `postMessage` strategy if a more targeted fix within `PresentationDisplayHost` and its message handling is sufficient.
- UI/UX redesign of the presentation display window beyond what's necessary to fix state management and data flow.

## 4. Dependencies
- Full source code of `PresentationDisplayHost.js` and any child components it directly renders and controls.
- Source code of the parts of the main application (e.g., `EducatorPanel.js`) that send `postMessage` events to `PresentationDisplayHost`.
- Clear understanding of the existing `postMessage` API (message types, payload structure) between the main app and `PresentationDisplayHost`.
- Access to browser developer tools for observing console logs and network requests during testing.

## 5. Milestones

*Each milestone is designed to be ≤ 8 work-hours.*

| #   | Title                                                    | Est. Time | Status       | Plan Document                           |
|-----|----------------------------------------------------------|-----------|--------------|-----------------------------------------|
| M1  | **Analysis & Detailed Plan for `PresentationDisplayHost`** | 3-4 h     | **IN-PROGRESS** | `/cursornotes/plan_PDH_Optimization.md` |
| M2  | **Refine `PresentationDisplayHost` Data Acquisition Logic**  | 4-6 h     | **TODO**     | -                                       |
| M3  | **Stabilize `PresentationDisplayHost` Component Lifecycle**| 3-5 h     | **TODO**     | -                                       |
| M4  | **Optimize `postMessage` Handling & Idempotency**        | 3-4 h     | **TODO**     | -                                       |
| M5  | **Integration Testing & Verification**                   | 2-3 h     | **TODO**     | -                                       |

### Milestone Descriptions:

**M1: Analysis & Detailed Plan for `PresentationDisplayHost` (`/cursornotes/plan_PDH_Optimization.md`)**
- **Goal:** Deeply analyze `PresentationDisplayHost.js` behavior and create a granular plan for remediation.
- **Tasks:**
    - Thoroughly review `PresentationDisplayHost.js` focusing on:
        - Current data fetching mechanisms (e.g., `useEffect` hooks, direct API calls).
        - State variables that trigger data fetches or re-renders.
        - `postMessage` listener implementation (`useEffect` dependencies, message parsing, state updates).
        - Component lifecycle methods and their impacts.
    - Pinpoint the exact lines of code causing the `Fetching data directly for encounter...` logs.
    - Trace the cause of repeated listener cleanup and re-initialization.
    - Document findings and a step-by-step tactical plan in `/cursornotes/plan_PDH_Optimization.md`. This plan will break down the subsequent milestones (M2-M4) into smaller, actionable coding tasks (chunks).
- **Acceptance Tests:**
    - `/cursornotes/plan_PDH_Optimization.md` is created and contains a detailed analysis and actionable plan.

**M2: Refine `PresentationDisplayHost` Data Acquisition Logic**
- **Goal:** Modify `PresentationDisplayHost` to prioritize data received via `postMessage` and minimize its own direct fetching.
- **Tasks (based on M1 plan):**
    - Adjust `PresentationDisplayHost` to expect full encounter data (or necessary parts) within the `LOAD_ENCOUNTER_IN_DISPLAY` message payload.
    - If direct fetching is retained as a fallback:
        - Implement strict conditions: only if `encounterId` changes AND data is not in message AND data is not already cached/available locally in `PresentationDisplayHost`.
        - Add robust checks to prevent re-fetching for the same `encounterId` if data is already being displayed or was recently fetched.
    - Refactor state management related to `currentEncounterId` and `encounterData` to support this new flow.
- **Acceptance Tests:**
    - `PresentationDisplayHost` primarily uses data from `postMessage`.
    - Direct fetches are rare and justified.
    - Console logs show a significant reduction in "Fetching data directly..." messages.

**M3: Stabilize `PresentationDisplayHost` Component Lifecycle**
- **Goal:** Eliminate unnecessary re-renders and listener re-initializations in `PresentationDisplayHost`.
- **Tasks (based on M1 plan):**
    - Scrutinize and correct `useEffect` dependency arrays in `PresentationDisplayHost` and its key child components.
    - Ensure `postMessage` event listeners are added once on mount and properly cleaned up on unmount.
    - Investigate if the `<Route path="/presentation-display" element={<PresentationDisplayHost />} />` in `App.js` or its surrounding structure could be causing `PresentationDisplayHost` to remount unnecessarily. If so, propose and implement a fix.
- **Acceptance Tests:**
    - Console logs show `[PresentationDisplayHost] Initialized and listening...` and `Cleaned up postMessage listener` messages only appearing at logical lifecycle points (e.g., initial load, genuine unmount), not repeatedly during normal operation.
    - Overall component stability improved.

**M4: Optimize `postMessage` Handling & Idempotency**
- **Goal:** Make `PresentationDisplayHost`'s response to `postMessage` events robust and idempotent.
- **Tasks (based on M1 plan):**
    - Review and potentially enhance the main app's logic (e.g., Educator Panel) for sending `LOAD_ENCOUNTER_IN_DISPLAY` to avoid redundant messages.
    - Implement stronger guards in `PresentationDisplayHost`'s message handler:
        - Ignore messages if the `encounterId` and relevant data are identical to the current state.
        - Potentially add a simple message queue or debouncing if high-frequency identical messages are an issue from the source.
        - Ensure that processing a message correctly updates internal state to prevent re-processing of the same logical event.
- **Acceptance Tests:**
    - `PresentationDisplayHost` correctly handles sequences of `postMessage` events, including duplicates or rapid succession, without triggering excessive actions or fetches.
    - Logs like `Duplicate LOAD_ENCOUNTER_IN_DISPLAY ignored` are consistently observed for actual duplicates.

**M5: Integration Testing & Verification**
- **Goal:** Confirm the resolution of the request storm and ensure no regressions.
- **Tasks:**
    - Execute the user-reported scenario:
        1. Open Educator Panel and Presentation Display window.
        2. Load an initial encounter from a scenario dropdown in Educator Panel.
        3. Navigate to another choice/encounter via the Educator Panel controls.
    - Monitor browser network tab: count API requests related to encounter loading.
    - Monitor browser console: check for errors, excessive logging, or signs of instability.
    - Verify that the presentation display updates correctly with the selected encounters.
    - Briefly test other core functionalities of `PresentationDisplayHost` to check for regressions.
- **Acceptance Tests:**
    - Total relevant network requests during the test scenario are minimal (e.g., < 5-10, ideally just 1-2 per unique encounter displayed).
    - `PresentationDisplayHost` displays content correctly and is stable.
    - No new errors or major console spam introduced.

## 6. Timeline (Optional)
- M1: 1 day
- M2: 1-2 days
- M3: 1 day
- M4: 1 day
- M5: 0.5 days

*Actual duration will depend on the complexity discovered in M1.*

## 7. House-Keeping
- Keep note files under version control.

## 8. Safety & Ethics
- No changes to commit credentials or secrets.
- Destructive file operations will be confirmed if necessary (unlikely for this SOW). 