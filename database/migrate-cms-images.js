const ODatabase = require("orientjs").ODatabase;
const https = require("https");
const http = require("http");
require("dotenv").config();

const dbConfig = {
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
};

const IMAGE_ORIGIN = "https://stoyanography.com";

/**
 * Download image from URL and convert to base64
 */
async function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://stoyanography.com",
      },
    };

    const timeout = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, 15000); // 15 second timeout

    client
      .get(url, options, (response) => {
        clearTimeout(timeout);

        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadImageAsBase64(response.headers.location)
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
          const base64 = buffer.toString("base64");
          const contentType = response.headers["content-type"] || "image/jpeg";
          resolve(`data:${contentType};base64,${base64}`);
        });
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Convert image path to base64 by fetching from production server
 */
async function imageToBase64(imagePath) {
  try {
    const imageUrl = `${IMAGE_ORIGIN}${imagePath}`;
    const base64 = await downloadImageAsBase64(imageUrl);
    return base64;
  } catch (error) {
    return null;
  }
}

/**
 * Main image migration function
 */
async function migrateImages() {
  let db;

  try {
    console.log("🚀 Starting CMS Image Migration...\n");

    // ========================================
    // 1. Connect to Database
    // ========================================
    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected successfully\n");

    // ========================================
    // 2. Migrate Photo Collection Images
    // ========================================
    console.log("📸 Migrating Photo Collection Images...\n");

    const collections = await db.query(
      `SELECT collectionName, metadata FROM CMSPhotoCollection`
    );

    let totalConverted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const collectionName = collection.collectionName;
      const metadata = JSON.parse(collection.metadata);
      const originalPaths = metadata.originalPaths || [];

      console.log(
        `[${i + 1}/${collections.length}] ${collectionName} (${
          originalPaths.length
        } images)`
      );

      const base64Photos = [];
      let skippedCount = 0;

      for (let j = 0; j < originalPaths.length; j++) {
        const photoPath = originalPaths[j];
        process.stdout.write(
          `  Converting ${j + 1}/${originalPaths.length}... `
        );

        const base64 = await imageToBase64(photoPath);
        if (base64) {
          base64Photos.push(base64);
          process.stdout.write(`✓\n`);
        } else {
          skippedCount++;
          process.stdout.write(`✗ (skipped)\n`);
        }
      }

      // Update collection with images
      await db.query(
        `UPDATE CMSPhotoCollection SET 
          photos = :photos,
          metadata = :metadata,
          updatedAt = sysdate()
        WHERE collectionName = :collectionName`,
        {
          params: {
            collectionName,
            photos: base64Photos,
            metadata: JSON.stringify({
              ...metadata,
              totalImages: base64Photos.length,
              skippedCount,
              migratedImages: true,
              migratedAt: new Date().toISOString(),
            }),
          },
        }
      );

      totalConverted += base64Photos.length;
      totalSkipped += skippedCount;

      console.log(
        `  ✓ Saved ${base64Photos.length}/${originalPaths.length} images\n`
      );
    }

    console.log(
      `✅ Migrated photo collections: ${totalConverted} images, ${totalSkipped} skipped\n`
    );

    // ========================================
    // 3. Migrate Singular Images
    // ========================================
    console.log("🖼️  Migrating Singular Images...\n");

    const singularResult = await db.query(
      `SELECT configData FROM CMSConfig WHERE configKey = 'SingularImages'`
    );

    if (singularResult.length > 0) {
      const singularImages = JSON.parse(singularResult[0].configData);
      const processedSingularImages = {};
      let singularConverted = 0;
      let singularSkipped = 0;

      for (const [key, imagePath] of Object.entries(singularImages)) {
        process.stdout.write(`  Converting ${key}... `);

        const base64 = await imageToBase64(imagePath);
        if (base64) {
          processedSingularImages[key] = base64;
          singularConverted++;
          process.stdout.write(`✓\n`);
        } else {
          processedSingularImages[key] = imagePath; // Keep path as fallback
          singularSkipped++;
          process.stdout.write(`✗ (kept path)\n`);
        }
      }

      await db.query(
        `UPDATE CMSConfig SET 
          configData = :configData,
          updatedAt = sysdate()
        WHERE configKey = 'SingularImages'`,
        {
          params: {
            configData: JSON.stringify(processedSingularImages),
          },
        }
      );

      console.log(
        `\n✅ Singular images: ${singularConverted} converted, ${singularSkipped} skipped\n`
      );
    }

    // ========================================
    // 4. Migrate Page Images
    // ========================================
    console.log("📄 Migrating Page Images...\n");

    const pages = await db.query(
      `SELECT configKey, configData FROM CMSConfig WHERE configKey LIKE 'page_%'`
    );

    let pageImageCount = 0;

    for (const page of pages) {
      const pageName = page.configKey.replace("page_", "");
      const pageData = JSON.parse(page.configData);
      let pageConverted = 0;

      if (pageData.sections && Array.isArray(pageData.sections)) {
        for (const section of pageData.sections) {
          // Single image
          if (
            section.image &&
            typeof section.image === "string" &&
            section.image.startsWith("/")
          ) {
            const base64 = await imageToBase64(section.image);
            if (base64) {
              section.image = base64;
              pageConverted++;
            }
          }

          // Multiple images
          if (section.images && Array.isArray(section.images)) {
            const base64Images = [];
            for (const imgPath of section.images) {
              if (typeof imgPath === "string" && imgPath.startsWith("/")) {
                const base64 = await imageToBase64(imgPath);
                if (base64) {
                  base64Images.push(base64);
                  pageConverted++;
                } else {
                  base64Images.push(imgPath); // Keep path as fallback
                }
              } else {
                base64Images.push(imgPath); // Already converted or not a path
              }
            }
            section.images = base64Images;
          }
        }
      }

      if (pageConverted > 0) {
        await db.query(
          `UPDATE CMSConfig SET 
            configData = :configData,
            updatedAt = sysdate()
          WHERE configKey = :configKey`,
          {
            params: {
              configKey: page.configKey,
              configData: JSON.stringify(pageData),
            },
          }
        );
        console.log(`  ✓ ${pageName}: ${pageConverted} images converted`);
        pageImageCount += pageConverted;
      }
    }

    console.log(`\n✅ Page images: ${pageImageCount} converted\n`);

    // ========================================
    // Summary
    // ========================================
    console.log("==================================================");
    console.log("🎉 Image Migration completed!\n");
    console.log("📊 Summary:");
    console.log(
      `   - Collection Images: ${totalConverted} converted, ${totalSkipped} skipped`
    );
    console.log(`   - Page Images: ${pageImageCount} converted`);
    console.log(`   - Total Images: ${totalConverted + pageImageCount}`);
  } catch (error) {
    console.error("\n❌ Image migration failed:", error);
    throw error;
  } finally {
    if (db) {
      db.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run migration
migrateImages().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
