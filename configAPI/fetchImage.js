const fetchLink = require("../utils/fetchLink");

async function handler(req, res) {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).send("Parameter is required");
    return;
  }

  try {
    const fetchedPhoto = await fetchLink(path);
    const photoUrl = fetchedPhoto.url;

    if (!photoUrl) {
      res.status(404).send("No URL found for the provided path");
      return;
    }

    res.status(200).send(photoUrl);
  } catch (error) {
    console.error(`Failed to fetch photo: ${path}`, error);
    res.status(500).send("Failed to fetch photo");
  }
}

module.exports = handler;
