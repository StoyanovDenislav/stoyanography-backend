const ServerCache = require("./ServerCache");
const processNewConfig = require("./processNewConfig");
const fetchLink = require("../legacy/utils/fetchLink");

class CacheManager {
  constructor() {
    this.cache = new ServerCache({
      cacheDir: process.env.CACHE_DIR || "./cache",
      maxAge: 3600 * 1000, // 1 hour default (can be overridden per item)
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 500 * 1024 * 1024, // 500MB
    });

    // Track ongoing processing to prevent concurrent processing of same items
    this.processingLocks = new Map();

    console.log("🚀 CacheManager initialized - On-demand caching enabled");
  }

  // Generate cache keys for different data types
  generateConfigKey(path) {
    return `config:${path}`;
  }

  generatePageKey(path, pageName, serviceName = null) {
    return serviceName
      ? `page:${path}:${pageName}:${serviceName}`
      : `page:${path}:${pageName}`;
  }

  generateCollectionKey(path, category, name) {
    return `collection:${path}:${category}:${name}`;
  }

  generateImageKey(path) {
    return `image:${path}`;
  }

  // Cached config fetching with threaded processing
  async getCachedConfig(configPath) {
    const cacheKey = this.generateConfigKey(configPath);

    // Try cache first
    let config = await this.cache.get(cacheKey);
    if (config) {
      console.log(`🚀 Using cached config: ${configPath}`);
      return config;
    }

    // Check if this config is already being processed
    if (this.processingLocks.has(cacheKey)) {
      console.log(`⏳ Config already being processed, waiting: ${configPath}`);
      return await this.processingLocks.get(cacheKey);
    }

    console.log(`🔄 Processing config with threading: ${configPath}`);

    // Create a processing promise to prevent concurrent processing
    const processingPromise = this._processConfigWithLock(configPath, cacheKey);
    this.processingLocks.set(cacheKey, processingPromise);

    try {
      const result = await processingPromise;
      return result;
    } finally {
      // Clean up the lock
      this.processingLocks.delete(cacheKey);
    }
  }

  async _processConfigWithLock(configPath, cacheKey) {
    try {
      // Fetch and process with threading
      const response = await fetchLink(configPath);
      const rawConfig = await response.json();

      // Use the threaded version for processing
      const processedConfig = await processNewConfig(rawConfig);

      console.log(
        `🔍 DEBUG: About to cache processed config for ${configPath}`
      );
      console.log(`🔍 DEBUG: Cache key: ${cacheKey}`);
      console.log(
        `🔍 DEBUG: Config size: ${JSON.stringify(processedConfig).length} bytes`
      );

      // Cache the result with 1-hour expiration
      const cacheResult = await this.cache.set(cacheKey, processedConfig, {
        maxAge: 3600 * 1000, // 1 hour cache expiration
      });

      console.log(`🔍 DEBUG: Cache set result: ${cacheResult}`);
      console.log(`💾 Cached processed config: ${configPath}`);
      return processedConfig;
    } catch (error) {
      console.error(`Failed to process config ${configPath}:`, error);
      throw error;
    }
  }

  // Cached page fetching
  async getCachedPage(configPath, pageName, serviceName = null) {
    const cacheKey = this.generatePageKey(configPath, pageName, serviceName);

    let page = await this.cache.get(cacheKey);
    if (page) {
      console.log(
        `🚀 Using cached page: ${pageName}${
          serviceName ? `/${serviceName}` : ""
        }`
      );
      return page;
    }

    console.log(
      `🔄 Processing page: ${pageName}${serviceName ? `/${serviceName}` : ""}`
    );

    try {
      // Get full config (this might be cached too)
      const config = await this.getCachedConfig(configPath);

      let result;
      if (pageName === "services" && serviceName) {
        result = config.Pages?.services?.[serviceName];
        if (!result) {
          throw new Error(`Service page "${serviceName}" not found`);
        }
      } else {
        result = config.Pages?.[pageName];
        if (!result) {
          throw new Error(`Page "${pageName}" not found`);
        }
      }

      // Cache the page separately for faster access
      await this.cache.set(cacheKey, result, {
        maxAge: 1 * 3600 * 1000, // 1 hour for pages
      });

      console.log(
        `💾 Cached page: ${pageName}${serviceName ? `/${serviceName}` : ""}`
      );
      return result;
    } catch (error) {
      console.error(`Failed to process page ${pageName}:`, error);
      throw error;
    }
  }

