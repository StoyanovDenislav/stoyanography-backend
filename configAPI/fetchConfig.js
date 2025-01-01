const fetchLink = require("../utils/fetchLink");
const processConfig = require("../utils/processConfig");

async function handler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Parameter is required" });
    return;
  }

  const response = await fetchLink(path);
  const configJSON = await response.json();
  const processedConfig = await processConfig(configJSON);

  // Set caching headers
  // res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");

  res.status(200).json(processedConfig);
}

module.exports = handler;
