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

    // Set caching headers for optimization
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.status(200).json(processedConfig);
  } catch (error) {
    console.error(`Failed to fetch or process config: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process config" });
  }
}

module.exports = fetchConfigHandler;
