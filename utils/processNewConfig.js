const { Worker } = require("worker_threads");
const path = require("path");
const os = require("os");

// Number of worker threads (typically number of CPU cores)
const NUM_WORKERS = os.cpus().length;

async function processNewConfig(config) {
  const processedConfig = {
    ...config,
    maintainance_mode: config.maintainance_mode,
    SingularImages: config.SingularImages ? {} : undefined,
    PhotoCollections: config.PhotoCollections ? {} : undefined,
    banners: config.banners ? [...config.banners] : undefined,
    Pages: config.Pages ? { ...config.Pages } : undefined,
  };

  // Utility function to split array into chunks for workers
  const chunkArray = (array, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  };

  // Function to process photos using worker threads
  const processPhotosWithWorkers = async (photos) => {
    if (photos.length === 0) return [];

    const chunkSize = Math.max(1, Math.ceil(photos.length / NUM_WORKERS));
    const photoChunks = chunkArray(photos, chunkSize);

    const workerPromises = photoChunks.map((chunk) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, "./photoWorker.js"), {
          workerData: { photos: chunk },
        });

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

    try {
      const allResults = await Promise.all(workerPromises);
      const flatResults = allResults.flat();
      return flatResults
        .filter((result) => result.success)
        .map((result) => result.url);
    } catch (error) {
      console.error("Worker thread error:", error);
      throw error;
    }
  };

  // Process singular images with threading
  const processSingularImages = async (images) => {
    const photos = Object.values(images);
    const keys = Object.keys(images);

    if (photos.length === 0) return {};

    const chunkSize = Math.max(1, Math.ceil(photos.length / NUM_WORKERS));
    const photoChunks = chunkArray(photos, chunkSize);

    const workerPromises = photoChunks.map((chunk, index) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, "./photoWorker.js"), {
          workerData: { photos: chunk },
        });

        worker.on("message", (data) => {
          if (data.success) {
            // Map results back to their keys
            const chunkResults = {};
            data.results.forEach((result, resultIndex) => {
              if (result.success) {
                const keyIndex = index * chunkSize + resultIndex;
                if (keyIndex < keys.length) {
                  chunkResults[keys[keyIndex]] = result.url;
                }
              }
            });
            resolve(chunkResults);
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

    try {
      const allResults = await Promise.all(workerPromises);
      return Object.assign({}, ...allResults);
    } catch (error) {
      console.error("Worker thread error in processSingularImages:", error);
      throw error;
    }
  };

  // Process photo collection with threading
  const processPhotoCollection = async (photos) => {
    if (!Array.isArray(photos)) return [];

    // Filter out placeholder entries like "..."
    const validPhotos = photos.filter((photoPath) => photoPath !== "...");

    if (validPhotos.length === 0) return [];

    return await processPhotosWithWorkers(validPhotos);
  };

  // Process all photo collections with threading
  const processPhotoCollections = async (collections) => {
    const processedCollections = {};

    const albumPromises = Object.entries(collections).map(
      async ([albumName, album]) => {
        if (Array.isArray(album.photos)) {
          const photos = await processPhotoCollection(album.photos);
          return [
            albumName,
            {
              translations: album.translations,
              photos: photos,
            },
          ];
        } else {
          console.error(`Photos for album ${albumName} are not an array`);
          return [
            albumName,
            {
              translations: album.translations,
              photos: [],
            },
          ];
        }
      }
    );

    const albumResults = await Promise.all(albumPromises);
    return Object.fromEntries(albumResults);
  };

  // Process single image URL for serviceItems
  const processSingleImage = async (imageUrl) => {
    const chunk = [imageUrl];
    const workerPromise = new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, "./photoWorker.js"), {
        workerData: { photos: chunk },
      });

      worker.on("message", (data) => {
        if (data.success && data.results.length > 0) {
          resolve(data.results[0].success ? data.results[0].url : null);
        } else {
          resolve(null);
        }
      });

      worker.on("error", () => resolve(null));
      worker.on("exit", (code) => {
        if (code !== 0) {
          resolve(null);
        }
      });
    });

    return await workerPromise;
  };

  // Process the Pages section with images and styles using threading
  const processPages = async (pages) => {
    const processedPages = {};

    // Process all pages concurrently
    const pagePromises = Object.entries(pages).map(async ([pageName, page]) => {
      // Special handling for nested "services" pages
      if (pageName === "services") {
        const serviceResults = {};

        // Process all services concurrently
        const servicePromises = Object.entries(page).map(
          async ([serviceName, serviceData]) => {
            // Clone service page with all properties including styles
            const processedService = { ...serviceData };

            if (serviceData.sections) {
              // Process sections concurrently
              const sectionPromises = serviceData.sections.map(
                async (section, i) => {
                  // Process hero section images while preserving styles
                  if (
                    section.type === "hero" &&
                    section.images &&
                    Array.isArray(section.images)
                  ) {
                    const images = await processPhotoCollection(section.images);
                    return { ...section, images };
                  }
                  return section;
                }
              );

              processedService.sections = await Promise.all(sectionPromises);
            }

            return [serviceName, processedService];
          }
        );

        const serviceResults_array = await Promise.all(servicePromises);
        return [pageName, Object.fromEntries(serviceResults_array)];
      } else {
        // Regular pages (non-services)
        const processedPage = { ...page };

        // Process serviceItems for servicesOverview page
        if (pageName === "servicesOverview" && page.serviceItems) {
          const serviceItemPromises = page.serviceItems.map(async (item) => {
            const processedItem = { ...item };
            if (item.imageUrl) {
              try {
                const photoUrl = await processSingleImage(item.imageUrl);
                if (photoUrl) {
                  processedItem.imageUrl = photoUrl;
                } else {
                  console.error(
                    `No URL found for serviceItem image: ${item.imageUrl}`
                  );
                }
              } catch (error) {
                console.error(
                  `Failed to fetch serviceItem image: ${item.imageUrl}`,
                  error
                );
              }
            }
            return processedItem;
          });

          processedPage.serviceItems = await Promise.all(serviceItemPromises);
        }

        // Process sections if they exist
        if (page.sections) {
          const sectionPromises = page.sections.map(async (section, i) => {
            // Process hero section images
            if (
              section.type === "hero" &&
              section.images &&
              Array.isArray(section.images)
            ) {
              const images = await processPhotoCollection(section.images);
              return { ...section, images };
            }
            return section;
          });

          processedPage.sections = await Promise.all(sectionPromises);
        }

        return [pageName, processedPage];
      }
    });

    const pageResults = await Promise.all(pagePromises);
    return Object.fromEntries(pageResults);
  };

  // Process each part of the config concurrently
  const tasks = [];

  if (config.SingularImages) {
    tasks.push(
      processSingularImages(config.SingularImages).then((result) => {
        processedConfig.SingularImages = result;
      })
    );
  }

  if (config.PhotoCollections) {
    tasks.push(
      processPhotoCollections(config.PhotoCollections).then((result) => {
        processedConfig.PhotoCollections = result;
      })
    );
  }

  if (config.Pages) {
    tasks.push(
      processPages(config.Pages).then((result) => {
        processedConfig.Pages = result;
      })
    );
  }

  await Promise.all(tasks);

  return processedConfig;
}

module.exports = processNewConfig;
