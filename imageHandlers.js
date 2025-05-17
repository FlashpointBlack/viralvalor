const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { dbPromise } = require('./db');

// This handles Encounter Image Uploads
const EncounterUploadHandler = (req, res) => {
    (async () => {
        try {
            if (!req.file) return res.status(400).send('No file uploaded.');

            const uploadedFileName = req.file.filename;
            const fileExtension = path.extname(req.file.originalname);
            const newFileName = uploadedFileName + fileExtension;

            const { ImageType, userSub, EncounterID, EncountersField } = req.body;

            await fsPromises.rename(req.file.path, path.join(req.file.destination, newFileName));

            const [imgRes] = await dbPromise.query(
                'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
                [req.file.originalname, newFileName, ImageType, userSub, userSub]
            );

            const ImageID = imgRes.insertId;

            await dbPromise.query('UPDATE Encounters SET ?? = ? WHERE ID = ?', [EncountersField || req.body.EncountersField, ImageID, EncounterID]);

            res.status(200).json({
                message: 'File uploaded, saved, and Encounter updated successfully',
                fileName: newFileName,
                ID: ImageID
            });
        } catch (err) {
            console.error('EncounterUploadHandler error:', err);
            res.status(500).send('Server error during encounter upload');
        }
    })();
};

// This handles Badge Image Uploads
const BadgeUploadHandler = (req, res) => {
    (async () => {
        try {
            if (!req.file) return res.status(400).send('No file uploaded.');

            const uploadedFileName = req.file.filename;
            const fileExtension = path.extname(req.file.originalname);
            const newFileName = uploadedFileName + fileExtension;
            const userSub = req.body.userSub;

            await fsPromises.rename(req.file.path, path.join(req.file.destination, newFileName));

            const [imgRes] = await dbPromise.query(
                'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageBadge", ?, ?)',
                [req.file.originalname, newFileName, userSub, userSub]
            );
            const ImageID = imgRes.insertId;

            const [badgeRes] = await dbPromise.query(
                'INSERT INTO Badges (Image, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?)',
                [ImageID, userSub, userSub]
            );

            res.status(200).json({ message: 'File uploaded', BadgeID: badgeRes.insertId });
        } catch (err) {
            console.error('BadgeUploadHandler error:', err);
            res.status(500).send('Server error during badge upload');
        }
    })();
};

// This handles Character Image Uploads
const CharacterUploadHandler = (req, res) => {
    if (!req.file) {
        console.error('No file uploaded in CharacterUploadHandler');
        return res.status(400).send('No file uploaded.');
    }

    // Log request information for debugging
    console.log('CharacterUploadHandler - Request body:', JSON.stringify(req.body));
    console.log('CharacterUploadHandler - File information:', JSON.stringify(req.file));

    let uploadedFileName = req.file.filename;
    let fileExtension = path.extname(req.file.originalname);
    let newFileName = uploadedFileName + fileExtension;
    // Default to anonymous if not provided, but still provide a value for _REC_Creation_User
    let userSub = req.body.userSub || 'anonymous';
    let title = req.body.title || ''; // Get title from form
    let description = req.body.description || ''; // Get description from form

    console.log('Processing file upload with:', {
        originalName: req.file.originalname,
        newFileName,
        userSub,
        title,
        description
    });

    // Create destination directory if it doesn't exist
    const destination = req.file.destination;
    if (!fs.existsSync(destination)) {
        console.log(`Creating directory: ${destination}`);
        fs.mkdirSync(destination, { recursive: true });
    }

    // Rename the file on the server with the proper extension
    fs.rename(req.file.path, destination + '/' + newFileName, async function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        // Include _REC_Creation_User field
        const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        const [imgRes] = await dbPromise.query(insertImageQuery, [req.file.originalname, newFileName, "ImageCharacter", userSub, userSub]);
        
        let ImageID = imgRes.insertId;
        console.log('Successfully inserted image with ID:', ImageID);

        // Include _REC_Creation_User field in character model query
        const insertCharacterQuery = 'INSERT INTO CharacterModels (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        const [charRes] = await dbPromise.query(insertCharacterQuery, [ImageID, title, description, userSub, userSub]);
        
        let CharacterID = charRes.insertId;
        console.log('Successfully inserted character with ID:', CharacterID);

        // If everything is successful, send a response back
        res.status(200).json({
            message: 'File uploaded',
            CharacterID: CharacterID
        });
    });
};

