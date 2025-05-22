# M1: EducatorPanel Refactoring Plan

## Context / Problem Statement
As identified in the SOW (`cursornotes/03_Frontend_Roadblocks_Refactor/SOW.md`), `client/src/components/EducatorPanel.js` is a candidate for refactoring. This plan outlines the steps to break it down into smaller, more manageable components, improving code quality, maintainability, and readability. This milestone has an estimated time of 4-6 hours.

## Task Breakdown

### step-1: Analyze `EducatorPanel.js`  **DONE**
- Goal: Understand the current responsibilities, state management, prop drilling, and identify potential sub-components within `EducatorPanel.js`. Document findings to guide refactoring.
- Files: `client/src/components/EducatorPanel.js` (read-only for analysis)
- Acceptance tests:
    - A clear understanding of the component's structure, state, props, and key functionalities is documented.
    - Potential areas for component extraction are identified.
- Template: N/A
- **Summary:** Analyzed `EducatorPanel.js` (2526 lines). Identified numerous responsibilities including presentation control, scenario/encounter management, polling, user interactions (XP/badges, instructions), extensive socket handling, and complex state. The component is a strong candidate for breakdown into multiple custom hooks (e.g., `usePresentationManager`, `useScenarioManagement`, `useEducatorPolls`) and child components (e.g., `PresentationControls`, `ScenarioExplorer`, `EducatorPollDisplay`, `UserManagementPanel`). Prop drilling is anticipated to be high. Detailed analysis in `notes/M1.md`.

### step-2: Define and Stub Sub-components **DONE**
- Goal: Based on the analysis, define the logical sub-components. Create new files for these sub-components with basic placeholder content.
- Files:
    - `client/src/components/EducatorPanel.js` (for minor modifications to import new stubs if necessary for planning)
    - `client/src/components/EducatorPanel/` (new directory for sub-components)
    - `client/src/components/EducatorPanel/PresentationControls.js` 
    - `client/src/components/EducatorPanel/ScenarioExplorer.js`
    - `client/src/components/EducatorPanel/EducatorPollDisplay.js`
    - `client/src/components/EducatorPanel/UserManagementPanel.js`
    - `client/src/components/EducatorPanel/InstructionManager.js`
    - `client/src/components/EducatorPanel/EducatorDebugPanel.js`
    - Potentially new hook files in `client/src/hooks/` like `usePresentationManager.js`, `useScenarioManagement.js`, etc.
- Acceptance tests:
    - A list of new sub-components and their intended responsibilities is created.
    - New files for sub-components are created with placeholder content.
    - `EducatorPanel.js` is prepared for integrating these new components (e.g., potential import statements added, structure outlined).
- Template: N/A
- **Summary:** Created stub files with basic placeholder content for all identified sub-components (`PresentationControls.js`, `ScenarioExplorer.js`, `EducatorPollDisplay.js`, `UserManagementPanel.js`, `InstructionManager.js`, `EducatorDebugPanel.js` within `client/src/components/EducatorPanel/`) and custom hooks (`usePresentationManager.js`, `useScenarioManagement.js`, `useEducatorPolls.js` within `client/src/hooks/`). The directory `client/src/components/EducatorPanel/` was also implicitly created.

### step-3: Migrate UI to Sub-components **DONE**
- Goal: Move specific UI sections and rendering logic from `EducatorPanel.js` into the newly created sub-components. **Note:** Carefully evaluate any interactions with `EncounterDisplay.js`. If direct modifications to `EncounterDisplay.js` are required for this step, it may also need to be marked as BLOCKED.
- Files:
    - `client/src/components/EducatorPanel.js`
    - `client/src/components/EducatorPanel/*.js` (all new sub-components)
- Overall Acceptance Tests for step-3:
    - Relevant JSX and rendering logic are successfully moved from `EducatorPanel.js` to the appropriate sub-components.
    - Props are correctly passed from `EducatorPanel.js` (or parent components) to the new sub-components.
    - The overall UI of the Educator Panel remains visually and structurally consistent with the pre-refactoring state for each migrated component.
