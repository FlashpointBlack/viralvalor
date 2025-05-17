const { dbPromise } = require('./db');

// Update a specific field in a badge
async function updateBadgeField(id, field, value) {
    try {
        const query = 'UPDATE Badges SET ?? = ? WHERE ID = ?';
        await dbPromise.query(query, [field, value, id]);
    } catch (error) {
        console.error('Error updating badge field:', error);
        throw error;
    }
}

// The rest of the badge operations are already handled by routesfunctions.js
// as GetBadgeData and GetAllBadgesData

module.exports = {
    updateBadgeField
}; 