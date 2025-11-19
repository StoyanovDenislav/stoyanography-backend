const ODatabase = require("orientjs").ODatabase;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const dbConfig = {
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
};

// Landing page configuration
const landingPageConfig = {
  type: "alternatingHeroSections",
  enabled: true,
  startReversed: false,
  sections: [
    {
      titleTranslationKey: "Main.Portfolio",
      paragraphTranslationKey: "Main.PortfolioText",
      buttonTranslationKey: "Main.ViewMore",
      buttonHref: "/gallery",
      imageSrc: "SingularImages.Portfolio",
      imageAlt: "Alt text",
      showButton: true,
    },
    {
      titleTranslationKey: "Main.PromPhotography",
      paragraphTranslationKey: "PromPhotography.Paragraphs.1.text",
      buttonTranslationKey: "Main.ViewMore",
      buttonHref: "/services/prom",
      imageSrc: "SingularImages.Prom",
      imageAlt: "Alt text",
      showButton: true,
    },
    {
      titleTranslationKey: "Main.PortraitPhotography",
      paragraphTranslationKey: "PortraitPhotography.Paragraphs.1.text",
      buttonTranslationKey: "Main.ViewMore",
      buttonHref: "/services/portrait",
      imageSrc: "SingularImages.Portrait",
      imageAlt: "Alt text",
      showButton: true,
    },
    {
      titleTranslationKey: "Main.BusinessPhotography",
      paragraphTranslationKey: "BusinessPhotography.Paragraphs.1.text",
      buttonTranslationKey: "Main.ViewMore",
      buttonHref: "/services/business",
      imageSrc: "SingularImages.Business",
      imageAlt: "Alt text",
      showButton: true,
    },
    {
      titleTranslationKey: "Main.AboutMe",
      paragraphTranslationKey: "AboutMe.Paragraphs.1.text",
      buttonTranslationKey: "Main.ViewMore",
      buttonHref: "/aboutme",
      imageSrc: "SingularImages.Img1",
      imageAlt: "Alt text",
      showButton: true,
    },
  ],
};

// Portfolio collection for landing page (random hero images)
const portfolioCollection = {
  translations: [
    {
      locale: "bg",
      name: "Портфолио",
      tag: "Микс",
    },
    {
      locale: "en",
      name: "Portfolio",
      tag: "Mix",
    },
  ],
  photos: [
    "/upload/prom/nikola/DSC01824.jpg",
    "/upload/prom/nikola/DSC01772.jpg",
    "/upload/portrait_photography/Stela/1.png",
    "/upload/portrait_photography/annie_boa/DSC01382.jpg",
    "/upload/portrait_photography/asuka/DSC01548.jpg",
    "/upload/portrait_photography/kiryak_misato/DSC01562.jpg",
    "/upload/portrait_photography/radi & ven/DSC02384.jpg",
    "/upload/portrait_photography/theshowmancosplay/DSC01503.jpg",
    "/upload/portrait_photography/JJK/DSC02397.jpg",
    "/upload/portrait_photography/stela_urban/DSC09630.jpg",
  ],
};

async function migrateLandingPage() {
  let db;

  try {
    console.log("🚀 Migrating Landing Page Config...\n");

    console.log("📦 Connecting to OrientDB...");
    db = new ODatabase(dbConfig);
    console.log("✅ Connected\n");

    // Check if page_home already exists
    const existing = await db.query(
      `SELECT FROM CMSConfig WHERE configKey = 'page_home'`
    );

    if (existing.length > 0) {
      console.log("⚠️  page_home already exists, updating...");
      await db.query(
        `UPDATE CMSConfig SET configData = :data WHERE configKey = 'page_home'`,
        {
          params: {
            data: JSON.stringify(landingPageConfig),
          },
        }
      );
      console.log("✅ Updated page_home\n");
    } else {
      console.log("📝 Creating page_home config...");
      await db.query(
        `INSERT INTO CMSConfig SET configKey = 'page_home', configData = :data`,
        {
          params: {
            data: JSON.stringify(landingPageConfig),
          },
        }
      );
      console.log("✅ Created page_home\n");
    }

    // Check if portfolio collection exists
    const existingCollection = await db.query(
      `SELECT FROM CMSPhotoCollection WHERE collectionName = 'portfolio'`
    );

    if (existingCollection.length > 0) {
      console.log("⚠️  portfolio collection already exists, updating...");
      await db.query(
        `UPDATE CMSPhotoCollection SET translations = :translations, metadata = :metadata WHERE collectionName = 'portfolio'`,
        {
          params: {
            translations: JSON.stringify(portfolioCollection.translations),
            metadata: JSON.stringify({
              originalPaths: portfolioCollection.photos,
              totalImages: portfolioCollection.photos.length,
              migratedImages: false,
              purpose: "Landing page hero banner random images",
            }),
          },
        }
      );
      console.log("✅ Updated portfolio collection\n");
    } else {
      console.log("📝 Creating portfolio collection...");
      await db.query(
        `INSERT INTO CMSPhotoCollection SET collectionName = 'portfolio', translations = :translations, photos = :photos, metadata = :metadata`,
        {
          params: {
            translations: JSON.stringify(portfolioCollection.translations),
            photos: [],
            metadata: JSON.stringify({
              originalPaths: portfolioCollection.photos,
              totalImages: portfolioCollection.photos.length,
              migratedImages: false,
              purpose: "Landing page hero banner random images",
            }),
          },
        }
      );
      console.log("✅ Created portfolio collection\n");
    }

    console.log("==================================================");
    console.log("🎉 Migration Completed!\n");
    console.log("✓ Landing page config added as 'page_home'");
    console.log("✓ Portfolio collection added for hero banner");
    console.log("\n💡 Next: Run generate-cached-configs-with-auth.js");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    if (db) {
      db.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

migrateLandingPage().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
