const fs = require('fs');
const path = require('path');
const { db } = require('./db');

// This handles Encounter Image Uploads
const EncounterUploadHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    let uploadedFileName = req.file.filename;
    let fileExtension = path.extname(req.file.originalname);
    let newFileName = uploadedFileName + fileExtension;
    let ImageType = req.body.ImageType;
    let userSub = req.body.userSub;
    let EncounterID = req.body.EncounterID;
    let EncountersFieldName = req.body.EncountersField;

    // Rename the file on the server
    fs.rename(req.file.path, req.file.destination + '/' + newFileName, function (err) {
        if (err) {
            return res.status(500).send('Error renaming file.');
        }

        // Insert into database
        db.query('INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)',
            [req.file.originalname, newFileName, ImageType, userSub, userSub], function (error, results, fields) {
                if (error) {
                    console.error(error);
                    return res.status(500).send('Error saving image information to the database.');
                }
                let ImageID = results.insertId;

                // Prepare the SQL query to update the Encounters table
                let updateQuery = 'UPDATE Encounters SET ?? = ? WHERE ID = ?';

                // Execute the query
                db.query(updateQuery, [EncountersFieldName, ImageID, EncounterID], function (updateError) {
                    if (updateError) {
                        console.error(updateError);
                        return res.status(500).send('Error updating Encounters table.');
                    }

                    // If everything is successful, send a response back
                    res.status(200).json({
                        message: 'File uploaded, saved, and Encounter updated successfully',
                        fileName: newFileName,
                        ID: ImageID
                    });
                });
            });
    });
};

