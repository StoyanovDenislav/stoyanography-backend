const fetchLink = require("../legacy/utils/fetchLink");

async function processNewConfig(config) {
  const processedConfig = {
    ...config,
    maintainance_mode: config.maintainance_mode,
    SingularImages: config.SingularImages ? {} : undefined,
    PhotoCollections: config.PhotoCollections ? {} : undefined,
    banners: config.banners ? [...config.banners] : undefined,
    Pages: config.Pages ? { ...config.Pages } : undefined,
  };

  // Process singular images
  const processSingularImages = async (images) => {
    const processedImages = {};
    for (const [key, photoPath] of Object.entries(images)) {
      try {
        const fetchedPhoto = await fetchLink(photoPath);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          processedImages[key] = photoUrl;
        } else {
          console.error(`No URL found for photo: ${photoPath}`);
        }
      } catch (error) {
        console.error(`Failed to fetch photo: ${photoPath}`, error);
      }
    }
    return processedImages;
  };

  // Process photo collection
  const processPhotoCollection = async (photos) => {
    if (!Array.isArray(photos)) return [];

    const processedPhotos = [];
    for (const photoPath of photos) {
      // Skip placeholder entries like "..."
      if (photoPath === "...") {
        continue;
      }

      try {
        const fetchedPhoto = await fetchLink(photoPath);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          processedPhotos.push(photoUrl);
        } else {
          console.error(`No URL found for photo: ${photoPath}`);
        }
      } catch (error) {
        console.error(`Failed to fetch photo: ${photoPath}`, error);
      }
    }
    return processedPhotos;
  };

  // Process all photo collections
  const processPhotoCollections = async (collections) => {
    const processedCollections = {};

    for (const [albumName, album] of Object.entries(collections)) {
      if (Array.isArray(album.photos)) {
        processedCollections[albumName] = {
          translations: album.translations,
          photos: await processPhotoCollection(album.photos),
        };
      } else {
        console.error(`Photos for album ${albumName} are not an array`);
        processedCollections[albumName] = {
          translations: album.translations,
          photos: [],
        };
      }
    }

    return processedCollections;
  };

  // Process the Pages section with images and styles
  const processPages = async (pages) => {
    const processedPages = {};

    for (const [pageName, page] of Object.entries(pages)) {
      // Special handling for nested "services" pages
      if (pageName === "services") {
        processedPages[pageName] = {};

        for (const [serviceName, serviceData] of Object.entries(page)) {
          // Clone service page with all properties including styles
          processedPages[pageName][serviceName] = {
            ...serviceData,
          };

          if (!serviceData.sections) continue;

          // Process sections for this service
          for (let i = 0; i < serviceData.sections.length; i++) {
            const section = serviceData.sections[i];

            // Process hero section images while preserving styles
            if (
              section.type === "hero" &&
              section.images &&
              Array.isArray(section.images)
            ) {
              processedPages[pageName][serviceName].sections[i] = {
                ...section,
                images: await processPhotoCollection(section.images),
              };
            }
          }
        }
      } else {
        // Regular pages (non-services)
        processedPages[pageName] = { ...page };

        // Process serviceItems for servicesOverview page
        if (pageName === "servicesOverview" && page.serviceItems) {
          processedPages[pageName].serviceItems = [];
          for (const item of page.serviceItems) {
            const processedItem = { ...item };
            if (item.imageUrl) {
              try {
                const fetchedPhoto = await fetchLink(item.imageUrl);
                const photoUrl = fetchedPhoto.url;
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
            processedPages[pageName].serviceItems.push(processedItem);
          }
        }

        if (!page.sections) continue;

        for (let i = 0; i < page.sections.length; i++) {
          const section = page.sections[i];

          // Process hero section images
          if (
            section.type === "hero" &&
            section.images &&
            Array.isArray(section.images)
          ) {
            processedPages[pageName].sections[i] = {
              ...section,
              images: await processPhotoCollection(section.images),
            };
          }
        }
      }
    }

    return processedPages;
  };

  // Process each part of the config
  if (config.SingularImages) {
    processedConfig.SingularImages = await processSingularImages(
      config.SingularImages
    );
  }

  if (config.PhotoCollections) {
    processedConfig.PhotoCollections = await processPhotoCollections(
      config.PhotoCollections
    );
  }

  if (config.Pages) {
    processedConfig.Pages = await processPages(config.Pages);
  }

  return processedConfig;
}

module.exports = processNewConfig;
