/**
 * Authentication middleware.
 * Rejects requests that don't have an active user session.
 */

/**
 * Require the request to come from a logged-in user.
 * Checks for req.session.userId — set during login/register.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  }
  next();
}

module.exports = { requireAuth };