  // Cached photo collection fetching
  async getCachedPhotoCollection(configPath, category, name) {
    const cacheKey = this.generateCollectionKey(configPath, category, name);

    let collection = await this.cache.get(cacheKey);
    if (collection) {
      console.log(`🚀 Using cached collection: ${category}/${name}`);
      return collection;
    }

    console.log(`🔄 Processing collection with threading: ${category}/${name}`);

    try {
      // Get the raw config first
      const response = await fetchLink(configPath);
      const rawConfig = await response.json();

      const targetCollection = rawConfig.PhotoCollections?.[category]?.[name];
      if (!targetCollection) {
        throw new Error("Photo collection not found");
      }

      // Process just this collection with threading
      const processedPhotos = [];
      if (Array.isArray(targetCollection.photos)) {
        // Use threaded processing for the photos
        const { Worker } = require("worker_threads");
        const path = require("path");
        const os = require("os");

        const NUM_WORKERS = os.cpus().length;
        const photos = targetCollection.photos;

        if (photos.length > 0) {
          const chunkSize = Math.max(1, Math.ceil(photos.length / NUM_WORKERS));
          const chunks = [];
          for (let i = 0; i < photos.length; i += chunkSize) {
            chunks.push(photos.slice(i, i + chunkSize));
          }

          const workerPromises = chunks.map((chunk) => {
            return new Promise((resolve, reject) => {
              const worker = new Worker(
                path.join(__dirname, "../legacy/utils/photoWorker.js"),
                {
                  workerData: { photos: chunk },
                }
              );

              worker.on("message", (data) => {
                if (data.success) {
                  resolve(data.results);
                } else {
                  reject(new Error(data.error));
                }
              });

              worker.on("error", reject);
              worker.on("exit", (code) => {
                if (code !== 0) {
                  reject(new Error(`Worker stopped with exit code ${code}`));
                }
              });
            });
          });

          const allResults = await Promise.all(workerPromises);
          const flatResults = allResults.flat();
          processedPhotos.push(
            ...flatResults
              .filter((result) => result.success)
              .map((result) => result.url)
          );
        }
      }

      const result = {
        tag: targetCollection.tag,
        photos: processedPhotos,
      };

      // Cache the collection
      await this.cache.set(cacheKey, result, {
        maxAge: 6 * 3600 * 1000, // 6 hours for collections
      });

      console.log(`💾 Cached collection: ${category}/${name}`);
      return result;
    } catch (error) {
      console.error(`Failed to process collection ${category}/${name}:`, error);
      throw error;
    }
  }

  // Cached single image fetching
  async getCachedImage(imagePath) {
    const cacheKey = this.generateImageKey(imagePath);

    let imageUrl = await this.cache.get(cacheKey);
    if (imageUrl) {
      console.log(`🚀 Using cached image: ${imagePath.substring(0, 50)}...`);
      return imageUrl;
    }

    console.log(`🔄 Processing image: ${imagePath.substring(0, 50)}...`);

    try {
      // Clean the path if needed
      const cleanPath = imagePath.startsWith("http")
        ? new URL(imagePath).pathname
        : imagePath;

      const fetchedPhoto = await fetchLink(cleanPath);
      const photoUrl = fetchedPhoto.url;

      if (!photoUrl) {
        throw new Error("No URL found for the provided path");
      }

      // Cache the image URL
      await this.cache.set(
        cacheKey,
        { url: photoUrl },
        {
          maxAge: 24 * 3600 * 1000, // 24 hours for images
        }
      );

      console.log(`💾 Cached image: ${imagePath.substring(0, 50)}...`);
      return { url: photoUrl };
    } catch (error) {
      console.error(`Failed to process image ${imagePath}:`, error);
      throw error;
    }
  }

  // Get cache statistics
  getStats() {
    return this.cache.getStats();
  }

  // Clear all cache
  async clearCache() {
    return await this.cache.clear();
  }

  // Invalidate specific cache entries
  async invalidateConfig(configPath) {
    const configKey = this.generateConfigKey(configPath);
    await this.cache.delete(configKey);

    // Also invalidate related pages and collections
    // This is a simple approach - in production you might want more sophisticated invalidation
    console.log(`🗑️ Invalidated cache for config: ${configPath}`);
  }

  // Manual cache warming for specific paths (admin use only)
  async warmCacheForConfig(configPath) {
    try {
      console.log(`🔥 Warming cache for config: ${configPath}`);

      // Pre-compute the main config
      const config = await this.getCachedConfig(configPath);

      // Pre-compute all pages
      if (config.Pages) {
        for (const [pageName, page] of Object.entries(config.Pages)) {
          if (pageName === "services" && typeof page === "object") {
            // Pre-compute service pages
            for (const serviceName of Object.keys(page)) {
              await this.getCachedPage(configPath, pageName, serviceName);
            }
          } else {
            await this.getCachedPage(configPath, pageName);
          }
        }
      }

      // Pre-compute photo collections
      if (config.PhotoCollections) {
        for (const [category, albums] of Object.entries(
          config.PhotoCollections
        )) {
          for (const albumName of Object.keys(albums)) {
            await this.getCachedPhotoCollection(
              configPath,
              category,
              albumName
            );
          }
        }
      }

      console.log(`🔥 Cache warming completed for: ${configPath}`);
    } catch (error) {
      console.error(`Cache warming failed for ${configPath}:`, error);
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
