const processNewConfig = require("../utils/processNewConfig");

async function fetchConfigHandler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  try {
    // Process config directly without caching
    const processedConfig = await processNewConfig(path);

    // Set no-cache headers
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.status(200).json(processedConfig);
  } catch (error) {
    console.error(`Failed to fetch or process config: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process config" });
  }
}

module.exports = fetchConfigHandler;
