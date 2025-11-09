const OrientDB = require("orientjs");
require("dotenv").config();

const server = OrientDB({
  host: process.env.HOST || "localhost",
  port: parseInt(process.env.PORT) || 2424,
  username: process.env.DBADMIN || "root",
  password: process.env.DBPASSWORD || "root",
  useToken: true,
});

const db = server.use({
  name: process.env.DBNAME || "stoyanography",
  username: process.env.DBADMIN || "root",
  password: process.env.DBPASSWORD || "root",
  useToken: true,
});

// Pricing sections for each service
const pricingSections = {
  page_portrait: {
    type: "pricing",
    enabled: true,
    translationsKey: "PortraitPhotography.Pricing",
    styles: {
      container: "w-full gap-6 grid p-4 bg-transparent",
      gridContainer:
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mx-auto max-w-7xl",
      card: "p-6 bg-sg-navy-600 border-2 border-sg-orange-800 rounded-xl shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-sg-orange-800/50 flex flex-col",
      title: "text-2xl font-bold text-sg-orange-800 mb-4 text-center",
      price: "text-4xl font-bold text-sg-white mb-2 text-center",
      duration: "text-lg text-gray-300 mb-4 text-center",
      description: "text-gray-200 mb-6 flex-grow",
      features: "space-y-2 mb-6",
      feature: "flex items-start gap-2 text-gray-200",
      featureIcon: "text-sg-orange-800 mt-1",
      button:
        "w-full py-3 bg-gradient-to-r from-sg-orange-800 to-sg-orange-200 text-white font-bold rounded-lg hover:opacity-90 transition-opacity",
    },
    packages: [
      {
        id: "portrait-basic",
        titleKey: "Packages.Basic.title",
        title: "Basic Portrait Session",
        descriptionKey: "Packages.Basic.description",
        description: "Perfect for individual portraits and headshots",
        price: 150,
        currency: "EUR",
        duration: 60,
        featuresKey: "Packages.Basic.features",
        features: [
          "1 hour photoshoot",
          "1 location",
          "1 outfit change",
          "15 edited photos",
          "Online gallery",
        ],
      },
      {
        id: "portrait-standard",
        titleKey: "Packages.Standard.title",
        title: "Standard Portrait Session",
        descriptionKey: "Packages.Standard.description",
        description: "Great for couples or small family portraits",
        price: 250,
        currency: "EUR",
        duration: 90,
        featuresKey: "Packages.Standard.features",
        features: [
          "1.5 hour photoshoot",
          "2 locations",
          "2 outfit changes",
          "30 edited photos",
          "Online gallery",
          "Print-ready files",
        ],
        highlighted: true,
      },
      {
        id: "portrait-premium",
        titleKey: "Packages.Premium.title",
        title: "Premium Portrait Session",
        descriptionKey: "Packages.Premium.description",
        description:
          "Ultimate portrait experience with full creative direction",
        price: 400,
        currency: "EUR",
        duration: 120,
        featuresKey: "Packages.Premium.features",
        features: [
          "2 hour photoshoot",
          "3 locations",
          "Unlimited outfit changes",
          "50 edited photos",
          "Online gallery",
          "Print-ready files",
          "Professional styling consultation",
        ],
      },
    ],
  },
  page_prom: {
    type: "pricing",
    enabled: true,
    translationsKey: "PromPhotography.Pricing",
    styles: {
      container: "w-full gap-6 grid p-4 bg-transparent",
      gridContainer:
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mx-auto max-w-7xl",
      card: "p-6 bg-sg-navy-600 border-2 border-sg-orange-800 rounded-xl shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-sg-orange-800/50 flex flex-col",
      title: "text-2xl font-bold text-sg-orange-800 mb-4 text-center",
      price: "text-4xl font-bold text-sg-white mb-2 text-center",
      duration: "text-lg text-gray-300 mb-4 text-center",
      description: "text-gray-200 mb-6 flex-grow",
      features: "space-y-2 mb-6",
      feature: "flex items-start gap-2 text-gray-200",
      featureIcon: "text-sg-orange-800 mt-1",
      button:
        "w-full py-3 bg-gradient-to-r from-sg-orange-800 to-sg-orange-200 text-white font-bold rounded-lg hover:opacity-90 transition-opacity",
    },
    packages: [
      {
        id: "prom-solo",
        titleKey: "Packages.Solo.title",
        title: "Solo Prom Package",
        descriptionKey: "Packages.Solo.description",
        description: "Individual coverage for your special night",
        price: 100,
        currency: "EUR",
        duration: 60,
        featuresKey: "Packages.Solo.features",
        features: [
          "1 hour coverage",
          "Pre-prom portraits",
          "Arrival coverage",
          "20 edited photos",
          "Online gallery",
        ],
      },
      {
        id: "prom-group",
        titleKey: "Packages.Group.title",
        title: "Group Prom Package",
        descriptionKey: "Packages.Group.description",
        description: "Perfect for friend groups and couples",
        price: 180,
        currency: "EUR",
        duration: 90,
        featuresKey: "Packages.Group.features",
        features: [
          "1.5 hour coverage",
          "Pre-prom group portraits",
          "Arrival coverage",
          "Dance floor moments",
          "40 edited photos",
          "Online gallery",
          "Group discount for 4+ people",
        ],
        highlighted: true,
      },
      {
        id: "prom-full",
        titleKey: "Packages.Full.title",
        title: "Full Prom Experience",
        descriptionKey: "Packages.Full.description",
        description: "Complete coverage from prep to after-party",
        price: 300,
        currency: "EUR",
        duration: 180,
        featuresKey: "Packages.Full.features",
        features: [
          "3 hour coverage",
          "Getting ready moments",
          "Pre-prom portraits",
          "Arrival and grand entrance",
          "Dance floor coverage",
          "Candid moments throughout",
          "60 edited photos",
          "Online gallery",
          "Highlight video",
        ],
      },
    ],
  },
  page_business: {
    type: "pricing",
    enabled: true,
    translationsKey: "BusinessPhotography.Pricing",
    styles: {
      container: "w-full gap-6 grid p-4 bg-transparent",
      gridContainer:
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mx-auto max-w-7xl",
      card: "p-6 bg-sg-navy-600 border-2 border-sg-orange-800 rounded-xl shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-sg-orange-800/50 flex flex-col",
      title: "text-2xl font-bold text-sg-orange-800 mb-4 text-center",
      price: "text-4xl font-bold text-sg-white mb-2 text-center",
      duration: "text-lg text-gray-300 mb-4 text-center",
      description: "text-gray-200 mb-6 flex-grow",
      features: "space-y-2 mb-6",
      feature: "flex items-start gap-2 text-gray-200",
      featureIcon: "text-sg-orange-800 mt-1",
      button:
        "w-full py-3 bg-gradient-to-r from-sg-orange-800 to-sg-orange-200 text-white font-bold rounded-lg hover:opacity-90 transition-opacity",
    },
    packages: [
      {
        id: "business-headshot",
        titleKey: "Packages.Headshot.title",
        title: "Professional Headshots",
        descriptionKey: "Packages.Headshot.description",
        description:
          "Individual professional headshots for LinkedIn and corporate use",
        price: 120,
        currency: "EUR",
        duration: 30,
        featuresKey: "Packages.Headshot.features",
        features: [
          "30 minute session",
          "Studio or office location",
          "2 outfit options",
          "10 edited photos",
          "High-resolution files",
          "Online gallery",
        ],
      },
      {
        id: "business-team",
        titleKey: "Packages.Team.title",
        title: "Team Photography",
        descriptionKey: "Packages.Team.description",
        description: "Professional team photos and individual headshots",
        price: 350,
        currency: "EUR",
        duration: 90,
        featuresKey: "Packages.Team.features",
        features: [
          "1.5 hour session",
          "Up to 10 team members",
          "Group shots and individuals",
          "On-location at your office",
          "50 edited photos",
          "High-resolution files",
          "Online gallery",
          "Rush delivery available",
        ],
        highlighted: true,
      },
      {
        id: "business-corporate",
        titleKey: "Packages.Corporate.title",
        title: "Corporate Event Coverage",
        descriptionKey: "Packages.Corporate.description",
        description:
          "Full event coverage for conferences, meetings, and corporate events",
        price: 600,
        currency: "EUR",
        duration: 240,
        featuresKey: "Packages.Corporate.features",
        features: [
          "4 hour coverage",
          "Conference and event photography",
          "Candid and staged shots",
          "Speaker and presentation coverage",
          "Networking moments",
          "100 edited photos",
          "High-resolution files",
          "Online gallery",
          "Same-day highlight reel",
        ],
      },
    ],
  },
};