- Template: `client/src/components/EducatorPanel/ExampleSubComponent1.js` will serve as a template for other sub-components created within this milestone.
- **Sub-component Migration Progress:**
    - **3.1: `EducatorPollDisplay.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and related logic for displaying poll status, results, and controls.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/EducatorPollDisplay.js`
        - Acceptance tests:
            - UI for poll status, results, controls (start/end) is moved and functional.
            - Props (`isPollRunning`, `elapsedSeconds`, `totalVotes`, `pollOptions`, `voteCounts`, `navigateToRoute`, `sendPoll`, `endPoll`, etc.) are correctly passed and utilized.
            - Visually and structurally consistent with pre-refactor.
        - Status: **DONE**. UI and related logic for displaying poll status, results, and controls have been successfully migrated. Props are passed. The component is functional and tested.

    - **3.2: `UserManagementPanel.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and related logic for displaying the user list, total users, and controls for bulk/individual XP and badge awards.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/UserManagementPanel.js`
        - Acceptance tests:
            - UI for user list, total users, XP/badge controls is moved and functional.
            - Props (`totalUsers`, `userList`, `unreadBySender`, `loadingBadges`, handlers like `handleAwardXPToAll`, `openBadgeModal`, etc.) are correctly passed and utilized.
            - Visually and structurally consistent with pre-refactor.
        - Status: **DONE**. UI and logic migrated. All outstanding bugs fixed.

    - **3.3: `PresentationControls.js` MIGRATION & TESTING** **DONE**
        - Goal: Consolidate route navigation buttons, poll results bars, and send/end poll buttons into `PresentationControls.js`.
        - Files:
            - `client/src/components/EducatorPanel.js`
            - `client/src/components/EducatorPanel/PresentationControls.js`
            - `client/src/components/EducatorPanel/EducatorPollDisplay.js`
        - Acceptance Tests:
            - Route navigation buttons are moved from `EducatorPollDisplay.js` to `PresentationControls.js` and are functional.
            - Poll results bars (including vote counts and percentages) are moved from `EducatorPollDisplay.js` to `PresentationControls.js` and display correctly.
            - The "Send Poll" / "End Poll" button is moved from `EducatorPollDisplay.js` to `PresentationControls.js` and is functional.
            - `PresentationControls.js` receives all necessary props for these elements (e.g., `isPollRunning`, `pollOptions`, `voteCounts`, `navigateToRoute`, `sendPoll`, `endPoll`, etc.).
            - `EducatorPollDisplay.js` no longer renders these elements and has its props updated accordingly.
            - The visual layout of these controls within the Educator Panel remains consistent with their appearance before this refactoring step (i.e., route buttons next to their respective result bars, send/end poll button logically grouped).
        - Status: **DONE**. UI and logic migrated. PresentationControls now renders correctly within EducatorPollDisplay's 'poll-info-section' div.

    - **3.4: `ScenarioExplorer.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and logic for browsing and selecting scenarios/encounters.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/ScenarioExplorer.js`
        - Acceptance tests:
            - UI for scenario exploration is moved and functional.
            - Relevant props and handlers are correctly passed and utilized.
            - Visually and structurally consistent.
        - Status: **DONE**. Scenario selection dropdown successfully migrated to `ScenarioExplorer.js` and is functional.

    - **3.5: `InstructionManager.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and logic for managing and displaying instructions to users.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/InstructionManager.js`
        - Acceptance tests:
            - UI for instruction management is moved and functional.
            - Relevant props and handlers are correctly passed and utilized.
            - Visually and structurally consistent.
        - Status: **DONE**

    - **3.7: `PreviewPane.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and logic for the encounter preview pane.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/PreviewPane.js`
        - Acceptance tests:
            - UI for displaying the current encounter thumbnail or messages (e.g., "Start presentation", "Select scenario") is moved and functional.
            - Relevant props (`isPresentationActive`, `currentEncounter`) are correctly passed and utilized.
            - Visually and structurally consistent.
        - Status: **DONE**

    - **3.8: `StartPresentationButtons.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and logic for the "Start Presentation" / "End Presentation" buttons.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/StartPresentationButtons.js`
        - Acceptance tests:
            - UI for the start/end presentation buttons is moved and functional.
            - Relevant props (`isPresentationActive`, `isPollRunning`) and handlers (`startPresentation`, `endPresentation`) are correctly passed and utilized.
            - Visually and structurally consistent.
        - Status: **DONE**

    - **3.9: `BreadcrumbTrail.js` MIGRATION & TESTING** **DONE**
        - Goal: Migrate UI and logic for displaying the encounter breadcrumb trail.
        - Files: 
            - `client/src/components/EducatorPanel.js`
            - `client/src/components/EducatorPanel/BreadcrumbTrail.js` (new)
            - `client/src/components/EducatorPanel.css` (if styles for BreadcrumbCircle need to move)
        - Acceptance tests:
            - UI for breadcrumb navigation is moved from `EducatorPanel.js` into `BreadcrumbTrail.js`.
            - The `BreadcrumbCircle` component (or its logic) is encapsulated or moved into `BreadcrumbTrail.js`.
            - Relevant props (e.g., `longestPath`, `navigateToBreadcrumb`, `getEncounterTitle`, `breadcrumbsLoading`) are correctly passed to `BreadcrumbTrail.js`.
            - The breadcrumb trail remains visually and structurally consistent with the pre-refactoring state.
        - Status: **DONE**

