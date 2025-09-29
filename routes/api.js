const express = require("express");

// API handlers
const {
  fetchConfigHandler,
  fetchImageHandler,
  fetchPhotoCollectionHandler,
  fetchPageHandler,
} = require("../configAPI");

const router = express.Router();

// API endpoints
router.get("/fetchConfig", fetchConfigHandler);
router.get("/fetchImage", fetchImageHandler);
router.get("/fetchPhotoCollection", fetchPhotoCollectionHandler);
router.get("/fetchPage", fetchPageHandler);

module.exports = router;