// This handles Backdrop Image Uploads
const BackdropUploadHandler = (req, res) => {
    if (!req.file) {
        console.error('No file uploaded in BackdropUploadHandler');
        return res.status(400).send('No file uploaded.');
    }

    // Log request information for debugging
    console.log('BackdropUploadHandler - Request body:', JSON.stringify(req.body));
    console.log('BackdropUploadHandler - File information:', JSON.stringify(req.file));

    let uploadedFileName = req.file.filename;
    let fileExtension = path.extname(req.file.originalname);
    let newFileName = uploadedFileName + fileExtension;
    // Default to anonymous if not provided, but still provide a value for _REC_Creation_User
    let userSub = req.body.userSub || 'anonymous';
    let title = req.body.title || ''; // Get title from form
    let description = req.body.description || ''; // Get description from form

    console.log('Processing file upload with:', {
        originalName: req.file.originalname,
        newFileName,
        userSub,
        title,
        description
    });

    // Create destination directory if it doesn't exist
    const destination = req.file.destination;
    if (!fs.existsSync(destination)) {
        console.log(`Creating directory: ${destination}`);
        fs.mkdirSync(destination, { recursive: true });
    }

    // Rename the file on the server with the proper extension
    fs.rename(req.file.path, destination + '/' + newFileName, async function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        // Include _REC_Creation_User field
        const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        const [imgRes] = await dbPromise.query(insertImageQuery, [req.file.originalname, newFileName, "ImageBackdrop", userSub, userSub]);
        
        let ImageID = imgRes.insertId;
        console.log('Successfully inserted image with ID:', ImageID);

        // Include _REC_Creation_User field in backdrop query
        const insertBackdropQuery = 'INSERT INTO Backdrops (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        const [backdropRes] = await dbPromise.query(insertBackdropQuery, [ImageID, title, description, userSub, userSub]);
        
        let BackdropID = backdropRes.insertId;
        console.log('Successfully inserted backdrop with ID:', BackdropID);

        // If everything is successful, send a response back
        res.status(200).json({
            message: 'File uploaded',
            BackdropID: BackdropID
        });
    });
};

// Profile Picture Upload Handler
const ProfileUploadHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // Expect the client to provide the numerical user ID so we can update the correct record
    const userId = req.body.userId;
    // We still capture userSub for auditing purposes but it is optional
    const userSub = req.body.userSub || 'anonymous';

    if (!userId) {
        return res.status(400).send('Missing userId field in form data.');
    }

    const uploadedFileName = req.file.filename;
    const path = require('path');
    const fs = require('fs');

    const fileExtension = path.extname(req.file.originalname);
    const newFileName = uploadedFileName + fileExtension;

    // Rename the temporary file so it includes the original extension
    fs.rename(req.file.path, req.file.destination + '/' + newFileName, async function (err) {
        if (err) {
            console.error('Error renaming uploaded profile picture:', err);
            return res.status(500).send('Error renaming file.');
        }

        try {
            const imageInsertQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageProfile", ?, ?)';
            const [imgRes] = await dbPromise.query(imageInsertQuery, [req.file.originalname, newFileName, userSub, userSub]);

            // Build the relative URL that the frontend can use (served by the /images static route)
            const imageUrl = `/images/uploads/profiles/${newFileName}`;

            const updateUserQuery = 'UPDATE UserAccounts SET picture_url = ? WHERE id = ?';
            await dbPromise.query(updateUserQuery, [imageUrl, userId]);

            return res.status(200).json({ message: 'Profile picture uploaded successfully', imageUrl });
        } catch (dbErr) {
            console.error('ProfileUploadHandler DB error:', dbErr);
            return res.status(500).send('Database error during profile upload.');
        }
    });
};

// This handles Student Instruction Image Uploads
const InstructionUploadHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    let uploadedFileName = req.file.filename;
    let fileExtension = path.extname(req.file.originalname);
    let newFileName = uploadedFileName + fileExtension;
    let userSub = req.body.userSub || 'anonymous';
    let title = req.body.title || '';
    let description = req.body.description || '';

    const destination = req.file.destination;
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    fs.rename(req.file.path, destination + '/' + newFileName, async function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        try {
            const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
            const [imgRes] = await dbPromise.query(insertImageQuery, [req.file.originalname, newFileName, 'ImageInstruction', userSub, userSub]);

            const ImageID = imgRes.insertId;

            const insertInstrQuery = 'INSERT INTO StudentInstructions (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
            const [instrRes] = await dbPromise.query(insertInstrQuery, [ImageID, title, description, userSub, userSub]);

            res.status(200).json({ message: 'File uploaded', InstructionID: instrRes.insertId });
        } catch (dbErr) {
            console.error('InstructionUploadHandler DB error:', dbErr);
            return res.status(500).send('Database error during instruction upload.');
        }
    });
};

module.exports = {
    EncounterUploadHandler,
    BadgeUploadHandler,
    CharacterUploadHandler,
    BackdropUploadHandler,
    ProfileUploadHandler,
    InstructionUploadHandler
}; 