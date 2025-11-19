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

async function listAdminUsers() {
  console.log("👥 Listing all admin users...\n");

  try {
    await db.open();

    // Get all admin users
    const users = await db.query("SELECT FROM AdminUser ORDER BY createdAt");

    if (users.length === 0) {
      console.log("⚠️  No admin users found.");
      console.log("\n💡 To create an admin user, run:");
      console.log("   node database/seed-admin.js");
      process.exit(0);
    }

    console.log(`Found ${users.length} admin user(s):\n`);
    console.log("─".repeat(80));

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. Username: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Active: ${user.isActive ? "✅ Yes" : "❌ No"}`);
      console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
      if (user.lastLoginAt) {
        console.log(
          `   Last Login: ${new Date(user.lastLoginAt).toLocaleString()}`
        );
      } else {
        console.log(`   Last Login: Never`);
      }
      console.log(`   ID: ${user["@rid"]}`);
    });

    console.log("\n" + "─".repeat(80));
    console.log("\n💡 To drop a user, run:");
    console.log("   node database/drop-admin.js <username>");
  } catch (error) {
    console.error("❌ Error listing admin users:", error);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

listAdminUsers();
