/**
 * Batch formatting tool to format all files using npm run format.
 * This script uses npm run format internally instead of calling prettier directly,
 * as prettier is installed via npm and may not be available in PATH.
 */

import { execSync } from "node:child_process";

/**
 * Format all files using the npm format script.
 */
function formatAll() {
  try {
    console.log("Running npm run format...");
    execSync("npm run format", { stdio: "inherit" });
    console.log("Formatting complete.");
  } catch (error) {
    console.error("Formatting failed:", error);
    process.exit(1);
  }
}

formatAll();
