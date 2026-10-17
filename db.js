// Storage layer.
//
// Two backends, same API:
//   Firefox add-on (moz-extension:)  browser.storage.local
//   Plain page / GitHub Pages:        localStorage
//
// Swapping this file is all that is needed to run the same UI in both places.

const DB_KEY = "stamrt.sites";

const DEFAULT_SITES = [
  ["gmail", "https://mail.google.com"],
  ["goodreads", "https://goodreads.com"],
  ["github", "https://github.com"],
  ["odinproject", "https://www.theodinproject.com"],
  ["youtube", "https://youtube.com"],
  ["reddit", "https://reddit.com"],
  ["hardcover", "https://hardcover.app"],
  ["mobilism", "https://mobilism.com"],
];

const ext = typeof browser !== "undefined" ? browser.storage?.local : null;

const db = {
  seed() {
    return DEFAULT_SITES.map(([name, url]) => ({ id: uid(), name, url }));
  },

  async read() {
    try {
      if (ext) {
        const stored = await ext.get(DB_KEY);
        const value = stored[DB_KEY];
        return Array.isArray(value) ? value : null;
      }
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  async write(sites) {
    if (ext) {
      await ext.set({ [DB_KEY]: sites });
      return;
    }
    localStorage.setItem(DB_KEY, JSON.stringify(sites));
  },

  async getAll() {
    const stored = await this.read();
    if (stored) return stored;
    const seeded = db.seed();
    await db.write(seeded);
    return seeded;
  },

  async add(site) {
    const sites = await this.getAll();
    sites.push(site);
    await this.write(sites);
    return sites;
  },

  async update(id, patch) {
    const sites = (await this.getAll()).map((s) => (s.id === id ? { ...s, ...patch } : s));
    await this.write(sites);
    return sites;
  },

  async remove(id) {
    const sites = (await this.getAll()).filter((s) => s.id !== id);
    await this.write(sites);
    return sites;
  },
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Accepts "hardcover.app", "https://hardcover.app", "http://x.com", etc.
function normalizeUrl(input) {
  const value = input.trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProtocol).href;
  } catch {
    return null;
  }
}
