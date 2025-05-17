const { dbPromise } = require('./db');

// Create a blank encounter
async function createBlankEncounter(userSub) {
    console.log(`[createBlankEncounter] Called with userSub: ${userSub?.substring(0, 8) || 'MISSING'}...`);
    
    if (!userSub) throw new Error('userSub is required');
    
    const query = 'INSERT INTO Encounters (_REC_Creation_User, _REC_Modification_User, IsRootEncounter) VALUES (?, ?, 1)';
    const [results] = await dbPromise.query(query, [userSub, userSub]);
    console.log(`[createBlankEncounter] Success - created encounter ID: ${results.insertId}`);
    return results.insertId;
}

// Update a specific field in an encounter
async function updateEncounterField(id, field, value) {
    const query = 'UPDATE Encounters SET ?? = ? WHERE ID = ?';
    await dbPromise.query(query, [field, value, id]);
}

// Duplicate an encounter
async function duplicateEncounter(encounterId, userSub) {
    const query = 'INSERT INTO Encounters (ImageBackdrop, ImageCharacter1, ImageCharacter2, _REC_Creation_User, _REC_Modification_User, IsRootEncounter) SELECT ImageBackdrop, ImageCharacter1, ImageCharacter2, ? AS _REC_Creation_User, ? AS _REC_Modification_User, 0 AS IsRootEncounter FROM Encounters WHERE ID = ?';
    const [results] = await dbPromise.query(query, [userSub, userSub, encounterId]);
    return results.insertId;
}

// Create an encounter choice
async function createEncounterChoice(encounterId, userSub) {
    const query = 'INSERT INTO EncounterRoutes (RelID_Encounter_Calling, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?)';
    const [results] = await dbPromise.query(query, [encounterId, userSub, userSub]);
    return results.insertId;
}

// Update an encounter choice title
async function updateEncounterChoice(choiceId, title) {
    const query = 'UPDATE EncounterRoutes SET Title = ? WHERE ID = ?';
    await dbPromise.query(query, [title, choiceId]);
}

// Delete an encounter choice
async function deleteEncounterChoice(choiceId) {
    const query = 'DELETE FROM EncounterRoutes WHERE ID = ?';
    await dbPromise.query(query, [choiceId]);
}

// Set the receiving encounter for a route
async function setReceivingEncounter(routeId, receivingEncounterId) {
    const query = 'UPDATE EncounterRoutes SET RelID_Encounter_Receiving = ? WHERE ID = ?';
    await dbPromise.query(query, [receivingEncounterId, routeId]);
}

// Get all unlinked encounters
async function getUnlinkedEncounters() {
    const query = `SELECT ID, Title FROM Encounters 
                   WHERE ID NOT IN (SELECT DISTINCT RelID_Encounter_Receiving FROM EncounterRoutes WHERE RelID_Encounter_Receiving IS NOT NULL)
                   ORDER BY Title`;
    const [results] = await dbPromise.query(query);
    return results;
}

// Get all root encounters
async function getRootEncounters() {
    const query = 'SELECT ID, Title FROM Encounters WHERE IsRootEncounter = 1 ORDER BY Title';
    const [results] = await dbPromise.query(query);
    return results;
}

// ----------------------- NEW: Recursive Delete -----------------------
// Helper to fetch all descendant encounter IDs (depth-first)
async function getAllDescendantEncounterIds(rootId) {
    const idsToProcess = [rootId];
    const collectedIds = new Set();

    while (idsToProcess.length) {
        const currentId = idsToProcess.shift();
        const query = 'SELECT RelID_Encounter_Receiving AS childId FROM EncounterRoutes WHERE RelID_Encounter_Calling = ? AND RelID_Encounter_Receiving IS NOT NULL';
        const [rows] = await dbPromise.query(query, [currentId]);
        rows.forEach(({ childId }) => {
            if (childId && !collectedIds.has(childId)) {
                collectedIds.add(childId);
                idsToProcess.push(childId);
            }
        });
    }

    return Array.from(collectedIds);
}

// Delete an entire root scenario (root encounter + all nested encounters & routes)
async function deleteRootEncounter(rootEncounterId) {
    try {
        // Gather all descendant encounter IDs first
        const descendantIds = await getAllDescendantEncounterIds(rootEncounterId);
        const allIds = [rootEncounterId, ...descendantIds];

        // Delete routes referencing any of these encounters
        const routeDeleteQuery = `DELETE FROM EncounterRoutes WHERE RelID_Encounter_Calling IN (?) OR RelID_Encounter_Receiving IN (?)`;
        await dbPromise.query(routeDeleteQuery, [allIds, allIds]);

        // Delete the encounters themselves
        await dbPromise.query('DELETE FROM Encounters WHERE ID IN (?)', [allIds]);

        console.log(`[deleteRootEncounter] Successfully deleted scenario tree containing ${allIds.length} encounters (root ${rootEncounterId}).`);
    } catch (err) {
        console.error('[deleteRootEncounter] Failure:', err);
        throw err;
    }
}

module.exports = {
    createBlankEncounter,
    updateEncounterField,
    duplicateEncounter,
    createEncounterChoice,
    updateEncounterChoice,
    deleteEncounterChoice,
    setReceivingEncounter,
    getUnlinkedEncounters,
    getRootEncounters,
    deleteRootEncounter
}; 