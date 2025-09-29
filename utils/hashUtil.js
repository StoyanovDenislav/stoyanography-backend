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

  // Fix: Check if path already includes protocol and domain
  if (path.startsWith("http://") || path.startsWith("https://")) {
    // Get just the pathname from the URL to avoid double domains
    try {
      const url = new URL(path);
      return `${url.origin}${url.pathname}?md5=${hash}&expires=${expiry}&ref=${ref}`;
    } catch (e) {
      console.error("Invalid URL format:", path);
    }
  }

  // Regular path case (starts with /)
  return `https://cdn.stoyanography.com${path}?md5=${hash}&expires=${expiry}&ref=${ref}`;
}

module.exports = {
  base64UrlEncode,
  base64UrlDecode,
  generateBase64Hash,
  generateLink,
};
