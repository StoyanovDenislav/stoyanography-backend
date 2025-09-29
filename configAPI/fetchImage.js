const cacheManager = require("../utils/CacheManager");

async function fetchImageHandler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  // Debug logging to verify the path format
  console.log(`fetchImageHandler received path: ${path}`);

  try {
    // Use cache manager for caching
    const result = await cacheManager.getCachedImage(path);

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
      // Cache for 24 hours in production (images rarely change)
      res.setHeader("Cache-Control", "public, max-age=86400");
    }

    res.status(200).json(result);
  } catch (error) {
    // Detailed error logging with full context
    console.error(`Failed to fetch photo: ${path}`);
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);

    // Log cause if available (nodejs v16+)
    if (error.cause) {
      console.error(`Caused by: ${error.cause.name} - ${error.cause.message}`);
      console.error(`Hostname attempted: ${error.cause.hostname || "N/A"}`);
      console.error(`Error code: ${error.cause.code || "N/A"}`);
    }

    // Log stack trace without overwhelming the console
    console.error(
      `Stack trace: ${error.stack?.split("\n").slice(0, 3).join("\n")}`
    );

    res.status(500).json({
      error: "Failed to fetch photo",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

module.exports = fetchImageHandler;
