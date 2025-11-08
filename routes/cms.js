const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");

// Cache directory for authenticated links
const CACHE_DIR = path.join(__dirname, "../cache/configs");

// In-memory cache
const configCache = new Map();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Get file modification time
 */
function getFileModTime(filename) {
  const filePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  return stats.mtime.getTime();
}

/**
 * Generate ETag for a file
 */
function generateETag(filename) {
  const filePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Check if cache is stale (older than 7 days)
 */
function isCacheStale(filename) {
  const modTime = getFileModTime(filename);
  if (!modTime) return true;

  const age = Date.now() - modTime;
  return age > CACHE_DURATION;
}

/**
 * Regenerate authenticated links
 */
function regenerateAuthenticatedLinks() {
  return new Promise((resolve, reject) => {
    console.log("🔄 Regenerating authenticated links...");
    const scriptPath = path.join(
      __dirname,
      "../database/generate-cached-configs-with-auth.js"
    );

    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Regeneration failed:", error);
        reject(error);
        return;
      }
      console.log("✅ Regeneration complete");
      // Clear memory cache after regeneration
      configCache.clear();
      resolve(stdout);
    });
  });
}

/**
 * Read config from cache (memory or file)
 */
function readConfigFile(filename) {
  // Check memory cache first
  const cached = configCache.get(filename);
  if (cached && cached.timestamp > Date.now() - CACHE_DURATION) {
    return cached.data;
  }

  // Read from file
  const filePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);

  // Store in memory cache
  configCache.set(filename, {
    data,
    timestamp: Date.now(),
  });

  return data;
}

/**
 * Build complete config for a specific page from DB
 * Fetches collections ONE AT A TIME to avoid buffer issues
 */
async function buildPageConfigFromDB(db, pageName) {
  // Get page config
  const pageResult = await db.query(
    `SELECT configData FROM CMSConfig WHERE configKey = :key`,
    { params: { key: `page_${pageName}` } }
  );

  if (pageResult.length === 0) {
    return null;
  }

  const pageConfig = JSON.parse(pageResult[0].configData);

  // Get photo collections referenced in this page
  const collections = new Set();

  if (pageConfig.sections) {
    for (const section of pageConfig.sections) {
      if (section.type === "portfolio" && section.collections) {
        section.collections.forEach((col) => collections.add(col));
      }
    }
  }

  // Fetch collections ONE AT A TIME to avoid buffer overflow
  const photoCollections = {};

  for (const collectionName of collections) {
    try {
      const collectionResult = await db.query(
        `SELECT photos, translations FROM CMSPhotoCollection WHERE collectionName = :name`,
        { params: { name: collectionName } }
      );

      if (collectionResult.length > 0) {
        const collection = collectionResult[0];
        const photos = collection.photos || [];

        // Only include collections that have been migrated (have base64 data)
        if (photos.length > 0 && photos[0].startsWith("data:image")) {
          photoCollections[collectionName] = {
            photos: photos,
            translations: JSON.parse(collection.translations),
          };
        }
      }
    } catch (error) {
      console.error(
        `Error fetching collection ${collectionName}:`,
        error.message
      );
      // Skip this collection and continue
    }
  }

  return {
    page: pageConfig,
    photoCollections,
  };
}

/**
 * Build the global config from DB
 */
async function buildGlobalConfigFromDB(db) {
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
 * Build the gallery config with all collections from DB
 */
async function buildGalleryConfigFromDB(db) {
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
 * GET /api/cms/global
 * Serve global config with caching and cache validation
 */
router.get("/global", async (req, res) => {
  try {
    const filename = "global.json";

    // Check if cache is stale
    if (isCacheStale(filename)) {
      console.log("⚠️  Cache is stale, regenerating...");
      await regenerateAuthenticatedLinks();
    }

    // Generate ETag
    const etag = generateETag(filename);

    // Check If-None-Match header
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).send(); // Not Modified
    }

    // Read from cache (memory or file)
    const config = readConfigFile(filename);

    if (!config) {
      return res.status(404).json({
        success: false,
        error:
          "Global config not found. Run: node database/generate-cached-configs-with-auth.js",
      });
    }

    res.set({
      ETag: etag,
      "Cache-Control": "public, max-age=3600", // 1 hour
    });

    res.json({
      success: true,
      data: config,
      cached: true,
    });
  } catch (error) {
    console.error("Error fetching global config:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/cms/page/:pageName
 * Serve page config with caching and cache validation
 */
router.get("/page/:pageName", async (req, res) => {
  const { pageName } = req.params;

  try {
    const filename = `${pageName}.json`;

    // Check if cache is stale
    if (isCacheStale(filename)) {
      console.log(`⚠️  Cache for ${pageName} is stale, regenerating...`);
      await regenerateAuthenticatedLinks();
    }

    // Generate ETag
    const etag = generateETag(filename);

    // Check If-None-Match header
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).send(); // Not Modified
    }

    // Read from cache (memory or file)
    const config = readConfigFile(filename);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Page config not found: ${pageName}. Run: node database/generate-cached-configs-with-auth.js`,
      });
    }

    res.set({
      ETag: etag,
      "Cache-Control": "public, max-age=3600", // 1 hour
    });

    res.json({
      success: true,
      data: config,
      cached: true,
    });
  } catch (error) {
    console.error(`Error fetching page ${pageName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/cms/regenerate
 * Manually trigger config regeneration
 */
router.post("/regenerate", async (req, res) => {
  try {
    await regenerateAuthenticatedLinks();

    res.json({
      success: true,
      message: "Authenticated links regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating configs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/cms/cache/clear
 * Clear the in-memory cache
 */
router.post("/cache/clear", (req, res) => {
  try {
    const size = configCache.size;
    configCache.clear();

    res.json({
      success: true,
      message: `Cleared ${size} cached entries`,
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear cache",
      message: error.message,
    });
  }
});

/**
 * GET /api/cms/health
 * Health check endpoint with cache status
 */
router.get("/health", (req, res) => {
  const cacheStats = {
    memoryEntries: configCache.size,
    cacheAge: {},
  };

  // Check age of each config file
  const files = [
    "global.json",
    "servicesOverview.json",
    "portrait.json",
    "prom.json",
    "business.json",
    "gallery.json",
  ];
  files.forEach((file) => {
    const modTime = getFileModTime(file);
    if (modTime) {
      const ageMs = Date.now() - modTime;
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      cacheStats.cacheAge[file] = {
        days: ageDays,
        stale: ageMs > CACHE_DURATION,
      };
    }
  });

  res.json({
    success: true,
    service: "CMS API",
    status: "operational",
    caching: "enabled",
    cacheStats,
  });
});

module.exports = router;
