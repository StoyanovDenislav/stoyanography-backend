const fetchLink = require("./fetchLink");

async function processConfig(config) {
  const processedConfig = {
    ...config,
    PhotoCollections: config.PhotoCollections ? {} : undefined,
    heroImages: config.heroImages ? [] : undefined,
    SingularImages: config.SingularImages ? {} : undefined,
  };

  const processCollection = async (collection) => {
    const processedCollection = [];
    for (const photo of collection) {
      try {
        const fetchedPhoto = await fetchLink(photo);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          processedCollection.push(photoUrl);
        } else {
          console.error(`No URL found for photo: ${photo}`);
        }
      } catch (error) {
        console.error(`Failed to fetch photo: ${photo}`, error);
      }
    }
    return processedCollection;
  };

  const processPhotoCollections = async (collections) => {
    const processedCollections = {};
    for (const [locale, albums] of Object.entries(collections)) {
      processedCollections[locale] = {};
      for (const [albumName, album] of Object.entries(albums)) {
        if (Array.isArray(album.photos)) {
          processedCollections[locale][albumName] = {
            tag: album.tag,
            photos: await processCollection(album.photos),
          };
        } else {
          console.error(`Photos for album ${albumName} are not an array`);
        }
      }
    }
    return processedCollections;
  };

  const processSingularImages = async (images) => {
    const processedImages = {};
    for (const [key, photo] of Object.entries(images)) {
      try {
        const fetchedPhoto = await fetchLink(photo);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          processedImages[key] = photoUrl;
        } else {
          console.error(`No URL found for photo: ${photo}`);
        }
      } catch (error) {
        console.error(`Failed to fetch photo: ${photo}`, error);
      }
    }
    return processedImages;
  };

  if (config.heroImages) {
    processedConfig.heroImages = await processCollection(config.heroImages);
  }

  if (config.PhotoCollections) {
    processedConfig.PhotoCollections = await processPhotoCollections(
      config.PhotoCollections
    );
  }

  if (config.SingularImages) {
    processedConfig.SingularImages = await processSingularImages(
      config.SingularImages
    );
  }

  return processedConfig;
}

module.exports = processConfig;
