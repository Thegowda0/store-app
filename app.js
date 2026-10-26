const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

let globalProducts = []; // Store products for search

// --- TOAST ---
function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px); background:#111; color:#fff; padding:12px 24px; border-radius:30px; font-size:14px; font-weight:500; opacity:0; transition:all 0.3s; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.2);";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  setTimeout(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }, 10);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(-50%) translateY(20px)"; }, 2500);
}

// --- BUILD TAB BAR ---
APP_CONFIG.tabs.forEach(tab => {
  const btn = document.createElement("button");
  btn.className = "tab";
  btn.dataset.id = tab.id;
  btn.innerHTML = `<span>${tab.icon}</span><small>${tab.label}</small>`;
  btn.onclick = () => { window.location.hash = tab.page === 'home' ? '' : tab.page; };
  tabbar.appendChild(btn);
});

// --- HISTORY ROUTER ---
window.addEventListener('hashchange', handleRoute);

function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  
  if (!hash) {
    navigate("home", null, false);
  } else if (hash.startsWith('product-')) {
    const id = hash.split('-')[1];
    navigate("product", id, false);
  } else {
    navigate(hash, null, false);
  }
}

async function navigate(pageId, param = null, pushHistory = true) {
  if (pushHistory) {
    if (pageId === "home") history.pushState(null, "", window.location.pathname);
    else if (pageId === "product") history.pushState(null, "", `#product-${param}`);
    else history.pushState(null, "", `#${pageId}`);
  }

  if (APP_CONFIG.nativePages[pageId]) {
    const res = await fetch(APP_CONFIG.nativePages[pageId]);
    container.innerHTML = await res.text();
    
    if (pageId === "home") loadProducts("home-featured");
    if (pageId === "shop") loadProducts("product-list");
    if (pageId === "product" && param) loadSingleProduct(param);
    if (pageId === "cart") renderCart();
    
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}"
      style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.id === pageId));
}

// --- PRODUCTS & SEARCH ---
async function loadProducts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  
  // If we already loaded products, just render them (faster navigation)
  if (globalProducts.length > 0) {
    renderProductGrid(containerId, globalProducts);
    return;
  }

  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";

  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`);
    globalProducts = await res.json(); // Save globally
    renderProductGrid(containerId, globalProducts);
  } catch(e) { 
    el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>";
  }
}

function renderProductGrid(containerId, products) {
  const el = document.getElementById(containerId);
  if (!el) return;
  
  if (products.length === 0) {
    el.innerHTML = "<p style='padding:32px 16px; text-align:center; color:#666; grid-column: span 2;'>No products found.</p>";
    return;
  }

  el.innerHTML = products.map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.images[0]?.thumbnail || ''}" loading="lazy" alt="${p.name}">
      <h3>${p.name}</h3>
      <div class="price">${p.price_html}</div>
    </div>`).join("");
}

function filterProducts() {
  const query = document.getElementById("search-input").value.toLowerCase();
  const filtered = globalProducts.filter(p => p.name.toLowerCase().includes(query));
  renderProductGrid("product-list", filtered);
}

async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";

  try {
    // Find product in global memory first to avoid API call
    let p = globalProducts.find(item => item.id == id);
    if (!p) {
      const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`);
      p = await res.json();
    }
    
    el.innerHTML = `
      <div style="padding-bottom: 80px;">
        <img src="${p.images[0]?.src}" style="width:100%; border-radius:12px; margin-bottom:16px;">
        <h1 style="font-size:24px; margin-bottom:8px; color:#111;">${p.name}</h1>
        <div style="font-size:20px; font-weight:bold; color:#111; margin-bottom:16px;">${p.price_html}</div>
        <div style="font-size:14px; color:#555; line-height:1.5; margin-bottom:24px;">${p.description || ''}</div>
      </div>
      
      <div style="position:fixed; bottom:60px; left:0; right:0; padding:16px; background:#fff; border-top:1px solid #eee;">
        <button onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" 
          style="width:100%; padding:16px; background:#111; color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:bold;">
          Add to Cart
        </button>
      </div>
    `;
  } catch(e) {
    el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>";
  }
}

// --- CART LOGIC ---
function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); }

function addToCart(id, name, price, image) {
  let cart = getCart();
  let existing = cart.find(item => item.id === id);
  
  if (existing) { existing.qty += 1; } else { cart.push({ id, name, price: parseFloat(price), image, qty: 1 }); }
  
  saveCart(cart);
  showToast("✓ Added to Cart");
}

function updateCartBadge() {
  const cart = getCart();
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTab = document.querySelector('.tab[data-id="cart"]');
  
  if (cartTab) {
    let badge = cartTab.querySelector(".cart-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "cart-badge";
      badge.style.cssText = "position:absolute; top:10px; right:25%; background:#FF4B2B; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center;";
      cartTab.appendChild(badge);
    }
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? "flex" : "none";
  }
}

function renderCart() {
  const cart = getCart();
  const el = document.getElementById("cart-items");
  const summary = document.getElementById("cart-summary");
  
  if (cart.length === 0) {
    el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2><p style='color:#666; margin-top:8px;'>Looks like you haven't added anything yet.</p></div>";
    summary.style.display = "none";
    return;
  }

  let total = 0;
  el.innerHTML = cart.map(item => {
    total += (item.price * item.qty);
    let displayPrice = (item.price / 100).toFixed(2);
    let totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    
    return `
    <div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;">
      <img src="${item.image}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;">
      <div style="flex:1;">
        <h3 style="font-size:14px; margin-bottom:4px;">${item.name}</h3>
        <div style="color:#666; font-size:13px;">$${displayPrice}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;">
        <button onclick="changeQty(${item.id}, -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button>
        <span style="font-size:14px; font-weight:600;">${item.qty}</span>
        <button onclick="changeQty(${item.id}, 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button>
      </div>
      <div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$${totalForItem}</div>
    </div>`;
  }).join("");

  const grandTotal = (total / 100).toFixed(2);
  document.getElementById("cart-total").textContent = `$${grandTotal}`;
  summary.style.display = "block";
}

function changeQty(id, change) {
  let cart = getCart();
  let item = cart.find(i => i.id === id);
  if (item) {
    item.qty += change;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    saveCart(cart);
    renderCart();
  }
}

function checkout() {
  navigate("checkout");
}

// --- INITIAL LOAD ---
updateCartBadge();
handleRoute();
