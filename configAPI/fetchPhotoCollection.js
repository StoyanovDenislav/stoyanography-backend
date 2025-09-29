const cacheManager = require("../utils/CacheManager");

async function fetchPhotoCollectionHandler(req, res) {
  const { path, category, name } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  if (!category || typeof category !== "string") {
    res.status(400).json({ error: "Category parameter is required" });
    return;
  }

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Collection name parameter is required" });
    return;
  }

  try {
    // Use cache manager for threaded processing and caching
    const result = await cacheManager.getCachedPhotoCollection(
      path,
      category,
      name
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
      // Cache for 6 hours in production (collections change less frequently)
      res.setHeader("Cache-Control", "public, max-age=21600");
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(
      `Failed to fetch or process photo collection: ${error.message}`
    );
    res
      .status(500)
      .json({ error: "Failed to fetch or process photo collection" });
  }
}

module.exports = fetchPhotoCollectionHandler;
