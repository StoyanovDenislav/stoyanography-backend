const { generateLink } = require("./hashUtil");
const crypto = require("crypto");

require("dotenv").config();

async function fetchLink(path) {
  const secret = process.env.SECRET || "";
  if (!secret) {
    throw new Error("SECRET environment variable is not defined");
  }

  const secret_ref = process.env.SECRET_REF || "";
  if (!secret_ref) {
    throw new Error("SECRET_REF environment variable is not defined");
  }

  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const hashRef = secret_ref + expiry;
  const ref = crypto.createHash("md5").update(hashRef, "utf8").digest("hex");
  const link = generateLink({ secret, path, expiry, ref });

  const referer = "stoyanography.com";

  const headers = {
    Referer: referer,
  };

  const response = await fetch(link, { headers });

  if (!response.ok) {
    throw new Error("Failed to fetch data");
  }

  return response;
}

module.exports = fetchLink;
