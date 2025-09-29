const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("worker_threads");
const fetchLink = require("../legacy/utils/fetchLink");

if (!isMainThread) {
  // Worker thread code
  async function processPhotos(photos) {
    const results = [];

    for (const photo of photos) {
      try {
        const fetchedPhoto = await fetchLink(photo);
        const photoUrl = fetchedPhoto.url;
        if (photoUrl) {
          results.push({ success: true, photo, url: photoUrl });
        } else {
          console.error(`No URL found for photo: ${photo}`);
          results.push({ success: false, photo, error: "No URL found" });
        }
      } catch (error) {
        console.error(`Failed to fetch photo: ${photo}`, error);
        results.push({ success: false, photo, error: error.message });
      }
    }

    return results;
  }

  // Process the photos assigned to this worker
  processPhotos(workerData.photos)
    .then((results) => {
      parentPort.postMessage({ success: true, results });
    })
    .catch((error) => {
      parentPort.postMessage({ success: false, error: error.message });
    });
}

module.exports = { Worker, isMainThread };
