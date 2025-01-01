const express = require("express");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const jwt = require("jsonwebtoken");
const db_admin = require("../database_inquiry");
const cookieParser = require("cookie-parser");
const { contentSecurityPolicy } = require("helmet");

class User {
  constructor(username) {
    this.username = username;
  }

  async openDb() {
    await db_admin.open();
  }

  async closeDb() {
    await db_admin.close();
  }

  async getUser() {
    await this.openDb();
    const user = await db_admin.query(
      "SELECT name FROM user WHERE name = :nm",
      {
        params: { nm: this.username },
      }
    );
    await this.closeDb();
    return user[0] ? true : false;
  }

  async getPassword() {
    await this.openDb();
    const pwd = await db_admin.query(
      "SELECT password FROM user WHERE name = :us",
      {
        params: { us: this.username },
      }
    );
    await this.closeDb();
    return pwd[0] ? pwd[0].password : false;
  }

  async getId() {
    await this.openDb();
    const id = await db_admin.query("SELECT id FROM user WHERE name = :us", {
      params: { us: this.username },
    });
    await this.closeDb();
    return id[0] ? id[0].id : false;
  }
}

class AuthController {
  static async getRefreshTokenByID(iD) {
    await db_admin.open();
    const userToken = await db_admin.query(
      "SELECT refresh_token FROM user WHERE id = :id",
      {
        params: { id: iD },
      }
    );
    await db_admin.close();
    return userToken[0] ? userToken[0].refresh_token : false;
  }

  static async deleteRefreshTokenbyUserId(ID) {
    try {
      await db_admin.open();
      const smth = await db_admin
        .select("*")
        .from("user")
        .where({ id: `${ID}` })
        .one();
      const recordID = smth["@rid"];
      const formattedID = `#${recordID.cluster}:${recordID.position}`;

      await db_admin.update(formattedID).set({ refresh_token: null }).one();
      await db_admin.close();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  static authenticateToken(req, res, next) {
    const tokenHeader = req.cookies.token;
    if (tokenHeader == null) return res.sendStatus(401);

    jwt.verify(tokenHeader, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
      if (err) {
        console.log(err);
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  }

  static generateAccessToken(user) {
    return jwt.sign({ user: user }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: 120,
    });
  }

  static generateRefreshToken(user) {
    return jwt.sign({ user: user }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: 180,
    });
  }
}

const login = express.Router();
login.use(express.json());
login.use(cookieParser());
require("dotenv").config();

login.post("/usernameID", async (req, res) => {
  const username = req.body.username;
  const user = new User(username);
  const id = await user.getId();
  res.json({ id: id });
});

login.get("/token/:id", async (req, res) => {
  let id = req.params.id;
  const refreshToken = await AuthController.getRefreshTokenByID(id);

  await jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      const accessToken = AuthController.generateAccessToken(user);
      res.cookie("token", accessToken, {
        origin: "https://localhost:3000",
        expires: new Date(Date.now() + 15 * 60 * 1000), // set desired expiration here
        httpOnly: true,
        path: "/",
        secure: true,
        sameSite: "none",
      });
      return res.sendStatus(204);
    }
  );
});

login.post("/login", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const user = new User(username);

  const userExists = await user.getUser();
  if (!userExists) {
    return res.status(404).json({ message: "User not found" });
  }

  const passwordMatch = await bcrypt.compare(
    password,
    await user.getPassword()
  );
  if (!passwordMatch) {
    return res.status(401).json({ message: "Incorrect password" });
  }

  res.sendStatus(204);
});

login.post("/2fa", async (req, res) => {
  const username = req.body.username;
  const enteredCode = req.body.code;
  const user = new User(username);

  const codeMatch = speakeasy.totp.verify({
    secret: process.env.AUTH_SECRET,
    encoding: "ascii",
    token: enteredCode,
  });
  if (!codeMatch) {
    return res.status(401).json({ message: "Incorrect 2FA code" });
  }

  const refreshToken = AuthController.generateRefreshToken({
    id: await user.getId(),
  });
  await db_admin.open();
  const record = await db_admin
    .select()
    .from("user")
    .where({ name: username })
    .one();
  const recordID = record["@rid"];
  const formattedID = `#${recordID.cluster}:${recordID.position}`;

  await db_admin.update(formattedID).set({ refresh_token: refreshToken }).one();
  await db_admin.close();
  res.sendStatus(204);
});

login.post("/logout", async (req, res) => {
  const usernameID = req.body.id;
  await AuthController.deleteRefreshTokenbyUserId(usernameID).then(() => {
    res.clearCookie("token");
    res.end();
  });
});

login.get(
  "/requestName",
  AuthController.authenticateToken,
  async (req, res) => {
    res.json({ name: "DesoBeso" });
  }
);

module.exports = login;
