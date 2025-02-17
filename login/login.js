const express = require("express");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const db_admin = require("../database_inquiry");
const cookieParser = require("cookie-parser");

// Rate limiting middleware
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
});

class UserRepository {
  static async findByUsername(username) {
    try {
      await db_admin.open();
      const user = await db_admin.query(
        "SELECT id, name, password FROM user WHERE name = :nm",
        { params: { nm: username } }
      );
      return user[0] || null;
    } finally {
      await db_admin.close();
    }
  }

  static async updateRefreshToken(userId, token) {
    try {
      await db_admin.open();
      const record = await db_admin
        .select()
        .from("user")
        .where({ id: userId })
        .one();
      const recordID = record["@rid"];
      const formattedID = `#${recordID.cluster}:${recordID.position}`;
      await db_admin.update(formattedID).set({ refresh_token: token }).one();
    } finally {
      await db_admin.close();
    }
  }
}

class AuthController {
  static #ACCESS_TOKEN_EXPIRY = "15m"; // Changed to 15 minutes
  static #REFRESH_TOKEN_EXPIRY = "7d"; // Changed to 7 days
  static COOKIE_OPTIONS = {
    origin: "https://localhost:3000",
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  };

  static async handleLogin(req, res) {
    try {
      const { username, password } = req.body;
      const user = await UserRepository.findByUsername(username);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      return res.sendStatus(204);
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  static async handle2FA(req, res) {
    try {
      const { username, code } = req.body;
      const user = await UserRepository.findByUsername(username);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const codeMatch = speakeasy.totp.verify({
        secret: process.env.AUTH_SECRET,
        encoding: "ascii",
        token: code,
        window: 1,
      });

      if (!codeMatch) {
        return res.status(401).json({ message: "Invalid 2FA code" });
      }

      const refreshToken = AuthController.generateRefreshToken(user.id);
      await UserRepository.updateRefreshToken(user.id, refreshToken);

      // Set both tokens in cookies
      const accessToken = AuthController.generateAccessToken(user.id);
      res.cookie("token", accessToken, {
        ...AuthController.COOKIE_OPTIONS,
        expires: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Store userId in cookie for refresh token functionality
      res.cookie("userId", user.id, {
        ...AuthController.COOKIE_OPTIONS,
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error("2FA error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  static generateAccessToken(userId) {
    return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: this.#ACCESS_TOKEN_EXPIRY,
    });
  }

  static generateRefreshToken(userId) {
    return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: this.#REFRESH_TOKEN_EXPIRY,
    });
  }

  static async authenticateToken(req, res, next) {
    try {
      const accessToken = req.cookies.token;
      const userId = req.cookies.userId; // We'll store userId in a cookie

      if (!accessToken || !userId) {
        return res.sendStatus(401);
      }

      try {
        // First try to verify the existing access token
        const decoded = jwt.verify(
          accessToken,
          process.env.ACCESS_TOKEN_SECRET
        );
        req.user = decoded;
        return next();
      } catch (err) {
        // If access token is expired, try to refresh it
        if (err.name === "TokenExpiredError") {
          try {
            // Get user and verify refresh token
            const user = await UserRepository.findByUsername(userId);

            if (!user?.refresh_token) {
              return res.sendStatus(401);
            }

            // Verify refresh token
            jwt.verify(
              user.refresh_token,
              process.env.REFRESH_TOKEN_SECRET,
              (refreshErr, decoded) => {
                if (refreshErr) {
                  // If refresh token is expired or invalid, user needs to login again
                  return res
                    .status(401)
                    .json({ message: "Session expired. Please login again." });
                }

                // Generate new access token
                const newAccessToken = AuthController.generateAccessToken(
                  decoded.userId
                );

                // Set new access token in cookie
                res.cookie("token", newAccessToken, {
                  ...AuthController.COOKIE_OPTIONS,
                  expires: new Date(Date.now() + 15 * 60 * 1000),
                });

                // Continue with request
                req.user = decoded;
                next();
              }
            );
          } catch (error) {
            console.error("Token refresh error:", error);
            return res.status(500).json({ message: "Internal server error" });
          }
        } else {
          return res.sendStatus(403);
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      return res.sendStatus(403);
    }
  }
}

// Router setup
const login = express.Router();
login.use(express.json());
login.use(cookieParser());

// Validation middleware
const loginValidation = [
  body("username").trim().isLength({ min: 3 }).escape(),
  body("password").isLength({ min: 6 }),
];

const twoFAValidation = [
  body("username").trim().isLength({ min: 3 }).escape(),
  body("code").trim().isLength({ min: 6, max: 6 }).isNumeric(),
];

// Routes
login.post("/login", loginValidation, loginLimiter, AuthController.handleLogin);
login.post("/2fa", twoFAValidation, loginLimiter, AuthController.handle2FA);

login.post("/logout", async (req, res) => {
  try {
    const { id } = req.body;
    await UserRepository.updateRefreshToken(id, null);
    res.clearCookie("token");
    res.clearCookie("userId"); // Clear userId cookie on logout
    res.sendStatus(204);
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

login.get("/token/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await UserRepository.findByUsername(id);

    if (!user?.refresh_token) {
      return res.sendStatus(401);
    }

    jwt.verify(
      user.refresh_token,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
        if (err) return res.sendStatus(403);

        const accessToken = AuthController.generateAccessToken(decoded.userId);
        res.cookie("token", accessToken, {
          ...AuthController.COOKIE_OPTIONS,
          expires: new Date(Date.now() + 15 * 60 * 1000),
        });
        res.sendStatus(204);
      }
    );
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

login.get("/requestName", AuthController.authenticateToken, (req, res) => {
  res.json({ name: "DesoBeso" });
});

module.exports = login;
