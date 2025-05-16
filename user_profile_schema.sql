-- MySQL schema changes for user profiles

-- Create UserBadges junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS UserBadges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    badge_id INT NOT NULL,
    date_earned DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES UserAccounts(id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES Badges(ID) ON DELETE CASCADE,
    UNIQUE KEY unique_user_badge (user_id, badge_id)
);

-- Add new fields to UserAccounts if they don't exist
-- Note: The query checks if columns exist before adding to avoid errors

-- Add level column if it doesn't exist
SET @exists = 0;
SELECT COUNT(*) INTO @exists FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'UserAccounts' AND column_name = 'level';
SET @query = IF(@exists = 0, 
    'ALTER TABLE UserAccounts ADD level INT NOT NULL DEFAULT 1',
    'SELECT ''level column already exists''');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add streak_days column if it doesn't exist
SET @exists = 0;
SELECT COUNT(*) INTO @exists FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'UserAccounts' AND column_name = 'streak_days';
SET @query = IF(@exists = 0, 
    'ALTER TABLE UserAccounts ADD streak_days INT NOT NULL DEFAULT 0',
    'SELECT ''streak_days column already exists''');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add profile_visibility column if it doesn't exist
SET @exists = 0;
SELECT COUNT(*) INTO @exists FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'UserAccounts' AND column_name = 'profile_visibility';
SET @query = IF(@exists = 0, 
    'ALTER TABLE UserAccounts ADD profile_visibility ENUM(''public'', ''friends'', ''private'') NOT NULL DEFAULT ''public''',
    'SELECT ''profile_visibility column already exists''');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add avatar_customization column if it doesn't exist
SET @exists = 0;
SELECT COUNT(*) INTO @exists FROM information_schema.columns 
    WHERE table_schema = DATABASE() AND table_name = 'UserAccounts' AND column_name = 'avatar_customization';
SET @query = IF(@exists = 0, 
    'ALTER TABLE UserAccounts ADD avatar_customization JSON NULL',
    'SELECT ''avatar_customization column already exists''');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt; 