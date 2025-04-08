const fetchLink = require("../legacy/utils/fetchLink");

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
    const response = await fetchLink(path);
    const configJSON = await response.json();

    if (
      !configJSON.PhotoCollections ||
      !configJSON.PhotoCollections[category] ||
      !configJSON.PhotoCollections[category][name]
    ) {
      res.status(404).json({ error: "Photo collection not found" });
      return;
    }

    // Process only this specific collection
    const collection = configJSON.PhotoCollections[category][name];
    const processedPhotos = [];

    for (const photoPath of collection.photos) {
      try {
        const fetchedPhoto = await fetchLink(photoPath);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          processedPhotos.push(photoUrl);
        }
      } catch (error) {
        console.error(`Failed to fetch photo (photo collection): ${photoPath}`, error);
      }
    }

    // Return the processed collection
    const result = {
      tag: collection.tag,
      photos: processedPhotos,
    };

    res.setHeader("Cache-Control", "public, max-age=3600");
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
