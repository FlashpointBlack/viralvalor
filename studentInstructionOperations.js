const { dbPromise } = require('./db');

// Update a specific field in a student instruction record
async function updateInstructionField(id, field, value) {
    try {
        const query = 'UPDATE StudentInstructions SET ?? = ? WHERE ID = ?';
        await dbPromise.query(query, [field, value, id]);
    } catch (error) {
        console.error('Error updating instruction field:', error);
        throw error;
    }
}

module.exports = {
    updateInstructionField
}; 