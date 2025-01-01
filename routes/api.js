const express = require("express");
const fetchConfigHandler = require("../configAPI/fetchConfig");
const fetchImageHandler = require("../configAPI/fetchImage");

const router = express.Router();

router.get("/fetchConfig", fetchConfigHandler);
router.get("/fetchImage", fetchImageHandler);

module.exports = router;
