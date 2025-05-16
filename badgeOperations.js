const { db } = require('./db');

// Update a specific field in a badge
function updateBadgeField(id, field, value) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE Badges SET ?? = ? WHERE ID = ?';
        db.query(query, [field, value, id], (error) => {
            if (error) {
                console.error('Error updating badge field:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// The rest of the badge operations are already handled by routesfunctions.js
// as GetBadgeData and GetAllBadgesData

module.exports = {
    updateBadgeField
}; 