# Interclient Communications: A General Template for Real-time Features

This document outlines a general-purpose template and data flow for implementing real-time features involving communication between clients (e.g., Educator Panel, Player Poll/Game Interface) and the server. It draws upon the patterns established in systems like XP/Badge awards.

## 1. Core Communication Pattern Overview

The fundamental pattern for features requiring real-time updates across different clients typically follows these steps:

1.  **Initiation (Client A):** A user action on one client (e.g., Educator Panel) triggers the need for a state change or notification on another client or group of clients.
2.  **Event Emission (Client A to Server):** Client A emits a specifically named Socket.IO event to the server, carrying a payload with all necessary data for the server to process the action.
3.  **Processing (Server):** The server receives the event, validates the payload, performs business logic (which may include database interactions like reads, writes, or updates), and prepares a result or notification.
4.  **Targeted Notification (Server to Client B/Group):** The server emits a new Socket.IO event, targeting the specific client(s) (e.g., Client B, all clients in a game room, or even back to Client A) that need to be informed of the outcome or state change. The payload includes relevant data for the recipient(s).
5.  **Reception & UI Update (Client B/Group):** The targeted client(s) receive this event and update their UI or internal state accordingly (e.g., display a popup, refresh a list, change a display element).

## 2. Key Components & Technologies

-   **Socket.IO:** The core library for enabling real-time, bi-directional, event-based communication between web clients and the server.
-   **React Context API (e.g., `client/src/contexts/SocketContext.js`):**
    -   Manages the global Socket.IO client instance.
    -   Can house global event listeners for events that have wide-ranging impact or update global state.
    -   Provides the socket instance and related context (e.g., connection status, globally relevant notification states) to components via a custom hook like `useSocket()`.
-   **React Hooks (Custom Feature-Specific Hooks, e.g., `client/src/hooks/useUserManagement.js`):**
    -   Encapsulate client-side logic for a specific feature domain.
    -   Obtain the socket instance from `SocketContext`.
    -   Define functions to emit feature-specific events to the server.
    -   Manage local state related to the feature (e.g., modal visibility, data fetched for the feature).
-   **Node.js/Express (`server.js`):**
    -   Hosts the Socket.IO server.
    -   Defines event handlers for all incoming socket events from clients.
    -   Contains the primary business logic, data validation, and coordination of database interactions.
-   **MySQL (`dbPromise` in `server.js`):**
    -   The interface for database operations, allowing the server to persist and retrieve data.

## 3. Detailed Steps & Generalized Implementation Guide

This section provides a step-by-step guide with generalized examples. Replace `[FeatureName]`, `[action]`, `[parameter]`, `[data]` etc., with specifics for your feature.

### Step 1: Client A - Initiating Action & Emitting Event

**Location:** Custom Hook (`client/src/hooks/use[FeatureName].js`) and consuming Component (`client/src/components/[FeatureName]Panel.js`).

**A. Define Emitter Function in Hook:**
   Inside your feature-specific hook (e.g., `use[FeatureName].js`):

   ```javascript
   import { useCallback } from 'react';
   import { useSocket } from '../contexts/SocketContext'; // Assuming SocketContext provides the socket

   const use[FeatureName] = (/* relevant params like gameId, currentItemId */) => {
     const { socket } = useSocket() || {}; // Get socket instance

     // Function to send a specific action to the server
     const perform[ActionName] = useCallback((actionParameters) => {
       if (!socket) {
         console.error('Socket not available for perform[ActionName]');
         return;
       }

       const payload = {
         // Common identifiers (examples, adapt as needed)
         gameId: /* currentGameId */,
         emittedBySub: /* currentEducatorOrUserSub */,

         // Action-specific parameters
         ...actionParameters, // e.g., targetUserId, itemId, value
       };

       console.log(`[use[FeatureName]] Emitting '[featureName]:[actionName]' with payload:`, payload);
       socket.emit('[featureName]:[actionName]', payload); // Specific event name

     }, [socket, /* other dependencies like gameId */]);

     return { perform[ActionName], /* other exposed states/functions */ };
   };

   export default use[FeatureName];
   ```

**B. Call Emitter from Component:**
   In your React component (e.g., `[FeatureName]Panel.js`):

   ```javascript
   import use[FeatureName] from '../../hooks/use[FeatureName]';

   const [FeatureName]Panel = () => {
     const { perform[ActionName] } = use[FeatureName](/* hook params */);

     const handleButtonClick = (/* event, data */) => {
       const paramsForAction = { /* e.g., targetUserId: 'auth0|sub|DisplayName', value: 100 */ };
       perform[ActionName](paramsForAction);
     };

     return <button onClick={handleButtonClick}>Perform Action</button>;
   };
   ```

**Payload Considerations:**
-   Include all necessary identifiers (`gameId`, `encounterId`, `userId` of target, `itemId`, `awardedBy` sub for accountability).
-   Ensure data types are as expected by the server (e.g., parse integers).

