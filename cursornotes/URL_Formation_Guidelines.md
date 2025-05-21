# Cursor AI: URL Formation Guidelines for ViralValor SPA

This document outlines simple rules for constructing URLs and paths within the ViralValor Single Page Application (SPA) to ensure consistency and prevent common errors.

## 1. Client-Side Navigation (React Router)

*   **Purpose:** Navigating between different views/pages *within* the SPA.
*   **Tools:** `Link` component from `react-router-dom`, `navigate()` function from `useNavigate()`.
*   **Rule:**
    *   Always use **absolute paths starting with a single `/`** that correspond to the routes defined in the React Router configuration (e.g., in `App.js`, `RoutesWithEncounter.js`).
    *   These paths **SHOULD NOT** include `/api` unless the link is intentionally pointing to a direct (non-SPA) backend API endpoint (which is rare for typical navigation).
*   **Examples:**
    *   Correct: `<Link to="/admin/site-health">Site Health</Link>`
    *   Correct: `navigate('/profile/user123');`
    *   Correct: `navigateToRoute('/educator-panel');` (if `navigateToRoute` is a wrapper around `navigate`)
    *   Incorrect for SPA navigation: `<Link to="/api/users">Users</Link>` (This would try to hit a backend endpoint directly, bypassing React Router for that view).

## 2. API Calls (Axios)

*   **Purpose:** Fetching data from or sending data to the backend API.
*   **Context:** `axios.defaults.baseURL` is globally set to `'/api'` in `client/src/utils/axiosSetup.js`.
*   **Rule:**
    *   When making `axios` calls (e.g., `axios.get()`, `axios.post()`), provide paths that are **relative to the `/api` base**.
    *   These paths **SHOULD NOT** start with `/api/`.
    *   These paths **SHOULD NOT** start with a leading `/` if `axios.defaults.baseURL` already contains a leading and/or trailing slash that would cause duplication (e.g., if `baseURL` was `/api/`, path should be `users/health`). Given `baseURL` is `'/api'`, paths like `'users/health'` are preferred.
*   **Examples (assuming `axios.defaults.baseURL = '/api';`):**
    *   Correct: `axios.get('users/health')` (Resulting URL: `[host]/api/users/health`)
    *   Correct: `axios.post('lectures', lectureData)` (Resulting URL: `[host]/api/lectures`)
    *   Incorrect: `axios.get('/api/users/health')` (Would result in `[host]/api/api/users/health`)
    *   Incorrect: `axios.get('/users/health')` (While this might work correctly with `baseURL = '/api'`, it's less explicit than `users/health` and could be ambiguous if `baseURL` changed. The non-leading-slash version is preferred for paths *after* the `baseURL`.)

## 3. Static Assets in `public/` directory

*   **Purpose:** Referencing images, favicons, `manifest.json`, etc., located in the `public` folder.
*   **Rule:**
    *   In HTML (`public/index.html`) or JavaScript, use paths **absolute from the domain root** (starting with `/`).
*   **Examples:**
    *   Correct (in `public/index.html`): `<link rel="icon" href="/favicon.ico" />`
    *   Correct (in JS, if needing to construct such a path): `const imageUrl = '/images/logo.png';`

## Quick Check:

*   Navigating inside the app? -> `Link to="/some/page"`
*   Calling the backend API? -> `axios.get('some/endpoint')`

---
This note is for internal guidance by Cursor AI. 