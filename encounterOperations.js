const { db } = require('./db');

// Create a blank encounter
function createBlankEncounter(userSub) {
    console.log(`[createBlankEncounter] Called with userSub: ${userSub?.substring(0, 8) || 'MISSING'}...`);
    
    if (!userSub) {
        console.error('[createBlankEncounter] NULL or UNDEFINED userSub provided');
        return Promise.reject(new Error('userSub is required'));
    }
    
    return new Promise((resolve, reject) => {
        console.log('[createBlankEncounter] Executing SQL query to create blank encounter');
        const query = 'INSERT INTO Encounters (_REC_Creation_User, _REC_Modification_User, IsRootEncounter) VALUES (?, ?, 1)';
        
        db.query(query, [userSub, userSub], (error, results) => {
            if (error) {
                console.error('[createBlankEncounter] Database error:', error);
                console.error('[createBlankEncounter] Error code:', error.code);
                console.error('[createBlankEncounter] Error message:', error.message);
                if (error.sqlMessage) {
                    console.error('[createBlankEncounter] SQL message:', error.sqlMessage);
                }
                return reject(error);
            }
            console.log(`[createBlankEncounter] Success - created encounter ID: ${results.insertId}`);
            resolve(results.insertId);
        });
    });
}

// Update a specific field in an encounter
function updateEncounterField(id, field, value) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE Encounters SET ?? = ? WHERE ID = ?';
        db.query(query, [field, value, id], (error) => {
            if (error) {
                console.error('Error updating encounter field:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// Duplicate an encounter
function duplicateEncounter(encounterId, userSub) {
    return new Promise((resolve, reject) => {
        const query = 'INSERT INTO Encounters (ImageBackdrop, ImageCharacter1, ImageCharacter2, _REC_Creation_User, _REC_Modification_User, IsRootEncounter) SELECT ImageBackdrop, ImageCharacter1, ImageCharacter2, ? AS _REC_Creation_User, ? AS _REC_Modification_User, 0 AS IsRootEncounter FROM Encounters WHERE ID = ?';
        db.query(query, [userSub, userSub, encounterId], (error, results) => {
            if (error) {
                console.error('Error duplicating encounter:', error);
                return reject(error);
            }
            resolve(results.insertId);
        });
    });
}

// Create an encounter choice
function createEncounterChoice(encounterId, userSub) {
    return new Promise((resolve, reject) => {
        const query = 'INSERT INTO EncounterRoutes (RelID_Encounter_Calling, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?)';
        db.query(query, [encounterId, userSub, userSub], (error, results) => {
            if (error) {
                console.error('Error creating encounter choice:', error);
                return reject(error);
            }
            resolve(results.insertId);
        });
    });
}

// Update an encounter choice title
function updateEncounterChoice(choiceId, title) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE EncounterRoutes SET Title = ? WHERE ID = ?';
        db.query(query, [title, choiceId], (error) => {
            if (error) {
                console.error('Error updating encounter choice:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// Delete an encounter choice
function deleteEncounterChoice(choiceId) {
    return new Promise((resolve, reject) => {
        const query = 'DELETE FROM EncounterRoutes WHERE ID = ?';
        db.query(query, [choiceId], (error) => {
            if (error) {
                console.error('Error deleting encounter choice:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// Set the receiving encounter for a route
function setReceivingEncounter(routeId, receivingEncounterId) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE EncounterRoutes SET RelID_Encounter_Receiving = ? WHERE ID = ?';
        db.query(query, [receivingEncounterId, routeId], (error) => {
            if (error) {
                console.error('Error setting receiving encounter:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// Get all unlinked encounters
function getUnlinkedEncounters() {
    return new Promise((resolve, reject) => {
        const query = `SELECT ID, Title FROM Encounters 
                      WHERE ID NOT IN (SELECT DISTINCT RelID_Encounter_Receiving FROM EncounterRoutes WHERE RelID_Encounter_Receiving IS NOT NULL)
                      ORDER BY Title`;
        db.query(query, (error, results) => {
            if (error) {
                console.error('Error fetching unlinked encounters:', error);
                return reject(error);
            }
            resolve(results);
        });
    });
}

// Get all root encounters
function getRootEncounters() {
    return new Promise((resolve, reject) => {
        const query = 'SELECT ID, Title FROM Encounters WHERE IsRootEncounter = 1 ORDER BY Title';
        db.query(query, (error, results) => {
            if (error) {
                console.error('Error fetching root encounters:', error);
                return reject(error);
            }
            resolve(results);
        });
    });
}

// ----------------------- NEW: Recursive Delete -----------------------
// Helper to fetch all descendant encounter IDs (depth-first)
function getAllDescendantEncounterIds(rootId) {
    return new Promise((resolve, reject) => {
        const idsToProcess = [rootId];
        const collectedIds = new Set();

        // Inner function to process the queue iteratively to avoid deep recursion
        const next = () => {
            if (idsToProcess.length === 0) {
                // Exclude the root itself – caller can add if needed
                return resolve(Array.from(collectedIds));
            }
            const currentId = idsToProcess.shift();
            // Fetch direct children of currentId
            const query = 'SELECT RelID_Encounter_Receiving AS childId FROM EncounterRoutes WHERE RelID_Encounter_Calling = ? AND RelID_Encounter_Receiving IS NOT NULL';
            db.query(query, [currentId], (error, rows) => {
                if (error) {
                    console.error('Error fetching descendant encounters:', error);
                    return reject(error);
                }
                rows.forEach(row => {
                    const childId = row.childId;
                    if (childId && !collectedIds.has(childId)) {
                        collectedIds.add(childId);
                        idsToProcess.push(childId);
                    }
                });
                // Continue processing
                next();
            });
        };

        next();
    });
}

// Delete an entire root scenario (root encounter + all nested encounters & routes)
async function deleteRootEncounter(rootEncounterId) {
    try {
        // Gather all descendant encounter IDs first
        const descendantIds = await getAllDescendantEncounterIds(rootEncounterId);
        const allIds = [rootEncounterId, ...descendantIds];

        // Delete routes referencing any of these encounters (either calling or receiving)
        await new Promise((resolve, reject) => {
            const query = `DELETE FROM EncounterRoutes WHERE RelID_Encounter_Calling IN (?) OR RelID_Encounter_Receiving IN (?)`;
            db.query(query, [allIds, allIds], (error) => {
                if (error) {
                    console.error('Error deleting encounter routes:', error);
                    return reject(error);
                }
                resolve();
            });
        });

        // Delete the encounters themselves
        await new Promise((resolve, reject) => {
            const query = 'DELETE FROM Encounters WHERE ID IN (?)';
            db.query(query, [allIds], (error) => {
                if (error) {
                    console.error('Error deleting encounters:', error);
                    return reject(error);
                }
                resolve();
            });
        });

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