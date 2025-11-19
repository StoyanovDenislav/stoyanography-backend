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

async function setupBookingSchema() {
  const db = new ODatabase(dbConfig);

  try {
    console.log("📦 Connecting to OrientDB...");
    await db.open();
    console.log("✅ Connected successfully\n");

    // Helper function to safely create class
    const createClass = async (className, extendsType = "V") => {
      try {
        await db.query(`CREATE CLASS ${className} EXTENDS ${extendsType}`);
        console.log(`  ✓ Created ${className} class`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`  ⏭️  ${className} already exists`);
        } else {
          throw error;
        }
      }
    };

    // Helper function to safely create property
    const createProperty = async (className, propertyName, propertyType) => {
      try {
        await db.query(
          `CREATE PROPERTY ${className}.${propertyName} ${propertyType}`
        );
      } catch (error) {
        if (!error.message.includes("already exists")) {
          console.log(`  ⚠️  Warning: ${className}.${propertyName}`);
        }
      }
    };

    console.log("🔨 Creating classes...\n");

    // TimeSlot class
    await createClass("TimeSlot");
    await createProperty("TimeSlot", "date", "STRING");
    await createProperty("TimeSlot", "startTime", "STRING");
    await createProperty("TimeSlot", "endTime", "STRING");
    await createProperty("TimeSlot", "isBooked", "BOOLEAN");
    await createProperty("TimeSlot", "createdAt", "DATETIME");

    // BookingService class
    await createClass("BookingService");
    await createProperty("BookingService", "name", "STRING");
    await createProperty("BookingService", "description", "STRING");
    await createProperty("BookingService", "duration", "INTEGER");
    await createProperty("BookingService", "price", "DOUBLE");
    await createProperty("BookingService", "currency", "STRING");
    await createProperty("BookingService", "isActive", "BOOLEAN");
    await createProperty("BookingService", "color", "STRING");
    await createProperty("BookingService", "createdAt", "DATETIME");
    await createProperty("BookingService", "updatedAt", "DATETIME");

    // Booking class
    await createClass("Booking");
    await createProperty("Booking", "bookingNumber", "STRING");
    await createProperty("Booking", "customerName", "STRING");
    await createProperty("Booking", "customerEmail", "STRING");
    await createProperty("Booking", "customerPhone", "STRING");
    await createProperty("Booking", "customerMessage", "STRING");
    await createProperty("Booking", "date", "STRING");
    await createProperty("Booking", "startTime", "STRING");
    await createProperty("Booking", "endTime", "STRING");
    await createProperty("Booking", "status", "STRING");
    await createProperty("Booking", "serviceId", "STRING");
    await createProperty("Booking", "serviceName", "STRING");
    await createProperty("Booking", "createdAt", "DATETIME");
    await createProperty("Booking", "updatedAt", "DATETIME");

    // BookingSettings class
    await createClass("BookingSettings");
    await createProperty("BookingSettings", "settingKey", "STRING");
    await createProperty("BookingSettings", "settingValue", "STRING");
    await createProperty("BookingSettings", "description", "STRING");

    console.log("\n✅ Classes created\n");

    // Create indexes for performance
    console.log("📊 Creating indexes...");
    const createIndex = async (
      className,
      propertyName,
      indexType = "NOTUNIQUE"
    ) => {
      const indexName = `${className}.${propertyName}`;
      try {
        await db.query(
          `CREATE INDEX ${indexName} ON ${className} (${propertyName}) ${indexType}`
        );
        console.log(`  ✓ Created index on ${indexName}`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`  ⏭️  Index ${indexName} already exists`);
        } else {
          console.log(`  ⚠️  Warning: Could not create index ${indexName}`);
        }
      }
    };

    // Booking indexes for fast queries
    await createIndex("Booking", "bookingNumber", "UNIQUE");
    await createIndex("Booking", "date", "NOTUNIQUE");
    await createIndex("Booking", "status", "NOTUNIQUE");
    await createIndex("Booking", "customerEmail", "NOTUNIQUE");

    // Composite index for date range queries
    try {
      await db.query(
        "CREATE INDEX Booking.date_status ON Booking (date, status) NOTUNIQUE"
      );
      console.log("  ✓ Created composite index on Booking.date_status");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  Composite index Booking.date_status already exists");
      }
    }

    // TimeSlot indexes
    await createIndex("TimeSlot", "date", "NOTUNIQUE");
    await createIndex("TimeSlot", "isBooked", "NOTUNIQUE");

    // Composite index for time slot queries
    try {
      await db.query(
        "CREATE INDEX TimeSlot.date_time ON TimeSlot (date, startTime) UNIQUE"
      );
      console.log("  ✓ Created composite index on TimeSlot.date_time");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  Composite index TimeSlot.date_time already exists");
      }
    }

    console.log("✅ Indexes created\n");

    // Insert default settings
    console.log("📝 Inserting default settings...");
    const existingSettings = await db.query(
      "SELECT count(*) as count FROM BookingSettings"
    );
    if (existingSettings[0].count === 0) {
      const settings = [
        {
          key: "workingHoursStart",
          value: "09:00",
          desc: "Start of working hours",
        },
        {
          key: "workingHoursEnd",
          value: "18:00",
          desc: "End of working hours",
        },
        { key: "workingDays", value: "[1,2,3,4,5]", desc: "Working days" },
        { key: "slotDuration", value: "30", desc: "Slot duration in minutes" },
        { key: "advanceBookingDays", value: "60", desc: "Max days in advance" },
        { key: "minAdvanceHours", value: "24", desc: "Min hours in advance" },
        { key: "autoConfirm", value: "false", desc: "Auto-confirm bookings" },
      ];

      for (const setting of settings) {
        await db.query(
          `INSERT INTO BookingSettings SET settingKey = '${setting.key}', settingValue = '${setting.value}', description = '${setting.desc}'`
        );
      }
      console.log("  ✓ Settings inserted");
    } else {
      console.log("  ⏭️  Settings already exist");
    }

    console.log("\n🎉 Booking schema setup completed successfully!");
  } catch (error) {
    console.error("\n❌ Error setting up booking schema:", error.message);
    throw error;
  } finally {
    await db.close();
    console.log("\n📪 Database connection closed");
  }
}

// Run the setup
if (require.main === module) {
  setupBookingSchema()
    .then(() => {
      console.log("\n✨ All done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Setup failed");
      process.exit(1);
    });
}

module.exports = setupBookingSchema;
