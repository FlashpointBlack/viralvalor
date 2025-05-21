# Statement of Work: Frontend Roadblocks & Refactoring Plan

## 1. Goal
Systematically refactor and improve the frontend codebase to address current development roadblocks, enhance maintainability, scalability, code quality, and developer experience, focusing on component complexity and CSS strategy.

## 2. Deliverables
- [ ] **Section 1: Critical - Component Refactoring Completed:**
    - [ ] `client/src/components/EducatorPanel.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/EncounterDisplay.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/MobilePoll.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/StorylineEditor.js` fully refactored (Stages 2 & 3 completed: Custom Hooks for State Logic, UI Componentization).
    - [ ] `client/src/components/UserManagement.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/PresentationDisplayHost.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/QuestionBankEditor.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/UserProfile.js` refactored into smaller, manageable components.
    - [ ] `client/src/components/ImageManager.js` refactored into smaller, manageable components.
- [ ] **Section 2: High Priority - CSS Strategy Unification Completed:**
    - [ ] Primary CSS methodology (e.g., CSS Modules, Styled Components, BEM/SCSS, Utility-first) decided, documented, and approved.
    - [ ] `client/src/components/OldCSS/` directory audited, and unused/redundant styles removed or integrated.
    - [ ] `*.css-Centralized` files analyzed, and their necessary styles refactored/removed and integrated into the new strategy.
    - [ ] Global styles in `client/src/theme.css`, `client/src/styles/` (and sub-files), `App.css`, `main.css`, `index.css` minimized and refocused.
    - [ ] Usage of `!important` significantly reduced/eliminated, particularly in `theme.css`.
    - [ ] Component-specific styles progressively migrated to the chosen methodology.
    - [ ] Clear documentation for the chosen CSS strategy created and approved.
- [ ] **Section 3: Medium Priority - Code & Project Structure Improvements Completed:**
    - [ ] Duplicated `ProtectedRoute` logic consolidated into a single, reusable component.
    - [ ] Clear conventions for component/view organization defined, documented, and approved.
    - [ ] Existing components from `client/src/components/` gradually restructured according to new conventions (at least 2 major components moved as examples).
    - [ ] Global header visibility logic in `App.js` refactored to be more declarative.
- [ ] **Section 4: Ongoing - Best Practices & Review Processes Established:**
    - [ ] Documented process for periodic review of React Context API usage.
    - [ ] Documented approach for investigating and addressing third-party library issues.
    - [ ] Guidelines for maintaining code cleanliness (addressing TODOs/FIXMEs) reinforced.

## 3. Out-of-Scope
- Complete rewrite of any major feature.
- Introduction of new major features not directly related to refactoring needs.
- Backend API changes (unless strictly necessary for a frontend refactoring task and clearly defined).
- Full migration of *all* existing component styles to the new CSS strategy within this SOW (progressive migration is expected, with a focus on refactored components and new development).
- Performance optimization beyond what is achieved by component breakdown and context review, unless a critical bottleneck is identified during refactoring.

## 4. Dependencies
- Access to the current frontend codebase and version control system.
- Decision-maker availability for approvals on CSS strategy and structural changes.
- Potentially, input from developers familiar with the history of the components being refactored.

## 5. Milestones

When generating a dedicate Milestone file, please use the following format for the steps to ensure each component is completely removed from educatorpanel:
4.1.1: Design and Implement Hook
4.1.2: Initial Hook Integration with Components
4.1.3: Verify Component Rendering Logic Migration
4.1.4: Verify Server-Side Interactions
4.1.5: End-to-End Testing

*   **M1: Component Refactoring - Core Group 1 (EducatorPanel & EncounterDisplay)** (Est. 8 hours) - [Plan: ./M1_EducatorPanel_Refactoring.md](./M1_EducatorPanel_Refactoring.md)
    *   Analyze and break down `EducatorPanel.js`.
    *   Implement refactoring for `EducatorPanel.js`.
    *   Analyze and break down `EncounterDisplay.js`. **BLOCKED**
    *   Implement refactoring for `EncounterDisplay.js`. **BLOCKED**
*   **M2: Component Refactoring - Core Group 2 (MobilePoll & StorylineEditor)** (Est. 8 hours)
    *   Analyze and break down `MobilePoll.js`.
    *   Implement refactoring for `MobilePoll.js`.
    *   Complete Stage 2 (Custom Hooks) for `StorylineEditor.js`.
    *   Complete Stage 3 (UI Componentization) for `StorylineEditor.js`.
*   **M3: Component Refactoring - Supporting Group 1 (UserManagement & PresentationDisplayHost)** (Est. 6-8 hours) - [Plan: ./M3_UserManagement_PresentationDisplayHost.md](./M3_UserManagement_PresentationDisplayHost.md) **IN-PROGRESS**
    *   Analyze, break down, and refactor `UserManagement.js`.
    *   Analyze, break down, and refactor `PresentationDisplayHost.js`.
*   **M4: Component Refactoring - Supporting Group 2 (QuestionBankEditor, UserProfile, ImageManager)** (Est. 6-8 hours)
    *   Analyze, break down, and refactor `QuestionBankEditor.js`.
    *   Analyze, break down, and refactor `UserProfile.js`.
    *   Analyze, break down, and refactor `ImageManager.js`.
*   **M5: CSS Strategy Definition & Initial Cleanup** (Est. 8 hours)
    *   Evaluate and decide on the primary CSS methodology. Document choice.
    *   Audit and clean up `OldCSS/` directory and `*.css-Centralized` files.
    *   Initial refactoring of global styles (`theme.css`, `App.css`, etc.) focusing on minimization and tokenization.
*   **M6: CSS Strategy Implementation - Phase 1** (Est. 8 hours)
    *   Migrate styles for at least two refactored components (from M1-M4) to the new CSS strategy.
    *   Draft CSS strategy documentation.
*   **M7: Code & Project Structure Improvements** (Est. 6 hours)
    *   Refactor `ProtectedRoute` component.
    *   Define and document component/view organization conventions.
    *   Refactor global header visibility logic in `App.js`.
    *   Move at least two existing components to the new structure as examples.
*   **M8: Documentation Finalization & Process Establishment** (Est. 4 hours)
    *   Finalize and get approval for CSS strategy documentation.
    *   Document processes for Context API review and third-party library issue investigation.
    *   Review and update guidelines for code cleanliness. 