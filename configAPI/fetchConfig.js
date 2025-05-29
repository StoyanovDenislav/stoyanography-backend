const fetchLink = require("../legacy/utils/fetchLink");
const processNewConfig = require("../utils/processNewConfig");

async function fetchConfigHandler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  try {
    const response = await fetchLink(path);
    const configJSON = await response.json();
    const processedConfig = await processNewConfig(configJSON);

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
      // Cache for 1 hour in production
      res.setHeader("Cache-Control", "public, max-age=3600");
    }

    res.status(200).json(processedConfig);
  } catch (error) {
    console.error(`Failed to fetch or process config: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process config" });
  }
}

module.exports = fetchConfigHandler;
