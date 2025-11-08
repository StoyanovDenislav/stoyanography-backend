const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");
const db = require("../database_inquiry");

const router = express.Router();

// JWT secrets from environment
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "access-secret-change-this";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "refresh-secret-change-this";

// Token expiry times
const ACCESS_TOKEN_EXPIRY = "5m"; // 5 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

/**
 * Generate access token (short-lived)
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user["@rid"].toString(),
      username: user.username,
      email: user.email,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generate refresh token (long-lived)
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Store refresh token in database
 */
async function storeRefreshToken(userId, token, req) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await db.insert().into("RefreshToken").set({
    token: token,
    userId: userId,
    expiresAt: expiresAt.toISOString().replace('T', ' ').substring(0, 19),
    createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || req.connection.remoteAddress || '',
    isRevoked: false
  }).one();
}

/**
 * POST /api/auth/login
 * Login with username/password and receive access token + refresh token in cookie
 */
router.post(
  "/login",
  [
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, password } = req.body;

    try {
      await db.open();

      // Find user by username
      const users = await db.query(
        "SELECT FROM AdminUser WHERE username = :username AND isActive = true",
        {
          params: { username },
        }
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const user = users[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Update last login time
      await db.update(user["@rid"]).set({
        lastLoginAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      }).one();

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken();

      // Store refresh token in database ONLY
      await storeRefreshToken(user["@rid"].toString(), refreshToken, req);

      // Set ONLY access token as HTTP-only cookie (5 minutes)
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      res.json({
        success: true,
        user: {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during login",
      });
    } finally {
      await db.close();
    }
  }
);

/**
 * POST /api/auth/refresh
 * Exchange existing access token for new access token using DB-stored refresh token
 */
router.post("/refresh", async (req, res) => {
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: "No access token provided",
    });
  }

  try {
    // Decode the expired/expiring access token (don't verify, just decode)
    const decoded = jwt.decode(accessToken);

    if (!decoded || typeof decoded === 'string' || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    await db.open();

    // Find active refresh token for this user in database
    const tokens = await db.query(
      "SELECT FROM RefreshToken WHERE userId = :userId AND isRevoked = false ORDER BY createdAt DESC LIMIT 1",
      {
        params: { userId: decoded.userId },
      }
    );

    if (tokens.length === 0) {
      return res.status(401).json({
        success: false,
        message: "No valid refresh token found",
      });
    }

    const tokenRecord = tokens[0];

    // Check if token is expired
    const expiresAt = new Date(tokenRecord.expiresAt);
    if (expiresAt < new Date()) {
      // Delete expired token
      await db.query(
        "DELETE VERTEX RefreshToken WHERE token = :token",
        { params: { token: tokenRecord.token } }
      );

      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
      });
    }

    // Get user
    const user = await db.record.get(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Set new access token cookie
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60 * 1000, // 5 minutes
    });

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during token refresh",
    });
  } finally {
    await db.close();
  }
});

/**
 * POST /api/auth/logout
 * Revoke refresh token from database and clear access token cookie
 */
router.post("/logout", async (req, res) => {
  const accessToken = req.cookies.accessToken;

  if (accessToken) {
    try {
      // Decode token to get userId
      const decoded = jwt.decode(accessToken);
      
      if (decoded && typeof decoded !== 'string' && decoded.userId) {
        await db.open();

        // Revoke all refresh tokens for this user
        await db.query(
          "UPDATE RefreshToken SET isRevoked = true WHERE userId = :userId",
          { params: { userId: decoded.userId } }
        );
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      await db.close();
    }
  }

  // Clear the access token cookie
  res.clearCookie("accessToken");

  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * POST /api/auth/verify
 * Verify access token from cookie and return user data
 */
router.post("/verify", async (req, res) => {
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

    await db.open();

    // Verify user still exists and is active
    const user = await db.record.get(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        expired: error.name === "TokenExpiredError",
      });
    }

    console.error("Token verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during verification",
    });
  } finally {
    await db.close();
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post(
  "/change-password",
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage("Password must contain uppercase, lowercase, number, and special character"),
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

      await db.open();

      // Get user
      const user = await db.record.get(decoded.userId);
      
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: "User not found or inactive",
        });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await db.update(decoded.userId).set({
        passwordHash: newPasswordHash,
      }).one();

      // Revoke all refresh tokens for this user (force re-login on all devices)
      await db.query(
        "UPDATE RefreshToken SET isRevoked = true WHERE userId = :userId",
        { params: { userId: decoded.userId } }
      );

      res.json({
        success: true,
        message: "Password changed successfully. Please log in again.",
      });
    } catch (error) {
      if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      console.error("Password change error:", error);
      res.status(500).json({
        success: false,
        message: "Server error during password change",
      });
    } finally {
      await db.close();
    }
  }
);

module.exports = router;
