# Plan: M6 - Implement Redirect Shim & Monitor Logs

- Goal: Implement a temporary redirect middleware to forward requests from legacy root-level URLs to their new `/api/*` counterparts, including a `Deprecation` header. Allow for manual testing since the site is not live.
- Est. Time: 1 hour (implementation) + testing time.

---

### step-00: Define Legacy to New Route Mappings  **DONE**
- Goal: Identify all legacy routes that need redirection and map them to their new `/api/` equivalents.
- Files: N/A (documentation within this plan)
- Acceptance tests:
    - A comprehensive list of old paths and their corresponding new `/api/...` paths is documented.
- Details (updated after reviewing `server.js`):
    - `/users/*` → `/api/users/*`
    - `/messages/*` → `/api/messages/*`
    - `/journal/*` → `/api/journal/*`
    - `/test-db` → `/api/selftest/test-db` (from legacy self-test setup)
    - `/run-test` → `/api/selftest/run-test` (from legacy self-test setup)
    - `/test-auth-ping` → `/api/selftest/test-auth-ping` (from legacy self-test setup)
    - `/am-admin` → `/api/am-admin` (ad-hoc in `server.js`)
    - `/am-educator` → `/api/am-educator` (ad-hoc in `server.js`)
    - Note: `/images/*` for static assets and the SPA fallback `*` will not be redirected by this shim.

### step-01: Create Redirect Shim Middleware  **DONE**
- Goal: Develop an Express middleware function that handles the 301 redirects and adds the `Deprecation` header.
- Files: `src/middleware/redirectShim.js` (new file)
- Acceptance tests:
    - Middleware function correctly identifies legacy paths based on the defined mappings.
    - Middleware issues a 301 redirect to the new path.
    - Middleware includes a `Deprecation: true` header (or similar, e.g., `Deprecation: date="<removal_date>"`) in the response.
    - Middleware calls `next()` if the path does not match any legacy route.

### step-02: Integrate Redirect Shim into `server.js`  **DONE**
- Goal: Mount the redirect shim middleware in the main `server.js` file.
- Files: `server.js`
- Acceptance tests:
    - Shim is mounted *before* any legacy route handlers (that will eventually be removed) and *before* the main `/api` router.
    - Server starts without errors.

### step-03: Manual Testing of Redirects  **DONE**
- Goal: Verify that all defined legacy routes are correctly redirected.
- Files: N/A (testing procedure)
- Acceptance tests:
    - Accessing an old URL (e.g., `/users/1`) in a browser or with `curl` results in a 301 redirect to the new URL (e.g., `/api/users/1`).
    - The redirect response includes the `Deprecation` header.
    - Non-legacy routes and `/api/*` routes continue to function normally without being redirected by the shim.
    - Test with and without trailing slashes, and with query parameters to ensure they are preserved.

### step-04: (Placeholder) Monitor Logs (Simulated)  **DONE**
- Goal: Since the site isn't live, this step is more about ensuring the logging of redirects works if needed, rather than a 24h observation period.
- Files: `server.js` (if logging needs to be added to the shim)
- Acceptance tests:
    - If a redirect occurs, a log message is generated (e.g., "Redirected legacy path X to Y"). This is optional but good practice.

### step-05: Update SOW and Plan  **DONE**
- Goal: Mark M6 as **DONE** in `01_SOW.md` and this plan.
- Files: `cursornotes/01_SOW.md`, `cursornotes/plan_M6_redirect_shim.md`
- Acceptance tests:
    - Files are updated and committed.
---

*This plan helps track the implementation of the redirect shim.* 