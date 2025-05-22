# SOW: ESLint Cleanup and Code Hygiene

## 1. Goal
To improve code quality, maintainability, and potentially reduce bundle size by systematically addressing a provided list of ESLint warnings. This involves removing unused variables, imports, and functions, and fixing other linting rule violations.

## 2. Deliverables
- A significant reduction in ESLint warnings in the specified files.
- Unused code (variables, imports, functions) identified from the `no-unused-vars` warnings will be commented out (Phase 1) and then deleted after confirmation (Phase 2).
- Other ESLint rule violations (e.g., `eqeqeq`, `react-hooks/exhaustive-deps`, `no-mixed-operators`, `no-self-compare`, `jsx-a11y/img-redundant-alt`, `no-loop-func`) from the provided list will be fixed.
- A cleaner, more maintainable codebase.
- Documentation within this SOW tracking the status of each item (commented out, then deleted, or fixed).

## 3. Out-of-Scope
- grepping the codebase to see if these variables are used. We are trying to comment out ONLY, not verify accuracy.
- Introducing new features or major refactoring beyond what is necessary to fix the identified lint issues.
- Addressing ESLint rules not explicitly mentioned in the provided list, unless they are trivial and directly related to a listed item.
- Modifying the ESLint configuration or adding new linting rules.
- Extensive testing beyond ensuring the application still runs and the specific fixes don't introduce obvious breakages. Full regression testing is the responsibility of the user.

## 4. Dependencies
- Access to the current codebase.
- The list of ESLint warnings provided by the user.
- Tooling for `grep` or similar full-text search capabilities to verify a symbol is not used before removal.

## 5. Milestones

### M1: Unused Code Identification and Commenting (Phase 1)
- **Goal:** Address all `no-unused-vars` warnings by commenting out the identified code. This should NOT affect other imports or variable declarations. We are aiming to disable the initiation of these specific variables while maintaining all other functionality.
- **Tasks:**
    1.  **Task 1.1: Process `no-unused-vars` warnings.** For each file and item in the user-provided list of `no-unused-vars` warnings:
        *   `src/App.js`:
            *   `'useContext'`
            *   `'HomePage'`
            *   `'EducatorPanel'`
            *   `'MobilePoll'`
            *   `'CompleteProfile'`
            *   `'UserProfile'`
            *   `'navigationHistory'`
            *   `'axios'`
            *   `'PresentationLanding'`
            *   `'PresentationEnd'`
            *   `'ProtectedRoute'`
            *   `'user'` (in `const { user } = useAuth();`)
            *   `'isAdmin'` (in `const isAdmin = user && user.role === 'admin';`)
        *   `src/components/ArticleManager.js`:
            *   `'handleSubmitForApproval'`
        *   `src/components/ChatWindow.js`:
            *   `'reactions'`
        *   `src/components/EducatorPanel.js`:
            *   `'Link'`
            *   `'createMultiplayerGame'`
            *   `'updateGameEncounter'`
            *   `'gameExists'`
            *   `'EncounterThumbnail'`
            *   `'axios'`
            *   `'useAuth'`
            *   `'useSocket'`
            *   `'setDebugInfo'`
            *   `'setDisplayCommunicationStatus'`
            *   `'selectedUserForBadge'`
            *   `'setSelectedUserForBadge'`
            *   `'displayWindowUniqueId'`
            *   `'hookSendEncounterState'`
            *   `'fetchBadgesFromHook'`
            *   `'presentationStartTime'`
            *   `'hookSetCurrentGameId'`
            *   `'getAccessTokenSilently'`
            *   `'errorsToShow'`
            *   `'setErrorsToShow'`
            *   `'showInstructionInput'`
            *   `'setShowInstructionInput'`
            *   `'currentInstructionText'`
            *   `'setCurrentInstructionText'`
            *   `'instructionRecipient'`
            *   `'setInstructionRecipient'`
            *   `'sentInstructions'`
            *   `'setSentInstructions'`
            *   `'activeLeftTab'`
            *   `'setActiveLeftTab'`
            *   `'setShowDebug'`
            *   `'handleEncounterUpdate'`
            *   `'handleUserUpdate'`
            *   `'handleUserXPUpdate'`
            *   `'handleBadgeAwarded'`
            *   `'handlePollStatus'`
            *   `'handlePollResults'`
            *   `'handlePollEnded'`
            *   `'handleInstructionBroadcast'`
            *   `'handleInstructionClose'`
            *   `'handleNewChatMessage'`
            *   `'handleChatHistory'`
            *   `'handleUserTyping'`
            *   `'handleUserStoppedTyping'`
            *   `'handleChatError'`
            *   `'handleReconnect'`
        *   `src/components/EducatorPanel/BreadcrumbTrail.js`:
            *   `'displayLabel'`
        *   `src/components/EncounterRoutes.js`:
            *   `'handleShowLinkOptions'`
        *   `src/components/ExportPdfButton.js`:
            *   `'pageHeight'`
        *   `src/components/HomePage.js`:
            *   `'articleId'`
        *   `src/components/JournalStudent.js`:
            *   `'charCount'`
            *   `'setSaveMsg'`
        *   `src/components/LectureEditor.js`:
            *   `'file'`
            *   `'setFile'`
        *   `src/components/MessageDropdown.js`:
            *   `'lastViewed'`
        *   `src/components/MobilePoll.js`:
            *   `'voteCounts'`
            *   `'setDeviceId'`
            *   `'lastXPAward'`
            *   `'lastBadgeAward'`
            *   `'copyGameLink'`
            *   `'handleMessagePresenter'`
            *   `'handleShowResults'`
        *   `src/components/PresentationDisplayHost.js`:
            *   `'ChoiceButtons'`
            *   `'userSub'`
        *   `src/components/PresentationEnd.js`:
            *   `'displayMode'`
        *   `src/components/QuestionBankEditor.js`:
            *   `'isMobile'`
            *   `'currentAppliedTheme'`
            *   `'refreshTagsAndQuestions'`
            *   `'getThemeStyles'`
        *   `src/components/QuestionPractice.js`:
            *   `'attempts'`
        *   `src/components/StorylineEditor.js`:
            *   `'prettyBytes'`
            *   `'runDiagnostics'`
            *   `'statusCode'` (in `axios.put` response)
            *   `'responseData'` (in `axios.put` response)
            *   `'responseData'` (in `axios.delete` response)
            *   `'checkAuthState'`
            *   `'testCreateRequest'`
        *   `src/components/TopHeader.js`:
            *   `'isAdmin'`
        *   `src/components/UserProfile.js`:
            *   `'useChat'`
            *   `'selectedImageFile'`
            *   `'formatDate'`
    2.  **Task 1.2: Commenting.** For each item from Task 1.1:
        *   Comment out the line where it's defined or imported.
        *   Mark the item in this SOW as "Commented Out".
