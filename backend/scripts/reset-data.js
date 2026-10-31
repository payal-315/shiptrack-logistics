const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const OPERATIONS_ROLES = ["operations", "OPERATIONS", "admin", "ADMIN"];
const userDeleteFilter = { role: { $nin: OPERATIONS_ROLES } };
const isOperationsUser = (user) => OPERATIONS_ROLES.includes(user.role);
const isRelatedCollection = (name) => /(shipment|tracking|checkpoint|route|delivery|location|event|password.?reset)/i.test(name);

const buildResetPlan = (collectionNames) => collectionNames
    .filter((name) => name !== "system.profile" && (name === "users" || name === "drivers" || name === "shipments" || name === "trackingevents" || name === "passwordresets" || isRelatedCollection(name)))
    .map((name) => ({ name, filter: name === "users" ? userDeleteFilter : {} }));

const parseOptions = (args, environment) => ({
    confirm: args.includes("--confirm"),
    forceProduction: args.includes("--force-production"),
    productionBlocked: environment.NODE_ENV === "production" && !args.includes("--force-production")
});

async function runReset({ args = process.argv.slice(2), environment = process.env, connection = mongoose.connection } = {}) {
    const options = parseOptions(args, environment);
    if (options.productionBlocked) throw new Error("Refusing to run in production without --force-production.");
    if (!environment.MONGO_URI) throw new Error("MONGO_URI is required.");
    if (connection.readyState !== 1) {
        await mongoose.connect(environment.MONGO_URI, { dbName: environment.MONGO_DB_NAME || undefined });
    }
    const db = connection.db;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
    const plan = buildResetPlan(names);
    const before = {};
    for (const item of plan) before[item.name] = await db.collection(item.name).countDocuments(item.filter);
    console.log(options.confirm ? "Reset plan (confirmed):" : "Dry run only. Pass --confirm to export backups and delete:");
    for (const item of plan) console.log(`  ${item.name}: ${before[item.name]} document(s) would be deleted`);
    if (!options.confirm) return { dryRun: true, plan, before };

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.resolve(__dirname, "..", "backups", `reset-${timestamp}`);
    await fs.mkdir(backupDir, { recursive: true });
    for (const item of plan) {
        const records = await db.collection(item.name).find(item.filter).toArray();
        await fs.writeFile(path.join(backupDir, `${item.name}.json`), JSON.stringify(records, null, 2), "utf8");
    }
    const deleted = {};
    for (const item of plan) {
        const result = await db.collection(item.name).deleteMany(item.filter);
        deleted[item.name] = result.deletedCount;
    }
    const after = {};
    for (const item of plan) after[item.name] = await db.collection(item.name).countDocuments();
    console.log(`Backup written to ${backupDir}`);
    console.log("Counts (before → after):");
    for (const item of plan) console.log(`  ${item.name}: ${before[item.name]} → ${after[item.name]} (deleted ${deleted[item.name]})`);
    return { dryRun: false, backupDir, plan, before, after, deleted };
}

if (require.main === module) {
    runReset().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    }).finally(async () => {
        if (mongoose.connection.readyState) await mongoose.disconnect();
    });
}

module.exports = { buildResetPlan, isOperationsUser, parseOptions, runReset, userDeleteFilter };
