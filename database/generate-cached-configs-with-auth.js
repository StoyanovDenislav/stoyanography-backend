const ODatabase = require("orientjs").ODatabase;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { generateLink } = require("../legacy/utils/hashUtil");
require("dotenv").config();

const dbConfig = {
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
};

const CACHE_DIR = path.join(__dirname, "../cache/configs");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Generate authenticated link - hashUtil does all the work!
 */
function getAuthenticatedLink(imagePath) {
  const secret = process.env.SECRET;
  const secret_ref = process.env.SECRET_REF;

  // 1 week expiry
  const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const hashRef = secret_ref + expiry;
  const ref = crypto.createHash("md5").update(hashRef, "utf8").digest("hex");

  // hashUtil.generateLink does everything!
  return generateLink({ secret, path: imagePath, expiry, ref });
}

async function buildPageConfig(db, pageName) {
  console.log(`  📄 Building config for: ${pageName}`);

  const pageResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = :key`,
    { params: { key: `page_${pageName}` } }
  );

  if (pageResult.length === 0) {
    return null;
  }

  const pageConfig = JSON.parse(pageResult[0].configData);
  const collections = new Set();

  if (pageConfig.sections) {
    for (const section of pageConfig.sections) {
      if (section.type === "portfolio" && section.collections) {
        section.collections.forEach((col) => collections.add(col));
      }
    }
  }

  // Special case: home page needs portfolio collection for hero banner
  if (pageName === "home") {
    collections.add("portfolio");
  }

  const photoCollections = {};

  for (const collectionName of collections) {
    const collectionResult = await db.query(
      `SELECT translations, metadata FROM CMSPhotoCollection WHERE collectionName = :name`,
      { params: { name: collectionName } }
    );

    if (collectionResult.length > 0) {
      const collection = collectionResult[0];
      const metadata = collection.metadata
        ? JSON.parse(collection.metadata)
        : {};
      const originalPaths = metadata.originalPaths || [];

      // Just pass each path through hashUtil!
      const authenticatedPhotos = originalPaths.map((imagePath) =>
        getAuthenticatedLink(imagePath)
      );

      if (authenticatedPhotos.length > 0) {
        photoCollections[collectionName] = {
          photos: authenticatedPhotos,
          translations: JSON.parse(collection.translations),
        };
      }
    }
  }

  return {
    page: pageConfig,
    photoCollections,
  };
}

async function buildGlobalConfig(db) {
  console.log(`  🌐 Building global config`);

  const config = {};

  const maintenanceResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'maintainance_mode'`
  );
  if (maintenanceResult.length > 0) {
    const data = JSON.parse(maintenanceResult[0].configData);
    config.maintainance_mode = data.enabled || false;
  }

  const bannersResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'banners'`
  );
  if (bannersResult.length > 0) {
    config.banners = JSON.parse(bannersResult[0].configData);
  }

  const singularResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'SingularImages'`
  );
  if (singularResult.length > 0) {
    const singularImages = JSON.parse(singularResult[0].configData);
    const authenticatedSingularImages = {};

    // Just pass each path through hashUtil!
    for (const [key, imagePath] of Object.entries(singularImages)) {
      authenticatedSingularImages[key] = getAuthenticatedLink(imagePath);
    }

    config.SingularImages = authenticatedSingularImages;
  }

  return config;
}

async function buildServicesOverviewConfig(db) {
  console.log(`  📋 Building services overview config`);

  const result = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'page_servicesOverview'`
  );

  if (result.length > 0) {
    const config = JSON.parse(result[0].configData);

    // Just pass each path through hashUtil!
    if (config.serviceItems) {
      config.serviceItems = config.serviceItems.map((item) => ({
        ...item,
        imageUrl: item.imageUrl
          ? getAuthenticatedLink(item.imageUrl)
          : item.imageUrl,
      }));
    }

    return config;
  }

  return null;
}

async function buildGalleryConfig(db) {
  console.log(`  🖼️  Building gallery config`);

  const pageResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = 'page_gallery'`
  );

  if (pageResult.length === 0) {
    return null;
  }

  const pageConfig = JSON.parse(pageResult[0].configData);
  const collectionsResult = await db.query(
    `SELECT collectionName, translations, metadata FROM CMSPhotoCollection`
  );

  const photoCollections = {};

  for (const collection of collectionsResult) {
    const metadata = collection.metadata ? JSON.parse(collection.metadata) : {};
    const originalPaths = metadata.originalPaths || [];

    // Just pass each path through hashUtil!
    const authenticatedPhotos = originalPaths.map((imagePath) =>
      getAuthenticatedLink(imagePath)
    );

    if (authenticatedPhotos.length > 0) {
      photoCollections[collection.collectionName] = {
        photos: authenticatedPhotos,
        translations: JSON.parse(collection.translations),
      };
    }
  }

  return {
    page: pageConfig,
    photoCollections,
  };
}

async function generateConfigs() {
  let db;

  try {
    console.log("🚀 Generating configs with authenticated links...\n");

    ensureCacheDir();

    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected\n");

    const globalConfig = await buildGlobalConfig(db);
    fs.writeFileSync(
      path.join(CACHE_DIR, "global.json"),
      JSON.stringify(globalConfig, null, 2)
    );
    console.log("  ✓ global.json\n");

    const servicesOverview = await buildServicesOverviewConfig(db);
    if (servicesOverview) {
      fs.writeFileSync(
        path.join(CACHE_DIR, "servicesOverview.json"),
        JSON.stringify(servicesOverview, null, 2)
      );
      console.log("  ✓ servicesOverview.json\n");
    }

    const servicePages = ["portrait", "prom", "business"];
    for (const pageName of servicePages) {
      const pageConfig = await buildPageConfig(db, pageName);
      if (pageConfig) {
        fs.writeFileSync(
          path.join(CACHE_DIR, `${pageName}.json`),
          JSON.stringify(pageConfig, null, 2)
        );
        console.log(`  ✓ ${pageName}.json`);
      }
    }

    const galleryConfig = await buildGalleryConfig(db);
    if (galleryConfig) {
      fs.writeFileSync(
        path.join(CACHE_DIR, "gallery.json"),
        JSON.stringify(galleryConfig, null, 2)
      );
      console.log("  ✓ gallery.json\n");
    }

    const otherPages = ["aboutme", "contacts", "home"];
    for (const pageName of otherPages) {
      const pageConfig = await buildPageConfig(db, pageName);
      if (pageConfig) {
        fs.writeFileSync(
          path.join(CACHE_DIR, `${pageName}.json`),
          JSON.stringify(pageConfig, null, 2)
        );
        console.log(`  ✓ ${pageName}.json`);
      }
    }

    console.log("\n🎉 Done! Links valid for 7 days");
  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  } finally {
    if (db) {
      db.close();
    }
  }
}

generateConfigs().catch(console.error);
