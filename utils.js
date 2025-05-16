/**
 * Utilities for database operations and validation
 */
const { db } = require('./db');

/**
 * Execute a database query using promises
 * @param {string} query - SQL query to execute
 * @param {Array} params - Parameters for the query
 * @returns {Promise} - Promise that resolves with query results
 */
function executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.query(query, params, (error, results) => {
            if (error) {
                console.error('Database query error:', error);
                return reject(error);
            }
            resolve(results);
        });
    });
}

/**
 * Validate that required fields exist in the request object
 * @param {Object} reqBody - Request body to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} - { isValid: boolean, missingFields: string[] }
 */
function validateRequiredFields(reqBody, requiredFields) {
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (reqBody[field] === undefined || reqBody[field] === null) {
            missingFields.push(field);
        }
    }
    
    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

/**
 * Sanitize a value for use in database queries
 * Simple sanitization - could be extended with more robust validation
 * @param {any} value - Value to sanitize
 * @returns {any} - Sanitized value
 */
function sanitizeValue(value) {
    if (typeof value === 'string') {
        // Prevent SQL injection by escaping quotes
        return value.replace(/['";]/g, '\\$&');
    }
    return value;
}

/**
 * Validate a field name to ensure it only contains allowed characters
 * @param {string} fieldName - Field name to validate
 * @returns {boolean} - Whether the field name is valid
 */
function isValidFieldName(fieldName) {
    // Only allow alphanumeric characters, underscores, and standard field name characters
    const validFieldNameRegex = /^[a-zA-Z0-9_]+$/;
    return validFieldNameRegex.test(fieldName);
}

/**
 * Handle common error response pattern with improved debugging
 * @param {Error} error - Error object
 * @param {Object} res - Express response object
 * @param {string} message - Error message to send
 */
function handleErrorResponse(error, res, message) {
    console.error(`[handleErrorResponse] ${message}`);
    
    // Extract the most useful error details for logging
    let errorDetails = {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
    };
    
    // For MySQL errors, extract additional useful details
    if (error.code && error.sqlMessage) {
        errorDetails = {
            ...errorDetails,
            sqlCode: error.code,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        };
        
        // Log full details for database debugging
        console.error('[handleErrorResponse] SQL error details:', {
            code: error.code,
            sqlMessage: error.sqlMessage,
            sqlState: error.sqlState
        });
    }
    
    // Respond with a more detailed error in development, or just the message in production
    if (process.env.NODE_ENV !== 'production') {
        return res.status(500).json({
            error: message,
            details: errorDetails
        });
    }
    
    // Simple error for production
    res.status(500).send(message);
}

module.exports = {
    executeQuery,
    validateRequiredFields,
    sanitizeValue,
    isValidFieldName,
    handleErrorResponse
}; 