#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// Steps to run in development mode:
// 1. Set the desired port in the environment variable: PORT=3001
// 2. deno run --allow-net --allow-env --allow-read --watch scripts/deno-ui.js

/**
 * Steps to create a standalone executable for Linux:
 * 
 * 1. Install Deno if not already installed:
 *    curl -fsSL https://deno.land/x/install/install.sh | sh
 * 
 * 2. Make the script executable:
 *    chmod +x deno-ui.js
 * 
 * 3. Compile to standalone executable:
 *    deno compile --allow-net --allow-env --allow-read --target x86_64-unknown-linux-gnu --output csv-to-rag-ui deno-ui.js
 * 
 * 4. (Optional) Move to system bin for global access:
 *    sudo mv csv-to-rag-ui /usr/local/bin/
 * 
 * The executable will be created as 'csv-to-rag-ui' and can be run directly:
 * ./csv-to-rag-ui
 */

// Import required Deno modules
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { template } from "./deno-ui/ui.js";

// Get port from environment variable or use default 3001
const port = parseInt(Deno.env.get("PORT") || "3001");

// Handle incoming requests
async function handler(req) {
  const url = new URL(req.url);
  
  if (url.pathname === "/") {
    return new Response(template, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Serve static files
  if (url.pathname === "/static/app.js") {
    try {
      const fileContent = await Deno.readFile(new URL("./deno-ui/app.js", import.meta.url));
      return new Response(fileContent, {
        headers: { "content-type": "application/javascript" },
      });
    } catch (error) {
      console.error("Error serving app.js:", error);
      return new Response("File not found", { status: 404 });
    }
  }

  return new Response("Not Found", { status: 404 });
}

// Start the server
console.log(`UI Server running at http://localhost:${port}`);
await serve(handler, { port });
