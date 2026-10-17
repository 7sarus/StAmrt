const linksEl = document.getElementById("links");
const settingsListEl = document.getElementById("settings-list");
const dialog = document.getElementById("settings-dialog");
const gear = document.getElementById("settings");
const addForm = document.getElementById("add-form");
const nameInput = document.getElementById("add-name");
const urlInput = document.getElementById("add-url");

let editingId = null;

function button(label, className, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

// Icon sources in fallback order. The last one is not a URL: if every fetch
// fails we fall back to a letter tile drawn in CSS.
function iconSources(site) {
  let host;
  try {
    host = new URL(site.url).hostname;
  } catch {
    return [];
  }
  // Bare hosts and .local names have no public favicon.
  if (!host.includes(".")) return [];

  return [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
  ];
}

function makeIcon(site) {
  const sources = iconSources(site);
  const box = document.createElement("span");
  box.className = "icon";
  box.setAttribute("aria-hidden", "true");

  const letter = document.createElement("span");
  letter.className = "icon-letter";
  letter.textContent = (site.name[0] || "?").toLowerCase();
  box.append(letter);

  if (sources.length === 0) return box;

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";

  let index = 0;
  img.addEventListener("load", () => box.replaceChildren(img));
  img.addEventListener("error", () => {
    index += 1;
    if (index < sources.length) {
      img.src = sources[index];
    } else {
      box.replaceChildren(letter);
    }
  });
  img.src = sources[0];

  return box;
}

function renderTiles(sites) {
  linksEl.replaceChildren(
    ...sites.map((site) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = site.url;
      a.append(makeIcon(site));
      a.append(document.createTextNode(site.name));
      li.append(a);
      return li;
    })
  );
}

function renderEditRow(site) {
  const li = document.createElement("li");
  li.className = "editing";

  const name = document.createElement("input");
  name.type = "text";
  name.value = site.name;
  name.className = "edit-name";
  name.maxLength = 40;
  name.setAttribute("aria-label", "Name");

  const url = document.createElement("input");
  url.type = "text";
  url.value = site.url;
  url.className = "edit-url";
  url.maxLength = 2000;
  url.setAttribute("aria-label", "URL");

  const save = async () => {
    const normalized = normalizeUrl(url.value);
    if (!normalized) {
      url.setCustomValidity("That does not look like a URL");
      url.reportValidity();
      return;
    }
    editingId = null;
    render(await db.update(site.id, { name: name.value.trim() || site.name, url: normalized }));
  };

  name.addEventListener("keydown", (e) => e.key === "Enter" && save());
  url.addEventListener("keydown", (e) => e.key === "Enter" && save());
  url.addEventListener("input", () => url.setCustomValidity(""));

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(
    button("Save", "save", save),
    button("Cancel", "remove", () => {
      editingId = null;
      refresh();
    })
  );

  li.append(name, url, actions);
  name.focus();
  name.select();
  return li;
}

function renderSettingsRow(site) {
  const li = document.createElement("li");

  const label = document.createElement("span");
  label.className = "settings-name";
  label.append(makeIcon(site), document.createTextNode(site.name));
  label.title = site.url;

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(
    button("Edit", "remove", () => {
      editingId = site.id;
      refresh();
    }),
    button("Remove", "remove", async () => render(await db.remove(site.id)))
  );

  li.append(label, actions);
  return li;
}

function render(sites) {
  renderTiles(sites);
  settingsListEl.replaceChildren(
    ...sites.map((site) => (site.id === editingId ? renderEditRow(site) : renderSettingsRow(site)))
  );
}

async function refresh() {
  render(await db.getAll());
}

gear.addEventListener("click", () => dialog.showModal());

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = normalizeUrl(urlInput.value);
  if (!url) {
    urlInput.setCustomValidity("That does not look like a URL");
    urlInput.reportValidity();
    return;
  }
  urlInput.setCustomValidity("");

  const name = nameInput.value.trim();
  render(await db.add({ id: uid(), name: name || new URL(url).hostname, url }));
  addForm.reset();
  nameInput.focus();
});

urlInput.addEventListener("input", () => urlInput.setCustomValidity(""));

refresh();
