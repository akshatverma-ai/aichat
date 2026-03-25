import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables - try multiple approaches
try {
  // Try standard dotenv first
  dotenv.config();
} catch {
  // Fallback: manually parse .env file
  try {
    const envPath = join(process.cwd(), ".env");
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...values] = line.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    });
    console.log("Loaded .env from:", envPath);
  } catch (error) {
    console.log('Could not load .env file');
  }
}

console.log("DATABASE_URL:", process.env.DATABASE_URL);