### Step 2: Server (`server.js`) - Receiving & Processing Event

**A. Set up Event Listener:**

   ```javascript
   // In server.js, within io.on('connection', (socket) => { ... });
   socket.on('[featureName]:[actionName]', async (payload) => {
     try {
       console.log(`Received '[featureName]:[actionName]' from socket ${socket.id} with payload:`, payload);

       // B. Payload Validation (Essential)
       const { requiredParam1, requiredParam2, optionalParam, userId /* if individual target */, gameId } = payload;
       if (!requiredParam1 || requiredParam2 === undefined) { // Example validation
         console.error(`[[featureName]:[actionName]] Invalid payload:`, payload);
         // Optionally: socket.emit('[featureName]:[actionName]_error', { message: 'Invalid payload' });
         return;
       }

       // C. Identifier Handling & User Lookup
       let targetUserAuth0Sub = null;
       if (userId && typeof userId === 'string' && userId.includes('|')) {
         targetUserAuth0Sub = userId.split('|').slice(0, 2).join('|');
       } else if (userId) {
         // Handle cases where userId might be a direct auth0_sub or other format if applicable
         targetUserAuth0Sub = userId;
       }
       // For "To All" or game-wide actions, retrieve list of relevant user subs:
       // const targetUserAuth0Subs = getUsersInGame(gameId); // Placeholder for your logic

       // D. Business Logic & Database Interaction
       // Example: Fetching numeric UserAccounts.id if needed for other tables
       let userAccountId = null;
       let awardedToDisplayName = targetUserAuth0Sub; // Default
       if (targetUserAuth0Sub) {
         const [userAccountRows] = await dbPromise.query('SELECT id, display_name FROM UserAccounts WHERE auth0_sub = ?', [targetUserAuth0Sub]);
         if (userAccountRows && userAccountRows.length > 0) {
           userAccountId = userAccountRows[0].id;
           awardedToDisplayName = userAccountRows[0].display_name || targetUserAuth0Sub;
         } else {
           console.warn(`[[featureName]:[actionName]] UserAccount not found for ${targetUserAuth0Sub}`);
           // Handle error or skip if user must exist
         }
       }

       // Example: Updating the database
       // const [updateResult] = await dbPromise.query('UPDATE YourTable SET column = ? WHERE id = ?', [payload.value, someId]);
       // if (updateResult.affectedRows === 0) { /* Handle no update */ }

       // Example: Inserting into a junction table (like UserBadges)
       // const [insertResult] = await dbPromise.query('INSERT INTO YourJunctionTable (user_id, item_id) VALUES (?, ?)', [userAccountId, payload.itemId]);

       console.log(`[[featureName]:[actionName]] Processed successfully for ${targetUserAuth0Sub || 'game ' + gameId}.`);

       // E. Prepare Notification Payload (next step)
       const notificationPayload = {
         toSub: targetUserAuth0Sub, // For direct user notification
         // Or gameId for game-wide notification
         actionStatus: 'success',
         message: 'Action completed!',
         details: { /* relevant data from processing */ },
         awardedToDisplayName // Useful for UI
       };
       
       // F. Emit Notification (next step)
       // (See Step 3)

     } catch (error) {
       console.error(`[[featureName]:[actionName]] Error:`, error, 'Payload:', payload);
       // Optionally: socket.emit('[featureName]:[actionName]_error', { message: 'Internal server error' });
     }
   });
   ```

**Key Server-Side Logic:**
-   **Auth0 Sub Extraction:** Consistently use `userId.split('|').slice(0, 2).join('|')` for `auth0_sub|DisplayName` strings.
-   **DB Identifiers:** Be mindful of whether a table uses the string `auth0_sub` or a numeric `UserAccounts.id` for foreign keys. Fetch the correct ID type before querying related tables.

### Step 3: Server (`server.js`) - Emitting Notification/Result Event

Continuing from the server's event handler:

   ```javascript
   // ... (inside the try block of socket.on('[featureName]:[actionName]', ...))

   // Example: Notifying a specific user
   if (targetUserAuth0Sub && notificationPayload.actionStatus === 'success') {
     io.to(targetUserAuth0Sub).emit('[featureName]:[actionName]_result', notificationPayload);
     console.log(`Emitted '[featureName]:[actionName]_result' to ${targetUserAuth0Sub}`);
   }

   // Example: Notifying all users in a game (ensure clients join game-specific rooms)
   // io.to(gameId).emit('[featureName]:game_update', updatePayload);

   // Example: Notifying the original emitter (Client A) of success/failure
   // socket.emit('[featureName]:[actionName]_confirmation', { status: 'success', details: ... });
   ```

