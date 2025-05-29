const fetchLink = require("../legacy/utils/fetchLink");
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
    const response = await fetchLink(path);
    const configJSON = await response.json();

    // Handle service pages (nested under "services")
    if (pageName === "services" && serviceName) {
      if (!configJSON.Pages?.services?.[serviceName]) {
        res
          .status(404)
          .json({ error: `Service page "${serviceName}" not found` });
        return;
      }

      // Process the whole config to handle image references
      const processedConfig = await processNewConfig(configJSON);
      const result = processedConfig.Pages.services[serviceName];

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

      res.status(200).json(result);
      return;
    }

    // Handle regular pages
    if (!configJSON.Pages || !configJSON.Pages[pageName]) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    // Process the whole config to handle image references
    const processedConfig = await processNewConfig(configJSON);
    const result = processedConfig.Pages[pageName];

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

    res.status(200).json(result);
  } catch (error) {
    console.error(`Failed to fetch or process page: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch or process page" });
  }
}

module.exports = fetchPageHandler;
