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
}

function renderFavoriteRows(selector, favorites, showBrand, onEdit, onDelete) {
  const body = document.querySelector(selector);
  body.innerHTML = favorites
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((fav) => `
      <tr>
        <td>${escapeHtml(fav.label)}</td>
        ${showBrand ? `<td>${escapeHtml(fav.brand || "")}</td>` : ""}
        <td>${escapeHtml(fav.adresse)}</td>
        <td class="row-actions">
          <button class="ghost" data-fav-edit="${escapeHtml(fav.label)}">Bearbeiten</button>
          <button class="danger" data-fav-delete="${escapeHtml(fav.label)}">Löschen</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="${showBrand ? 4 : 3}" class="muted">Keine Favoriten angelegt.</td></tr>`;
  body.querySelectorAll("[data-fav-edit]").forEach((button) => button.addEventListener("click", () => onEdit(button.dataset.favEdit)));
  body.querySelectorAll("[data-fav-delete]").forEach((button) => button.addEventListener("click", () => onDelete(button.dataset.favDelete)));
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
