# TODO Worklist

This file tracks pending tasks and larger refactoring items that are not part of an active milestone but should be addressed in the future.

## Code Cleanup & Refactoring

- **Remove `EducatorDebugPanel.js`**: The component `client/src/components/EducatorPanel/EducatorDebugPanel.js` and any related import/usage within `EducatorPanel.js` should be removed from the codebase. It was part of an earlier refactoring plan but has been deemed unnecessary. 


- **Standardize API Call Patterns & Simplify Server Routing:**
    - **Goal:** Ensure all client-side API calls use a consistent pattern (e.g., relative paths like `feature/endpoint` with a global `axios.defaults.baseURL = '/api'`) to simplify server-side routing and eliminate issues like the `/api/api/...` double prefix.
    - **Current State:**
        - Client makes API calls in multiple ways:
            - Explicitly prefixed with `/api/` (e.g., `/api/conversations`, `/api/user/me`).
            - Some relative paths (e.g., `user/by-sub/...`) relying on client proxy.
            - One instance observed where `/api/conversations` resulted in `/api/api/conversations` at the server, requiring a specific server-side workaround.
        - Server routing is complex to accommodate these varied patterns, with routes mounted at the root, under `/api`, and with nested `/api` handling for the conversation endpoint.
    - **Proposed Client-Side Changes:**
        1.  Establish a global `axios.defaults.baseURL = '/api';` in the client setup.
        2.  Modify all `axios` calls that currently include `/api/` in their path to use relative paths (e.g., change `axios.get('/api/conversations')` to `axios.get('conversations')`).
        3.  Ensure calls that were previously entirely relative (e.g., `axios.get('user/by-sub')`) continue to work as expected with the new `baseURL` (they should become `/api/user/by-sub`).
    - **Proposed Server-Side Changes (after client changes):**
        1.  Simplify `src/routes/index.js`:
            - Remove the nested `/api` handling for message routes (`router.use('/api', messagesApiSubRouter);`).
            - Mount message routes directly on `apiRouter` (e.g., `setupMessageRoutes(router);`).
        2.  Potentially remove root-level API handlers in `server.js` (e.g., `setupMessageRoutes(app);`, `setupUserRoutes(userRouter); app.use('/', userRouter);`) if all API traffic is consistently routed through `/api`. This would involve ensuring that routes currently handled at the root (like `/users`, `/user/by-sub`) are accessible via `/api/users`, `/api/user/by-sub` and the client calls them accordingly.
    - **Acceptance Criteria:**
        - All client-side API calls correctly reach their intended server-side handlers via the `/api/...` path.
        - Server-side routing logic is simplified, especially in `src/routes/index.js`.
        - The `/api/api/...` issue is resolved at the client-side source.
        - All existing application functionality relying on these API calls remains operational. 

- **Investigate and Fix `PreviewPane` Flash Issue:**
    - **Goal:** Eliminate the visual flash/flicker in the `PreviewPane` (`client/src/components/EducatorPanel/PreviewPane.js`) when new encounter content is being loaded.
    - **Current State:** Despite efforts in SOW `04_SharedEncounterView_Style_Refactor` (Milestone M3) to synchronize content visibility with image loading (making `.preview-scaled-content` initially `opacity: 0` and fading in via `preview-content-fade-in` class when images are ready), a flash of content still reportedly occurs.
    - **Possible Areas to Investigate:**
        - Timing of CSS class application for animations/transitions.
        - Interaction between `SharedEncounterView`'s internal rendering and `PreviewPane`'s state updates (`isLoading`, `imagesReady`).
        - React component lifecycle and re-render triggers in `PreviewPane.js` and `SharedEncounterView.js`.
        - Potential interference from other CSS rules or JavaScript behavior affecting visibility or layout before intended.
        - Browser-specific rendering quirks.
    - **Acceptance Criteria:**
        - The `PreviewPane` displays a smooth transition from a blank/loading state to the fully rendered encounter content without any intermediate flash of unstyled or prematurely revealed elements. 

- Implement a debug mode toggle system (e.g., global flag, per-component flags, or environment variable) to control console debug output for major pages/components (like `PresentationDisplayHost.js`, `EducatorPanel.js`, etc.) to avoid spamming the console during normal operation and allow for easier debugging when needed.
