var nodemailer = require("nodemailer");

require("dotenv").config();

class Nodemailer {
  constructor(from, to, subject, text) {
    this.from = from;
    this.to = to;
    this.subject = subject;
    this.text = text;
  }

  SendEmail() {
    var transporter = nodemailer.createTransport({
      host: "smtp.zoho.eu",
      port: 465,
      secure: true,
      auth: {
        user: "support@stoyanography.com",
        pass: process.env.ZOHOPASS,
      },
    });

    var mailOptions = {
      from: this.from, //"Stoyanography Service <service@stoyanography.com>",
      to: this.to, //"denislav.stoyanov@stoyanography.com",
      subject: this.subject,
      text: this.text,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
          return reject(error);
        } else {
          console.log("Email sent to: " + info.response);
          return resolve(info);
        }
      });
    });
  }
}

module.exports = Nodemailer;
