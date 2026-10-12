const database = process.env.PG_MEM_TEST === "1"
  ? await import("./postgres-database.js")
  : await import("./mysql-database.js");

export const { db } = database;
