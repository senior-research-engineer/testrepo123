(function () {
  const entriesEl = document.getElementById("entries");
  const searchBox = document.getElementById("search-box");
  let allEntries = [];

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return escapeHtml(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function renderEntries(entries) {
    if (entries.length === 0) {
      entriesEl.innerHTML = '<p class="empty-state">No entries yet. Be the first to share your learning!</p>';
      return;
    }

    entriesEl.innerHTML = entries
      .map((entry) => {
        const photos = (entry.photos || [])
          .map((filename) => `<img src="data/photos/${encodeURIComponent(filename)}" alt="Photo from ${escapeHtml(entry.name)}'s entry" />`)
          .join("");

        return `
          <article class="entry-card">
            <div class="entry-meta">${escapeHtml(entry.name)} &middot; ${formatDate(entry.date)}</div>
            <h2>${escapeHtml(entry.title)}</h2>
            <p class="entry-summary">${escapeHtml(entry.summary)}</p>
            ${photos ? `<div class="photo-grid">${photos}</div>` : ""}
          </article>
        `;
      })
      .join("");
  }

  function applySearch() {
    const query = searchBox.value.trim().toLowerCase();
    if (!query) {
      renderEntries(allEntries);
      return;
    }
    const filtered = allEntries.filter((entry) => {
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.title.toLowerCase().includes(query) ||
        entry.summary.toLowerCase().includes(query)
      );
    });
    renderEntries(filtered);
  }

  searchBox.addEventListener("input", applySearch);

  fetch("/api/entries")
    .then((res) => res.json())
    .then((data) => {
      allEntries = data;
      renderEntries(allEntries);
    })
    .catch(() => {
      entriesEl.innerHTML = '<p class="empty-state">Could not load entries. Please try again later.</p>';
    });
})();
