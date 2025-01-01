const express = require("express");
const db_inquiries = require("./database_inquiry");
const Nodemailer = require("./nodemailer");
const createApplication = require("express/lib/express");
const inquiry = express.Router();

inquiry.use(express.json());
require("dotenv").config();

inquiry.post("/inquiry", async (req, res) => {
  const name = req.body.name;
  const surname = req.body.surname;
  const email = req.body.email;
  const phone_number = req.body.phone_number;
  const message = req.body.message;
  const category = req.body.category;

  // Input validation
  if (!/^[a-zA-Z\s]+$/.test(name) || !/^[a-zA-Z\s]+$/.test(surname)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }
  if (!/^[a-zA-Z0-9_\-\.]+@(?:[a-zA-Z0-9]+\.)+[a-zA-Z]+$/.test(email)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }
  if (!/^\d+$/.test(phone_number)) {
    return res.status(400).send("Mining for Gold, found coal. Shame...");
  }

  const currInquiry = new Inquiry(
    name,
    surname,
    email,
    phone_number,
    message,
    category
  );

  await currInquiry.registerInquiry().then(() => {
    console.log("cool");
  });

  console.log(message);

  /**
   * Very hacky solution
   * Currently the requests will be sent directly via email,
   * however we are also logging them into the DB, because
   * once we do the admin page, we will need to fetch them from somewhere
   */

  const mailer = new Nodemailer(
    "Stoyanography Support <support@stoyanography.com>",
    "Denislav Stoyanov <denislav.stoyanov@stoyanography.com>",
    "New Inquiry",
    `Name: ${name}\n
    Surname: ${surname}\n
    Phone number: ${phone_number}\n
    Category: ${category}\n
    Email: ${email}\n
    -----------------------------------------------\n
    ${message}
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

      await db_inquiries
        .query(query, params)

        .then(() => {
          db_inquiries.close();
        });
    } catch (error) {
      console.error(`Error registering user: ${error.message}`);
    }
  }
}
module.exports = inquiry;
