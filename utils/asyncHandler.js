// A tiny helper to eliminate repetitive try/catch blocks around async Express handlers.
// Usage: router.get('/endpoint', asyncHandler(async (req, res) => { ... }))
// Any error thrown will be passed to next() -> the global error middleware.

module.exports = function asyncHandler(fn) {
    return function asyncRouteWrapper(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}; 