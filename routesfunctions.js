const { db } = require('./db');
const { connectedUsers } = require('./globals');
const { executeQuery } = require('./utils');

function checkUserProfileCompletion(userSub) {
    return new Promise((resolve, reject) => {
        // Replace this query with one appropriate for your database schema and setup.
        const query = 'SELECT profile_complete FROM UserAccounts WHERE auth0_sub = ?';

        // Execute the query
        db.query(query, [userSub], (error, results) => {
            if (error) {
                console.error('Error checking profile completion:', error);
                return reject(error);
            }

            // Assume 'profile_complete' is a boolean column in your 'UserAccounts' table.
            if (results.length > 0 && results[0].profile_complete) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

function storeUserDetails(userDetails) {
    return new Promise((resolve, reject) => {
        // Prepare your SQL query to insert or update user details
        const query = `
      INSERT INTO UserAccounts (auth0_sub, nickname, name, email, email_verified, display_name, profile_complete, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE
        nickname = VALUES(nickname),
        name = VALUES(name),
        email = VALUES(email),
        email_verified = VALUES(email_verified),
        display_name = VALUES(display_name),
        profile_complete = VALUES(profile_complete);`; // Don't update 'updated_at' here, and no picture_url

        // Extract the details from userDetails object
        const {
            nickname,
            name,
            email,
            email_verified,
            auth0_sub,
            display_name
        } = userDetails;

        // Ensure auth0_sub is defined, as it's crucial for identifying the user
        if (!auth0_sub) {
            console.error('auth0_sub is undefined. It is required to uniquely identify the user.');
            reject('auth0_sub is undefined');
            return; // Exit the function early
        }

        const values = [
            auth0_sub,
            nickname || null,
            name || null,
            email || null,
            email_verified || null,
            display_name || null
        ];

        // Execute the query
        db.execute(query, values, (err, results) => {
            if (err) {
                console.error('Failed to insert/update user details:', err);
                reject(err); // Reject the Promise if there's an error
                return;
            }
            console.log('User details inserted/updated:', results);
            resolve(); // Resolve the Promise when done
        });
    });
}

const fetchUserData = (auth0_sub, socketId) => {
    return new Promise((resolve, reject) => {
        const query = 'SELECT display_name FROM UserAccounts WHERE auth0_sub = ?';

		db.execute(query, [auth0_sub], (err, results, fields) => {
			if (err) {
				console.error('Failed to retrieve user data:', err);
				return reject(err);
			}

			if (results.length > 0) {
				const user = results[0];
				connectedUsers[socketId] = user.display_name;
				resolve(user.display_name);
			} else {
				console.log('No user found with the provided auth0_sub');
				resolve(null);
			}
		});

    });
};

// Serve the chat.html at root
// app.get('/', requiresAuth(), (req, res) => {
// res.render('chat', { userDetails: req.oidc.user });
// });


// Helper function to determine if a user is an admin
function isAdmin(user) {
    // Implement your logic to determine if the user is an admin
    // For example, check if the user's email or id is in a list of admins
    return true; // Replace this with actual check
}

// CONVERTED TO PROMISE: Data retrieval functions 
/**
 * Get encounter data with associated images and routes
 * @param {number} encounterId - ID of the encounter to retrieve
 * @returns {Promise<Object>} Promise resolving to encounter data and routes
 */
function GetEncounterData(encounterId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get encounter data
            const encounters = await executeQuery('SELECT * FROM Encounters WHERE ID = ?', [encounterId]);
            if (encounters.length === 0) {
                return reject(new Error(`No encounter found with ID ${encounterId}`));
            }
            
            const encounter = encounters[0];
            
            // Get encounter routes
            const encounterRoutes = await executeQuery(
                'SELECT * FROM EncounterRoutes WHERE RelID_Encounter_Calling = ?', 
                [encounterId]
            );
            
            // Function to handle image fetching for character models
            const fetchCharacterImage = async (characterModelId) => {
                const characterModels = await executeQuery(
                    'SELECT * FROM CharacterModels WHERE ID = ?', 
                    [characterModelId]
                );
                
                if (characterModels.length === 0) {
                    return null;
                }
                
                const characterModel = characterModels[0];
                const images = await executeQuery(
                    'SELECT * FROM Images WHERE ID = ?', 
                    [characterModel.Image]
                );
                
                if (images.length === 0) {
                    return null;
                }
                
                return images[0].FileNameServer;
            };
            
            // Function to handle image fetching for backdrops
            const fetchBackdropImage = async (backdropId) => {
                const backdrops = await executeQuery(
                    'SELECT * FROM Backdrops WHERE ID = ?', 
                    [backdropId]
                );
                
                if (backdrops.length === 0) {
                    return null;
                }
                
                const backdrop = backdrops[0];
                const images = await executeQuery(
                    'SELECT * FROM Images WHERE ID = ?', 
                    [backdrop.Image]
                );
                
                if (images.length === 0) {
                    return null;
                }
                
                return images[0].FileNameServer;
            };
            
            // Fetch backdrop image if available
            if (encounter.ImageBackdrop) {
                const fileNameServer = await fetchBackdropImage(encounter.ImageBackdrop);
                if (fileNameServer) {
                    encounter.BackdropImage = `<img src="images/uploads/backdrops/${fileNameServer}" class="EncounterImagePreview"/>`;
                } else {
                    encounter.BackdropImage = '';
                }
            } else {
                encounter.BackdropImage = '';
            }
            
            // Fetch character 1 image if available
            if (encounter.ImageCharacter1) {
                const fileNameServer = await fetchCharacterImage(encounter.ImageCharacter1);
                if (fileNameServer) {
                    encounter.Character1Image = `<img src="images/uploads/characters/${fileNameServer}" class="EncounterImagePreview"/>`;
                } else {
                    encounter.Character1Image = '';
                }
            } else {
                encounter.Character1Image = '';
            }
            
            // Fetch character 2 image if available
            if (encounter.ImageCharacter2) {
                const fileNameServer = await fetchCharacterImage(encounter.ImageCharacter2);
                if (fileNameServer) {
                    encounter.Character2Image = `<img src="images/uploads/characters/${fileNameServer}" class="EncounterImagePreview"/>`;
                } else {
                    encounter.Character2Image = '';
                }
            } else {
                encounter.Character2Image = '';
            }
            
            // Return the complete encounter data
            resolve({
                Encounter: encounter,
                EncounterRoutes: encounterRoutes
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get badge data including image information
 * @param {number} badgeId - ID of the badge to retrieve
 * @returns {Promise<Object>} Promise resolving to badge data
 */
function GetBadgeData(badgeId) {
    return new Promise(async (resolve, reject) => {
        try {
            const badgeData = await executeQuery(
                'SELECT * FROM Badges WHERE ID = ? LIMIT 1', 
                [badgeId]
            );
            
            if (badgeData.length === 0) {
                return reject(new Error(`No badge found with ID ${badgeId}`));
            }
            
            const badge = badgeData[0];
            const images = await executeQuery(
                'SELECT * FROM Images WHERE ID = ? LIMIT 1', 
                [badge.Image]
            );
            
            if (images.length === 0) {
                return resolve({
                    Title: badge.Title,
                    Description: badge.Description,
                    FileName: null
                });
            }
            
            resolve({
                Title: badge.Title,
                Description: badge.Description,
                FileName: images[0].FileNameServer
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get all badges data including images
 * @returns {Promise<Array>} Promise resolving to array of badge data
 */
function GetAllBadgesData() {
    return new Promise(async (resolve, reject) => {
        try {
            const query = 'SELECT b.ID, b.Title, b.Description, i.FileNameServer, i._REC_Creation_Timestamp AS CreationTimestamp ' +
                'FROM Badges b ' +
                'LEFT JOIN Images i ON b.Image = i.ID';
            
            const results = await executeQuery(query);
            
            const badges = results.map(row => ({
                ID: row.ID,
                Title: row.Title,
                Description: row.Description,
                FileName: row.FileNameServer,
                _REC_Creation_Timestamp: row.CreationTimestamp
            }));
            
            resolve(badges);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get character data including image information
 * @param {number} characterId - ID of the character to retrieve
 * @returns {Promise<Object>} Promise resolving to character data
 */
function GetCharacterData(characterId) {
    return new Promise(async (resolve, reject) => {
        try {
            const characterData = await executeQuery(
                'SELECT * FROM CharacterModels WHERE ID = ? LIMIT 1', 
                [characterId]
            );
            
            if (characterData.length === 0) {
                return reject(new Error(`No character found with ID ${characterId}`));
            }
            
            const character = characterData[0];
            const images = await executeQuery(
                'SELECT * FROM Images WHERE ID = ? LIMIT 1', 
                [character.Image]
            );
            
            if (images.length === 0) {
                return resolve({
                    Title: character.Title,
                    Description: character.Description,
                    FileName: null
                });
            }
            
            resolve({
                Title: character.Title,
                Description: character.Description,
                FileName: images[0].FileNameServer
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get all character models data including images
 * @returns {Promise<Array>} Promise resolving to array of character data
 */
function GetAllCharacterData() {
    return new Promise(async (resolve, reject) => {
        try {
            const query = 'SELECT b.ID, b.Title, b.Description, i.FileNameServer, i.FileType, i._REC_Creation_Timestamp AS CreationTimestamp ' +
                'FROM CharacterModels b ' +
                'LEFT JOIN Images i ON b.Image = i.ID';
            
            const results = await executeQuery(query);
            
            const characters = results.map(row => ({
                ID: row.ID,
                Title: row.Title,
                Description: row.Description,
                FileName: row.FileNameServer,
                FileType: row.FileType,
                _REC_Creation_Timestamp: row.CreationTimestamp
            }));
            
            resolve(characters);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get backdrop data including image information
 * @param {number} backdropId - ID of the backdrop to retrieve
 * @returns {Promise<Object>} Promise resolving to backdrop data
 */
function GetBackdropData(backdropId) {
    return new Promise(async (resolve, reject) => {
        try {
            const results = await executeQuery(
                'SELECT * FROM Backdrops WHERE ID = ? LIMIT 1', 
                [backdropId]
            );
            
            if (results.length === 0) {
                return resolve({}); // Return empty object if no backdrop found
            }
            
            const backdrop = results[0];
            
            // Get the associated image
            const imageResults = await executeQuery(
                'SELECT * FROM Images WHERE ID = ? LIMIT 1', 
                [backdrop.Image]
            );
            
            if (imageResults.length === 0) {
                return resolve({
                    Title: backdrop.Title,
                    Description: backdrop.Description,
                    FileName: null
                });
            }
            
            const image = imageResults[0];
            
            resolve({
                Title: backdrop.Title,
                Description: backdrop.Description,
                FileName: image.FileNameServer
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get all backdrop data including images
 * @returns {Promise<Array>} Promise resolving to array of backdrop data
 */
function GetAllBackdropData() {
    return new Promise(async (resolve, reject) => {
        try {
            const query = 'SELECT b.ID, b.Title, b.Description, i.FileNameServer, i.FileType, i._REC_Creation_Timestamp AS CreationTimestamp ' +
                'FROM Backdrops b ' +
                'LEFT JOIN Images i ON b.Image = i.ID';
            
            const results = await executeQuery(query);
            
            const backdrops = results.map(row => ({
                ID: row.ID,
                Title: row.Title,
                Description: row.Description,
                FileName: row.FileNameServer,
                FileType: row.FileType,
                _REC_Creation_Timestamp: row.CreationTimestamp
            }));
            
            resolve(backdrops);
        } catch (error) {
            reject(error);
        }
    });
}

// Setup multer for file uploads
function setupMulter(destination) {
    const multer = require('multer');
    const fs = require('fs');
    const path = require('path');

    // Ensure the upload directory exists
    if (!fs.existsSync(destination)) {
        console.log(`Creating upload directory: ${destination}`);
        fs.mkdirSync(destination, { recursive: true });
    }

    // Configure storage
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, destination);
        },
        filename: function (req, file, cb) {
            // Use a unique filename to prevent collisions
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix);
        }
    });

    return multer({ 
        storage: storage,
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB file size limit
        }
    });
}

module.exports = {
    checkUserProfileCompletion,
    storeUserDetails,
    fetchUserData,
    isAdmin,
    GetEncounterData,
    GetBadgeData,
    GetAllBadgesData,
    GetCharacterData,
    GetAllCharacterData,
    GetBackdropData,
    GetAllBackdropData,
    GetInstructionData,
    GetAllInstructionData,
    setupMulter
};

// Add Student Instruction helpers
/**
 * Get student instruction data including image information
 * @param {number} instructionId - ID of the instruction record
 * @returns {Promise<Object>}
 */
function GetInstructionData(instructionId) {
    return new Promise(async (resolve, reject) => {
        try {
            const results = await executeQuery(
                'SELECT * FROM StudentInstructions WHERE ID = ? LIMIT 1',
                [instructionId]
            );

            if (results.length === 0) {
                return resolve({});
            }

            const record = results[0];

            const imageResults = await executeQuery(
                'SELECT * FROM Images WHERE ID = ? LIMIT 1',
                [record.Image]
            );

            const image = imageResults[0] || {};

            resolve({
                Title: record.Title,
                Description: record.Description,
                FileName: image.FileNameServer || null
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Get all student instruction data including images
 * @returns {Promise<Array>}
 */
function GetAllInstructionData() {
    return new Promise(async (resolve, reject) => {
        try {
            const query = 'SELECT s.ID, s.Title, s.Description, i.FileNameServer, i.FileType, i._REC_Creation_Timestamp AS CreationTimestamp ' +
                'FROM StudentInstructions s ' +
                'LEFT JOIN Images i ON s.Image = i.ID';

            const results = await executeQuery(query);

            const instructions = results.map(row => ({
                ID: row.ID,
                Title: row.Title,
                Description: row.Description,
                FileName: row.FileNameServer,
                FileType: row.FileType,
                _REC_Creation_Timestamp: row.CreationTimestamp
            }));

            resolve(instructions);
        } catch (error) {
            reject(error);
        }
    });
}