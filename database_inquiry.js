const ODatabase = require("orientjs").ODatabase;
require("dotenv").config();

const db_inquiries = new ODatabase({
  host: process.env.HOST,
  port: process.env.PORT,
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
});

/*const db_photos = new ODatabase({
  host: process.env.HOST,
  port: process.env.PORT,
  username: process.env.PHADMIN,
  password: process.env.PHPASSWORD,
  name: process.env.PHNAME,
  useToken: true,
});*/
console.log("Database active: ", db_inquiries.name);
/*db_inquiries
  .insert()
  .into("`inquiry`")
  .set({
    name: "test",
    surname: "test",
    email: "test",
    phone_number: "test",
    message: "test",
  })
  .one()
  .then((player) => {
    console.log(player);
  })
  .then(() => {
    db_inquiries.close().then(() => {
      console.log("closed");
    });
  });*/

module.exports = db_inquiries;
//module.exports = db_photos;