// This handles Badge Image Uploads
const BadgeUploadHandler = (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    let uploadedFileName = req.file.filename;
    let fileExtension = path.extname(req.file.originalname);
    let newFileName = uploadedFileName + fileExtension;
    let userSub = req.body.userSub;

    // Rename the file on the server with the proper extension
    fs.rename(req.file.path, req.file.destination + '/' + newFileName, function (err) {
        if (err) {
            return res.status(500).send('Error renaming file.');
        }

        // Insert into database
        db.query('INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageBadge", ?, ?)',
            [req.file.originalname, newFileName, userSub, userSub], function (error, results, fields) {
                if (error) {
                    console.error(error);
                    return res.status(500).send('Error saving image information to the database.');
                }
                let ImageID = results.insertId;

                // Execute the query
                db.query('INSERT INTO Badges (Image, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?)',
                    [ImageID, userSub, userSub], function (error, results, fields) {
                        if (error) {
                            console.error(error);
                            return res.status(500).send('Error saving image information to the database.');
                        }
                        let BadgeID = results.insertId;

                        // If everything is successful, send a response back
                        res.status(200).json({
                            message: 'File uploaded',
                            BadgeID: BadgeID
                        });
                    });
            });
    });
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

    // Log the SQL structure for debugging
    console.log('Database structure check:');
    db.query('DESCRIBE Images', (err, results) => {
        if (err) {
            console.error('Error checking Images table structure:', err);
        } else {
            console.log('Images table structure:', JSON.stringify(results));
        }
    });
    
    db.query('DESCRIBE CharacterModels', (err, results) => {
        if (err) {
            console.error('Error checking CharacterModels table structure:', err);
        } else {
            console.log('CharacterModels table structure:', JSON.stringify(results));
        }
    });

    // Rename the file on the server with the proper extension
    fs.rename(req.file.path, destination + '/' + newFileName, function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        // Include _REC_Creation_User field
        const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        db.query(insertImageQuery, [req.file.originalname, newFileName, "ImageCharacter", userSub, userSub], function (error, results) {
            if (error) {
                console.error('Error inserting image to database:', error);
                console.error('Query params:', JSON.stringify([req.file.originalname, newFileName, "ImageCharacter", userSub, userSub]));
                return res.status(500).send('Error saving image information to the database: ' + error.message);
            }
            
            let ImageID = results.insertId;
            console.log('Successfully inserted image with ID:', ImageID);

            // Include _REC_Creation_User field in character model query
            const insertCharacterQuery = 'INSERT INTO CharacterModels (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
            db.query(insertCharacterQuery, [ImageID, title, description, userSub, userSub], function (error, results) {
                if (error) {
                    console.error('Error inserting character model to database:', error);
                    console.error('Query params:', JSON.stringify([ImageID, title, description, userSub, userSub]));
                    return res.status(500).send('Error saving character model information to the database: ' + error.message);
                }
                
                let CharacterID = results.insertId;
                console.log('Successfully inserted character with ID:', CharacterID);

                // If everything is successful, send a response back
                res.status(200).json({
                    message: 'File uploaded',
                    CharacterID: CharacterID
                });
            });
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

    // Log the SQL structure for debugging
    console.log('Database structure check:');
    db.query('DESCRIBE Images', (err, results) => {
        if (err) {
            console.error('Error checking Images table structure:', err);
        } else {
            console.log('Images table structure:', JSON.stringify(results));
        }
    });
    
    db.query('DESCRIBE Backdrops', (err, results) => {
        if (err) {
            console.error('Error checking Backdrops table structure:', err);
        } else {
            console.log('Backdrops table structure:', JSON.stringify(results));
        }
    });

    // Rename the file on the server with the proper extension
    fs.rename(req.file.path, destination + '/' + newFileName, function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        // Include _REC_Creation_User field
        const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        db.query(insertImageQuery, [req.file.originalname, newFileName, "ImageBackdrop", userSub, userSub], function (error, results) {
            if (error) {
                console.error('Error inserting image to database:', error);
                console.error('Query params:', JSON.stringify([req.file.originalname, newFileName, "ImageBackdrop", userSub, userSub]));
                return res.status(500).send('Error saving image information to the database: ' + error.message);
            }
            
            let ImageID = results.insertId;
            console.log('Successfully inserted image with ID:', ImageID);

            // Include _REC_Creation_User field in backdrop query
            const insertBackdropQuery = 'INSERT INTO Backdrops (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
            db.query(insertBackdropQuery, [ImageID, title, description, userSub, userSub], function (error, results) {
                if (error) {
                    console.error('Error inserting backdrop to database:', error);
                    console.error('Query params:', JSON.stringify([ImageID, title, description, userSub, userSub]));
                    return res.status(500).send('Error saving backdrop information to the database: ' + error.message);
                }
                
                let BackdropID = results.insertId;
                console.log('Successfully inserted backdrop with ID:', BackdropID);

                // If everything is successful, send a response back
                res.status(200).json({
                    message: 'File uploaded',
                    BackdropID: BackdropID
                });
            });
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
    fs.rename(req.file.path, req.file.destination + '/' + newFileName, function (err) {
        if (err) {
            console.error('Error renaming uploaded profile picture:', err);
            return res.status(500).send('Error renaming file.');
        }

        // Store the image reference
        const imageInsertQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, "ImageProfile", ?, ?)';
        db.query(imageInsertQuery, [req.file.originalname, newFileName, userSub, userSub], function (imageErr) {
            if (imageErr) {
                console.error('Error inserting profile image into Images table:', imageErr);
                return res.status(500).send('Error saving image information to the database.');
            }

            // Build the relative URL that the frontend can use (served by the /images static route)
            const imageUrl = `/images/uploads/profiles/${newFileName}`;

            // Update the UserAccounts record with the new picture URL
            const updateUserQuery = 'UPDATE UserAccounts SET picture_url = ? WHERE id = ?';
            db.query(updateUserQuery, [imageUrl, userId], function (updateErr) {
                if (updateErr) {
                    console.error('Error updating user profile picture:', updateErr);
                    return res.status(500).send('Error updating user with new profile picture.');
                }

                return res.status(200).json({
                    message: 'Profile picture uploaded successfully',
                    imageUrl
                });
            });
        });
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

    fs.rename(req.file.path, destination + '/' + newFileName, function (err) {
        if (err) {
            console.error('Error renaming file:', err);
            return res.status(500).send('Error renaming file: ' + err.message);
        }

        const insertImageQuery = 'INSERT INTO Images (FileNameOriginal, FileNameServer, FileType, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
        db.query(insertImageQuery, [req.file.originalname, newFileName, 'ImageInstruction', userSub, userSub], function (error, results) {
            if (error) {
                console.error('Error inserting image to database:', error);
                return res.status(500).send('Error saving image information to the database: ' + error.message);
            }

            let ImageID = results.insertId;

            const insertInstrQuery = 'INSERT INTO StudentInstructions (Image, Title, Description, _REC_Creation_User, _REC_Modification_User) VALUES (?, ?, ?, ?, ?)';
            db.query(insertInstrQuery, [ImageID, title, description, userSub, userSub], function (error, results) {
                if (error) {
                    console.error('Error inserting instruction into database:', error);
                    return res.status(500).send('Error saving instruction information to the database: ' + error.message);
                }

                let InstructionID = results.insertId;
                res.status(200).json({ message: 'File uploaded', InstructionID });
            });
        });
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