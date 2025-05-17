// Express error handling middleware that logs the error and sends a generic response
// Place after all routes.
module.exports = function errorHandler(err, req, res, next) {
    console.error('Unhandled error occurred:', err);
    if (res.headersSent) {
        return next(err);
    }
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
}; 