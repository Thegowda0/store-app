const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

// Build tab bar
APP_CONFIG.tabs.forEach(tab => {
  const btn = document.createElement("button");
  btn.className = "tab";
  btn.dataset.id = tab.id;
  btn.innerHTML = `<span>${tab.icon}</span><small>${tab.label}</small>`;
  btn.onclick = () => navigate(tab.page);
  tabbar.appendChild(btn);
});

// Router
async function navigate(pageId, param = null) {
  if (APP_CONFIG.nativePages[pageId]) {
    const res = await fetch(APP_CONFIG.nativePages[pageId]);
    container.innerHTML = await res.text();
    
    if (pageId === "home") loadProducts("home-featured");
    if (pageId === "shop") loadProducts("product-list");
    if (pageId === "product" && param) loadSingleProduct(param);
    
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}"
      style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.id === pageId));
}

// Load multiple products
async function loadProducts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  
  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";

  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=20`);
    const products = await res.json();
    
    el.innerHTML = products.map(p => `
      <div class="card" onclick="navigate('product', ${p.id})">
        <img src="${p.images[0]?.thumbnail || ''}" loading="lazy" alt="${p.name}">
        <h3>${p.name}</h3>
        <div class="price">${p.price_html}</div>
      </div>`).join("");
  } catch(e) { 
    console.error(e); 
    el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>";
  }
}

// Load single product
async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";

  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`);
    const p = await res.json();
    
    el.innerHTML = `
      <div style="padding-bottom: 80px;">
        <img src="${p.images[0]?.src}" style="width:100%; border-radius:12px; margin-bottom:16px;">
        <h1 style="font-size:24px; margin-bottom:8px; color:#111;">${p.name}</h1>
        <div style="font-size:20px; font-weight:bold; color:#111; margin-bottom:16px;">${p.price_html}</div>
        <div style="font-size:14px; color:#555; line-height:1.5; margin-bottom:24px;">${p.description || ''}</div>
      </div>
      
      <div style="position:fixed; bottom:60px; left:0; right:0; padding:16px; background:#fff; border-top:1px solid #eee;">
        <button onclick="addToCart('${p.permalink}')" 
          style="width:100%; padding:16px; background:#111; color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:bold;">
          Add to Cart
        </button>
      </div>
    `;
  } catch(e) {
    el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>";
  }
}

// Add to cart
function addToCart(permalink) {
  container.innerHTML = `<iframe src="${permalink}"
    style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
}

// Start the app
navigate("home");
