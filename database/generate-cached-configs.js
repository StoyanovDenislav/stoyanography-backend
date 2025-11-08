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

// Output directory for cached configs
const CACHE_DIR = path.join(__dirname, "../cache/configs");

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Build complete config for a specific page
 */
async function buildPageConfig(db, pageName) {
  console.log(`  📄 Building config for: ${pageName}`);
  
  // Get page config
  const pageResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = :key`,
    { params: { key: `page_${pageName}` } }
  );
  
  if (pageResult.length === 0) {
    console.log(`  ⚠️  Page not found: ${pageName}`);
    return null;
  }
  
  const pageConfig = JSON.parse(pageResult[0].configData);
  
  // Get photo collections referenced in this page
  const collections = new Set();
  
  if (pageConfig.sections) {
    for (const section of pageConfig.sections) {
      if (section.type === "portfolio" && section.collections) {
        section.collections.forEach(col => collections.add(col));
      }
    }
  }
  
  // Fetch all collections for this page
  const photoCollections = {};
  
  for (const collectionName of collections) {
    const collectionResult = await db.query(
      `SELECT photos, translations, metadata FROM CMSPhotoCollection WHERE collectionName = :name`,
      { params: { name: collectionName } }
    );
    
    if (collectionResult.length > 0) {
      const collection = collectionResult[0];
      photoCollections[collectionName] = {
        photos: collection.photos,
        translations: JSON.parse(collection.translations),
      };
    }
  }
  
  return {
    page: pageConfig,
    photoCollections,
  };
}

/**
 * Build the global config (banners, singular images, maintenance mode)
 */
async function buildGlobalConfig(db) {
  console.log(`  🌐 Building global config`);
  
  const config = {};
  
  // Get maintenance mode
  const maintenanceResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'maintainance_mode'`
  );
  if (maintenanceResult.length > 0) {
    const data = JSON.parse(maintenanceResult[0].configData);
    config.maintainance_mode = data.enabled || false;
  }
  
  // Get banners
  const bannersResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'banners'`
  );
  if (bannersResult.length > 0) {
    config.banners = JSON.parse(bannersResult[0].configData);
  }
  
  // Get singular images
  const singularResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'SingularImages'`
  );
  if (singularResult.length > 0) {
    config.SingularImages = JSON.parse(singularResult[0].configData);
  }
  
  return config;
}

/**
 * Build the services overview config
 */
async function buildServicesOverviewConfig(db) {
  console.log(`  📋 Building services overview config`);
  
  const result = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'page_servicesOverview'`
  );
  
  if (result.length > 0) {
    return JSON.parse(result[0].configData);
  }
  
  return null;
}

/**
 * Build the gallery config with all collections
 */
async function buildGalleryConfig(db) {
  console.log(`  🖼️  Building gallery config`);
  
  // Get page config
  const pageResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'page_gallery'`
  );
  
  if (pageResult.length === 0) {
    return null;
  }
  
  const pageConfig = JSON.parse(pageResult[0].configData);
  
  // Get ALL photo collections for gallery
  const collectionsResult = await db.query(
    `SELECT collectionName, photos, translations FROM CMSPhotoCollection`
  );
  
  const photoCollections = {};
  
  for (const collection of collectionsResult) {
    photoCollections[collection.collectionName] = {
      photos: collection.photos,
      translations: JSON.parse(collection.translations),
    };
  }
  
  return {
    page: pageConfig,
    photoCollections,
  };
}

/**
 * Main generation function
 */
async function generateCachedConfigs() {
  let db;
  
  try {
    console.log("🚀 Starting Cached Config Generation...\n");
    
    ensureCacheDir();
    
    // Connect to database
    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected successfully\n");
    
    // Generate global config
    console.log("🌐 Generating Global Config...\n");
    const globalConfig = await buildGlobalConfig(db);
    fs.writeFileSync(
      path.join(CACHE_DIR, "global.json"),
      JSON.stringify(globalConfig, null, 2)
    );
    console.log("  ✓ Saved: cache/configs/global.json\n");
    
    // Generate services overview
    console.log("📋 Generating Services Overview Config...\n");
    const servicesOverview = await buildServicesOverviewConfig(db);
    if (servicesOverview) {
      fs.writeFileSync(
        path.join(CACHE_DIR, "servicesOverview.json"),
        JSON.stringify(servicesOverview, null, 2)
      );
      console.log("  ✓ Saved: cache/configs/servicesOverview.json\n");
    }
    
    // Generate service page configs (portrait, prom, business)
    console.log("📄 Generating Service Page Configs...\n");
    const servicePages = ["portrait", "prom", "business"];
    
    for (const pageName of servicePages) {
      const pageConfig = await buildPageConfig(db, pageName);
      if (pageConfig) {
        fs.writeFileSync(
          path.join(CACHE_DIR, `${pageName}.json`),
          JSON.stringify(pageConfig, null, 2)
        );
        console.log(`  ✓ Saved: cache/configs/${pageName}.json`);
      }
    }
    console.log();
    
    // Generate gallery config
    console.log("🖼️  Generating Gallery Config...\n");
    const galleryConfig = await buildGalleryConfig(db);
    if (galleryConfig) {
      fs.writeFileSync(
        path.join(CACHE_DIR, "gallery.json"),
        JSON.stringify(galleryConfig, null, 2)
      );
      console.log("  ✓ Saved: cache/configs/gallery.json\n");
    }
    
    // Generate about/contacts pages with same structure as other pages
    console.log("📄 Generating Other Page Configs...\n");
    const otherPages = ["aboutme", "contacts"];
    
    for (const pageName of otherPages) {
      const pageConfig = await buildPageConfig(db, pageName);
      if (pageConfig) {
        fs.writeFileSync(
          path.join(CACHE_DIR, `${pageName}.json`),
          JSON.stringify(pageConfig, null, 2)
        );
        console.log(`  ✓ Saved: cache/configs/${pageName}.json`);
      }
    }
    console.log();
    
    // Summary
    console.log("==================================================");
    console.log("🎉 Cache Generation Completed!\n");
    console.log("📊 Generated Files:");
    console.log("   - global.json (maintenance, banners, singular images)");
    console.log("   - servicesOverview.json");
    console.log("   - portrait.json (page + collections)");
    console.log("   - prom.json (page + collections)");
    console.log("   - business.json (page + collections)");
    console.log("   - gallery.json (page + all collections)");
    console.log("   - aboutme.json");
    console.log("   - contacts.json");
    console.log("\n💡 These files will be served by the backend API");
    
  } catch (error) {
    console.error("\n❌ Generation failed:", error);
    throw error;
  } finally {
    if (db) {
      db.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run generation
generateCachedConfigs().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
