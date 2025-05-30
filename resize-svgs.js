import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module-friendly __dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, "icons-new");
const outputDir = path.join(__dirname, "public/icons");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.readdirSync(inputDir).forEach((file) => {
  if (path.extname(file) === ".svg") {
    const filePath = path.join(inputDir, file);
    let content = fs.readFileSync(filePath, "utf8");

    content = content.replace(/<svg([^>]*)>/, (match, group) => {
      // Remove any existing width/height
      let cleaned = group
        .replace(/width="[^"]*"/, "")
        .replace(/height="[^"]*"/, "");

      return `<svg${cleaned} width="12" height="12">`;
    });

    fs.writeFileSync(path.join(outputDir, file), content, "utf8");
    console.log(`Resized: ${file}`);
  }
});
