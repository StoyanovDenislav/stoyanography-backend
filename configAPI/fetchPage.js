const processNewConfig = require("../utils/processNewConfig");

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
    // Process config directly without caching
    const fullConfig = await processNewConfig(path);
    
    // Extract the specific page
    let result;
    if (serviceName) {
      result = fullConfig?.Pages?.services?.[serviceName];
    } else {
      result = fullConfig?.Pages?.[pageName];
    }

    if (!result) {
      return res.status(404).json({ error: "Page not found" });
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
    console.error(`Failed to fetch or process page: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process page" });
  }
}

module.exports = fetchPageHandler;
