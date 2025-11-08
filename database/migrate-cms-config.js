const ODatabase = require("orientjs").ODatabase;
const fs = require("fs");
const path = require("path");
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

/**
 * Process a photo collection - store metadata only, no image conversion
 */
async function processPhotoCollection(collectionName, collectionData) {
  console.log(
    `  📸 Processing collection: ${collectionName} (${
      collectionData.photos?.length || 0
    } images)`
  );

  return {
    collectionName,
    photos: [], // Empty array - will be populated by image migration script
    translations: JSON.stringify(collectionData.translations || []),
    metadata: JSON.stringify({
      totalImages: 0,
      originalPaths: collectionData.photos || [],
      migratedImages: false,
    }),
  };
}

/**
 * Process a page config - keep structure without converting images
 */
async function processPageConfig(pageName, pageData) {
  // Return page data as-is, images will stay as paths
  return pageData;
}

/**
 * Main migration function
 */
async function migrateConfig() {
  let db;

  try {
    console.log("🚀 Starting CMS Config Migration (Structure Only)...\n");

    // ========================================
    // 1. Read Config File
    // ========================================
    console.log("📖 Reading configCMS.json...");
    const configCMS = JSON.parse(fs.readFileSync(CONFIG_CMS_PATH, "utf-8"));
    console.log("✅ Config file loaded\n");

    // ========================================
    // 2. Connect to Database
    // ========================================
    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected successfully\n");

    // ========================================
    // 3. Migrate Photo Collections (Structure Only)
    // ========================================
    console.log("📸 Migrating Photo Collections (metadata only)...\n");

    const photoCollections = configCMS.PhotoCollections || {};
    const collectionNames = Object.keys(photoCollections);

    for (let i = 0; i < collectionNames.length; i++) {
      const collectionName = collectionNames[i];
      const collectionData = photoCollections[collectionName];

      console.log(`[${i + 1}/${collectionNames.length}] ${collectionName}`);

      const processedCollection = await processPhotoCollection(
        collectionName,
        collectionData
      );

      // Delete existing record
      await db.query(
        `DELETE VERTEX CMSPhotoCollection WHERE collectionName = :name`,
        { params: { name: collectionName } }
      );

      // Insert new record
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
    // 4. Migrate Singular Images (Paths Only)
    // ========================================
    console.log("🖼️  Migrating Singular Images (paths only)...\n");

    const singularImages = configCMS.SingularImages || {};

    await db.query(
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
          configData: JSON.stringify(singularImages),
        },
      }
    );

    console.log(
      `✅ Migrated ${Object.keys(singularImages).length} singular images\n`
    );

    // ========================================
    // 5. Migrate Banners
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
    // 6. Migrate Page Configurations
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
    // 7. Migrate Maintenance Mode
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
    console.log("==================================================");
    console.log("🎉 Config Migration completed successfully!\n");
    console.log("📊 Summary:");
    console.log(
      `   - Photo Collections: ${collectionNames.length} (metadata only)`
    );
    console.log(
      `   - Singular Images: ${Object.keys(singularImages).length} (paths only)`
    );
    console.log(`   - Banners: ${banners.length}`);
    console.log(`   - Page Configurations: ${pageCount}`);
    console.log(`   - Other Settings: 1 (maintenance mode)`);
    console.log("\n💡 Next steps:");
    console.log(
      "   1. Run 'node database/migrate-cms-images.js' to populate images"
    );
    console.log("   2. Test the API endpoints");
    console.log("   3. Update frontend to use API instead of JSON files");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    if (db) {
      db.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run migration
migrateConfig().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
