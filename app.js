const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const login = require("./login/login.js");
const register = require("./login/register.js");
const inquiry = require("./inquiry_record.js");
const rateLimit = require("express-rate-limit");
const https = require("https");
const fs = require("fs");
const SendTestEmail = require("./nodemailer.js");
const apiRouter = require("./routes/api.js");
//const db = require("./database")

require("dotenv").config();

const app = express();

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Custom CORS middleware to handle wildcards
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "https://stoyanography.com",
    "https://*.stoyanography.com",
  ];
  const origin = req.get("Origin");

  console.log("Origin:", origin);

  const isAllowed = allowedOrigins.some((allowed) => {
    const regex = new RegExp(`^${allowed.replace(/\*/g, ".*")}\/?$`);
    const result = regex.test(origin);
    console.log(`Testing ${origin} against ${regex}: ${result}`);
    return result;
  });

  if (origin && isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers"
    );
    next();
  } else {
    res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forbidden 403</title>
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          #rickroll {
            opacity: 0;
            transition: opacity 1s;
          }
        </style>
      </head>
      <body>
        <h1 id="header">Forbidden 403</h1>
        <video id="rickroll" width="1000" height="1000" controls autoplay muted>
          <source src="https://cdn.mtdv.me/video/rick.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <script>
          const video = document.getElementById('rickroll');
          const header = document.getElementById('header');
          setTimeout(() => {
            header.textContent = "Never Gonna Give You Data";
            video.muted = false;
            video.currentTime = 0; // Rewind the video
            video.style.opacity = 1;
            video.play();
          }, 2000); // 2-second delay

         
        </script>
      </body>
      </html>
    `);
  }
});

// Middleware to restrict access
app.use((req, res, next) => {
  const allowedReferers = [
    "http://localhost:3000",
    "https://stoyanography.com",
    "https://*.stoyanography.com",
  ];
  const referer = req.get("Referer") || req.get("Origin");

  console.log("Referer:", referer);

  const isAllowed = allowedReferers.some((allowed) => {
    const regex = new RegExp(`^${allowed.replace(/\*/g, ".*")}\/?$`);
    const result = regex.test(referer);
    console.log(`Testing ${referer} against ${regex}: ${result}`);
    return result;
  });

  if (referer && isAllowed) {
    next();
  } else {
    res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forbidden 403</title>
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          #rickroll {
            opacity: 0;
            transition: opacity 1s;
          }
        </style>
      </head>
      <body>
        <h1 id="header">Forbidden 403</h1>
        <video id="rickroll" width="1000" height="1000" controls autoplay muted>
          <source src="https://cdn.mtdv.me/video/rick.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <script>
          const video = document.getElementById('rickroll');
          const header = document.getElementById('header');
          setTimeout(() => {
            header.textContent = "Never Gonna Give You Data";
            video.muted = false;
            video.currentTime = 0; // Rewind the video
            video.style.opacity = 1;
            video.play();
          }, 2000); // 2-second delay

         
        </script>
      </body>
      </html>
    `);
  }
});

// Security middleware
app.use(helmet());
app.use(cookieParser());

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use(login);
app.use(register);
app.use(express.static("public"));
app.use(inquiry);
//app.use(uploadToServer);
//app.use(getFromServer);
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000, // 1 hour
    max: 100, // 100 requests per minute
  })
);
app.use(apiRouter);

const options = {
  key: fs.readFileSync("./certs/privkey.pem"),
  cert: fs.readFileSync("./certs/fullchain.pem"), //once on the server, make sure to reroute the ssl certs
  //to the folder that holds the real SSL certs
};
const server = https.createServer(options, app);

const port = 6001;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);

  //set HTTPS=true&&
});
