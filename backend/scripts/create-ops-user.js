const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const User = require("../models/User");

function getOptions(args = [], environment = process.env) {
    const options = {
        email: environment.OPS_EMAIL,
        password: environment.OPS_PASSWORD,
        name: environment.OPS_NAME
    };

    for (let index = 0; index < args.length; index += 1) {
        const key = args[index];
        if (!["--email", "--password", "--name"].includes(key) || !args[index + 1]) {
            throw new Error("Usage: npm run create-ops -- --email <email> --password <password> --name <name>");
        }
        options[key.slice(2)] = args[index + 1];
        index += 1;
    }

    const email = typeof options.email === "string" ? options.email.trim().toLowerCase() : "";
    const password = options.password;
    const name = typeof options.name === "string" ? options.name.trim() : "";
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== "string" || password.length < 8 || password.length > 128 ||
        !/[a-z]/i.test(password) || !/\d/.test(password)) {
        throw new Error("Provide OPS_NAME, a valid OPS_EMAIL, and an OPS_PASSWORD with at least 8 characters, one letter, and one number.");
    }
    return { email, password, name };
}

async function createOpsUser({ email, password, name }, UserModel = User) {
    const existing = await UserModel.findOne({ email });
    if (existing) throw new Error("An account with that email already exists.");
    const hashedPassword = await bcrypt.hash(password, 10);
    return UserModel.create({ id: randomUUID(), name, email, password: hashedPassword, role: "operations" });
}

async function main() {
    try {
        require("dotenv").config();
        const options = getOptions(process.argv.slice(2));
        if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
        await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME || undefined });
        await createOpsUser(options);
        console.log("Operations user created successfully.");
    } catch (error) {
        console.error(error.message || "Could not create operations user.");
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState) await mongoose.disconnect();
    }
}

if (require.main === module) main();

module.exports = { createOpsUser, getOptions };
