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

// Helper function to create class
async function createClass(className, superClass = null) {
  try {
    const exists = await db.class.list();
    if (exists.some((c) => c.name === className)) {
      console.log(`✓ Class ${className} already exists, skipping...`);
      return false;
    }

    await db.class.create(className, superClass);
    console.log(`✓ Created class: ${className}`);
    return true;
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log(`✓ Class ${className} already exists`);
      return false;
    }
    throw error;
  }
}

// Helper function to create property
async function createProperty(
  className,
  propertyName,
  propertyType,
  options = {}
) {
  try {
    const classObj = await db.class.get(className);
    await classObj.property.create({
      name: propertyName,
      type: propertyType,
      ...options,
    });
    console.log(`  ✓ Added property: ${propertyName} (${propertyType})`);
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log(`  ✓ Property ${propertyName} already exists`);
    } else {
      throw error;
    }
  }
}

async function setupAdminSchema() {
  console.log("🔐 Setting up Admin Authentication schema...\n");

  try {
    await db.open();

    // Create AdminUser class
    console.log("Creating AdminUser class...");
    await createClass("AdminUser", "V");

    // Add properties to AdminUser
    await createProperty("AdminUser", "username", "String", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("AdminUser", "email", "String", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("AdminUser", "passwordHash", "String", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("AdminUser", "firstName", "String");
    await createProperty("AdminUser", "lastName", "String");
    await createProperty("AdminUser", "isActive", "Boolean", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("AdminUser", "createdAt", "DateTime", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("AdminUser", "lastLoginAt", "DateTime");

    // Create unique index on username
    try {
      await db.index.create({
        name: "AdminUser.username",
        type: "unique",
        class: "AdminUser",
        properties: ["username"],
      });
      console.log("  ✓ Created unique index on username");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ✓ Index on username already exists");
      } else {
        throw error;
      }
    }

    // Create unique index on email
    try {
      await db.index.create({
        name: "AdminUser.email",
        type: "unique",
        class: "AdminUser",
        properties: ["email"],
      });
      console.log("  ✓ Created unique index on email");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ✓ Index on email already exists");
      } else {
        throw error;
      }
    }

    // Create RefreshToken class
    console.log("\nCreating RefreshToken class...");
    await createClass("RefreshToken", "V");

    // Add properties to RefreshToken
    await createProperty("RefreshToken", "token", "String", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("RefreshToken", "userId", "String", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("RefreshToken", "expiresAt", "DateTime", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("RefreshToken", "createdAt", "DateTime", {
      mandatory: true,
      notNull: true,
    });
    await createProperty("RefreshToken", "userAgent", "String");
    await createProperty("RefreshToken", "ipAddress", "String");
    await createProperty("RefreshToken", "isRevoked", "Boolean", {
      mandatory: true,
      notNull: true,
    });

    // Create index on token
    try {
      await db.index.create({
        name: "RefreshToken.token",
        type: "unique",
        class: "RefreshToken",
        properties: ["token"],
      });
      console.log("  ✓ Created unique index on token");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ✓ Index on token already exists");
      } else {
        throw error;
      }
    }

    // Create index on userId
    try {
      await db.index.create({
        name: "RefreshToken.userId",
        type: "notunique",
        class: "RefreshToken",
        properties: ["userId"],
      });
      console.log("  ✓ Created index on userId");
    } catch (error) {
      if (error.message.includes("already exists")) {
        console.log("  ✓ Index on userId already exists");
      } else {
        throw error;
      }
    }

    console.log("\n✅ Admin schema setup complete!");
    console.log("\nNext steps:");
    console.log(
      "1. Run: node database/seed-admin.js (to create default admin user)"
    );
    console.log("2. Admin credentials will be: admin / ChangeMe123!");
  } catch (error) {
    console.error("❌ Error setting up admin schema:", error);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

setupAdminSchema();
