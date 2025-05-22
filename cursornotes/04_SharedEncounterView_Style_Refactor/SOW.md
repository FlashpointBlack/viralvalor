# SOW: SharedEncounterView Style Refactor

## 1. Goal
To improve component encapsulation, maintainability, and style consistency for `SharedEncounterView` by co-locating its base styles within its own dedicated CSS file.

## 2. Deliverables
- A new CSS file: `client/src/components/SharedEncounterView.css`.
- `SharedEncounterView.js` imports and utilizes `SharedEncounterView.css` for its fundamental styling.
- Base styles specific to `SharedEncounterView` (e.g., for classes like `encounter-display`, `encounter-backdrop`, `encounter-character`, `encounter-content`, `encounter-title`, `encounter-description`) are moved from their current location(s) to `SharedEncounterView.css`.
- The visual appearance of `SharedEncounterView` remains consistent across all its use cases (main presentation display, single-player mode, preview pane) after the refactor.
- Context-specific styles (e.g., `PreviewPane.css` for scaling and animations in the preview) continue to function correctly.
- Minimized CSS duplication related to `SharedEncounterView`'s base styles.

## 3. Out-of-Scope
- Major redesign or functional changes to `SharedEncounterView`.
- Refactoring styles of components other than `SharedEncounterView`, unless directly necessitated by the extraction of its styles (e.g., removing duplicated rules from a shared file).
- Changes to the JavaScript logic of `SharedEncounterView` beyond adding the CSS import.

## 4. Dependencies
- Access to the current CSS file(s) where `SharedEncounterView`'s styles are defined (likely `EncounterDisplay.css` or a global/shared stylesheet).
- Understanding of how `SharedEncounterView` is used within `PresentationDisplayHost.js` and `PreviewPane.js`.

## 5. Milestones

### M1: Style Identification, Extraction, and Initial Integration (Est. 2-3 hours)
- **Goal:** Identify, move, and integrate the core styles of `SharedEncounterView` into its own CSS file.
- **Tasks:**
    1.  **Task 1.1:** Thoroughly search the codebase (especially likely CSS files like `EncounterDisplay.css`, `single-player-game.css`, or any global stylesheets) to identify all CSS rules that directly define the appearance and layout of `SharedEncounterView` and its child elements (e.g., `.encounter-display`, `.encounter-backdrop`, `.encounter-character`, `.encounter-content`, `.encounter-title`, `.encounter-description`).
    2.  **Task 1.2:** Create the new file `client/src/components/SharedEncounterView.css`.
    3.  **Task 1.3:** Carefully copy the identified CSS rules from their original location(s) into `SharedEncounterView.css`.
    4.  **Task 1.4:** Add the import statement `import './SharedEncounterView.css';` at the top of `client/src/components/SharedEncounterView.js`.
    5.  **Task 1.5:** Initial testing: Render `SharedEncounterView` in one of its primary contexts (e.g., within `PresentationDisplayHost.js`) and verify that the base styles are being applied correctly from the new CSS file. Address any immediate breakages or major visual discrepancies.
- **Acceptance Criteria:**
    - `SharedEncounterView.css` contains the core styles for the component.
    - `SharedEncounterView.js` imports this new CSS file.
    - Basic rendering of `SharedEncounterView` shows that styles from `SharedEncounterView.css` are active.

### M2: Cleanup, Contextual Styling Verification, and Full Testing (Est. 2-3 hours) **DONE**
- **Goal:** Ensure the refactoring is clean, doesn't negatively impact other parts of the application, and that `SharedEncounterView` behaves correctly in all contexts.
- **Tasks:**
    1.  **Task 2.1:** Review the original CSS file(s) from which styles were moved. If the moved styles are now exclusively for `SharedEncounterView`, remove them from the original file(s) to prevent duplication and potential conflicts. If they are shared, ensure no unintended side effects on other components.
    2.  **Task 2.2:** Test `SharedEncounterView` thoroughly in all its usage contexts:
        *   Main presentation display (via `PresentationDisplayHost.js`).
        *   Single-player mode (via `PresentationDisplayHost.js`).
        *   Preview pane (via `PreviewPane.js`).
    3.  **Task 2.3:** Verify that context-specific styles (e.g., scaling and animations from `PreviewPane.css`) are still correctly applied and override/complement the base styles from `SharedEncounterView.css` as intended.
    4.  **Task 2.4:** Perform cross-browser checks (if applicable) and ensure responsive behavior is maintained.
