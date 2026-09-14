export function favoriteOptions(data) {
  return data.favoriten
    .filter((fav) => fav.type === "address")
    .flatMap((fav) => [
      `<option value="${escapeHtml(fav.label)}">${escapeHtml(fav.adresse)}</option>`,
      `<option value="${escapeHtml(fav.adresse)}">${escapeHtml(fav.label)}</option>`,
    ])
    .join("");
}

export function renderFavorites(data, onEdit, onDelete) {
  renderFavoriteRows("#addressFavoriteRows", data.favoriten.filter((fav) => fav.type === "address"), false, onEdit, onDelete);
  renderFavoriteRows("#fuelFavoriteRows", data.favoriten.filter((fav) => fav.type === "fuelStation"), true, onEdit, onDelete);
  renderFavoriteCards("#addressFavoriteCards", data.favoriten.filter((fav) => fav.type === "address"), false, onEdit, onDelete);
  renderFavoriteCards("#fuelFavoriteCards", data.favoriten.filter((fav) => fav.type === "fuelStation"), true, onEdit, onDelete);
}

function renderFavoriteRows(selector, favorites, showBrand, onEdit, onDelete) {
  const body = document.querySelector(selector);
  body.innerHTML = favorites
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((fav) => `
      <tr>
        <td data-label="Name">${escapeHtml(fav.label)}</td>
        ${showBrand ? `<td data-label="Marke">${escapeHtml(fav.brand || "")}</td>` : ""}
        <td data-label="Adresse">${escapeHtml(fav.adresse)}</td>
        <td data-label="Aktionen" class="row-actions">
          <button class="ghost" data-fav-edit="${escapeHtml(fav.label)}">Bearbeiten</button>
          <button class="danger" data-fav-delete="${escapeHtml(fav.label)}">Löschen</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="${showBrand ? 4 : 3}" class="muted">Keine Favoriten angelegt.</td></tr>`;
  body.querySelectorAll("[data-fav-edit]").forEach((button) => button.addEventListener("click", () => onEdit(button.dataset.favEdit)));
  body.querySelectorAll("[data-fav-delete]").forEach((button) => button.addEventListener("click", () => onDelete(button.dataset.favDelete)));
}

function renderFavoriteCards(selector, favorites, showBrand, onEdit, onDelete) {
  const cards = document.querySelector(selector);
  cards.innerHTML = favorites
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((fav) => `
      <article class="mobile-card">
        <div class="card-head">
          <div>
            <span class="card-kicker">${showBrand ? escapeHtml(fav.brand || "Tankstelle") : "Adresse"}</span>
            <strong>${escapeHtml(fav.label)}</strong>
          </div>
        </div>
        <p class="card-sub">${escapeHtml(fav.adresse)}</p>
        <div class="actions">
          <button class="ghost" data-fav-card-edit="${escapeHtml(fav.label)}">Bearbeiten</button>
          <button class="danger" data-fav-card-delete="${escapeHtml(fav.label)}">Löschen</button>
        </div>
      </article>`).join("") || `<p class="muted small">Keine Favoriten angelegt.</p>`;
  cards.querySelectorAll("[data-fav-card-edit]").forEach((button) => button.addEventListener("click", () => onEdit(button.dataset.favCardEdit)));
  cards.querySelectorAll("[data-fav-card-delete]").forEach((button) => button.addEventListener("click", () => onDelete(button.dataset.favCardDelete)));
}

export function fuelStationOptions(data) {
  return data.favoriten
    .filter((fav) => fav.type === "fuelStation")
    .flatMap((fav) => [
      `<option value="${escapeHtml(fav.label)}">${escapeHtml([fav.brand, fav.adresse].filter(Boolean).join(" - "))}</option>`,
      `<option value="${escapeHtml(fav.adresse)}">${escapeHtml([fav.label, fav.brand].filter(Boolean).join(" - "))}</option>`,
    ])
    .join("");
}

export function normalizeFavoriteAddress(data, value, type = "address") {
  const clean = String(value || "").trim();
  const favorite = data.favoriten.find((fav) => fav.type === type && (fav.label === clean || fav.adresse === clean));
  return favorite ? favorite.label : clean;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}