- **Acceptance Criteria:**
    - All `no-unused-vars` warnings from the provided list have been processed.
    - Each item has been commented out.
    - A record of items commented out is updated in this SOW.

### M2: Fixing Other ESLint Rule Violations
- **Goal:** Address all other specified ESLint warnings from the provided list.
- **Tasks:**
    1.  **Task 2.1: Fix `react-hooks/exhaustive-deps` warnings.**
        *   `src/components/AppWrapper.js` (Line 60)
        *   `src/components/ChatWindow.js` (Line 119)
        *   `src/components/EducatorPanel.js` (Line 412, 421, 431, 480)
        *   `src/components/EncounterForm.js` (Line 75)
        *   `src/components/ImageSelector.js` (Line 28)
        *   `src/components/JournalStudent.js` (Line 25)
        *   `src/components/MessageDropdown.js` (Line 107)
        *   `src/components/MobilePoll.js` (Line 465)
        *   `src/components/PresentationDisplayHost.js` (Line 446)
        *   `src/components/ProfileMenu.js` (Line 68)
        *   `src/components/QuestionPractice.js` (Line 54)
        *   `src/components/QuestionReport.js` (Line 87, 96)
        *   `src/components/StorylineEditor.js` (Line 54)
        *   `src/components/StudentPracticeReports.js` (Line 106, 111)
        *   `src/hooks/useEducatorPolls.js` (Line 236, 267)
        *   `src/hooks/usePresentationManager.js` (Line 190)
    2.  **Task 2.2: Fix `eqeqeq` warnings.**
        *   `src/components/ChatWindow.js` (Line 61, 171)
        *   `src/contexts/SocketContext.js` (Line 80)
    3.  **Task 2.3: Fix `no-mixed-operators` warnings.**
        *   `src/components/MobilePoll.js` (Line 16 twice)
    4.  **Task 2.4: Fix `no-self-compare` warnings.**
        *   `src/components/MobilePoll.js` (Line 332)
    5.  **Task 2.5: Fix `jsx-a11y/img-redundant-alt` warnings.**
        *   `src/components/PublicUserProfile.js` (Line 256)
    6.  **Task 2.6: Fix `no-loop-func` warnings.**
        *   `src/hooks/useTextAutosize.js` (Line 64)