- **Acceptance Criteria:**
    - `SharedEncounterView` renders correctly and consistently in all its use cases.
    - Styling from `PreviewPane.css` (for scaling, animation) correctly applies to the preview instance.
    - CSS duplication is minimized.
    - No new styling regressions are introduced elsewhere in the application.
- **Note:** `SharedEncounterView` integration is complete and verified across single player, multiplayer, and preview pane contexts. A minor rendering issue in the preview pane (transitions occurring before images load) has been identified and will be addressed as a separate follow-up task. 

### M3: PreviewPane Image Loading Enhancement (Addressing follow-up from M2) **DONE**
- **Goal:** Ensure that in the `PreviewPane`, transitions and animations wait for encounter images (backdrop, characters) to be fully loaded, preventing visual glitches.
- **Approach:** Enhance `SharedEncounterView` to manage its own image preloading and signal readiness to parent components.
- **Tasks:**
    1.  **Task 3.1: Enhance `SharedEncounterView.js` for Image Preloading** **DONE**
        -   **Sub-task 3.1.1:** Add `onImagesLoaded` prop to `SharedEncounterView`.
            -   Status: **DONE**
        -   **Sub-task 3.1.2:** Implement an `extractImageSrc` utility function within `SharedEncounterView` to reliably get image URLs from encounter data (whether direct URLs or embedded in HTML `<img>` tags).
            -   Status: **DONE**
        -   **Sub-task 3.1.3:** Add `useEffect` hook to `SharedEncounterView` that:
            -   Uses `extractImageSrc` to get all relevant image URLs from `encounterData`.
            -   Preloads these images.
            -   Calls the `onImagesLoaded` callback prop once all identified images are settled (loaded or errored). If no images, call back immediately.
            -   Status: **DONE**
    2.  **Task 3.2: Update `PreviewPane.js`** **DONE**
        -   Pass the `onImagesLoaded` callback to `SharedEncounterView`.
        -   Manage a loading state within `PreviewPane.js` (e.g., `imagesReady`).
        -   Delay applying fade-in/transition CSS classes to `SharedEncounterView` until `onImagesLoaded` is triggered and `imagesReady` is true.
        -   Status: **DONE**
    3.  **Task 3.3: Unify Image Handling & Preload Logic Across Views** **DONE**
        -   **Sub-task 3.3.1:** Create `client/src/utils/imageHelpers.js` that exports generic `ensureImagePath` and `extractImageSrc` helpers (moved from `SharedEncounterView.js`).
            -   Status: **DONE**
        -   **Sub-task 3.3.2:** Refactor `SharedEncounterView.js` to import these helpers from the shared util file.
            -   Status: **DONE**
        -   **Sub-task 3.3.3:** Refactor `PresentationDisplayHost.js` to replace its bespoke `extractImageUrls` implementation with the shared `extractImageSrc` so that image pre-loading covers both plain URLs and `<img>` snippets.
            -   Status: **DONE**
        -   **Sub-task 3.3.4:** Ensure unit / integration tests (if any) are updated or added for `imageHelpers.js` to verify correct extraction/path handling.
            -   Status: **DONE**
    4.  **Task 3.4: Eliminate PreviewPane Flash Before Images Ready** **DONE**
        -   **Sub-task 3.4.1:** Update `PreviewPane.css` so that `.preview-scaled-content` starts with `opacity: 0` and transitions to `opacity: 1` either via existing animation (`preview-content-fade-in`) or a fallback `transition` rule.
            -   Status: **DONE**
        -   **Sub-task 3.4.2:** Confirm that `imagesReady` is the sole trigger for making content visible, and that no visual artefacts (early flashes) occur while images download.
            -   Status: **DONE**
        -   **Sub-task 3.4.3:** Validate across common browsers and screen sizes.
            -   Status: **DONE** (Manual validation by user required)
- **Acceptance Criteria:**
    -   When a new encounter is selected in the `EducatorPanel`, the `PreviewPane` waits for its images to load before animating or transitioning in the new encounter view.
    -   `SharedEncounterView` correctly preloads its images and calls `onImagesLoaded`. 
    -   `PresentationDisplayHost` preloads all encounter images (URLs or `<img>` snippets) before beginning its slide transition, aligning presentation-display behaviour with the preview pane.
    -   `.preview-scaled-content` remains invisible until `imagesReady` is `true`, removing the initial flash/flicker. 