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
 * Setup VerificationCode schema
 * Stores temporary verification codes for email verification
 */
async function setupVerificationCodeSchema() {
  const db = new ODatabase(dbConfig);

  try {
    console.log("📦 Connecting to OrientDB...");
    await db.open();
    console.log("✅ Connected successfully\n");

    console.log("🔨 Creating VerificationCode class...\n");

    // Create VerificationCode class
    try {
      await db.query("CREATE CLASS VerificationCode EXTENDS V");
      console.log("  ✓ Created VerificationCode class");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  VerificationCode already exists");
      } else {
        throw error;
      }
    }

    // Create properties
    const properties = [
      { name: "email", type: "STRING" },
      { name: "code", type: "STRING" },
      { name: "expiresAt", type: "DATETIME" },
      { name: "used", type: "BOOLEAN" },
      { name: "createdAt", type: "DATETIME" },
    ];

    for (const prop of properties) {
      try {
        await db.query(
          `CREATE PROPERTY VerificationCode.${prop.name} ${prop.type}`
        );
      } catch (error) {
        if (!error.message.includes("already exists")) {
          console.log(`  ⚠️  Warning: VerificationCode.${prop.name}`);
        }
      }
    }

    console.log("  ✓ Properties created\n");

    // Create indexes
    console.log("📊 Creating indexes...");
    
    // Index on email for fast lookup
    try {
      await db.query(
        "CREATE INDEX VerificationCode.email ON VerificationCode (email) NOTUNIQUE"
      );
      console.log("  ✓ Created index on VerificationCode.email");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  Index VerificationCode.email already exists");
      } else {
        console.log("  ⚠️  Warning: Could not create index on email");
      }
    }

    // Composite index on email and code for verification
    try {
      await db.query(
        "CREATE INDEX VerificationCode.email_code ON VerificationCode (email, code) NOTUNIQUE"
      );
      console.log("  ✓ Created composite index on VerificationCode.email_code");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ⏭️  Index VerificationCode.email_code already exists");
      } else {
        console.log("  ⚠️  Warning: Could not create composite index");
      }
    }

    console.log("\n✅ VerificationCode schema setup complete!\n");
  } catch (error) {
    console.error("❌ Error setting up VerificationCode schema:", error.message);
    throw error;
  } finally {
    await db.close();
    console.log("👋 Database connection closed");
  }
}

setupVerificationCodeSchema();
