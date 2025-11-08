const OrientDB = require("orientjs");
const bcrypt = require("bcrypt");
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

async function seedAdminUser() {
  console.log("🔐 Seeding default admin user...\n");

  try {
    await db.open();

    // Check if admin already exists
    const existing = await db.query("SELECT FROM AdminUser WHERE username = 'admin'");
    if (existing.length > 0) {
      console.log("⚠️  Admin user already exists. Skipping...");
      console.log("   If you want to reset the password, delete the user first.");
      process.exit(0);
    }

    // Hash the default password
    const defaultPassword = "ChangeMe123!";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // Create admin user
    const result = await db.insert()
      .into("AdminUser")
      .set({
        username: "admin",
        email: "admin@stoyanography.com",
        passwordHash: passwordHash,
        firstName: "System",
        lastName: "Administrator",
        isActive: true,
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        lastLoginAt: null
      })
      .one();

    console.log("✅ Default admin user created successfully!");
    console.log("\n📋 Default Credentials:");
    console.log("   Username: admin");
    console.log("   Password: ChangeMe123!");
    console.log("\n⚠️  IMPORTANT: Change this password immediately after first login!");

  } catch (error) {
    console.error("❌ Error seeding admin user:", error);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

seedAdminUser();
