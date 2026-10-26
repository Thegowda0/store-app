const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

let globalProducts = [];
let activeCategory = "all";

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

// --- ROUTER ---
window.addEventListener('hashchange', handleRoute);

function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) navigate("home", null, false);
  else if (hash.startsWith('product-')) navigate("product", hash.split('-')[1], false);
  else navigate(hash, null, false);
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
    if (pageId === "search") initSearchPage();
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

// --- SEARCH PAGE LOGIC (BIGBASKET STYLE) ---
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try {
      const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`);
      globalProducts = await res.json();
    } catch(e) { return; }
  }

  // 1. Load Trending Products (First 4)
  document.getElementById("trending-search").innerHTML = globalProducts.slice(0, 4).map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.images[0]?.thumbnail || ''}" loading="lazy">
      <h3>${p.name}</h3>
      <div class="price">${p.price_html}</div>
    </div>
  `).join("");

  // 2. Load Recent Searches from Memory
  renderRecentSearches();

  // 3. Build Category Pills
  const categories = ["all", ...new Set(globalProducts.map(p => p.categories[0]?.name).filter(Boolean))];
  document.getElementById("search-categories").innerHTML = categories.map(cat => `
    <button onclick="setSearchCategory('${cat}')" 
      style="white-space:nowrap; padding:8px 16px; border-radius:8px; border:1px solid ${activeCategory === cat ? '#111' : '#ddd'}; background:${activeCategory === cat ? '#111' : '#fff'}; color:${activeCategory === cat ? '#fff' : '#333'}; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s;">
      ${cat === 'all' ? 'All Products' : cat}
    </button>
  `).join("");

  // Focus input
  setTimeout(() => document.getElementById("search-page-input").focus(), 100);
}

function renderRecentSearches() {
  const recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  const el = document.getElementById("recent-searches");
  
  if (recents.length === 0) {
    el.innerHTML = `<span style="font-size: 13px; color: #888;">No recent searches yet.</span>`;
    return;
  }

  el.innerHTML = recents.map(term => `
    <div onclick="clickRecent('${term}')" style="padding: 8px 16px; border: 1px solid #eee; border-radius: 8px; font-size: 13px; color: #333; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-clock-rotate-left" style="color: #999; font-size: 12px;"></i> ${term}
    </div>
  `).join("");
}

function clickRecent(term) {
  document.getElementById("search-page-input").value = term;
  executeSearch();
}

function clearRecent() {
  localStorage.removeItem("recent_searches");
  renderRecentSearches();
}

function setSearchCategory(cat) {
  activeCategory = cat;
  const pills = document.getElementById("search-categories").children;
  for (let pill of pills) {
    const isActive = pill.textContent.trim() === (cat === 'all' ? 'All Products' : cat);
    pill.style.background = isActive ? '#111' : '#fff';
    pill.style.color = isActive ? '#fff' : '#333';
    pill.style.border = isActive ? '1px solid #111' : '1px solid #ddd';
  }
  executeSearch();
}

function executeSearch() {
  const query = document.getElementById("search-page-input").value.trim().toLowerCase();
  const defaultState = document.getElementById("default-search-state");
  const activeState = document.getElementById("active-search-state");

  // Toggle views based on input
  if (query.length === 0 && activeCategory === "all") {
    defaultState.style.display = "block";
    activeState.style.display = "none";
    return;
  } else {
    defaultState.style.display = "none";
    activeState.style.display = "block";
  }

  // Save to recent searches (only if query is longer than 2 chars)
  if (query.length > 2) {
    let recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
    if (!recents.includes(query)) {
      recents.unshift(query);
      if (recents.length > 5) recents.pop();
      localStorage.setItem("recent_searches", JSON.stringify(recents));
      renderRecentSearches(); // Update pills behind the scenes
    }
  }

  const filtered = globalProducts.filter(p => {
    const matchesQuery = p.name.toLowerCase().includes(query) || (p.description || "").toLowerCase().includes(query);
    const matchesCategory = activeCategory === "all" || p.categories.some(c => c.name.toLowerCase() === activeCategory.toLowerCase());
    return matchesQuery && matchesCategory;
  });

  const resultsEl = document.getElementById("search-results");
  if (filtered.length === 0) {
    resultsEl.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 40px 16px; color: #666;">
        <i class="fa-solid fa-box-open" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
        <h3 style="color:#111;">No results found</h3>
        <p style="font-size: 14px; margin-top: 8px;">Try searching for something else.</p>
      </div>`;
    return;
  }

  resultsEl.innerHTML = filtered.map(p => `
    <div class="card" style="border: 1px solid #eee; box-shadow: none; border-radius: 12px;" onclick="navigate('product', ${p.id})">
      <div style="position: relative;">
        <img src="${p.images[0]?.thumbnail || ''}" loading="lazy" style="border-radius: 12px 12px 0 0;">
        <button onclick="event.stopPropagation(); showToast('Added to Wishlist ❤️')" style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.8); border: none; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <i class="fa-regular fa-heart" style="color: #888;"></i>
        </button>
      </div>
      <div style="padding: 8px 12px 12px;">
        <div class="price" style="font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px;">${p.price_html}</div>
        <h3 style="font-size: 13px; color: #555; white-space: normal; line-height: 1.3;">${p.name}</h3>
      </div>
    </div>`).join("");
}

// --- STANDARD PRODUCTS ---
async function loadProducts(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (globalProducts.length > 0) { renderProductGrid(containerId, globalProducts); return; }

  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";
  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`);
    globalProducts = await res.json();
    renderProductGrid(containerId, globalProducts);
  } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>"; }
}

function renderProductGrid(containerId, products) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (products.length === 0) { el.innerHTML = "<p>No products found.</p>"; return; }

  el.innerHTML = products.map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.images[0]?.thumbnail || ''}" loading="lazy" alt="${p.name}">
      <h3>${p.name}</h3>
      <div class="price">${p.price_html}</div>
    </div>`).join("");
}

async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";

  try {
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
  } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>"; }
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

function checkout() { navigate("checkout"); }

updateCartBadge();
handleRoute();
