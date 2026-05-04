import JSZip from "jszip";

export async function buildProjectPackageBlob({ markdown, manifest, assets }) {
  const zip = new JSZip();
  zip.file("slides.md", markdown);
  zip.file("config.json", JSON.stringify(manifest, null, 2));
  assets.forEach((asset) => {
    const content = dataUrlToZipContent(asset.dataUrl);
    zip.file(asset.path, content.data, { base64: content.base64 });
  });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readProjectPackage(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const paths = entries.map((entry) => normalizePackageEntryPath(entry.name));
  validateProjectPackagePaths(paths);

  const slidesEntry = zip.file("slides.md");
  const manifestEntry = zip.file("config.json");
  if (!slidesEntry) throw new Error("Package must include slides.md at the root.");
  if (!manifestEntry) throw new Error("Package must include config.json at the root.");

  const markdown = await slidesEntry.async("text");
  const manifest = JSON.parse(await manifestEntry.async("text"));
  validateProjectPackageManifest(manifest, paths);
  const assetBlobs = await Promise.all(manifest.assets.map(async (assetMeta) => {
    const assetEntry = zip.file(assetMeta.path);
    if (!assetEntry) throw new Error(`Missing asset file: ${assetMeta.path}.`);
    return {
      blob: await assetEntry.async("blob"),
      path: assetMeta.path,
      metadata: assetMeta,
    };
  }));

  return { markdown, manifest, assetBlobs };
}

function dataUrlToZipContent(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return { data: dataUrl, base64: false };
  if (match[2]) return { data: match[3], base64: true };
  return { data: decodeURIComponent(match[3]), base64: false };
}

function normalizePackageEntryPath(path) {
  return normalizeAssetPath(path).replace(/^\/+/, "");
}

function normalizeAssetPath(path) {
  return path
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

function validateProjectPackagePaths(paths) {
  const invalid = paths.find((path) => (
    !path ||
    path.startsWith("../") ||
    path.includes("/../") ||
    path === "." ||
    path.includes("//") ||
    (!["slides.md", "config.json"].includes(path) && !path.startsWith("assets/"))
  ));
  if (invalid) {
    throw new Error(`Unsupported package entry: ${invalid}. Only slides.md, config.json, and assets/ files are allowed.`);
  }
}

function validateProjectPackageManifest(manifest, packagePaths) {
  if (!manifest || typeof manifest !== "object") throw new Error("config.json must be a project manifest object.");
  if (manifest.schema !== "slip.project") throw new Error("config.json schema must be slip.project.");
  const version = Number(manifest.version);
  if (!Number.isInteger(version) || version < 1) throw new Error("config.json version must be a positive integer.");
  if (version > 2) throw new Error(`Project version ${manifest.version} is newer than this Slip build supports.`);
  if (manifest.entry !== "slides.md") throw new Error("config.json entry must be slides.md.");
  if (!Array.isArray(manifest.assets)) throw new Error("config.json assets must be an array.");

  const invalidAsset = manifest.assets.find((asset) => (
    !asset ||
    typeof asset.path !== "string" ||
    !asset.path.startsWith("assets/") ||
    asset.path.includes("../")
  ));
  if (invalidAsset) throw new Error("Every config.json asset path must stay inside assets/.");

  const assetPaths = new Set(manifest.assets.map((asset) => asset.path));
  if (assetPaths.size !== manifest.assets.length) throw new Error("config.json contains duplicate asset paths.");

  const extraAsset = packagePaths.find((path) => path.startsWith("assets/") && !assetPaths.has(path));
  if (extraAsset) throw new Error(`Asset file is not listed in config.json: ${extraAsset}.`);

  const missingAsset = [...assetPaths].find((path) => !packagePaths.includes(path));
  if (missingAsset) throw new Error(`config.json lists a missing asset file: ${missingAsset}.`);
}
