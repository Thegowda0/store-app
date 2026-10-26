const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

let globalProducts = [];
let currentSearchQuery = "";
let currentFilteredProducts = [];

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

// --- WISHLIST LOGIC ---
function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function saveWishlist(w) { localStorage.setItem("native_wishlist", JSON.stringify(w)); }

function toggleWishlist(id, name, price, image) {
  let w = getWishlist();
  let exists = w.find(item => item.id === id);
  
  if (exists) {
    w = w.filter(item => item.id !== id);
    showToast("Removed from Wishlist");
  } else {
    w.push({ id, name, price: parseFloat(price), image });
    showToast("✓ Added to Wishlist");
  }
  saveWishlist(w);
  
  // Refresh UI if on results page
  if (window.location.hash === "#search-results") renderSearchResultsGrid();
  if (window.location.hash === "#wishlist") renderWishlistPage();
}

function renderWishlistPage() {
  const w = getWishlist();
  const grid = document.getElementById("wishlist-grid");
  
  if (w.length === 0) {
    grid.innerHTML = "<div style='grid-column: span 2; text-align: center; padding: 40px;'><i class='fa-regular fa-heart' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h3>Your wishlist is empty</h3></div>";
    return;
  }
  
  grid.innerHTML = w.map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.image}" loading="lazy">
      <div style="padding: 8px 12px;">
        <h3>${p.name}</h3>
      </div>
    </div>
  `).join("");
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
    try {
      const res = await fetch(APP_CONFIG.nativePages[pageId]);
      container.innerHTML = await res.text();
      
      if (pageId === "home") loadProducts("home-featured");
      if (pageId === "shop") loadProducts("product-list");
      if (pageId === "search") initSearchPage();
      if (pageId === "search-results") initSearchResultsPage();
      if (pageId === "wishlist") renderWishlistPage();
      if (pageId === "product" && param) loadSingleProduct(param);
      if (pageId === "cart") renderCart();
    } catch (e) {
      container.innerHTML = `<p style="padding:20px;">Error loading page: ${pageId}</p>`;
    }
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}"
      style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.id === pageId));
}

// --- SEARCH PAGE (AUTOCOMPLETE) ---
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try {
      const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`);
      globalProducts = await res.json();
    } catch(e) { return; }
  }

  document.getElementById("trending-search").innerHTML = globalProducts.slice(0, 4).map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.images[0]?.thumbnail || ''}" loading="lazy">
      <h3>${p.name}</h3>
      <div class="price">${p.price_html}</div>
    </div>
  `).join("");

  renderRecentSearches();
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
  saveSearchHistory(term);
  goToSearchResults();
}

function saveSearchHistory(term) {
  term = term.trim().toLowerCase();
  if (term.length < 2) return;
  
  let recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  if (!recents.includes(term)) {
    recents.unshift(term);
    if (recents.length > 6) recents.pop();
    localStorage.setItem("recent_searches", JSON.stringify(recents));
    renderRecentSearches();
  }
}

function clearRecent() {
  localStorage.removeItem("recent_searches");
  renderRecentSearches();
}

function executeSearch() {
  const query = document.getElementById("search-page-input").value.trim().toLowerCase();
  currentSearchQuery = query;
  const defaultState = document.getElementById("default-search-state");
  const activeState = document.getElementById("active-search-state");

  if (query.length === 0) {
    defaultState.style.display = "block";
    activeState.style.display = "none";
    return;
  } else {
    defaultState.style.display = "none";
    activeState.style.display = "block";
  }

  const filtered = globalProducts.filter(p => p.name.toLowerCase().includes(query));
  const listEl = document.getElementById("autocomplete-list");
  
  if (filtered.length === 0) {
    listEl.innerHTML = `<p style="font-size:14px; color:#666;">No results for "${query}"</p>`;
    return;
  }

  listEl.innerHTML = filtered.slice(0, 6).map(p => `
    <div onclick="saveSearchHistory('${p.name.replace(/'/g, "\\'")}'); navigate('product', ${p.id})" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
      <img src="${p.images[0]?.thumbnail || ''}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
      <span style="font-size: 15px; font-weight: 500; color: #333;">${p.name}</span>
    </div>
  `).join("");
}

function goToSearchResults() {
  saveSearchHistory(currentSearchQuery);
  navigate('search-results');
}

// --- SEARCH RESULTS PAGE (BIGBASKET STYLE) ---
function initSearchResultsPage() {
  const query = currentSearchQuery || "All Products";
  document.getElementById("results-search-label").textContent = query;

  currentFilteredProducts = globalProducts.filter(p => {
    if (currentSearchQuery === "") return true;
    return p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery);
  });

  renderSearchResultsGrid();
}

function sortProducts(type) {
  if (type === 'price-low') {
    currentFilteredProducts.sort((a, b) => parseInt(a.prices.price) - parseInt(b.prices.price));
  } else if (type === 'price-high') {
    currentFilteredProducts.sort((a, b) => parseInt(b.prices.price) - parseInt(a.prices.price));
  } else {
    // Relevance (default)
    currentFilteredProducts.sort((a, b) => a.id - b.id);
  }
  
  // Update checkmarks
  document.getElementById("check-relevance").style.display = type === 'relevance' ? "block" : "none";
  document.getElementById("check-price-low").style.display = type === 'price-low' ? "block" : "none";
  document.getElementById("check-price-high").style.display = type === 'price-high' ? "block" : "none";
  
  renderSearchResultsGrid();
  closeFilterSheet();
}

// --- FILTER BOTTOM SHEET ---
function openFilterSheet() {
  document.getElementById("filter-overlay").style.display = "block";
  setTimeout(() => document.getElementById("filter-overlay").style.opacity = "1", 10);
  document.getElementById("filter-sheet").style.bottom = "0";
}

function closeFilterSheet() {
  document.getElementById("filter-overlay").style.opacity = "0";
  document.getElementById("filter-sheet").style.bottom = "-100%";
  setTimeout(() => document.getElementById("filter-overlay").style.display = "none", 300);
}

function renderSearchResultsGrid() {
  const grid = document.getElementById("final-results-grid");
  const wishlist = getWishlist();
  
  if (currentFilteredProducts.length === 0) {
    grid.innerHTML = `<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No results found</h3></div>`;
    return;
  }

  grid.innerHTML = currentFilteredProducts.map(p => {
    let discountTag = "";
    if (p.on_sale && parseInt(p.prices.regular_price) > parseInt(p.prices.price)) {
      const reg = parseInt(p.prices.regular_price);
      const sale = parseInt(p.prices.price);
      const percent = Math.round(((reg - sale) / reg) * 100);
      discountTag = `<div style="background: #FFD700; color: #111; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${percent}% OFF</div>`;
    }
    
    const isSaved = wishlist.some(item => item.id === p.id);
    const heartColor = isSaved ? "#FF4B2B" : "#aaa";
    const heartIcon = isSaved ? "fa-solid fa-heart" : "fa-regular fa-heart";

    return `
    <div style="background: #fff; border-radius: 12px; padding: 12px; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;" onclick="navigate('product', ${p.id})">
      
      <button onclick="event.stopPropagation(); toggleWishlist(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="position: absolute; top: 12px; right: 12px; background: none; border: none; z-index: 2;">
        <i class="${heartIcon}" style="font-size: 18px; color: ${heartColor};"></i>
      </button>

      <img src="${p.images[0]?.thumbnail || ''}" style="width: 100%; aspect-ratio: 1/1; object-fit: contain; margin-bottom: 8px;">
      
      ${discountTag}
      
      <div style="font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px;">${p.price_html}</div>
      
      <h3 style="font-size: 13px; color: #555; line-height: 1.3; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.name}</h3>
      
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: #888;">1 unit</span>
        <button onclick="event.stopPropagation(); addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" 
          style="background: #fff; border: 1px solid #008C4A; color: #008C4A; font-weight: 700; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          +
        </button>
      </div>
    </div>`;
  }).join("");
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