async function addPricingSections() {
  try {
    console.log("Adding pricing sections to service configs...\n");

    for (const [pageKey, pricingSection] of Object.entries(pricingSections)) {
      console.log(`Processing ${pageKey}...`);

      // Fetch the existing config
      const result = await db.query(
        `SELECT FROM CMSConfig WHERE configKey = '${pageKey}'`
      );

      if (!result || result.length === 0) {
        console.log(`  ⚠️  ${pageKey} not found, skipping`);
        continue;
      }

      const config = result[0];
      const data = JSON.parse(config.configData);

      // Check if pricing section already exists
      const hasPricing = data.sections.some((s) => s.type === "pricing");

      if (hasPricing) {
        console.log(`  ℹ️  Pricing section already exists, updating...`);
        // Update existing pricing section
        const pricingIndex = data.sections.findIndex(
          (s) => s.type === "pricing"
        );
        data.sections[pricingIndex] = pricingSection;
      } else {
        console.log(`  ➕ Adding new pricing section...`);
        // Add pricing section (insert after accordion/paragraphs, before portfolio)
        const portfolioIndex = data.sections.findIndex(
          (s) => s.type === "portfolio"
        );
        if (portfolioIndex !== -1) {
          data.sections.splice(portfolioIndex, 0, pricingSection);
        } else {
          data.sections.push(pricingSection);
        }
      }

      // Update the config in the database
      await db
        .update(config["@rid"])
        .set({
          configData: JSON.stringify(data),
          updatedAt: new Date(),
        })
        .one();

      console.log(`  ✓ Updated ${pageKey}\n`);
    }

    console.log(
      "\n✅ Successfully added pricing sections to all service configs!"
    );
    console.log(
      "\n🔄 Now run: node database/generate-cached-configs-with-auth.js"
    );
    console.log("   to regenerate the cached configs with pricing sections.");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding pricing sections:", error);
    process.exit(1);
  }
}

addPricingSections();
