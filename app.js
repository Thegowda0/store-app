const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

APP_CONFIG.tabs.forEach(tab => {
  const btn = document.createElement("button");
  btn.className = "tab";
  btn.dataset.id = tab.id;
  btn.innerHTML = `<span>${tab.icon}</span><small>${tab.label}</small>`;
  btn.onclick = () => navigate(tab.page);
  tabbar.appendChild(btn);
});

async function navigate(pageId) {
  if (APP_CONFIG.nativePages[pageId]) {
    const res = await fetch(APP_CONFIG.nativePages[pageId]);
    container.innerHTML = await res.text();
    if (pageId === "shop") loadProducts();
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}"
      style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.id === pageId));
}

async function loadProducts() {
  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/products?per_page=20`);
    const products = await res.json();
    const el = document.getElementById("product-list");
    if (!el) return;
    el.innerHTML = products.map(p => `
      <div class="card" onclick="location.hash='product-${p.id}'">
        <img src="${p.images[0]?.src || ''}" loading="lazy">
        <h3>${p.name}</h3>
        <p>${p.price_html}</p>
      </div>`).join("");
  } catch(e) { console.error(e); }
}

navigate("home");
