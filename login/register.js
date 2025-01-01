const express = require("express");
const bcrypt = require("bcrypt");
const register = express.Router();

const db_admin = require("../database_inquiry");
const crypto = require("crypto");
require("dotenv").config();

register.use(express.json());

register.post("/register", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const repeatPassword = req.body.repeatPassword;
  const email = req.body.email;
  var id = generateRandomUserId();

  // Check if the username already exists
  const user = await getUserByEmail(email);

  if (user) {
    return res.status(409).json({ message: "Username already exists" });
  }

  // Generate a salt

  // Hash the password
  const hashedPassword = await encryptPassword(password);

  // Create a new user record
  const newUser = {
    id: id,
    username: username,
    hashedPassword: hashedPassword,
    email: email,
  };

  if (password === repeatPassword) {
    await registerUser(
      newUser.id,
      newUser.email,
      newUser.username,
      newUser.hashedPassword
    );
    // Send a success response
    res.sendStatus(201);
  }
});

async function encryptPassword(password) {
  // Generate a salt
  const salt = await bcrypt.genSalt(10);
  // Hash the password using the salt
  const hashedPassword = await bcrypt.hash(password, salt);

  return hashedPassword;
}

module.exports = async function verifyPassword(password, hashedPassword) {
  const passwordMatch = await bcrypt.compare(password, hashedPassword);

  return passwordMatch;
};

async function getUserByEmail(email) {
  // Validate the email address.

  // Open the database connection.
  await db_admin.open();

  // Execute the query.
  const user = await db_admin.query(
    "SELECT email FROM user WHERE email = :em",
    {
      params: { em: email },
    }
  );

  // Close the database connection.
  await db_admin.close();

  // If the user exists, return the user's email address. Otherwise, return `false`.
  if (user[0]) return true;
  else return false;
}

async function registerUser(id, email, name, password) {
  try {
    if (!/^[a-zA-Z0-9]+$/.test(name)) {
      throw new Error("Invalid username");
    }

    if (!/^[a-zA-Z0-9_\-\.]+@(?:[a-zA-Z0-9]+\.)+[a-zA-Z]+$/.test(email)) {
      throw new Error("Invalid email address");
    }

    db_admin
      .insert()
      .into("`user`")
      .set({
        id,
        email,
        name,
        password,
        refresh_token: null,
      })
      .one()
      .then((player) => {
        console.log(player);
      })
      .then(() => {
        db_admin.close().then(() => {
          console.log("closed");
        });
      });
  } catch (error) {
    console.error(`Error registering user: ${error.message}`);
  }
}

function generateRandomUserId() {
  return crypto.randomUUID();
}

module.exports = registerUser;

module.exports = register;
