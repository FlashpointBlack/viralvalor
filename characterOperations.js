const { db } = require('./db');

// Update a specific field in a character model
function updateCharacterField(id, field, value) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE CharacterModels SET ?? = ? WHERE ID = ?';
        db.query(query, [field, value, id], (error) => {
            if (error) {
                console.error('Error updating character field:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

// The rest of the character operations are already handled by routesfunctions.js
// as GetCharacterData and GetAllCharacterData

module.exports = {
    updateCharacterField
}; 