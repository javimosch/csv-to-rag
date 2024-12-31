#!/usr/bin/env -S deno run --allow-read --allow-write

import { join } from "https://deno.land/std/path/mod.ts";

async function bundleAppFiles() {
  const appDir = join(Deno.cwd(), "scripts", "deno-ui", "app");
  const bundleContent = [];

  // Add a timestamp for cache busting
  bundleContent.push(`// Generated bundle ${new Date().toISOString()}`);
  
  for await (const entry of Deno.readDir(appDir)) {
    if (entry.isFile && entry.name.endsWith(".js")) {
      const content = await Deno.readTextFile(join(appDir, entry.name));
      bundleContent.push(`// File: ${entry.name}\n${content}`);
    }
  }

  await Deno.writeTextFile(
    join(Deno.cwd(), "scripts", "deno-ui", "app-bundle.js"),
    bundleContent.join("\n\n")
  );
  console.log("Bundle created successfully!");
}

await bundleAppFiles();
