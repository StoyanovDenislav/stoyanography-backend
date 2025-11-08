#!/usr/bin/env node

const ODatabase = require("orientjs").ODatabase;
require("dotenv").config();

const dbConfig = {
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
};

async function setupCMSSchema() {
  const db = new ODatabase(dbConfig);

  try {
    console.log("📦 Connecting to OrientDB...");
    await db.open();
    console.log("✅ Connected successfully\n");

    // Helper function to safely create class
    const createClass = async (className, extendsType = "V") => {
      try {
        await db.query(`CREATE CLASS ${className} EXTENDS ${extendsType}`);
        console.log(`  ✓ Created ${className} class`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`  ⏭️  ${className} already exists`);
        } else {
          throw error;
        }
      }
    };

    // Helper function to safely create property
    const createProperty = async (className, propertyName, propertyType) => {
      try {
        await db.query(
          `CREATE PROPERTY ${className}.${propertyName} ${propertyType}`
        );
      } catch (error) {
        if (!error.message.includes("already exists")) {
          console.log(`  ⚠️  Warning: ${className}.${propertyName}`);
        }
      }
    };

    console.log("🔨 Creating CMS classes...\n");

    // CMSConfig class - stores all configuration as key-value pairs
    // Each config is stored as a JSON string for flexibility
    await createClass("CMSConfig");
    await createProperty("CMSConfig", "configKey", "STRING");
    await createProperty("CMSConfig", "configData", "STRING"); // JSON stringified data
    await createProperty("CMSConfig", "version", "INTEGER");
    await createProperty("CMSConfig", "createdAt", "DATETIME");
    await createProperty("CMSConfig", "updatedAt", "DATETIME");

    // CMSPhotoCollection class - stores photo collections with image paths
    await createClass("CMSPhotoCollection");
    await createProperty("CMSPhotoCollection", "collectionName", "STRING");
    await createProperty("CMSPhotoCollection", "photos", "EMBEDDEDLIST STRING"); // Array of image paths (not base64)
    await createProperty("CMSPhotoCollection", "translations", "STRING"); // JSON stringified translations
    await createProperty("CMSPhotoCollection", "metadata", "STRING"); // JSON stringified metadata
    await createProperty("CMSPhotoCollection", "createdAt", "DATETIME");
    await createProperty("CMSPhotoCollection", "updatedAt", "DATETIME");

    console.log("\n✅ CMS Classes created\n");

    // Create indexes for performance
    console.log("📊 Creating indexes...");

    const createIndex = async (className, propertyName, indexType = "NOTUNIQUE") => {
      try {
        const indexName = `${className}_${propertyName}_idx`;
        await db.query(
          `CREATE INDEX ${indexName} ON ${className} (${propertyName}) ${indexType}`
        );
        console.log(`  ✓ Created index on ${className}.${propertyName}`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`  ⏭️  Index on ${className}.${propertyName} already exists`);
        } else {
          console.log(`  ⚠️  Warning creating index: ${error.message}`);
        }
      }
    };

    await createIndex("CMSConfig", "configKey", "UNIQUE");
    await createIndex("CMSPhotoCollection", "collectionName", "UNIQUE");

    console.log("\n✅ Indexes created\n");

    console.log("🎉 CMS Schema setup completed successfully!\n");
    console.log("📝 Summary:");
    console.log("   - CMSConfig: Stores all config data as key-value pairs");
    console.log("   - CMSPhotoCollection: Stores photo collections with base64 images");
    console.log("\n💡 Next steps:");
    console.log("   1. Run the migration script to populate the database");
    console.log("   2. Update frontend to fetch from API instead of JSON files");

  } catch (error) {
    console.error("❌ Error setting up CMS schema:", error);
    process.exit(1);
  } finally {
    await db.close();
    console.log("\n🔌 Database connection closed");
  }
}

// Run the setup
setupCMSSchema();
