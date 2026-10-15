// Storage layer. Today: localStorage.
// When this ships as a browser plugin, swap the internals of read/write for
// chrome.storage.local (promise-based) and nothing else has to change.

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

const db = {
  seed() {
    return DEFAULT_SITES.map(([name, url]) => ({ id: uid(), name, url }));
  },

  read() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  write(sites) {
    localStorage.setItem(DB_KEY, JSON.stringify(sites));
  },

  getAll() {
    let sites = this.read();
    if (!sites) {
      sites = db.seed();
      this.write(sites);
    }
    return sites;
  },

  add(site) {
    const sites = this.getAll();
    sites.push(site);
    this.write(sites);
    return sites;
  },

  update(id, patch) {
    const sites = this.getAll().map((s) => (s.id === id ? { ...s, ...patch } : s));
    this.write(sites);
    return sites;
  },

  remove(id) {
    const sites = this.getAll().filter((s) => s.id !== id);
    this.write(sites);
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
