const express = require("express");
const cacheManager = require("../utils/CacheManager");

const router = express.Router();

// Middleware to check if admin request (you might want to add proper auth here)
const isAdmin = (req, res, next) => {
  // For now, check if request is from development environment
  // In production, add proper authentication
  const isDev = process.env.NODE_ENV === "development";
  const isLocalhost =
    req.hostname === "localhost" || req.hostname === "127.0.0.1";

  if (isDev || isLocalhost) {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
};

// Get cache statistics
router.get("/cache/stats", isAdmin, (req, res) => {
  try {
    const stats = cacheManager.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear all cache
router.delete("/cache/clear", isAdmin, async (req, res) => {
  try {
    await cacheManager.clearCache();
    res.json({
      success: true,
      message: "Cache cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Warm cache for specific config
router.post("/cache/warm", isAdmin, async (req, res) => {
  try {
    const { configPath } = req.body;

    if (!configPath) {
      return res.status(400).json({
        success: false,
        error: "configPath is required",
      });
    }

    // Start warming in background
    cacheManager
      .warmCacheForConfig(configPath)
      .then(() => {
        console.log(`✅ Cache warming completed for: ${configPath}`);
      })
      .catch((error) => {
        console.error(`❌ Cache warming failed for ${configPath}:`, error);
      });

    res.json({
      success: true,
      message: `Cache warming started for: ${configPath}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Invalidate specific config cache
router.delete("/cache/invalidate", isAdmin, async (req, res) => {
  try {
    const { configPath } = req.body;

    if (!configPath) {
      return res.status(400).json({
        success: false,
        error: "configPath is required",
      });
    }

    await cacheManager.invalidateConfig(configPath);

    res.json({
      success: true,
      message: `Cache invalidated for: ${configPath}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint that includes cache status
router.get("/health", (req, res) => {
  try {
    const stats = cacheManager.getStats();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        enabled: true,
        ...stats,
      },
      server: {
        nodeEnv: process.env.NODE_ENV,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

module.exports = router;
