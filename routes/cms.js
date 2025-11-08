const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// Cache directory for processed configs
const CACHE_DIR = path.join(__dirname, "../cache/configs");

/**
 * Read JSON file from cache directory
 */
function readConfigFile(filename) {
  const filePath = path.join(CACHE_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Build complete config for a specific page from DB
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
        section.collections.forEach(col => collections.add(col));
      }
    }
  }
  
  // Fetch all collections for this page
  const photoCollections = {};
  
  for (const collectionName of collections) {
    const collectionResult = await db.query(
      `SELECT photos, translations FROM CMSPhotoCollection WHERE collectionName = :name`,
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
 * Serve pre-generated global config
 */
router.get("/global", (req, res) => {
  try {
    // Read from file (NO CACHING)
    const config = readConfigFile("global.json");
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: "Global config not found. Run: node database/generate-cached-configs.js",
      });
    }
    
    res.json({
      success: true,
      data: config,
      cached: false,
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
 * Serve pre-generated page config
 */
router.get("/page/:pageName", (req, res) => {
  const { pageName } = req.params;
  
  try {
    // Read from file (NO CACHING)
    const config = readConfigFile(`${pageName}.json`);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Page config not found: ${pageName}`,
      });
    }
    
    res.json({
      success: true,
      data: config,
      cached: false,
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
 * Trigger config regeneration from database
 */
router.post("/regenerate", (req, res) => {
  try {
    const { exec } = require("child_process");
    const scriptPath = path.join(__dirname, "../database/generate-cached-configs.js");
    
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error("Error regenerating configs:", error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
      
      res.json({
        success: true,
        message: "Configs regenerated from database",
        output: stdout,
      });
    });
  } catch (error) {
    console.error("Error triggering regeneration:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/cms/cache/clear
 * Clear the CMS cache (currently disabled)
 */
router.post("/cache/clear", (req, res) => {
  try {
    res.json({
      success: true,
      message: "No cache to clear - caching is disabled",
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
 * Health check endpoint
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "CMS API",
    status: "operational",
    caching: "disabled",
  });
});

module.exports = router;
