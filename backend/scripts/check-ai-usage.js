import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({
  path: new URL("../.env", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
});

const conn = await mongoose.connect(
  "mongodb://localhost:27017/coding-challenge-platform",
);
const docs = await conn.connection.db.listCollections().toArray();
console.log(docs.map((d) => d.name).join("\n"));
await mongoose.disconnect();
