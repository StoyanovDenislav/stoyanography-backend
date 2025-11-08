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

const services = [
  {
    name: "Business Photography",
    description:
      "Professional business photography for corporate portraits, headshots, and product photography. Perfect for executives, entrepreneurs, and corporate teams.",
    duration: 60,
    price: 150.0,
    currency: "EUR",
    color: "#3B82F6",
    isActive: true,
  },
  {
    name: "Prom Photography",
    description:
      "Capture your special prom night with stunning photos. Full coverage of your prom experience including preparation, arrival, and dance floor moments.",
    duration: 90,
    price: 120.0,
    currency: "EUR",
    color: "#EC4899",
    isActive: true,
  },
  {
    name: "Consultation",
    description:
      "Initial consultation to discuss your photography needs, review portfolio, and plan your upcoming photo session. Great for understanding what to expect.",
    duration: 30,
    price: 0.0,
    currency: "EUR",
    color: "#10B981",
    isActive: true,
  },
  {
    name: "Portrait Photography",
    description:
      "Professional portrait photography for individuals and families. Includes wardrobe changes, multiple locations, and creative poses to capture your personality.",
    duration: 75,
    price: 180.0,
    currency: "EUR",
    color: "#F59E0B",
    isActive: true,
  },
];

async function seedServices() {
  try {
    console.log("Seeding services...");

    // Clear existing services first (optional)
    await db.query("DELETE FROM BookingService");
    console.log("Cleared existing services");

    // Insert services
    for (const service of services) {
      await db
        .insert()
        .into("BookingService")
        .set({
          name: service.name,
          description: service.description,
          duration: service.duration,
          price: service.price,
          currency: service.currency,
          color: service.color,
          isActive: service.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .one();

      console.log(`✓ Created service: ${service.name}`);
    }

    console.log("\nSuccessfully seeded all services!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding services:", error);
    process.exit(1);
  }
}

// Run the seeder
seedServices();
