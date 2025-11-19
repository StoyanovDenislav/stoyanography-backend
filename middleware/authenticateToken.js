const jwt = require("jsonwebtoken");
const db = require("../database_inquiry");

const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || "access-secret-change-this";

/**
 * Middleware to verify JWT access token from cookie and authenticate admin users
 */
async function authenticateToken(req, res, next) {
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

    // Verify user exists and is active in database
    await db.open();

    const user = await db.record.get(decoded.userId);

    await db.close();

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error) {
    // Make sure DB is closed on error
    try {
      await db.close();
    } catch (closeError) {
      // Ignore close errors
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during authentication",
    });
  }
}

module.exports = authenticateToken;
