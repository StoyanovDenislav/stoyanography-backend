#!/usr/bin/env node

const ODatabase = require("orientjs").ODatabase;
const fs = require("fs");
const path = require("path");
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

// Configuration paths
const CONFIG_CMS_PATH = path.join(
  __dirname,
  "../../stoyanography-nextjs-tsx-aceternity/app/configCMS.json"
);

const IMAGE_ORIGIN = "https://cdn.stoyanography.com";

/**
 * Download image from URL and convert to base64
 */
async function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://stoyanography.com'
      }
    };
    
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout
    
    client.get(url, options, (response) => {
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
    }).on("error", (err) => {
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
    // Construct full URL
    const imageUrl = `${IMAGE_ORIGIN}${imagePath}`;
    
    const base64 = await downloadImageAsBase64(imageUrl);
    return base64;
  } catch (error) {
    // Don't log every error to keep output clean
    if (!error.message.includes('HTTP 403')) {
      console.warn(`  ⚠️  Skipping ${imagePath}: ${error.message}`);
    }
    return null;
  }
}/**
 * Process a photo collection - convert all images to base64
 */
async function processPhotoCollection(
  collectionName,
  collectionData,
  progressCallback
) {
  console.log(`  📸 Processing collection: ${collectionName} (${collectionData.photos?.length || 0} images)`);

  const photos = collectionData.photos || [];
  const base64Photos = [];
  let errorCount = 0;

  for (let i = 0; i < photos.length; i++) {
    const photoPath = photos[i];

    if (progressCallback) {
      progressCallback(collectionName, i + 1, photos.length);
    }

    const base64 = await imageToBase64(photoPath);
    if (base64) {
      base64Photos.push(base64);
    } else {
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.log(`  ⚠️  Skipped ${errorCount} images due to errors`);
  }
  console.log(`  ✓ Successfully converted ${base64Photos.length}/${photos.length} images\n`);

  return {
    collectionName,
    photos: base64Photos,
    translations: JSON.stringify(collectionData.translations || []),
    metadata: JSON.stringify({
      totalImages: base64Photos.length,
      originalPaths: photos,
      skippedCount: errorCount,
    }),
  };
}

/**
 * Process a page config - convert section images to base64
 */
async function processPageConfig(pageName, pageData) {
  let convertedCount = 0;
  let skippedCount = 0;
  
  if (pageData.sections && Array.isArray(pageData.sections)) {
    for (const section of pageData.sections) {
      if (section.image) {
        const base64 = await imageToBase64(section.image);
        if (base64) {
          section.image = base64;
          convertedCount++;
        } else {
          skippedCount++;
        }
      }
      
      if (section.images && Array.isArray(section.images)) {
        const base64Images = [];
        for (const imgPath of section.images) {
          const base64 = await imageToBase64(imgPath);
          if (base64) {
            base64Images.push(base64);
            convertedCount++;
          } else {
            skippedCount++;
          }
        }
        section.images = base64Images;
      }
    }
  }
  
  if (convertedCount > 0 || skippedCount > 0) {
    console.log(`  📷 Images: ${convertedCount} converted, ${skippedCount} skipped`);
  }
  
  return pageData;
}/**
 * Main migration function
 */
async function migrateCMSToDB() {
  const db = new ODatabase(dbConfig);

  try {
    console.log("🚀 Starting CMS migration to database...\n");

    // Read configCMS.json
    console.log("📖 Reading configCMS.json...");
    if (!fs.existsSync(CONFIG_CMS_PATH)) {
      throw new Error(`Config file not found: ${CONFIG_CMS_PATH}`);
    }

    const configCMS = JSON.parse(fs.readFileSync(CONFIG_CMS_PATH, "utf8"));
    console.log("✅ Config file loaded\n");

    // Connect to database
    console.log("📦 Connecting to OrientDB...");
    await db.open();
    console.log("✅ Connected successfully\n");

    // ========================================
    // 1. Migrate Photo Collections
    // ========================================
    console.log("📸 Migrating Photo Collections...\n");

    const collections = configCMS.PhotoCollections || {};
    const collectionNames = Object.keys(collections);

    for (let i = 0; i < collectionNames.length; i++) {
      const collectionName = collectionNames[i];
      const collectionData = collections[collectionName];

      console.log(`[${i + 1}/${collectionNames.length}] ${collectionName}`);

      const processedCollection = await processPhotoCollection(
        collectionName,
        collectionData,
        (name, current, total) => {
          process.stdout.write(`\r  Converting images: ${current}/${total}`);
        }
      );

      console.log(""); // New line after progress

      // Delete existing collection if it exists
      await db.query(
        `DELETE VERTEX CMSPhotoCollection WHERE collectionName = :collectionName`,
        { params: { collectionName } }
      );

      // Insert new collection
      await db.query(
        `INSERT INTO CMSPhotoCollection SET 
          collectionName = :collectionName,
          photos = :photos,
          translations = :translations,
          metadata = :metadata,
          createdAt = sysdate(),
          updatedAt = sysdate()`,
        {
          params: {
            collectionName: processedCollection.collectionName,
            photos: processedCollection.photos,
            translations: processedCollection.translations,
            metadata: processedCollection.metadata,
          },
        }
      );

      console.log(`  ✓ Saved to database\n`);
    }

    console.log(`✅ Migrated ${collectionNames.length} photo collections\n`);

    // ========================================
    // 2. Migrate Singular Images
    // ========================================
    console.log("🖼️  Migrating Singular Images...\n");
    
    const singularImages = configCMS.SingularImages || {};
    const processedSingularImages = {};
    let singularConverted = 0;
    let singularSkipped = 0;
    
    for (const [key, imagePath] of Object.entries(singularImages)) {
      const base64 = await imageToBase64(imagePath);
      if (base64) {
        processedSingularImages[key] = base64;
        singularConverted++;
      } else {
        processedSingularImages[key] = imagePath; // Fallback to path
        singularSkipped++;
      }
    }
    
    console.log(`  ✓ Converted: ${singularConverted}, Skipped: ${singularSkipped}`);    await db.query(
      `DELETE VERTEX CMSConfig WHERE configKey = 'SingularImages'`
    );
    await db.query(
      `INSERT INTO CMSConfig SET 
        configKey = 'SingularImages',
        configData = :configData,
        version = 1,
        createdAt = sysdate(),
        updatedAt = sysdate()`,
      {
        params: {
          configData: JSON.stringify(processedSingularImages),
        },
      }
    );

    console.log(
      `✅ Migrated ${Object.keys(singularImages).length} singular images\n`
    );

    // ========================================
    // 3. Migrate Banners
    // ========================================
    console.log("🎌 Migrating Banners...\n");

    const banners = configCMS.banners || [];
    await db.query(`DELETE VERTEX CMSConfig WHERE configKey = 'banners'`);
    await db.query(
      `INSERT INTO CMSConfig SET 
        configKey = 'banners',
        configData = :configData,
        version = 1,
        createdAt = sysdate(),
        updatedAt = sysdate()`,
      {
        params: {
          configData: JSON.stringify(banners),
        },
      }
    );

    console.log(`✅ Migrated ${banners.length} banners\n`);

    // ========================================
    // 4. Migrate Page Configurations
    // ========================================
    console.log("📄 Migrating Page Configurations...\n");

    const pages = configCMS.Pages || {};
    let pageCount = 0;

    for (const [pageName, pageData] of Object.entries(pages)) {
      // Check if this is the "services" page which has nested sub-pages
      if (pageName === "services" && typeof pageData === "object") {
        // Flatten services sub-pages (portrait, prom, business)
        for (const [serviceName, serviceData] of Object.entries(pageData)) {
          console.log(`  Processing page: ${serviceName} (from services)`);

          const processedPageData = await processPageConfig(
            serviceName,
            serviceData
          );

          await db.query(
            `DELETE VERTEX CMSConfig WHERE configKey = :configKey`,
            {
              params: { configKey: `page_${serviceName}` },
            }
          );

          await db.query(
            `INSERT INTO CMSConfig SET 
          configKey = :configKey,
          configData = :configData,
          version = 1,
          createdAt = sysdate(),
          updatedAt = sysdate()`,
            {
              params: {
                configKey: `page_${serviceName}`,
                configData: JSON.stringify(processedPageData),
              },
            }
          );

          console.log(`  ✓ Saved page config: ${serviceName}\n`);
          pageCount++;
        }
      } else {
        // Regular page (not nested)
        console.log(`  Processing page: ${pageName}`);

        const processedPageData = await processPageConfig(pageName, pageData);

        await db.query(`DELETE VERTEX CMSConfig WHERE configKey = :configKey`, {
          params: { configKey: `page_${pageName}` },
        });

        await db.query(
          `INSERT INTO CMSConfig SET 
          configKey = :configKey,
          configData = :configData,
          version = 1,
          createdAt = sysdate(),
          updatedAt = sysdate()`,
          {
            params: {
              configKey: `page_${pageName}`,
              configData: JSON.stringify(processedPageData),
            },
          }
        );

        console.log(`  ✓ Saved page config: ${pageName}\n`);
        pageCount++;
      }
    }

    console.log(`✅ Migrated ${pageCount} page configurations\n`);

    // ========================================
    // 5. Migrate Maintenance Mode
    // ========================================
    console.log("🔧 Migrating Maintenance Mode...\n");

    await db.query(
      `DELETE VERTEX CMSConfig WHERE configKey = 'maintainance_mode'`
    );
    await db.query(
      `INSERT INTO CMSConfig SET 
        configKey = 'maintainance_mode',
        configData = :configData,
        version = 1,
        createdAt = sysdate(),
        updatedAt = sysdate()`,
      {
        params: {
          configData: JSON.stringify({
            enabled: configCMS.maintainance_mode || false,
          }),
        },
      }
    );

    console.log("✅ Migrated maintenance mode setting\n");

    // ========================================
    // Summary
    // ========================================
    console.log("=".repeat(50));
    console.log("🎉 Migration completed successfully!\n");
    console.log("📊 Summary:");
    console.log(`   - Photo Collections: ${collectionNames.length}`);
    console.log(`   - Singular Images: ${Object.keys(singularImages).length}`);
    console.log(`   - Banners: ${banners.length}`);
    console.log(`   - Page Configurations: ${Object.keys(pages).length}`);
    console.log(`   - Other Settings: 1 (maintenance mode)`);
    console.log("\n💡 Next steps:");
    console.log("   1. Test the API endpoints");
    console.log("   2. Update frontend to use API instead of JSON files");
    console.log("   3. Backup and archive the old JSON files");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.close();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the migration
migrateCMSToDB();
