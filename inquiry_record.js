const express = require("express");
const crypto = require("crypto");
const db_inquiries = require("./database_inquiry");
const Nodemailer = require("./nodemailer");
const inquiry = express.Router();

inquiry.use(express.json());
require("dotenv").config();

const algorithm = "aes-256-cbc";
const secretKey = crypto
  .createHash("sha256")
  .update(String(process.env.SECRET_KEY))
  .digest("base64")
  .substr(0, 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

inquiry.post("/inquiry", async (req, res) => {
  const name = req.body.name;
  const surname = req.body.surname;
  const email = req.body.email;
  const phone_number = req.body.phone_number;
  const message = req.body.message;
  const category = req.body.category;

  // Updated input validation to accept Cyrillic
  if (!/^[\p{L}\s]+$/u.test(name) || !/^[\p{L}\s]+$/u.test(surname)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }
  if (!/^[a-zA-Z0-9_\-\.]+@(?:[a-zA-Z0-9]+\.)+[a-zA-Z]+$/.test(email)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }
  if (!/^\d+$/.test(phone_number)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }

  const encryptedName = encrypt(name);
  const encryptedSurname = encrypt(surname);
  const encryptedEmail = encrypt(email);
  const encryptedPhoneNumber = encrypt(phone_number);
  const encryptedMessage = encrypt(message);
  const encryptedCategory = encrypt(category);

  const currInquiry = new Inquiry(
    encryptedName,
    encryptedSurname,
    encryptedEmail,
    encryptedPhoneNumber,
    encryptedMessage,
    encryptedCategory
  );

  await currInquiry.registerInquiry().then(() => {
    console.log("Inquiry registered successfully");
  });

  const decryptedName = decrypt(encryptedName);
  const decryptedSurname = decrypt(encryptedSurname);
  const decryptedEmail = decrypt(encryptedEmail);
  const decryptedPhoneNumber = decrypt(encryptedPhoneNumber);
  const decryptedMessage = decrypt(encryptedMessage);
  const decryptedCategory = decrypt(encryptedCategory);

  const mailer = new Nodemailer(
    "Stoyanography Support <support@stoyanography.com>",
    "Denislav Stoyanov <denislav.stoyanov@stoyanography.com>",
    "New Inquiry",
    `Name: ${decryptedName}\n
    Surname: ${decryptedSurname}\n
    Phone number: ${decryptedPhoneNumber}\n
    Category: ${decryptedCategory}\n
    Email: ${decryptedEmail}\n
    -----------------------------------------------\n
    ${decryptedMessage}
    `
  );

  await mailer
    .SendEmail()
    .then(() => {
      return res.status(200).send("Email sent successfully!");
    })
    .catch((error) => {
      console.error(error);
      return res.status(500).send("Failed to send email!");
    });
});

class Inquiry {
  constructor(name, surname, email, phone_number, message, category) {
    this.name = name;
    this.surname = surname;
    this.email = email;
    this.phone_number = phone_number;
    this.message = message;
    this.category = category;
  }
  async registerInquiry() {
    try {
      const query = `
        INSERT INTO inquiry (name, surname, email, phone_number, message, category)
        VALUES (:name, :surname, :email, :phone_number, :message, :category)
      `;
      const params = {
        params: {
          name: this.name,
          surname: this.surname,
          email: this.email,
          phone_number: this.phone_number,
          message: this.message,
          category: this.category,
        },
      };

      await db_inquiries.query(query, params).then(() => {
        db_inquiries.close();
      });
    } catch (error) {
      console.error(`Error registering inquiry: ${error.message}`);
    }
  }
}

module.exports = inquiry;
