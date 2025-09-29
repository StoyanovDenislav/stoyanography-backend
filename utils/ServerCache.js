const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

class ServerCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(__dirname, "../cache");
    this.maxAge = options.maxAge || 3600 * 1000; // 1 hour default
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
    this.cleanupInterval = options.cleanupInterval || 300 * 1000; // 5 minutes
    this.memoryCache = new Map();
    this.metadata = new Map();

    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadMetadata();
      this.startCleanupTimer();
      console.log(`✅ ServerCache initialized: ${this.cacheDir}`);
    } catch (error) {
      console.error("❌ Failed to initialize cache:", error);
    }
  }

  generateKey(input) {
    if (typeof input === "object") {
      input = JSON.stringify(input);
    }
    return crypto.createHash("sha256").update(input).digest("hex");
  }

  getFilePath(key) {
    const subDir = key.substring(0, 2);
    return path.join(this.cacheDir, subDir, `${key}.json`);
  }

  getMetadataPath(key) {
    const subDir = key.substring(0, 2);
    return path.join(this.cacheDir, subDir, `${key}.meta.json`);
  }

  async loadMetadata() {
    try {
      const metaFile = path.join(this.cacheDir, "cache-metadata.json");
      const data = await fs.readFile(metaFile, "utf8");
      const meta = JSON.parse(data);
      this.metadata = new Map(Object.entries(meta));
    } catch (error) {
      // Metadata file doesn't exist or is corrupt, start fresh
      this.metadata = new Map();
    }
  }

  async saveMetadata() {
    try {
      const metaFile = path.join(this.cacheDir, "cache-metadata.json");
      const metaObj = Object.fromEntries(this.metadata);
      await fs.writeFile(metaFile, JSON.stringify(metaObj, null, 2));
    } catch (error) {
      console.error("Failed to save metadata:", error);
    }
  }

  async set(key, value, options = {}) {
    try {
      console.log(
        `🔍 DEBUG: Starting cache set for key: ${key.substring(0, 50)}...`
      );

      const hashedKey = this.generateKey(key);
      const filePath = this.getFilePath(hashedKey);
      const metaPath = this.getMetadataPath(hashedKey);

      // Use temporary files for atomic operations
      const tempFilePath = filePath + ".tmp";
      const tempMetaPath = metaPath + ".tmp";

      console.log(`🔍 DEBUG: Cache file path: ${filePath}`);
      console.log(`🔍 DEBUG: Cache meta path: ${metaPath}`);
      console.log(`🔍 DEBUG: Using temp files for atomic operation`);

      // Ensure subdirectory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      console.log(`🔍 DEBUG: Created subdirectory: ${path.dirname(filePath)}`);

      const now = Date.now();
      const metadata = {
        key: key,
        size: JSON.stringify(value).length,
        createdAt: now,
        lastAccessed: now,
        expiresAt: now + (options.maxAge || this.maxAge),
        hits: 0,
      };

      console.log(`🔍 DEBUG: Writing cache files to temporary locations...`);

      // Write to temporary files first
      await Promise.all([
        fs.writeFile(tempFilePath, JSON.stringify(value)),
        fs.writeFile(tempMetaPath, JSON.stringify(metadata)),
      ]);

      console.log(
        `🔍 DEBUG: Atomically moving temp files to final locations...`
      );

      // Atomically move temporary files to final locations
      await Promise.all([
        fs.rename(tempFilePath, filePath),
        fs.rename(tempMetaPath, metaPath),
      ]);

      console.log(`🔍 DEBUG: Cache files written successfully`);

      // Update in-memory structures
      this.metadata.set(hashedKey, metadata);
      this.memoryCache.set(hashedKey, value);

      await this.saveMetadata();
      console.log(
        `💾 Cached: ${key.substring(0, 50)}... (${metadata.size} bytes)`
      );

      return true;
    } catch (error) {
      console.error("❌ Cache set error:", error);
      console.error("❌ Error details:", error.message);
      console.error("❌ Error stack:", error.stack);

      // Clean up temporary files if they exist
      const hashedKey = this.generateKey(key);
      const filePath = this.getFilePath(hashedKey);
      const metaPath = this.getMetadataPath(hashedKey);
      const tempFilePath = filePath + ".tmp";
      const tempMetaPath = metaPath + ".tmp";

      try {
        await Promise.all([
          fs.unlink(tempFilePath).catch(() => {}),
          fs.unlink(tempMetaPath).catch(() => {}),
        ]);
      } catch (cleanupError) {
        console.error("❌ Failed to clean up temp files:", cleanupError);
      }

      return false;
    }
  }

  async get(key) {
    try {
      const hashedKey = this.generateKey(key);

      // Check memory cache first
      if (this.memoryCache.has(hashedKey)) {
        const metadata = this.metadata.get(hashedKey);
        if (metadata && Date.now() < metadata.expiresAt) {
          metadata.hits++;
          metadata.lastAccessed = Date.now();
          console.log(
            `🚀 Memory cache HIT: ${key.substring(0, 50)}... (${
              metadata.hits
            } hits)`
          );
          return this.memoryCache.get(hashedKey);
        }
      }

      // Check disk cache
      const filePath = this.getFilePath(hashedKey);
      const metaPath = this.getMetadataPath(hashedKey);

      const [data, metaData] = await Promise.all([
        fs.readFile(filePath, "utf8").catch(() => null),
        fs.readFile(metaPath, "utf8").catch(() => null),
      ]);

      if (!data || !metaData) {
        console.log(`❌ Cache MISS: ${key.substring(0, 50)}...`);
        return null;
      }

      const metadata = JSON.parse(metaData);

      // Check if expired
      if (Date.now() >= metadata.expiresAt) {
        console.log(`⏰ Cache EXPIRED: ${key.substring(0, 50)}...`);
        await this.delete(hashedKey);
        return null;
      }

      const value = JSON.parse(data);

      // Update metadata and add to memory cache
      metadata.hits++;
      metadata.lastAccessed = Date.now();
      this.metadata.set(hashedKey, metadata);
      this.memoryCache.set(hashedKey, value);

      console.log(
        `💿 Disk cache HIT: ${key.substring(0, 50)}... (${metadata.hits} hits)`
      );
      return value;
    } catch (error) {
      console.error("Cache get error:", error);
      return null;
    }
  }

  async delete(keyOrHashedKey) {
    try {
      const hashedKey =
        keyOrHashedKey.length === 64
          ? keyOrHashedKey
          : this.generateKey(keyOrHashedKey);

      const filePath = this.getFilePath(hashedKey);
      const metaPath = this.getMetadataPath(hashedKey);

      await Promise.all([
        fs.unlink(filePath).catch(() => {}),
        fs.unlink(metaPath).catch(() => {}),
      ]);

      this.metadata.delete(hashedKey);
      this.memoryCache.delete(hashedKey);

      return true;
    } catch (error) {
      console.error("Cache delete error:", error);
      return false;
    }
  }

  async has(key) {
    const hashedKey = this.generateKey(key);
    const metadata = this.metadata.get(hashedKey);

    if (!metadata) return false;
    if (Date.now() >= metadata.expiresAt) {
      await this.delete(hashedKey);
      return false;
    }

    return true;
  }

  async clear() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.metadata.clear();
      this.memoryCache.clear();
      console.log("🧹 Cache cleared");
      return true;
    } catch (error) {
      console.error("Cache clear error:", error);
      return false;
    }
  }

  async cleanup() {
    const now = Date.now();
    let deletedCount = 0;
    let freedSpace = 0;

    console.log("🧹 Starting cache cleanup...");

    for (const [hashedKey, metadata] of this.metadata.entries()) {
      // Delete expired entries
      if (now >= metadata.expiresAt) {
        freedSpace += metadata.size;
        await this.delete(hashedKey);
        deletedCount++;
      }
    }

    // If still over size limit, delete least recently used
    let totalSize = Array.from(this.metadata.values()).reduce(
      (sum, meta) => sum + meta.size,
      0
    );

    if (totalSize > this.maxSize) {
      const sortedByLRU = Array.from(this.metadata.entries()).sort(
        (a, b) => a[1].lastAccessed - b[1].lastAccessed
      );

      for (const [hashedKey, metadata] of sortedByLRU) {
        if (totalSize <= this.maxSize) break;

        totalSize -= metadata.size;
        freedSpace += metadata.size;
        await this.delete(hashedKey);
        deletedCount++;
      }
    }

    await this.saveMetadata();

    if (deletedCount > 0) {
      console.log(
        `🧹 Cleanup completed: ${deletedCount} entries deleted, ${Math.round(
          freedSpace / 1024
        )}KB freed`
      );
    }
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanup().catch(console.error);
    }, this.cleanupInterval);
  }

  getStats() {
    const totalEntries = this.metadata.size;
    const memoryEntries = this.memoryCache.size;
    const totalSize = Array.from(this.metadata.values()).reduce(
      (sum, meta) => sum + meta.size,
      0
    );
    const totalHits = Array.from(this.metadata.values()).reduce(
      (sum, meta) => sum + meta.hits,
      0
    );

    return {
      totalEntries,
      memoryEntries,
      diskEntries: totalEntries - memoryEntries,
      totalSize: Math.round(totalSize / 1024) + "KB",
      totalHits,
      hitRate:
        totalEntries > 0
          ? Math.round((totalHits / totalEntries) * 100) + "%"
          : "0%",
    };
  }

  // Method to warm cache with frequently requested data
  async warmCache(precomputeFunction, keys) {
    console.log("🔥 Starting cache warm-up...");

    for (const key of keys) {
      try {
        if (!(await this.has(key))) {
          console.log(`🔥 Pre-computing: ${key}`);
          const data = await precomputeFunction(key);
          await this.set(key, data);
        }
      } catch (error) {
        console.error(`Failed to warm cache for ${key}:`, error);
      }
    }

    console.log("🔥 Cache warm-up completed");
  }
}

module.exports = ServerCache;