### Step 4: Refactor State and Logic from EducatorPanel.js **DONE**
This step focuses on extracting complex state and business logic from `EducatorPanel.js` into custom hooks. The goal for each sub-step is to achieve a fully functional, testable, and maintainable refactored unit. This includes making necessary client-side structural changes and, if required for end-to-end functionality of the refactored component/hook, identifying and addressing any directly related server-side logic to ensure the component's features (e.g., data display, interactions) work as intended post-refactor. The primary aim is to simplify the main `EducatorPanel.js` component while ensuring all functionalities remain intact or are improved.

#### step-4.1: Poll Management Logic (EducatorPollDisplay, PresentationControls) **DONE**
- Goal: Extract state and logic related to poll management from `EducatorPanel.js` into a custom hook (`useEducatorPolls.js` or `usePollManagement.js`), integrate it with relevant components, ensure server-side interactions are correct, and thoroughly test all functionalities.
- Sub-steps:
    - **4.1.1: Design and Implement `useEducatorPolls.js` Hook:** **DONE**
        - Goal: Create the `useEducatorPolls.js` hook, encapsulating all poll-related state (e.g., `isPollRunning`, `elapsedSeconds`, `pollOptions`, `voteCounts`, `finalVoteCounts`) and logic (e.g., `sendPoll`, `endPoll`, `requestResults`, socket event handlers for poll updates like `pollStatus`, `pollResults`, `pollEnded`).
        - Files: `client/src/hooks/useEducatorPolls.js` (new), `client/src/components/EducatorPanel.js` (for reference and removal of old logic).
        - Acceptance tests:
            - Hook manages all specified poll state.
            - Hook exposes necessary functions and state values.
            - Socket event listeners for poll operations are correctly set up and cleaned up within the hook.
    - **4.1.2: Initial Hook Integration with Components:** **DONE**
        - Goal: Refactor `EducatorPollDisplay.js` and `PresentationControls.js` to initially connect to and consume `useEducatorPolls.js`. This involves passing the necessary state and functions from the hook to these components, typically via props if `EducatorPanel.js` consumes the hook, or by direct consumption in the child components.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/EducatorPollDisplay.js`, `client/src/components/EducatorPanel/PresentationControls.js`.
        - Acceptance tests:
            - `EducatorPollDisplay.js` and `PresentationControls.js` are successfully connected to the hook and receive its data/functions.
            - `EducatorPanel.js` is updated to facilitate this connection (e.g., instantiating the hook and passing props).
    - **4.1.3: Verify Component Rendering Logic Migration:** **DONE**
        - Goal: Ensure that the internal rendering logic of `EducatorPollDisplay.js` and `PresentationControls.js` is fully updated to be driven by the state and functions provided by `useEducatorPolls.js`. Confirm that all poll-related conditional rendering and display logic has been removed from `EducatorPanel.js`.
        - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/EducatorPollDisplay.js`, `client/src/components/EducatorPanel/PresentationControls.js`.
        - Acceptance tests:
            - `EducatorPollDisplay.js` and `PresentationControls.js` internal rendering logic exclusively uses hook-provided data/functions for poll-related UI.
            - No poll-related conditional rendering remains in `EducatorPanel.js`.
            - Visual consistency of poll elements is maintained.
    - **4.1.4: Verify Server-Side Interactions for Polls:** **DONE**
        - Goal: Confirm that client-side poll actions triggered via the hook (e.g., starting a poll, ending a poll) are correctly handled by the server (`server.js` socket handlers), and that server-sent poll events are correctly received and processed by the hook.
        - Files: `server.js` (read-only, for verification), `client/src/hooks/useEducatorPolls.js`.
        - Acceptance tests:
            - Server correctly processes `sendPoll` and `endPoll` events from the client.
            - Server correctly emits `pollStatus`, `pollResults`, `pollEnded` to clients.
            - Hook correctly updates state based on server events.
    - **4.1.5: End-to-End Testing of Poll Management:** **DONE**
        - Goal: Perform comprehensive testing of all poll functionalities: starting a poll, students voting, educator seeing live results, ending a poll, displaying final results, and ensuring vote counts clear upon navigation.
        - Files: N/A (testing activity).
        - Acceptance tests:
            - Educator can successfully start and end polls.
            - Poll status (running/ended, timer) displays correctly.
            - Vote counts and percentages update in real-time in `PresentationControls.js`.
            - Final results display correctly.
            - All UI elements in `EducatorPollDisplay.js` and relevant parts of `PresentationControls.js` behave as expected.
            - No console errors related to poll functionality.
            - Vote counts clear from the UI when navigating to a new encounter or changing scenarios.
