const database = process.env.PG_MEM_TEST === "1"
  ? await import("./adapters/postgres-database.js")
  : await import("./adapters/mysql-database.js");

export const { db } = database;
