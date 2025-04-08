const fetchLink = require("../legacy/utils/fetchLink");

async function fetchImageHandler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Path parameter is required" });
    return;
  }

  // Debug logging to verify the path format
  console.log(`fetchImageHandler received path: ${path}`);

  try {
    // Ensure path doesn't have duplicate protocol/domain
    const cleanPath = path.startsWith("http") ? new URL(path).pathname : path;

    console.log(`Using cleaned path: ${cleanPath}`);

    const fetchedPhoto = await fetchLink(cleanPath);
    const photoUrl = fetchedPhoto.url;

    if (!photoUrl) {
      console.error(`No URL returned for path: ${cleanPath}`);
      res.status(404).json({ error: "No URL found for the provided path" });
      return;
    }

    // Set caching headers for optimization
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
    res.status(200).json({ url: photoUrl });
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
