const processNewConfig = require("../utils/processNewConfig");

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
    // Process config directly without caching
    const fullConfig = await processNewConfig(path);

    // Extract the specific photo collection
    const result = fullConfig?.PhotoCollections?.[category]?.[name];

    if (!result) {
      return res.status(404).json({ error: "Photo collection not found" });
    }

    // Set no-cache headers
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

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