- Overall Acceptance tests for step-4.1: **DONE**
    - Poll-related state and logic are fully managed by the `useEducatorPolls.js` custom hook.
    - `EducatorPanel.js` is simplified, using the hook (or passing its results) to provide poll state and handlers to child components.
    - `EducatorPollDisplay.js` and `PresentationControls.js` receive necessary data and functions from the hook.
    - All poll functionalities (starting, running, ending, displaying results) are intact and visually consistent.
    - Server-side interactions are verified.
- Template: Logic from step-4.1 (Poll Management) can serve as a template.

#### step-4.2: User Management Logic (UserManagementPanel) **DONE**
- Goal: Evaluate if state (userList, totalUsers, badges, loadingBadges, badgeModal, inputModal) and logic (handleAwardXP, openBadgeModal, awardBadgeToUser, fetchBadges, bulk award actions, socket handlers for user updates) related to user management can be moved into a custom hook (e.g., `useUserManagement.js`). Ensure `UserManagementPanel.js` handles its own modal rendering.
- **Note:** The client-side structural refactoring for `useUserManagement` and its integration into `UserManagementPanel` is complete. Server-side adjustments for user list targeting (`sendUserList`) and robust XP/Badge awarding (including DB interactions and client notifications) have been implemented, debugged, and are confirmed working. The core logic for awarding XP and Badges (individual and to all) and notifying users is fully functional end-to-end. The `useUserManagement.js` hook now correctly manages the state and emits the necessary socket events for these actions, and related server-side handlers in `server.js` process these events and interact with the database correctly.
- Files:
    - `client/src/components/EducatorPanel.js`
    - `client/src/hooks/useUserManagement.js`
    - `client/src/components/EducatorPanel/UserManagementPanel.js`
    - `server.js` (for backend socket handlers - no changes expected for this sub-task)
- Acceptance tests:
    - User management state and logic (including modal state and control) are fully encapsulated in the `useUserManagement` hook.
    - `EducatorPanel.js` utilizes this hook and passes all necessary state and handlers to `UserManagementPanel.js`.
    - `UserManagementPanel.js` renders all its associated UI, including the XP award input modal and the Badge selection modal, using the props derived from the hook.
    - Rendering logic for user management modals is removed from `EducatorPanel.js`.
    - All user management functionalities (displaying users, awarding XP/badges, popups for recipients) work correctly and remain visually consistent.
- Template: `N/A`

