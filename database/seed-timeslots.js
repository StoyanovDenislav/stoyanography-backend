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

/**
 * Generate time slots for the next 3 months
 * Default working hours: Monday-Friday 9:00 AM - 6:00 PM, Saturday 10:00 AM - 4:00 PM
 */
async function seedTimeSlots() {
  try {
    console.log("Seeding time slots...");

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);

    let slotsCreated = 0;
    const batchSize = 100;
    let batch = [];

    // Iterate through each day
    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

      // Skip Sundays
      if (dayOfWeek === 0) continue;

      const dateStr = date.toISOString().split("T")[0];

      // Define working hours
      let startHour, endHour;
      if (dayOfWeek === 6) {
        // Saturday
        startHour = 10;
        endHour = 16;
      } else {
        // Monday-Friday
        startHour = 9;
        endHour = 18;
      }

      // Create slots every 30 minutes
      for (let hour = startHour; hour < endHour; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const startTime = `${String(hour).padStart(2, "0")}:${String(
            minute
          ).padStart(2, "0")}`;
          let endMinute = minute + 30;
          let endHour = hour;

          if (endMinute >= 60) {
            endMinute = 0;
            endHour++;
          }

          const endTime = `${String(endHour).padStart(2, "0")}:${String(
            endMinute
          ).padStart(2, "0")}`;

          batch.push({
            date: dateStr,
            startTime,
            endTime,
            isBooked: false,
            createdAt: new Date(),
          });

          if (batch.length >= batchSize) {
            // Insert batch
            for (const slot of batch) {
              try {
                await db.insert().into("TimeSlot").set(slot).one();
                slotsCreated++;
              } catch (error) {
                // Ignore duplicates
                if (!error.message.includes("duplicate")) {
                  console.error(`Error inserting slot: ${error.message}`);
                }
              }
            }
            console.log(`  → Created ${slotsCreated} slots so far...`);
            batch = [];
          }
        }
      }
    }

    // Insert remaining slots
    if (batch.length > 0) {
      for (const slot of batch) {
        try {
          await db.insert().into("TimeSlot").set(slot).one();
          slotsCreated++;
        } catch (error) {
          // Ignore duplicates
          if (!error.message.includes("duplicate")) {
            console.error(`Error inserting slot: ${error.message}`);
          }
        }
      }
    }

    console.log(`\nSuccessfully created ${slotsCreated} time slots!`);
    console.log(
      `Coverage: ${startDate.toISOString().split("T")[0]} to ${
        endDate.toISOString().split("T")[0]
      }`
    );
    process.exit(0);
  } catch (error) {
    console.error("Error seeding time slots:", error);
    process.exit(1);
  }
}

// Run the seeder
seedTimeSlots();
