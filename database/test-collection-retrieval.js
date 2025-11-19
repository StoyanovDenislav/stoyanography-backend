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

async function testCollectionRetrieval() {
  let db;

  try {
    console.log("🚀 Testing Collection Retrieval...\n");

    // Connect to database
    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected successfully\n");

    // Get all collections
    const collections = await db.query(
      `SELECT collectionName, metadata FROM CMSPhotoCollection`
    );

    console.log(`📚 Found ${collections.length} collections:\n`);

    for (const collection of collections) {
      const metadata = JSON.parse(collection.metadata);
      console.log(`  - ${collection.collectionName}`);
      console.log(`    Total images: ${metadata.totalImages || 0}`);
      console.log(`    Migrated: ${metadata.migratedImages ? "✅" : "❌"}`);
      console.log();
    }

    // Test retrieving a specific collection with photos
    if (collections.length > 0) {
      const testCollectionName = collections[0].collectionName;
      console.log(`\n🔍 Retrieving collection: ${testCollectionName}\n`);

      const result = await db.query(
        `SELECT collectionName, photos, translations, metadata 
         FROM CMSPhotoCollection 
         WHERE collectionName = :name`,
        { params: { name: testCollectionName } }
      );

      if (result.length > 0) {
        const collection = result[0];
        const metadata = JSON.parse(collection.metadata);
        const translations = JSON.parse(collection.translations);

        console.log(`📊 Collection Details:`);
        console.log(`   Name: ${collection.collectionName}`);
        console.log(`   Total Images: ${collection.photos?.length || 0}`);
        console.log(`   Translations:`, translations);
        console.log(`   Metadata:`, metadata);

        if (collection.photos && collection.photos.length > 0) {
          console.log(`\n🖼️  First Image Preview:`);
          const firstImage = collection.photos[0];
          if (firstImage.startsWith("data:image")) {
            console.log(`   Type: Base64 encoded`);
            console.log(`   Size: ${(firstImage.length / 1024).toFixed(2)} KB`);
            console.log(`   Preview: ${firstImage.substring(0, 100)}...`);
          } else {
            console.log(`   Type: Path/URL`);
            console.log(`   Value: ${firstImage}`);
          }
        }

        console.log(`\n✅ Collection retrieved successfully!`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    if (db) {
      db.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

testCollectionRetrieval();
