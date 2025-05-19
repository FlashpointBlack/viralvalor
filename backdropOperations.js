const { dbPromise } = require('./db');

// Update a specific field in a backdrop
async function updateBackdropField(id, field, value) {
    try {
        // 1) Attempt to update by primary key (standard case)
        let [result] = await dbPromise.query('UPDATE Backdrops SET ?? = ? WHERE ID = ?', [field, value, id]);

        // If a row was updated we're done
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // 2) Fallback – the supplied id might be the *Images.ID* for an "orphan"
        //    backdrop (image exists but metadata row does not).  Try updating by
        //    the Image foreign-key column instead.
        [result] = await dbPromise.query('UPDATE Backdrops SET ?? = ? WHERE Image = ?', [field, value, id]);
        if (result.affectedRows && result.affectedRows > 0) {
            return;
        }

        // 3) Still nothing?  That means there is no Backdrops row for this image.
        //    Create one on-the-fly so future updates succeed.
        const insertSql = 'INSERT INTO Backdrops (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, "", "", "system", "system")';
        const [insertRes] = await dbPromise.query(insertSql, [id]);
        const newBackdropId = insertRes.insertId;

        // Apply the original update to the freshly inserted row
        await dbPromise.query('UPDATE Backdrops SET ?? = ? WHERE ID = ?', [field, value, newBackdropId]);
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