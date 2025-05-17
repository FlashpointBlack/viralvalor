const { dbPromise } = require('./db');

// Update a specific field in a character model
async function updateCharacterField(id, field, value) {
    try {
        const query = 'UPDATE CharacterModels SET ?? = ? WHERE ID = ?';
        await dbPromise.query(query, [field, value, id]);
    } catch (error) {
        console.error('Error updating character field:', error);
        throw error;
    }
}

// The rest of the character operations are already handled by routesfunctions.js
// as GetCharacterData and GetAllCharacterData

module.exports = {
    updateCharacterField
}; 