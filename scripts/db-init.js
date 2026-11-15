// Creates the database, its collections and indexes. Safe to run more than once.
// Usage: npm run db:init   (reads MONGODB_URI and MONGODB_DB from .env)
import { connectDb } from "../server/db.js";

const dbName = process.env.MONGODB_DB || "longlost_captain";
const { client, db } = await connectDb({ uri: process.env.MONGODB_URI, dbName, poolSize: 2 });
const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).sort();
const idx = (await db.collection("players").indexes()).map(i => i.name);
console.log(JSON.stringify({ database: dbName, collections: cols, playerIndexes: idx }, null, 2));
await client.close();
