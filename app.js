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
const adminRouter = require("./routes/admin.js");
const bookingRouter = require("./routes/booking.js");
const authRouter = require("./routes/auth.js");
const cacheManager = require("./utils/CacheManager");
const fetchLink = require("./legacy/utils/fetchLink");
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

  // Allow requests without Origin header (same-origin or direct API calls)
  if (!origin) {
    console.log("No origin header - allowing request");
    next();
    return;
  }

  const isAllowed = allowedOrigins.some((allowed) => {
    const regex = new RegExp(`^${allowed.replace(/\*/g, ".*")}\/?$`);
    const result = regex.test(origin);
    console.log(`Testing ${origin} against ${regex}: ${result}`);
    return result;
  });

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Cookie"
    );
    
    // Handle preflight
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    
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
app.use("/api/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/api/booking", bookingRouter);

// Startup config processing function
async function preProcessConfigs() {
  console.log(
    "🚀 Starting automatic config processing with change detection..."
  );

  // Get config paths from environment variable or use a sensible default
  let configPaths = [];

  const envConfigPaths = process.env.STARTUP_CONFIG_PATHS;
  if (envConfigPaths) {
    configPaths = envConfigPaths.split(",").map((path) => path.trim());
    console.log(
      `📋 Using config paths from environment: ${configPaths.join(", ")}`
    );
  } else {
    // Default to common paths, but we'll verify they exist
    const potentialPaths = [
      "/upload/configs/main/config.json",
      "/upload/configs/configCMS.json",
    ];

    // Test which configs actually exist by trying to fetch them
    console.log("🔍 Testing which config paths are accessible...");
    for (const path of potentialPaths) {
      try {
        const response = await fetchLink(path);
        if (response.ok) {
          configPaths.push(path);
          console.log(`✅ Config found: ${path}`);
        }
      } catch (error) {
        console.log(`❌ Config not accessible: ${path} (${error.message})`);
      }
    }
  }

  if (configPaths.length === 0) {
    console.log(
      "⚠️ No accessible config paths found. Skipping automatic processing."
    );
    console.log(
      "💡 Set STARTUP_CONFIG_PATHS environment variable to specify config paths to monitor."
    );
    return;
  }

  console.log(
    `📝 Monitoring ${configPaths.length} config(s): ${configPaths.join(", ")}`
  );

  // Use hash-based change detection instead of processing everything
  await cacheManager.checkAllConfigs(configPaths);

  // Start hourly monitoring
  cacheManager.startHourlyConfigCheck(configPaths);

  console.log("🎉 Startup config processing and monitoring setup completed");
}
const isDev = process.env.NODE_ENV !== "production";
const port = 6001;

let server;

if (isDev) {
  // Use HTTP for development
  console.log("Starting server in DEVELOPMENT mode (HTTP)");
  server = require("http").createServer(app);
} else {
  // Use HTTPS for production
  console.log("Starting server in PRODUCTION mode (HTTPS)");
  try {
    const options = {
      key: fs.readFileSync("./certs/privkey.pem"),
      cert: fs.readFileSync("./certs/fullchain.pem"),
    };
    server = require("https").createServer(options, app);
  } catch (error) {
    console.error("Error loading SSL certificates:", error);
    process.exit(1);
  }
}

server.listen(port, async () => {
  console.log(
    `Server is running on port ${port} in ${
      isDev ? "development" : "production"
    } mode`
  );

  // Start config pre-processing in the background after server is ready
  setTimeout(() => {
    preProcessConfigs().catch((error) => {
      console.error("Startup config processing failed:", error);
    });
  }, 1000); // Give the server a second to fully initialize
});

// Graceful shutdown handler
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  cacheManager.stopHourlyConfigCheck();
  server.close(() => {
    console.log("Server gracefully terminated");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  cacheManager.stopHourlyConfigCheck();
  server.close(() => {
    console.log("Server gracefully terminated");
    process.exit(0);
  });
});
