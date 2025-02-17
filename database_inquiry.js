const ODatabase = require("orientjs").ODatabase;
require("dotenv").config();

class DatabaseConnection {
  constructor() {
    if (DatabaseConnection.instance) {
      return DatabaseConnection.instance;
    }

    this.dbConfig = {
      host: process.env.HOST,
      port: process.env.PORT,
      username: process.env.DBADMIN,
      password: process.env.DBPASSWORD,
      name: process.env.DBNAME,
      useToken: true,
      pool: {
        max: 10,
        min: 1,
        acquire: 30000,
        idle: 10000,
      },
    };

    this.db = null;
    this.connect();
    DatabaseConnection.instance = this;
  }

  async connect() {
    try {
      this.db = new ODatabase(this.dbConfig);
      console.log("Database connected successfully:", this.db.name);
    } catch (error) {
      console.error("Database connection failed:", error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.db) {
      await this.db.close();
      console.log("Database connection closed.");
    }
  }

  getConnection() {
    return this.db;
  }
}

const dbInstance = new DatabaseConnection();

process.on("SIGINT", async () => {
  try {
    await dbInstance.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error closing database:", err);
    process.exit(1);
  }
});

module.exports = dbInstance.getConnection();
