const cacheManager = require("../utils/CacheManager");

async function fetchPageHandler(req, res) {
  const { path, pageName, serviceName } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  if (!pageName || typeof pageName !== "string") {
    res.status(400).json({ error: "Page name parameter is required" });
    return;
  }

  try {
    // Use cache manager for threaded processing and caching
    const result = await cacheManager.getCachedPage(
      path,
      pageName,
      serviceName
    );

    // Set caching headers based on environment
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      // No caching in development mode
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else {
      // Cache for 1 hour in production (server-side cache handles the heavy lifting)
      res.setHeader("Cache-Control", "public, max-age=3600");
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(`Failed to fetch or process page: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process page" });
  }
}

module.exports = fetchPageHandler;
