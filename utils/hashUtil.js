const crypto = require("crypto");

function base64UrlEncode(input) {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  input = input.replace(/\-/g, "+").replace(/_/g, "/");
  while (input.length % 4) {
    input += "=";
  }

  return Buffer.from(input, "base64");
}

function generateBase64Hash({ secret, path, expiry, ref }) {
  const data = `${secret}${path}${expiry}${ref}`;
  const hash = crypto.createHash("md5").update(data, "utf8").digest();
  return base64UrlEncode(hash);
}

function generateLink({ secret, path, expiry, ref }) {
  const hash = generateBase64Hash({ secret, path, expiry, ref });
  const baseUrl = `https://cdn.stoyanography.com${path}?md5=${hash}&expires=${expiry}&ref=${ref}`;

  return baseUrl;
}

module.exports = {
  base64UrlEncode,
  base64UrlDecode,
  generateBase64Hash,
  generateLink,
};