#### step-4.3: Scenario and Encounter Logic (ScenarioExplorer, BreadcrumbTrail, PreviewPane) **DONE**
- Goal: Extract state and logic related to scenario/encounter management and navigation from `EducatorPanel.js` into one or more custom hooks (e.g., `useScenarioManager.js` or `useEncounterNavigation.js`). Integrate these hooks with `ScenarioExplorer.js`, `BreadcrumbTrail.js`, and `PreviewPane.js`. Ensure correct server-side interactions for fetching and navigating encounters, and conduct thorough end-to-end testing.
- Sub-steps:
    - **4.3.1: Design and Implement Scenario/Encounter Hook(s):** **DONE**
        - Goal: Create hook(s) to manage state (e.g., `scenarios`, `selectedScenarioId`, `currentEncounter`, `encounterPath`, `longestPath`, `encounterCache`, `breadcrumbsLoading`) and logic (e.g., `fetchScenarios`, `handleScenarioChange`, `fetchEncounterData`, `navigateToBreadcrumb`, `calculateLongestPath`, `prefetchFutureEncounters`, socket handlers for `TravelToID` and related encounter updates).
        - Files: `client/src/hooks/useScenarioManager.js` (new), `client/src/components/EducatorPanel.js` (for reference).
        - Acceptance tests:
            - Hook(s) manage all specified scenario/encounter state.
            - Hook(s) expose necessary functions (e.g., for fetching data, handling navigation) and state values.
            - Socket event listeners for encounter updates are correctly set up and cleaned up.
        - Summary: Created `useScenarioManager.js` and migrated core logic from `EducatorPanel.js` for fetching scenarios, fetching individual/silent encounter data, calculating longest path (including `computeScenarioMaxDepth` and `findAllPathsRecursive` helpers), prefetching future encounters, handling scenario selection (`selectScenario`), and unified encounter navigation (`navigateToEncounter`). The hook takes `currentGameId`, `isPresentationActive`, `userSub`, and an `onNavigationPollClear` callback as parameters. It exposes relevant state and an `actions` object. The actual `postMessage` logic for `loadEncounterInDisplay` remains outside the hook, to be triggered by `EducatorPanel.js` based on state changes from this hook.
    - **4.3.2: Initial Hook Integration with Components:** **DONE**
        - Goal: Refactor `ScenarioExplorer.js`, `BreadcrumbTrail.js`, and `PreviewPane.js` to initially connect to and consume the new scenario/encounter hook(s).
        - Files: 
            - `client/src/components/EducatorPanel.js`
            - `client/src/components/EducatorPanel/ScenarioExplorer.js` (Prepared)
            - `client/src/components/EducatorPanel/BreadcrumbTrail.js` (Prepared)
            - `client/src/components/EducatorPanel/PreviewPane.js` (Prepared)
        - Acceptance tests:
            - Components are successfully connected to the hook(s) and receive data/functions.
            - `EducatorPanel.js` is updated to facilitate this.
        - Summary: `useScenarioManager` hook is instantiated in `EducatorPanel.js`. State and actions from the hook are correctly passed as props to `ScenarioExplorer.js`, `BreadcrumbTrail.js`, and `PreviewPane.js`. The components are prepared to use these props.
    - **4.3.3: Verify Component Rendering Logic Migration:** **DONE**
        - Goal: Ensure the internal rendering logic of `ScenarioExplorer.js`, `BreadcrumbTrail.js`, and `PreviewPane.js` is fully driven by the hook(s). Confirm removal of related conditional rendering from `EducatorPanel.js`.
        - Files: 
            - `client/src/components/EducatorPanel.js`
            - `client/src/components/EducatorPanel/ScenarioExplorer.js` (Verified)
            - `client/src/components/EducatorPanel/BreadcrumbTrail.js` (Verified)
            - `client/src/components/EducatorPanel/PreviewPane.js` (Verified)
        - Acceptance tests:
            - Components' rendering logic exclusively uses hook-provided data for scenario/encounter UI.
            - No related conditional rendering remains in `EducatorPanel.js`.
            - Visual consistency is maintained.
        - Summary: Relevant state and logic previously in `EducatorPanel.js` (e.g., local state for scenarios, encounters, path, loading, and functions like `fetchScenarios`, `handleScenarioChange`, `fetchEncounterData`, `navigateToBreadcrumb`) have been removed or commented out. Child components (`ScenarioExplorer.js`, `BreadcrumbTrail.js`, `PreviewPane.js`) are receiving props from `useScenarioManager` via `EducatorPanel.js`.
    - **4.3.4: Verify Server-Side Interactions for Scenarios/Encounters:** **DONE**
        - Goal: Confirm that client-side actions (e.g., fetching scenario list, fetching specific encounter data, navigating via `TravelToID`) are correctly handled by the server (API endpoints and socket handlers).
        - Files: `server.js` (read-only, for API and socket verification), relevant hook files.
        - Acceptance tests:
            - Server correctly provides scenario lists and encounter data via API calls.
            - Server correctly handles `TravelToID` socket events and broadcasts updates.
            - Hook(s) correctly update state based on API responses and server-sent socket events.
    - **4.3.5: End-to-End Testing of Scenario/Encounter Management:** **DONE**
        - Goal: Perform comprehensive testing of all scenario and encounter functionalities: loading scenario list, selecting a scenario, displaying initial encounter preview, navigating through encounters using breadcrumbs and other controls, prefetching, and cache behavior.
        - Files: N/A (testing activity).
        - Acceptance tests:
            - Scenario list loads and displays correctly in `ScenarioExplorer.js`.
            - Selecting a scenario updates the `PreviewPane.js` and `BreadcrumbTrail.js`.
            - Navigation via breadcrumbs works, updating `currentEncounter` and `PreviewPane.js`.
            - `longestPath` is calculated and displayed correctly.
            - Encounter data is fetched and cached as expected.
            - `PreviewPane.js` updates correctly based on `currentEncounter` and presentation state.
            - No console errors related to scenario/encounter functionality.
