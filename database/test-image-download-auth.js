const https = require("https");
const crypto = require("crypto");
const { generateLink } = require("../utils/hashUtil");
require("dotenv").config();

async function testImageDownload(imagePath) {
  return new Promise((resolve, reject) => {
    // Generate authenticated URL using the same system as fetchLink.js
    const secret = process.env.SECRET;
    const secretRef = process.env.SECRET_REF;
    const expiry = Date.now() + 300000; // 5 minutes from now
    const ref = crypto
      .createHash("md5")
      .update(secretRef + expiry, "utf8")
      .digest("hex");

    const authenticatedUrl = generateLink({ secret, path: imagePath, expiry, ref });

    console.log("Testing authenticated image download...");
    console.log("Image path:", imagePath);
    console.log("Authenticated URL:", authenticatedUrl);
    console.log("Expiry:", new Date(expiry).toISOString());
    console.log("Ref hash:", ref);
    console.log("");

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "stoyanography.com",
      },
    };

    https
      .get(authenticatedUrl, options, (response) => {
        console.log("Status Code:", response.statusCode);
        console.log("Content-Type:", response.headers["content-type"]);
        console.log("Content-Length:", response.headers["content-length"]);
        console.log("Server:", response.headers["server"]);

        if (response.statusCode !== 200) {
          console.error(`\n❌ Failed with status ${response.statusCode}`);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString("base64");
          const dataUrl = `data:${response.headers["content-type"]};base64,${base64}`;
          
          console.log("\n✅ Image downloaded successfully!");
          console.log("Base64 length:", base64.length);
          console.log("Data URL length:", dataUrl.length);
          console.log("First 100 chars of base64:", base64.substring(0, 100));
          
          resolve(dataUrl);
        });
      })
      .on("error", (err) => {
        console.error("\n❌ Request error:", err.message);
        reject(err);
      });
  });
}

// Test with real image path
testImageDownload("/upload/pfp.png")
  .then(() => {
    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  });
