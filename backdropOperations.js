const { dbPromise } = require('./db');

// Update a specific field in a backdrop
async function updateBackdropField(id, field, value) {
    try {
        const query = 'UPDATE Backdrops SET ?? = ? WHERE ID = ?';
        await dbPromise.query(query, [field, value, id]);
    } catch (error) {
        console.error('Error updating backdrop field:', error);
        throw error;
    }
}

// The rest of the backdrop operations are already handled by routesfunctions.js
// as GetBackdropData and GetAllBackdropData

module.exports = {
    updateBackdropField
}; 