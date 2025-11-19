#!/usr/bin/env node

const ODatabase = require("orientjs").ODatabase;
require("dotenv").config();

const dbConfig = {
  host: process.env.HOST,
  port: parseInt(process.env.PORT),
  username: process.env.DBADMIN,
  password: process.env.DBPASSWORD,
  name: process.env.DBNAME,
  useToken: true,
};

/**
 * Setup DateAvailability schema
 * Allows setting custom working hours for specific dates
 */
async function setupDateAvailabilitySchema() {
  const db = new ODatabase(dbConfig);

  try {
    console.log("📦 Connecting to OrientDB...");
    await db.open();
    console.log("✅ Connected successfully\n");

    console.log("🔨 Creating DateAvailability class...\n");

    // Create DateAvailability class
    try {
      await db.query("CREATE CLASS DateAvailability EXTENDS V");
      console.log("  ✓ Created DateAvailability class");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  DateAvailability already exists");
      } else {
        throw error;
      }
    }

    // Create properties
    const properties = [
      { name: "date", type: "STRING" },
      { name: "isAvailable", type: "BOOLEAN" }, // false = fully unavailable (holiday, day off)
      { name: "customStartTime", type: "STRING" }, // Override default start time
      { name: "customEndTime", type: "STRING" }, // Override default end time
      { name: "notes", type: "STRING" }, // Admin notes (e.g., "Holiday", "Half day", etc.)
      { name: "createdAt", type: "DATETIME" },
      { name: "updatedAt", type: "DATETIME" },
    ];

    for (const prop of properties) {
      try {
        await db.query(
          `CREATE PROPERTY DateAvailability.${prop.name} ${prop.type}`
        );
      } catch (error) {
        if (!error.message.includes("already exists")) {
          console.log(`  ⚠️  Warning: DateAvailability.${prop.name}`);
        }
      }
    }

    console.log("  ✓ Properties created\n");

    // Create index on date (must be unique - one config per date)
    console.log("📊 Creating indexes...");
    try {
      await db.query(
        "CREATE INDEX DateAvailability.date ON DateAvailability (date) UNIQUE"
      );
      console.log("  ✓ Created unique index on DateAvailability.date");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  Index DateAvailability.date already exists");
      } else {
        console.log("  ⚠️  Warning: Could not create index on date");
      }
    }

    console.log("\n✅ DateAvailability schema setup completed successfully!");
    console.log("\nSchema structure:");
    console.log("  - date (STRING, unique) - e.g., '2025-12-25'");
    console.log("  - isAvailable (BOOLEAN) - false for holidays/days off");
    console.log("  - customStartTime (STRING) - e.g., '10:00' (optional)");
    console.log("  - customEndTime (STRING) - e.g., '14:00' (optional)");
    console.log("  - notes (STRING) - e.g., 'Christmas Day', 'Half day'");
    console.log("  - createdAt (DATETIME)");
    console.log("  - updatedAt (DATETIME)");
    console.log("\nUsage examples:");
    console.log("  • Mark December 25 as unavailable:");
    console.log(
      "    INSERT INTO DateAvailability SET date='2025-12-25', isAvailable=false, notes='Christmas Day'"
    );
    console.log("  • Set custom hours for December 24:");
    console.log(
      "    INSERT INTO DateAvailability SET date='2025-12-24', isAvailable=true, customStartTime='09:00', customEndTime='13:00', notes='Christmas Eve - Half day'"
    );
  } catch (error) {
    console.error("\n❌ Error setting up schema:", error.message);
    throw error;
  } finally {
    await db.close();
    console.log("\n📪 Database connection closed");
  }
}

// Run the setup
if (require.main === module) {
  setupDateAvailabilitySchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = setupDateAvailabilitySchema;