- Overall Acceptance tests for step-4.3: **DONE**
    - Scenario/encounter related state and logic are fully managed by the `useScenarioManager.js` hook.
    - `EducatorPanel.js` is simplified.
    - `ScenarioExplorer.js`, `BreadcrumbTrail.js`, and `PreviewPane.js` correctly use the hook.
    - All functionalities are intact and visually consistent.
    - Server-side interactions (fetching scenarios, encounters) are verified.
- Template: N/A

#### step-4.4: Presentation Management Logic (StartPresentationButtons, PreviewPane) **DONE**
    - Goal: Extract state and logic related to presentation management from `EducatorPanel.js` into a custom hook (`usePresentationManager.js`). Integrate this hook with `StartPresentationButtons.js` and `PreviewPane.js`. Ensure correct server-side interactions and conduct thorough testing.
    - Sub-steps:
        - **4.4.1: Design and Implement `usePresentationManager.js` Hook:** **DONE**
            - Goal: Create the `usePresentationManager.js` hook, encapsulating all presentation-related state (e.g., `isPresentationActive`, `currentEncounterForPresentation`, `presentationStartTime`) and logic (e.g., `startPresentation`, `endPresentation`, socket event handlers for presentation updates like `presentationStarted`, `presentationEnded`, `encounterChanged`).
            - Files: `client/src/hooks/usePresentationManager.js` (new), `client/src/components/EducatorPanel.js` (for reference and removal of old logic).
            - Acceptance tests:
                - Hook manages all specified presentation state.
                - Hook exposes necessary functions and state values (e.g., `isPresentationActive`, `startPresentation`, `endPresentation`).
                - Socket event listeners for presentation operations are correctly set up and cleaned up within the hook.
        - **4.4.2: Initial Hook Integration with Components:** **DONE**
            - Goal: Refactor `StartPresentationButtons.js` and `PreviewPane.js` (if it consumes presentation state directly) to connect to and consume `usePresentationManager.js`. This involves passing the necessary state and functions from the hook to these components, typically via props if `EducatorPanel.js` consumes the hook, or by direct consumption.
            - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/StartPresentationButtons.js`, `client/src/components/EducatorPanel/PreviewPane.js`.
            - Acceptance tests:
                - `StartPresentationButtons.js` and `PreviewPane.js` (if applicable) are successfully connected to the hook and receive its data/functions.
                - `EducatorPanel.js` is updated to facilitate this connection (e.g., instantiating the hook and passing props).
        - **4.4.3: Verify Component Rendering Logic Migration:** **DONE**
            - Goal: Ensure that the internal rendering logic of `StartPresentationButtons.js` (and `PreviewPane.js` if relevant) is fully updated to be driven by the state and functions provided by `usePresentationManager.js`. Confirm that all presentation-related conditional rendering and display logic has been removed from `EducatorPanel.js`.
            - Files: `client/src/components/EducatorPanel.js`, `client/src/components/EducatorPanel/StartPresentationButtons.js`, `client/src/components/EducatorPanel/PreviewPane.js`.
            - Acceptance tests:
                - `StartPresentationButtons.js` (and `PreviewPane.js`) internal rendering logic exclusively uses hook-provided data/functions for presentation-related UI.
                - No presentation-related conditional rendering remains in `EducatorPanel.js`.
                - Visual consistency of presentation control elements is maintained.
        - **4.4.4: Verify Server-Side Interactions for Presentation State:** **DONE**
            - Goal: Confirm that client-side presentation actions triggered via the hook (e.g., starting a presentation, ending a presentation) are correctly handled by the server (`server.js` socket handlers), and that server-sent presentation events (e.g., `presentationStarted`, `presentationEnded`) are correctly received and processed by the hook. This includes verifying any state changes on the server that dictate what clients see (e.g., `is_presenting` flags in user or session data).
            - Files: `server.js` (read-only, for verification), `client/src/hooks/usePresentationManager.js`.
            - Acceptance tests:
                - Server correctly processes `startPresentation` and `endPresentation` events from the client.
                - Server correctly emits relevant events to clients when presentation state changes.
                - Hook correctly updates state based on server events.
                - Any associated server-side state (e.g., `is_presenting` flags) is correctly updated.
        - **4.4.5: End-to-End Testing of Presentation Management:** **DONE**
            - Goal: Perform comprehensive testing of all presentation functionalities: starting a presentation, ensuring client views update accordingly, educator ending the presentation, and client views reflecting this. Test scenarios like educator joining, starting presentation, then a student joining – does the student see the active presentation?
            - Files: N/A (testing activity).
            - Acceptance tests:
                - Educator can successfully start and end presentations.
                - `isPresentationActive` state is correctly reflected in the UI (e.g., button text/state in `StartPresentationButtons.js`, content in `PreviewPane.js`).
                - All client applications (student, audience) correctly reflect the presentation status (active/inactive) and current encounter.
                - No console errors related to presentation functionality.
    - Overall Acceptance tests for step-4.4: **DONE**
        - Presentation-related state and logic are fully managed by the `usePresentationManager.js` custom hook.
        - `EducatorPanel.js` is simplified, using the hook (or passing its results) to provide presentation state and handlers to child components.
        - `StartPresentationButtons.js` and `PreviewPane.js` receive necessary data and functions from the hook.
        - All presentation functionalities (starting, ending, client view synchronization) are intact and visually consistent.
        - Server-side interactions are verified.
    - Template: Logic from step-4.1 (Poll Management) can serve as a template.

### step-5: Refactor EducatorDebugPanel.js **DONE**
- Goal: Refactor `EducatorDebugPanel.js` to ensure it is fully functional and meets the requirements of the refactoring plan.
- Files: `client/src/components/EducatorPanel/EducatorDebugPanel.js`
- Acceptance tests:
    - EducatorDebugPanel.js is fully functional and meets the requirements of the refactoring plan.
    - All necessary components and logic are correctly implemented.
    - No console errors related to EducatorDebugPanel functionality.
- Template: N/A

## Milestone Summary
All planned steps (step-1 through step-5) for the refactoring of `EducatorPanel.js` as outlined in this document are now **DONE**.
- **Step 1 (Analysis):** Completed, providing a clear understanding of `EducatorPanel.js`.
- **Step 2 (Sub-component Stubbing):** Completed, with all stubs created.
- **Step 3 (UI Migration):** Completed, with UI elements moved to respective sub-components (`EducatorPollDisplay`, `UserManagementPanel`, `PresentationControls`, `ScenarioExplorer`, `InstructionManager`, `PreviewPane`, `StartPresentationButtons`, `BreadcrumbTrail`).
- **Step 4 (State and Logic Refactoring):** Completed, with logic extracted into custom hooks (`useEducatorPolls`, `useUserManagement`, `useScenarioManager`, `usePresentationManager`).
- **Step 5 (EducatorDebugPanel Refactoring):** Completed, ensuring its functionality.

The `EducatorPanel.js` component has been significantly simplified by breaking it down into smaller components and custom hooks.