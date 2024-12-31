#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-run

// Steps to run in development mode:
// 1. Set the desired port in the environment variable: PORT=3001
// 2. deno run --allow-net --allow-env --allow-read --allow-run --watch scripts/deno-ui.js

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
 *    deno compile --allow-net --allow-env --allow-read --allow-run --target x86_64-unknown-linux-gnu --output csv-to-rag-ui deno-ui.js
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
import { join } from "https://deno.land/std@0.210.0/path/mod.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";

// Load environment variables from .env file
const env = config();

// Set Deno.env variables
Deno.env.set('UI_BACKEND_URL', env.UI_BACKEND_URL || 'http://localhost:3000');
Deno.env.set('UI_USERNAME', env.UI_USERNAME || 'admin');
Deno.env.set('UI_PASSWORD', env.UI_PASSWORD || 'admin');

console.log('Backend URL:', Deno.env.get('UI_BACKEND_URL'));

// Get port from environment variable or use default 3001
const port = parseInt(Deno.env.get('PORT') || "3001");

// Store backend process
let backendProcess = null;
let backendPid = null;

// Check if internal backend is available
async function checkBackendAvailable() {
  if (Deno.env.get("INTERNAL_BACKEND") === "0") {
    return false;
  }

  try {
    // Check if package.json exists and contains the dev script
    const packageJsonPath = join(Deno.cwd(), "package.json");
    try {
      const packageJson = JSON.parse(await Deno.readTextFile(packageJsonPath));
      return packageJson.scripts && packageJson.scripts.dev;
    } catch {
      return false;
    }
  } catch {
    return false;
  }

}

// Handle backend process management
async function startBackend() {
  if (backendProcess) {
    return { status: "error", message: "Backend is already running" };
  }

  try {
    const command = new Deno.Command("npm", {
      args: ["run", "dev"],
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped"
    });

    backendProcess = command.spawn();
    backendPid = backendProcess.pid;

    // Handle process output
    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of backendProcess.stdout) {
        console.log(decoder.decode(chunk));
      }
    })();

    (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of backendProcess.stderr) {
        console.error(decoder.decode(chunk));
      }
    })();

    // Wait a bit to check if process started successfully
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (backendPid) {
      return { status: "success", message: "Backend started successfully" };
    } else {
      backendProcess = null;
      backendPid = null;
      return { status: "error", message: "Failed to start backend" };
    }
  } catch (error) {
    backendProcess = null;
    backendPid = null;
    return { status: "error", message: `Error starting backend: ${error.message}` };
  }
}

async function stopBackend() {
  if (!backendProcess || !backendPid) {
    return { status: "error", message: "Backend is not running" };
  }

  try {
    // Use tree-kill via node to kill the process tree
    const killCommand = new Deno.Command("node", {
      args: ["-e", `require('tree-kill')(${backendPid}, 'SIGTERM', err => process.exit(err ? 1 : 0))`],
    });
    await killCommand.output();

    backendProcess = null;
    backendPid = null;
    return { status: "success", message: "Backend stopped successfully" };
  } catch (error) {
    // Cleanup state even if there was an error
    backendProcess = null;
    backendPid = null;
    return { status: "error", message: `Error stopping backend: ${error.message}` };
  }
}

async function handler(req) {
  // Check basic authentication
  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Restricted Access"',
      },
    });
  }

  // Decode and verify credentials
  const [scheme, encoded] = authorization.split(' ');
  if (!encoded || scheme !== 'Basic') {
    return new Response('Invalid authentication', { status: 401 });
  }

  const decoded = atob(encoded);
  const [username, password] = decoded.split(':');
  
  if (username !== Deno.env.get('UI_USERNAME') || password !== Deno.env.get('UI_PASSWORD')) {
    return new Response('Invalid credentials', { status: 401 });
  }

  const url = new URL(req.url);

  if (url.pathname === "/") {
    return new Response(template, {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (url.pathname === "/static/main.js") {
    try {
      let jsContent;
      if (Deno.env.get("DEV") === "true") {
        // Development mode - load files individually
        const files = [];
        const appDir = join(Deno.cwd(), "scripts", "deno-ui", "app");
        for await (const entry of Deno.readDir(appDir)) {
          if (entry.isFile && entry.name.endsWith(".js")) {
            files.push(Deno.readTextFile(join(appDir, entry.name)));
          }
        }
        jsContent = (await Promise.all(files)).join("\n");
      } else {
        // Production mode - use embedded bundle
        jsContent = await Deno.readTextFile(
          new URL("./deno-ui/app-bundle.js", import.meta.url)
        );
      }

      return new Response(jsContent, {
        headers: { "Content-Type": "application/javascript" },
      });
    } catch (error) {
      console.error(`Error loading JavaScript: ${error}`);
      return new Response("Error loading application files", { status: 500 });
    }
  }

  if (url.pathname === "/api/backend/state") {
    return new Response(JSON.stringify({
      status: backendProcess ? 'running' : 'stopped',
      message: backendProcess ? 'Backend is running' : 'Backend is stopped'
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/backend/available") {
    const available = await checkBackendAvailable();
    return new Response(JSON.stringify({ available }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/api/backend/start") {
    const result = await startBackend();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/api/backend/stop") {
    const result = await stopBackend();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

// Start the server
console.log(`UI Server running at http://localhost:${port}`);
await serve(handler, { port });