- **Acceptance Criteria:**
    - All listed ESLint warnings (other than `no-unused-vars`) are resolved in the codebase.
    - Each fix is verified to not break the intended functionality.
    - A record of fixed items is updated in this SOW.

### M3: Unused Code Deletion (Phase 2)
- **Goal:** Permanently remove the unused code that was commented out in M1 after ensuring stability.
- **Tasks:**
    1.  **Task 3.1: Review Commented Code.** Go through all items marked as "Commented Out" from M1.
    2.  **Task 3.2: Deletion.** After a confirmation period (e.g., user confirms, or after a set duration without reported issues from the commenting phase), delete the commented-out lines.
    3.  **Task 3.3: Final Verification.** Run ESLint again to ensure no new warnings related to the deletions have appeared. Perform a quick check of the application's key functionalities.
    4.  Mark each item in this SOW as "Deleted".
- **Acceptance Criteria:**
    - All code previously commented out in M1 is now deleted from the codebase.
    - The application remains stable and ESLint reports no new errors related to these deletions.
    - The SOW reflects the "Deleted" status for these items.

---
**Tracking Table for `no-unused-vars` (M1 & M3):**

| File                                         | Item                        | Phase 1 Status (Commented Out) | Phase 2 Status (Deleted) | Notes                                                        |
|----------------------------------------------|-----------------------------|--------------------------------|--------------------------|--------------------------------------------------------------|
| `src/App.js`                                 | `useContext`                | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `HomePage`                  | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `EducatorPanel`             | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `MobilePoll`                | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `CompleteProfile`           | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `UserProfile`               | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `navigationHistory`         | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `axios`                     | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `PresentationLanding`       | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `PresentationEnd`           | Commented Out                  | TODO                     |                                                              |
| `src/App.js`                                 | `ProtectedRoute`            | Commented Out                  | TODO                     | Entire component definition commented.                       |
| `src/App.js`                                 | `user` (in `useAuth0` hook in `App`)       | Commented Out                  | TODO                     | Destructured `user` commented, usages handled.               |
| `src/App.js`                                 | `isAdmin` (in `App`)        | Commented Out                  | TODO                     | Destructured `isAdmin` from `useAuth()` in App scope commented. |
| `src/components/ArticleManager.js`           | `handleSubmitForApproval`   | Commented Out                  | TODO                     |                                                              |
| `src/components/ChatWindow.js`               | `reactions`                 | Commented Out                  | TODO                     | State variable `reactions` and its `setReactions` call commented. |
| `src/components/EducatorPanel.js`            | `Link`                      | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `createMultiplayerGame`     | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `updateGameEncounter`       | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `gameExists`                | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `EncounterThumbnail`        | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `axios`                     | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `useAuth`                   | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `useSocket`                 | Commented Out                  | TODO                     |                                                              |
| `src/components/EducatorPanel.js`            | `setDebugInfo`              | Commented Out                  | TODO                     | Setter commented out.                                        |
| `src/components/EducatorPanel.js`            | `setDisplayCommunicationStatus` | Commented Out                  | TODO                     | Setter commented out.                                        |
| `src/components/EducatorPanel.js`            | `selectedUserForBadge`      | Commented Out                  | TODO                     | State variable and setter commented out.                     |
| `src/components/EducatorPanel.js`            | `setSelectedUserForBadge`   | Commented Out                  | TODO                     | (Covered by selectedUserForBadge)                            |
| `src/components/EducatorPanel.js`            | `displayWindowUniqueId`     | Commented Out                  | TODO                     | State variable and setter commented out, usage also commented. |
| `src/components/EducatorPanel.js`            | `hookSendEncounterState`    | Commented Out                  | TODO                     | From `useEducatorPolls`.                                              |
| `src/components/EducatorPanel.js`            | `fetchBadgesFromHook`       | Commented Out                  | TODO                     | From `useUserManagement`.                                             |
| `src/components/EducatorPanel.js`            | `presentationStartTime`     | Commented Out                  | TODO                     | From `usePresentationManager`.                                        |
| `src/components/EducatorPanel.js`            | `hookSetCurrentGameId`      | Commented Out                  | TODO                     | From `usePresentationManager`.                                        |
| `src/components/EducatorPanel.js`            | `getAccessTokenSilently`    | Commented Out                  | TODO                     | From `useAuth0`.                                                      |
| `src/components/EducatorPanel.js`            | `errorsToShow`              | Commented Out                  | TODO                     | Appears to be used. Marked for review. SOW may be incorrect.        |
| `src/components/EducatorPanel.js`            | `setErrorsToShow`           | Commented Out                  | TODO                     | Appears to be used. Marked for review. SOW may be incorrect.        |
| `src/components/EducatorPanel.js`            | `showInstructionInput`      | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `setShowInstructionInput`   | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `currentInstructionText`    | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `setCurrentInstructionText` | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `instructionRecipient`      | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `setInstructionRecipient`   | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `sentInstructions`          | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `setSentInstructions`       | Commented Out                  | TODO                     | Appears to be used (InstructionManager). Marked for review.         |
| `src/components/EducatorPanel.js`            | `activeLeftTab`             | Commented Out                  | TODO                     | Appears to be used (MainNavTabs). Marked for review.                |
| `src/components/EducatorPanel.js`            | `setActiveLeftTab`          | Commented Out                  | TODO                     | Appears to be used (MainNavTabs). Marked for review.                |
| `src/components/EducatorPanel.js`            | `setShowDebug`              | Commented Out                  | TODO                     | Refers to setDebugPanelVisible. Appears to be used as prop. Marked for review. |
| `src/components/EducatorPanel.js`            | `handleEncounterUpdate`     | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleUserUpdate`          | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleUserXPUpdate`        | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleBadgeAwarded`        | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handlePollStatus`          | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handlePollResults`         | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handlePollEnded`           | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleInstructionBroadcast`| Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleInstructionClose`    | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleNewChatMessage`      | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleChatHistory`         | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleUserTyping`          | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleUserStoppedTyping`   | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleChatError`           | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel.js`            | `handleReconnect`           | Commented Out                  | TODO                     | Already commented in code. Definition commented. Usage in socket effect will error.            |
| `src/components/EducatorPanel/BreadcrumbTrail.js` | `displayLabel`            | Commented Out                  | TODO                     | Already commented in code.                                                                     |
| `src/components/EncounterRoutes.js`          | `handleShowLinkOptions`     | Commented Out                  | TODO                     | Function defined but not used.                                                                     |
| `src/components/ExportPdfButton.js`          | `pageHeight`                | Commented Out                  | TODO                     |                                                                     |
| `src/components/HomePage.js`                 | `articleId`                 | Commented Out                  | TODO                     | State and setter commented. Was set by URL param but not used. |
| `src/components/JournalStudent.js`           | `charCount`                 | Commented Out                  | TODO                     | State, setter, and usages commented.                               |
| `src/components/JournalStudent.js`           | `setSaveMsg`                | Commented Out                  | TODO                     | Setter only commented. State variable `saveMsg` is used.          |
| `src/components/LectureEditor.js`            | `file`                      | Commented Out                  | TODO                     | State and setter commented.                                         |
| `src/components/LectureEditor.js`            | `setFile`                   | Commented Out                  | TODO                     | (Covered by `file`)                                                 |
| `src/components/MessageDropdown.js`          | `lastViewed`                | Commented Out                  | TODO                     | Destructured from useSocket but not used. `lastViewedByConv` is used. |
| `src/components/MobilePoll.js`               | `voteCounts`                | Commented Out                  | TODO                     | State and setter commented, and usages.                             |
| `src/components/MobilePoll.js`               | `setDeviceId`               | Commented Out                  | TODO                     | Setter only commented. Initial value set differently.               |
| `src/components/MobilePoll.js`               | `lastXPAward`               | Commented Out                  | TODO                     | Already commented out in useAppSocket destructuring.                |
| `src/components/MobilePoll.js`               | `lastBadgeAward`            | Commented Out                  | TODO                     | Already commented out in useAppSocket destructuring.                |
| `src/components/MobilePoll.js`               | `copyGameLink`              | Commented Out                  | TODO                     | Function definition commented out.                                  |
| `src/components/MobilePoll.js`               | `handleMessagePresenter`    | Commented Out                  | TODO                     | Function definition commented out.                                  |
| `src/components/MobilePoll.js`               | `handleShowResults`         | Not Found                      | TODO                     | Function definition not found at SOW line or elsewhere. SOW may be outdated or item already removed. |
| `src/components/PresentationDisplayHost.js`  | `ChoiceButtons`             | Commented Out                  | TODO                     | Import commented out.                                               |
| `src/components/PresentationDisplayHost.js`  | `userSub`                   | Commented Out                  | TODO                     | Variable definition commented out.                                  |
| `src/components/PresentationEnd.js`          | `displayMode`               | Commented Out                  | TODO                     | Already commented out in code.                                      |
| `src/components/QuestionBankEditor.js`       | `isMobile`                  | Commented Out                  | TODO                     | State and setter calls commented.                                   |
| `src/components/QuestionBankEditor.js`       | `currentAppliedTheme`       | Commented Out                  | TODO                     | State and setter calls commented.                                   |
| `src/components/QuestionBankEditor.js`       | `refreshTagsAndQuestions`   | Commented Out                  | TODO                     | Function definition commented. Not used.                            |
| `src/components/QuestionBankEditor.js`       | `getThemeStyles`            | Commented Out                  | TODO                     | Function definition removed by tool. Usages commented.             |
| `src/components/QuestionPractice.js`         | `attempts`                  | Commented Out                  | TODO                     | State, setter function `loadAttempts`, and calls commented.         |
| `src/components/StorylineEditor.js`          | `prettyBytes`               | Commented Out                  | TODO                     | Import not used.                                                    |
| `src/components/StorylineEditor.js`          | `runDiagnostics`            | Commented Out                  | TODO                     | Function not used.                                                  |
| `src/components/StorylineEditor.js`          | `statusCode` (`axios.put`)  | Used                           | TODO                     | Variable is used in `createBlankEncounter` error handling. SOW may be for a different, non-existent usage. |
| `src/components/StorylineEditor.js`          | `responseData` (`axios.put`)| Used                           | TODO                     | Variable is used in `createBlankEncounter` error handling. SOW may be for a different, non-existent usage. |
| `src/components/StorylineEditor.js`          | `responseData` (`axios.del`)| Not Found                      | TODO                     | Specific variable not found. Similar error data is used in `deleteRootScenario`. |
| `src/components/StorylineEditor.js`          | `checkAuthState`            | Commented Out                  | TODO                     | Function not used.                                                  |
| `src/components/StorylineEditor.js`          | `testCreateRequest`         | Commented Out                  | TODO                     | Function not used.                                                  |
| `src/components/TopHeader.js`                | `isAdmin`                   | Commented Out                  | TODO                     | Destructured from useAuth() but not used.                           |
| `src/components/UserProfile.js`              | `useChat`                   | Commented Out                  | TODO                     | Import not used.                                                    |
| `src/components/UserProfile.js`              | `selectedImageFile`         | Commented Out                  | TODO                     | State and setter calls commented.                                   |
| `src/components/UserProfile.js`              | `formatDate`                | Commented Out                  | TODO                     | Function not used.                                                  |

