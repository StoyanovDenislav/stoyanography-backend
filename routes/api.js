const express = require("express");

// Legacy handlers
const fetchLegacyConfigHandler = require("../legacy/configAPI/fetchConfig");
const fetchLegacyImageHandler = require("../legacy/configAPI/fetchImage");

// New handlers
const {
  fetchConfigHandler,
  fetchImageHandler,
  fetchPhotoCollectionHandler,
  fetchPageHandler,
} = require("../configAPI");

const router = express.Router();

// Legacy endpoints
//router.get("/fetchLegacyConfig", fetchLegacyConfigHandler);
//router.get("/fetchLegacyImage", fetchLegacyImageHandler);

// New endpoints
router.get("/fetchConfig", fetchConfigHandler);
router.get("/fetchImage", fetchImageHandler);
router.get("/fetchPhotoCollection", fetchPhotoCollectionHandler);
router.get("/fetchPage", fetchPageHandler);

module.exports = router;
