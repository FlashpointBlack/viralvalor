const { dbPromise } = require('./db');

// Update a specific field in a student instruction record
async function updateInstructionField(id, field, value) {
    try {
        // Standard update by primary key
        let [result] = await dbPromise.query('UPDATE StudentInstructions SET ?? = ? WHERE ID = ?', [field, value, id]);
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // Fallback: treat id as Images.ID for orphan instruction image
        [result] = await dbPromise.query('UPDATE StudentInstructions SET ?? = ? WHERE Image = ?', [field, value, id]);
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // Create missing metadata row if needed
        const insertSql = 'INSERT INTO StudentInstructions (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, "", "", "system", "system")';
        const [insRes] = await dbPromise.query(insertSql, [id]);
        const newInstrId = insRes.insertId;

        await dbPromise.query('UPDATE StudentInstructions SET ?? = ? WHERE ID = ?', [field, value, newInstrId]);
    } catch (error) {
        console.error('Error updating instruction field:', error);
        throw error;
    }
}

module.exports = {
    updateInstructionField
}; 