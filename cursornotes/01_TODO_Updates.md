# Things to Change or Updates to Make

## Tasks

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