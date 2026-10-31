const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const databaseName =
            process.env.MONGO_DB_NAME ||
            "logisticsDB";

        const mongoUri =
            process.env.MONGO_URI ||
            `mongodb://127.0.0.1:27017/${encodeURIComponent(databaseName)}`;

        await mongoose.connect(mongoUri, {
            dbName: databaseName
        });

        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
