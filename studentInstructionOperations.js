const { db } = require('./db');

// Update a specific field in a student instruction record
function updateInstructionField(id, field, value) {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE StudentInstructions SET ?? = ? WHERE ID = ?';
        db.query(query, [field, value, id], (error) => {
            if (error) {
                console.error('Error updating instruction field:', error);
                return reject(error);
            }
            resolve();
        });
    });
}

module.exports = {
    updateInstructionField
}; 