**Targeting Methods:**
-   `io.to(roomName)`: Sends to all sockets in a specific room (e.g., user's `auth0_sub` room, `gameId` room).
-   `socket.emit()`: Sends only to the originating socket.
-   `io.emit()`: Broadcasts to all connected clients (use sparingly).

### Step 4: Client B (or A) - Receiving Event & Updating UI

**Location:** `client/src/contexts/SocketContext.js` (for global state changes) OR directly in relevant components (e.g., `client/src/components/MobilePoll.js` for UI popups/notifications).

**A. Global Listener in `SocketContext.js` (Optional - for broad impact/global state):**

   ```javascript
   // In SocketContext.js, useEffect where newSocket listeners are defined
   newSocket.on('[featureName]:[actionName]_result', (data) => {
     console.log('SocketContext: Received [featureName]:[actionName]_result:', data);
     // Example: Update some global context state
     // setLast[FeatureName]Notification(data);
   });
   ```

**B. Direct Listener in Component (e.g., `MobilePoll.js`) for UI Updates:**

   ```javascript
   // In MobilePoll.js or other relevant component
   import { useEffect, useState, useRef } from 'react';
   import socket from '../socket'; // Or from useSocket() if using context for the instance
   import { useSocket as useAppSocket } from '../contexts/SocketContext'; // For clearing global state

   const PlayerComponent = () => {
     const [uiNotification, setUiNotification] = useState(null); // e.g., for a popup
     const { clearLast[FeatureName]Notification } = useAppSocket(); // If context manages a global lastNotification

     useEffect(() => {
       const handleFeatureResult = (payload) => {
         console.log('PlayerComponent: Received [featureName]:[actionName]_result:', payload);
         setUiNotification({ type: '[featureName]', payload });
         // Optionally play a sound, etc.
       };

       socket.on('[featureName]:[actionName]_result', handleFeatureResult);

       return () => {
         socket.off('[featureName]:[actionName]_result', handleFeatureResult);
       };
     }, [socket]); // Add other dependencies if needed

     const closeNotification = () => {
       setUiNotification(null);
       // If using global context state for this notification type:
       // if (uiNotification?.type === '[featureName]') {
       //   clearLast[FeatureName]Notification();
       // }
     };
     
     // Auto-dismiss logic (similar to XP/Badge popup)
     useEffect(() => {
        if (!uiNotification) return;
        const timer = setTimeout(() => {
            // const currentType = uiNotification ? uiNotification.type : null;
            closeNotification(); 
        }, 8000); // Example: 8 seconds
        return () => clearTimeout(timer);
     }, [uiNotification /*, clearLast[FeatureName]Notification */]);


     return (
       <>
         {/* ... other UI ... */}
         {uiNotification && (
           <div className="notification-popup-overlay" onClick={closeNotification}>
             <div className="notification-popup-content" onClick={(e) => e.stopPropagation()}>
               <h2>Notification: {uiNotification.payload.message}</h2>
               {/* Display uiNotification.payload.details */}
               <button onClick={closeNotification}>Dismiss</button>
             </div>
           </div>
         )}
       </>
     );
   };
   ```

**Key Client-Side Reception Logic:**
-   **Socket Instance:** Consistently use the same socket instance (either a global one from `../socket` or from `SocketContext`).
-   **Event Handlers:** Attach listeners in `useEffect` and clean them up on unmount.
-   **State Management:** Use `useState` for local UI changes (like popups). If the notification also affects global state or needs to be "remembered" by context (like `lastXPAward`), coordinate with the context.
-   **Clearing State:** Crucially, when a temporary UI element (like a popup) is closed or auto-dismissed, ensure both its local display state AND any related global context state are cleared to prevent stale displays or behavior.

## 5. Important General Considerations

-   **Clear & Specific Event Naming:** Adopt a convention, e.g., `[contextOrFeature]:[actionOrEventName]`. Examples: `xp:award`, `badge:award_result`, `poll:start`, `poll:vote_received`.
-   **Comprehensive Payloads:** Ensure all necessary data is sent in payloads to avoid extra lookups or ambiguity.
-   **Targeted Communication:** Leverage Socket.IO rooms (e.g., per user via `auth0_sub`, per `gameId`) for efficient and secure messaging, rather than broadcasting sensitive or irrelevant data to all clients.
-   **Error Handling:** Implement `try...catch` blocks on the server for socket handlers. Consider emitting error events back to the originating client if an action fails.
-   **Security/Validation:** Always validate payloads on the server. Do not trust client-sent data implicitly. Ensure the authenticated user (educator/admin) has the permission to perform the action.
-   **Database Schema Consistency:** Server-side logic must accurately reflect the database schema (column names, data types, relationships) to prevent SQL errors.
-   **Idempotency (where applicable):** For operations that shouldn't be repeated (like awarding a unique badge), check if the action has already been performed before re-applying it.
-   **Client-Side State Synchronization:** Carefully manage how client-side state is updated in response to socket events to avoid race conditions or stale UI.

By following this generalized template, adapting it with specific feature details, and adhering to these considerations, robust real-time interclient communication can be implemented effectively. 