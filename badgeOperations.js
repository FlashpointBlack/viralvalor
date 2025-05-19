const { dbPromise } = require('./db');

// Update a specific field in a badge
async function updateBadgeField(id, field, value) {
    try {
        // 1) Try normal update by primary key
        let [result] = await dbPromise.query('UPDATE Badges SET ?? = ? WHERE ID = ?', [field, value, id]);
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // 2) Fallback – treat `id` as Images.ID for orphan badge
        [result] = await dbPromise.query('UPDATE Badges SET ?? = ? WHERE Image = ?', [field, value, id]);
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // 3) No metadata row exists – create one
        const insertSql = 'INSERT INTO Badges (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, "", "", "system", "system")';
        const [insRes] = await dbPromise.query(insertSql, [id]);
        const newBadgeId = insRes.insertId;

        await dbPromise.query('UPDATE Badges SET ?? = ? WHERE ID = ?', [field, value, newBadgeId]);
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