import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://arayeshgar:arayeshgar@localhost:5432/arayeshgar",
  },
  strict: true,
  verbose: true,
});
