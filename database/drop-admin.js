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

async function dropAdminUser() {
  console.log("🗑️  Dropping admin user...\n");

  try {
    await db.open();

    // Get the username from command line args or default to 'admin'
    const username = process.argv[2] || "admin";

    // Check if admin user exists
    const existing = await db.query(
      "SELECT FROM AdminUser WHERE username = :username",
      {
        params: { username },
      }
    );

    if (existing.length === 0) {
      console.log(`⚠️  Admin user '${username}' not found.`);
      process.exit(0);
    }

    // Delete the admin user (using DELETE VERTEX for OrientDB graph database)
    await db.query("DELETE VERTEX AdminUser WHERE username = :username", {
      params: { username },
    });

    console.log(`✅ Admin user '${username}' has been deleted successfully!`);
    console.log("\n💡 To create a new admin user, run:");
    console.log("   node database/seed-admin.js");

  } catch (error) {
    console.error("❌ Error dropping admin user:", error);
    process.exit(1);
  } finally {
    await db.close();
    process.exit(0);
  }
}

// Show usage if --help is passed
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: node database/drop-admin.js [username]

Drop (delete) an admin user from the database.

Arguments:
  username    Username to delete (default: 'admin')

Examples:
  node database/drop-admin.js              # Drops user 'admin'
  node database/drop-admin.js john         # Drops user 'john'
  `);
  process.exit(0);
}

dropAdminUser();
