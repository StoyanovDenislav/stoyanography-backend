const OrientDB = require("orientjs");
const bcrypt = require("bcrypt");
const readline = require("readline");
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function listAdmins() {
  const users = await db.query("SELECT FROM AdminUser ORDER BY createdAt");

  if (users.length === 0) {
    console.log("\n⚠️  No admin users found.\n");
    return [];
  }

  console.log(`\nFound ${users.length} admin user(s):\n`);
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
    }
  });

  console.log("\n" + "─".repeat(80) + "\n");
  return users;
}

async function createAdmin() {
  console.log("\n📝 Create New Admin User\n");

  const username = await question("Username: ");
  const email = await question("Email: ");
  const firstName = await question("First Name: ");
  const lastName = await question("Last Name: ");
  const password = await question("Password (min 8 chars): ");

  if (password.length < 8) {
    console.log("\n❌ Password must be at least 8 characters!");
    return;
  }

  // Check if username exists
  const existing = await db.query(
    "SELECT FROM AdminUser WHERE username = :username",
    { params: { username } }
  );

  if (existing.length > 0) {
    console.log(`\n❌ Username '${username}' already exists!`);
    return;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  await db
    .insert()
    .into("AdminUser")
    .set({
      username,
      email,
      passwordHash,
      firstName,
      lastName,
      isActive: true,
      createdAt: new Date().toISOString().replace("T", " ").substring(0, 19),
      lastLoginAt: null,
    })
    .one();

  console.log(`\n✅ Admin user '${username}' created successfully!`);
}

async function deleteAdmin() {
  const users = await listAdmins();

  if (users.length === 0) {
    return;
  }

  const username = await question("Enter username to delete (or 'cancel'): ");

  if (username.toLowerCase() === "cancel") {
    console.log("\n❌ Operation cancelled.");
    return;
  }

  const confirm = await question(
    `⚠️  Are you sure you want to delete '${username}'? (yes/no): `
  );

  if (confirm.toLowerCase() !== "yes") {
    console.log("\n❌ Operation cancelled.");
    return;
  }

  const result = await db.query(
    "DELETE VERTEX AdminUser WHERE username = :username",
    { params: { username } }
  );

  if (result > 0) {
    console.log(`\n✅ Admin user '${username}' deleted successfully!`);
  } else {
    console.log(`\n❌ User '${username}' not found.`);
  }
}

async function resetPassword() {
  const users = await listAdmins();

  if (users.length === 0) {
    return;
  }

  const username = await question(
    "Enter username to reset password (or 'cancel'): "
  );

  if (username.toLowerCase() === "cancel") {
    console.log("\n❌ Operation cancelled.");
    return;
  }

  // Check if user exists
  const existing = await db.query(
    "SELECT FROM AdminUser WHERE username = :username",
    { params: { username } }
  );

  if (existing.length === 0) {
    console.log(`\n❌ User '${username}' not found.`);
    return;
  }

  const newPassword = await question("New password (min 8 chars): ");

  if (newPassword.length < 8) {
    console.log("\n❌ Password must be at least 8 characters!");
    return;
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update password
  await db.query(
    "UPDATE AdminUser SET passwordHash = :passwordHash WHERE username = :username",
    { params: { passwordHash, username } }
  );

  console.log(`\n✅ Password for '${username}' has been reset!`);
}

async function toggleActive() {
  const users = await listAdmins();

  if (users.length === 0) {
    return;
  }

  const username = await question(
    "Enter username to toggle active status (or 'cancel'): "
  );

  if (username.toLowerCase() === "cancel") {
    console.log("\n❌ Operation cancelled.");
    return;
  }

  // Get user
  const existing = await db.query(
    "SELECT FROM AdminUser WHERE username = :username",
    { params: { username } }
  );

  if (existing.length === 0) {
    console.log(`\n❌ User '${username}' not found.`);
    return;
  }

  const user = existing[0];
  const newStatus = !user.isActive;

  // Update status
  await db.query(
    "UPDATE AdminUser SET isActive = :isActive WHERE username = :username",
    { params: { isActive: newStatus, username } }
  );

  console.log(
    `\n✅ User '${username}' is now ${newStatus ? "ACTIVE" : "INACTIVE"}!`
  );
}

async function mainMenu() {
  console.clear();
  console.log("╔═══════════════════════════════════════╗");
  console.log("║   ADMIN USER MANAGEMENT SYSTEM        ║");
  console.log("╚═══════════════════════════════════════╝\n");

  console.log("1. List all admin users");
  console.log("2. Create new admin user");
  console.log("3. Delete admin user");
  console.log("4. Reset admin password");
  console.log("5. Toggle user active status");
  console.log("6. Exit\n");

  const choice = await question("Select an option (1-6): ");

  try {
    await db.open();

    switch (choice) {
      case "1":
        await listAdmins();
        break;
      case "2":
        await createAdmin();
        break;
      case "3":
        await deleteAdmin();
        break;
      case "4":
        await resetPassword();
        break;
      case "5":
        await toggleActive();
        break;
      case "6":
        console.log("\n👋 Goodbye!\n");
        rl.close();
        await db.close();
        process.exit(0);
        return;
      default:
        console.log("\n❌ Invalid option!");
    }

    await db.close();

    // Wait for user to press enter
    await question("\nPress Enter to continue...");
    mainMenu();
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    await db.close();
    await question("\nPress Enter to continue...");
    mainMenu();
  }
}

// Start the menu
mainMenu();
