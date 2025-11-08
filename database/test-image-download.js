const https = require("https");

const IMAGE_ORIGIN = "https://cdn.stoyanography.com";

/**
 * Test downloading a single image
 */
async function testImageDownload(imagePath) {
  return new Promise((resolve, reject) => {
    const url = `${IMAGE_ORIGIN}${imagePath}`;
    console.log(`\n🔍 Testing: ${url}`);

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://stoyanography.com",
        Origin: "https://stoyanography.com",
      },
    };

    const timeout = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, 15000);

    https
      .get(url, options, (response) => {
        clearTimeout(timeout);

        console.log(`📊 Status Code: ${response.statusCode}`);
        console.log(`📋 Headers:`, response.headers);

        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          console.log(`↪️  Redirect to: ${response.headers.location}`);
          return testImageDownload(response.headers.location)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const sizeKB = (buffer.length / 1024).toFixed(2);
          console.log(`✅ Downloaded successfully: ${sizeKB} KB`);
          console.log(
            `🖼️  Content-Type: ${response.headers["content-type"]}`
          );
          resolve({
            success: true,
            size: buffer.length,
            contentType: response.headers["content-type"],
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        console.error(`❌ Error: ${err.message}`);
        reject(err);
      });
  });
}

// Test with a sample image path
async function runTest() {
  console.log("🚀 Testing Image Download from CDN\n");
  console.log("=" .repeat(60));

  // Test paths - add actual image paths from your collections
  const testPaths = [
    "/upload/pfp.png", // Profile picture from aboutme
  ];

  for (const path of testPaths) {
    try {
      await testImageDownload(path);
      console.log("✅ Test passed for:", path);
    } catch (error) {
      console.error("❌ Test failed for:", path);
      console.error("   Error:", error.message);
    }
    console.log("=" .repeat(60));
  }
}

runTest();
