const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your_jwt_secret';

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.sendStatus(401);
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (requiredRoles.length && !requiredRoles.includes(payload.role)) {
        return res.sendStatus(403);
      }
      req.user = payload;
      next();
    } catch (e) {
      res.sendStatus(401);
    }
  };
}

module.exports = auth;
