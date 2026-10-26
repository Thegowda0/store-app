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
    
    // Trigger page-specific logic
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

// Load multiple products (Home & Shop)
async function loadProducts(containerId) {
  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/products?per_page=20`);
    const products = await res.json();
    const el = document.getElementById(containerId);
    if (!el) return;
    
    el.innerHTML = products.map(p => `
      <div class="card" onclick="openProduct(${p.id})">
        <img src="${p.images[0]?.src || ''}" loading="lazy">
        <h3>${p.name}</h3>
        <p>${p.price_html}</p>
      </div>`).join("");
  } catch(e) { 
    console.error(e); 
    document.getElementById(containerId).innerHTML = "<p style='padding:16px;'>Could not load products. Check API URL.</p>";
  }
}

// Open single product
function openProduct(id) {
  navigate("product", id);
}

// Load single product details
async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/products/${id}`);
    const p = await res.json();
    
    el.innerHTML = `
      <img src="${p.images[0]?.src}" style="width:100%; border-radius:12px; margin-bottom:16px;">
      <h1 style="font-size:24px; margin-bottom:8px;">${p.name}</h1>
      <div style="font-size:20px; font-weight:bold; color:#111; margin-bottom:16px;">${p.price_html}</div>
      <div style="font-size:14px; color:#555; margin-bottom:24px;">${p.description || 'No description available.'}</div>
      
      <button onclick="addToCart('${APP_CONFIG.siteUrl}${p.permalink}')" 
        style="width:100%; padding:16px; background:#111; color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:bold;">
        Add to Cart
      </button>
    `;
  } catch(e) {
    el.innerHTML = "<p>Error loading product.</p>";
  }
}

// Add to cart button logic (sends user to WebView)
function addToCart(permalink) {
  // Opens the website product page inside a WebView so they can add to cart
  container.innerHTML = `<iframe src="${permalink}"
    style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
}
