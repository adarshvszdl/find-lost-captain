import { MongoClient } from "mongodb";

export async function connectDb({ uri, dbName, poolSize = 40 }) {
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri, {
    appName: "captain-voyage",
    maxPoolSize: poolSize,
    minPoolSize: 2,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(dbName || "longlost_captain");
  await ensureSchema(db);
  return { client, db, games: db.collection("games"), players: db.collection("players") };
}

// Idempotent: safe to run on every start. Creates the collections and indexes the game needs.
export async function ensureSchema(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  for (const name of ["games", "players"]) if (!existing.has(name)) await db.createCollection(name);
  await db.collection("players").createIndex({ gameId: 1, joinedAt: 1 }, { name: "by_game_joined" });
}
