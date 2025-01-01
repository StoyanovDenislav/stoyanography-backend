/*const express = require("express");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const jwt = require("jsonwebtoken");
const db_admin = require("../../database_inquiry");
const cookieParser = require("cookie-parser");
const { contentSecurityPolicy } = require("helmet");

const login = express.Router();

login.use(express.json());
login.use(cookieParser());

require("dotenv").config();

async function getUserByUsername(username) {
  // Open the database connection.
  await db_admin.open();

  // Execute the query.
  const user = await db_admin.query("SELECT name FROM user WHERE name = :nm", {
    params: { nm: username },
  });

  // Close the database connection.
  await db_admin.close();

  // If the user exists, return the user's username. Otherwise, return `false`.
  if (user[0]) return true;
  else return false;
}

async function getPasswordbyUser(username) {
  // Open the database connection.
  await db_admin.open();

  // Execute the query.
  const pwd = await db_admin.query(
    "SELECT password FROM user WHERE name = :us",
    {
      params: { us: username },
    }
  );

  // Close the database connection.
  await db_admin.close();

  // If the user exists, return the user's password. Otherwise, return `false`.
  if (pwd[0] != null) {
    return pwd[0].password;
  } else return false;
}

async function getRefreshTokenByID(iD) {
  // Open the database connection.
  await db_admin.open();

  // Execute the query.
  const userToken = await db_admin.query(
    "SELECT refresh_token FROM user WHERE id = :id",
    {
      params: { id: iD },
    }
  );

  await db_admin.close();

  if (userToken[0] != null) {
    return userToken[0].refresh_token;
  } else return false;

  // If the user exists, return the user's refresh token. Otherwise, return `false`.
}

async function getIdbyUser(username) {
  try {
    // Open the database connection.
    await db_admin.open();

    // Execute the query.
    const id = await db_admin.query("SELECT id FROM user WHERE name = :us", {
      params: { us: username },
    });

    // Close the database connection.
    await db_admin.close();

    // If the user exists, return the user's password. Otherwise, return `false`.
    if (id[0] != null) {
      console.log(id[0].id.toString());
      return id[0].id;
    } else return false;
  } catch (error) {
    console.error(error);
    throw error; // Or handle the error as you see fit.
  }
}

async function deleteRefreshTokenbyUserId(ID) {
  try {
    // Open the database connection.
    await db_admin.open();

    const smth = await db_admin
      .select("*")
      .from(`user`)
      .where({
        id: `${ID}`,
      })
      .one();

    console.log(smth, "parcal id");

    const recordID = smth["@rid"];
    const formattedID = `#${recordID.cluster}:${recordID.position}`;

    await db_admin
      .update(formattedID)
      .set({
        refresh_token: null,
      })
      .one()
      .then(function (update) {
        console.log("Records Updated:", update);
      });

    // Store the refresh token in the database

    /*await db_admin
    .insert()
    .into("user")
    .set({ refresh_token: refreshToken })
    .where(`id = ${JSON.stringify(await getIdb_adminyUser(username))}`)
    .one();
    await db_admin.close();

    // If the user exists, return the user's password. Otherwise, return `false`.
  } catch (error) {
    console.error(error);
    throw error; // Or handle the error as you see fit.
  }
}

function authenticateToken(req, res, next) {
  const tokenHeader = req.cookies.token;

  if (tokenHeader == null) return res.sendStatus(401);
  // no refresh token check???
  jwt.verify(tokenHeader, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      console.log(err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

module.exports = authenticateToken;

login.post("/usernameID", async (req, res) => {
  const username = req.body.username;

  const id = await getIdbyUser(username);

  res.json({ id: id });
});

login.get("/token/:id", async (req, res) => {
  let id = req.params.id;

  //  const username = "test4";

  // Parse username to ID
  // const userId = await getIdb_adminyUser(username); "b665b58c-7e3e-4edb_admin-a38a-8bb7ab1f7963"

  const refreshToken = await getRefreshTokenByID(id);

  await jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      // Generate a new access token
      const accessToken = generateAccessToken(user);

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

  // Check if the user exists in the database
  const user = await getUserByUsername(username);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Compare the password to the hashed password in the database
  const passwordMatch = await bcrypt.compare(
    password,
    await getPasswordbyUser(username)
  );

  if (!passwordMatch) {
    return res.status(401).json({ message: "Incorrect password" });
  }

  // Store the username in a session or a cookie

  // Redirect the user to the 2FA page
  res.sendStatus(204);
});

login.post("/2fa", async (req, res) => {
  const username = req.body.username;
  const enteredCode = req.body.code;

  // Verify the 2FA code
  const codeMatch = speakeasy.totp.verify({
    secret: process.env.AUTH_SECRET,
    encoding: "ascii",
    token: enteredCode,
  });
  if (!codeMatch) {
    return res.status(401).json({ message: "Incorrect 2FA code" });
  }

  // Generate an access token

  // sessionStorage.setItem("accessToken", accessToken);

  // Generate a refresh token
  const refreshToken = generateRefreshToken({
    id: await getIdbyUser(username),
  });

  //console.log(await getIdb_adminyUser(username));

  await db_admin.open();

  const record = await db_admin
    .select()
    .from("user")
    .where({ name: username })
    .one();
  const recordID = record["@rid"];
  const formattedID = `#${recordID.cluster}:${recordID.position}`;

  await db_admin
    .update(formattedID)
    .set({
      refresh_token: refreshToken,
    })
    .one()
    .then(function (update) {
      console.log("Records Updated:", update);
    });

  // Store the refresh token in the database

  /*await db_admin
    .insert()
    .into("user")
    .set({ refresh_token: refreshToken })
    .where(`id = ${JSON.stringify(await getIdb_adminyUser(username))}`)
    .one();
  await db_admin.close();

  res.sendStatus(204);
});

login.post("/logout", async (req, res) => {
  const usernameID = req.body.id;

  await deleteRefreshTokenbyUserId(usernameID).then(() => {
    res.clearCookie("token");
    res.end();
  });
});

login.get("/requestName", authenticateToken, async (req, res) => {
  res.json({ name: "DesoBeso" });
  // Authenticate User
});

function generateAccessToken(user) {
  return jwt.sign({ user: user }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: 120,
  });
}

function generateRefreshToken(user) {
  return jwt.sign({ user: user }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: 180,
  });
}

module.exports = login;*/
