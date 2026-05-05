import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isShareExpired, validateShareObject } from "../src/shareModel.js";

export class FileShareStore {
  constructor(options = {}) {
    this.directory = options.directory || ".slip-shares";
  }

  async save(share) {
    const validation = validateShareObject(share);
    if (!validation.valid) throw new Error(validation.reason);
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.sharePath(share.id), JSON.stringify(share, null, 2), "utf8");
    return share;
  }

  async get(id) {
    try {
      const raw = await readFile(this.sharePath(id), "utf8");
      const share = JSON.parse(raw);
      const validation = validateShareObject(share);
      return validation.valid ? share : null;
    } catch (_error) {
      return null;
    }
  }

  async delete(id) {
    await rm(this.sharePath(id), { force: true });
  }

  async deleteExpired(now = Date.now()) {
    const shares = await this.list();
    const expired = shares.filter((share) => isShareExpired(share, now));
    await Promise.all(expired.map((share) => this.delete(share.id)));
    return expired.length;
  }

  async list() {
    try {
      const entries = await readdir(this.directory);
      const shares = await Promise.all(entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => this.get(entry.slice(0, -5))));
      return shares.filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  sharePath(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(id || ""))) {
      throw new Error("Invalid share id.");
    }
    return join(this.directory, `${id}.json`);
  }
}
