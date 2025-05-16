const { db } = require('./db');

// Update a specific field in a backdrop
function updateBackdropField(id, field, value) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE Backdrops SET ?? = ? WHERE ID = ?';
        db.query(query, [field, value, id], (error) => {
            if (error) {
                console.error('Error updating backdrop field:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// The rest of the backdrop operations are already handled by routesfunctions.js
// as GetBackdropData and GetAllBackdropData

module.exports = {
    updateBackdropField
}; 