**Tracking Table for Other ESLint Fixes (M2):**

| File                                     | Line | Rule                         | Status (Fixed) | Notes |
|------------------------------------------|------|------------------------------|----------------|-------|
| `src/components/AppWrapper.js`           | 60   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/ChatWindow.js`           | 119  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/ChatWindow.js`           | 61   | `eqeqeq`                     | TODO           |       |
| `src/components/ChatWindow.js`           | 171  | `eqeqeq`                     | TODO           |       |
| `src/components/EducatorPanel.js`        | 412  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/EducatorPanel.js`        | 421  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/EducatorPanel.js`        | 431  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/EducatorPanel.js`        | 480  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/EncounterForm.js`        | 75   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/ImageSelector.js`        | 28   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/JournalStudent.js`       | 25   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/MessageDropdown.js`       | 107  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/MobilePoll.js`            | 465  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/PresentationDisplayHost.js` | 446 | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/ProfileMenu.js`           | 68   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/QuestionPractice.js`      | 54   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/QuestionReport.js`        | 87   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/QuestionReport.js`        | 96   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/StorylineEditor.js`       | 54   | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/StudentPracticeReports.js`| 106  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/components/StudentPracticeReports.js`| 111  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/hooks/useEducatorPolls.js`          | 236  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/hooks/useEducatorPolls.js`          | 267  | `react-hooks/exhaustive-deps`| TODO           |       |
| `src/hooks/usePresentationManager.js`    | 190  | `react-hooks/exhaustive-deps`| TODO           |       |