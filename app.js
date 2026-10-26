const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

let globalProducts = [];
let currentSearchQuery = "";

// Filter State
let filterState = {
  sort: "relevance",
  category: null,
  minPrice: 0,
  maxPrice: 10000,
  attributes: {} 
};

let minProductPrice = 0;
let maxProductPrice = 10000;

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
    } catch (e) { container.innerHTML = `<p style="padding:20px;">Error loading page: ${pageId}</p>`; }
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.id === pageId));
}

// --- SEARCH LOGIC ---
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`); globalProducts = await res.json(); } catch(e) { return; }
  }

  document.getElementById("trending-search").innerHTML = globalProducts.slice(0, 4).map(p => `
    <div class="card" onclick="navigate('product', ${p.id})">
      <img src="${p.images[0]?.thumbnail || ''}" loading="lazy"><h3>${p.name}</h3><div class="price">${p.price_html}</div>
    </div>
  `).join("");

  renderRecentSearches();
  setTimeout(() => document.getElementById("search-page-input").focus(), 100);
}

function renderRecentSearches() {
  const recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  const el = document.getElementById("recent-searches");
  if (recents.length === 0) { el.innerHTML = `<span style="font-size: 13px; color: #888;">No recent searches yet.</span>`; return; }
  el.innerHTML = recents.map(term => `
    <div onclick="clickRecent('${term}')" style="padding: 8px 16px; border: 1px solid #eee; border-radius: 8px; font-size: 13px; color: #333; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-clock-rotate-left" style="color: #999; font-size: 12px;"></i> ${term}
    </div>
  `).join("");
}

function clickRecent(term) { document.getElementById("search-page-input").value = term; saveSearchHistory(term); goToSearchResults(); }

function saveSearchHistory(term) {
  term = term.trim().toLowerCase();
  if (term.length < 2) return;
  let recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  if (!recents.includes(term)) {
    recents.unshift(term); if (recents.length > 6) recents.pop();
    localStorage.setItem("recent_searches", JSON.stringify(recents)); renderRecentSearches();
  }
}

function clearRecent() { localStorage.removeItem("recent_searches"); renderRecentSearches(); }

function executeSearch() {
  const query = document.getElementById("search-page-input").value.trim().toLowerCase();
  currentSearchQuery = query;
  const defaultState = document.getElementById("default-search-state");
  const activeState = document.getElementById("active-search-state");

  if (query.length === 0) { defaultState.style.display = "block"; activeState.style.display = "none"; return; } 
  else { defaultState.style.display = "none"; activeState.style.display = "block"; }

  const filtered = globalProducts.filter(p => p.name.toLowerCase().includes(query));
  const listEl = document.getElementById("autocomplete-list");
  if (filtered.length === 0) { listEl.innerHTML = `<p style="font-size:14px; color:#666;">No results for "${query}"</p>`; return; }
  listEl.innerHTML = filtered.slice(0, 6).map(p => `
    <div onclick="saveSearchHistory('${p.name.replace(/'/g, "\\'")}'); navigate('product', ${p.id})" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
      <img src="${p.images[0]?.thumbnail || ''}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">
      <span style="font-size: 15px; font-weight: 500; color: #333;">${p.name}</span>
    </div>
  `).join("");
}

function goToSearchResults() { 
  saveSearchHistory(currentSearchQuery); 
  resetFilters(false); 
  navigate('search-results'); 
}

// --- AMAZON STYLE FILTER UI ---
function initSearchResultsPage() {
  document.getElementById("results-search-label").textContent = currentSearchQuery || "All Products";
  
  // Set min and max limits for the price slider
  if (globalProducts.length > 0) {
    const prices = globalProducts.map(p => parseInt(p.prices.price) / 100);
    minProductPrice = Math.floor(Math.min(...prices));
    maxProductPrice = Math.ceil(Math.max(...prices));
    if (filterState.minPrice === 0) filterState.minPrice = minProductPrice;
    if (filterState.maxPrice === 10000) filterState.maxPrice = maxProductPrice;
  }

  buildFilterSheetUI();
  applyFilters(); // Initial load
}

function buildFilterSheetUI() {
  const container = document.getElementById("filter-accordion-container");
  let html = "";

  // 1. Sort UI (Radio Buttons)
  html += createAccordion("sort", "Sort By", `
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${[
        {id: 'relevance', label: 'Relevance'},
        {id: 'price-low', label: 'Price: Low to High'},
        {id: 'price-high', label: 'Price: High to Low'},
        {id: 'rating', label: 'Customer Rating'}
      ].map(s => `
        <label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:8px 0; cursor:pointer;">
          <input type="radio" name="sort" value="${s.id}" ${filterState.sort === s.id ? 'checked' : ''} onchange="filterState.sort='${s.id}'" style="width:18px; height:18px; accent-color:#111;">
          <span>${s.label}</span>
        </label>
      `).join('')}
    </div>
  `);

  // 2. Price UI (Dual Slider)
  html += createAccordion("price", "Price Range", `
    <div style="padding: 10px 0;">
      <div style="display:flex; justify-content:space-between; margin-bottom:16px; font-weight:600; font-size:14px;">
        <span>$${filterState.minPrice}</span>
        <span>$${filterState.maxPrice}</span>
      </div>
      <div style="position:relative; height:30px;">
        <!-- Slider track -->
        <div style="position:absolute; top:50%; left:0; right:0; height:4px; background:#ddd; border-radius:2px; transform:translateY(-50%); z-index:0;"></div>
        <!-- The actual inputs -->
        <input type="range" min="${minProductPrice}" max="${maxProductPrice}" value="${filterState.minPrice}" oninput="handleMinPrice(this.value)" style="position:absolute; width:100%; pointer-events:none; appearance:none; background:none; top:0; z-index:1;">
        <input type="range" min="${minProductPrice}" max="${maxProductPrice}" value="${filterState.maxPrice}" oninput="handleMaxPrice(this.value)" style="position:absolute; width:100%; pointer-events:none; appearance:none; background:none; top:0; z-index:2;">
      </div>
    </div>
  `);

  // 3. Categories
  const cats = [...new Set(globalProducts.flatMap(p => p.categories.map(c => c.name)))];
  html += createAccordion("category", "Categories", `
    <div style="display:flex; flex-direction:column; gap:12px;">
      ${cats.map(c => `
        <label style="display:flex; align-items:center; gap:12px; font-size:14px; cursor:pointer;">
          <input type="radio" name="cat" ${filterState.category === c ? 'checked' : ''} onchange="filterState.category='${c}'" style="width:18px; height:18px; accent-color:#111;">
          <span>${c}</span>
        </label>
      `).join('')}
    </div>
  `);

  // 4. Dynamic Attributes (Color, Size, etc.)
  const allAttributes = [...new Set(globalProducts.flatMap(p => p.attributes?.map(a => a.name) || []))];
  
  allAttributes.forEach(attrName => {
    const terms = [...new Set(globalProducts.flatMap(p => p.attributes?.filter(a => a.name === attrName).flatMap(a => a.terms.map(t => t.name)) || []))];
    if (terms.length === 0) return;

    html += createAccordion(`attr-${attrName}`, attrName, `
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${terms.map(t => `
          <div onclick="toggleFilterPill('${attrName}', '${t}')" style="padding: 8px 16px; border-radius: 20px; border: 1px solid ${filterState.attributes[attrName] === t ? '#111' : '#ddd'}; background: ${filterState.attributes[attrName] === t ? '#111' : '#fff'}; color: ${filterState.attributes[attrName] === t ? '#fff' : '#333'}; font-size: 13px; cursor: pointer;">${t}</div>
        `).join('')}
      </div>
    `);
  });

  container.innerHTML = html;
}

function handleMinPrice(val) {
  if (parseInt(val) >= filterState.maxPrice) filterState.minPrice = filterState.maxPrice - 1;
  else filterState.minPrice = parseInt(val);
  updatePriceUI();
}

function handleMaxPrice(val) {
  if (parseInt(val) <= filterState.minPrice) filterState.maxPrice = filterState.minPrice + 1;
  else filterState.maxPrice = parseInt(val);
  updatePriceUI();
}

function updatePriceUI() {
  const el = document.getElementById("accordion-price");
  if(el) { const spans = el.querySelectorAll("span"); spans[0].textContent = `$${filterState.minPrice}`; spans[1].textContent = `$${filterState.maxPrice}`; }
}

function createAccordion(id, title, content) {
  return `
    <div style="border-bottom: 1px solid #eee; padding: 16px 0;">
      <div onclick="toggleAccordion('${id}')" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <h3 style="font-size: 16px; font-weight: 600; color: #111;">${title}</h3>
        <i class="fa-solid fa-chevron-down" id="icon-${id}" style="transition: 0.3s; color: #666;"></i>
      </div>
      <div id="accordion-${id}" style="display: none; padding-top: 16px;">
        ${content}
      </div>
    </div>
  `;
}

function toggleAccordion(id) {
  const el = document.getElementById(`accordion-${id}`);
  const icon = document.getElementById(`icon-${id}`);
  if (el.style.display === "none" || el.style.display === "") {
    el.style.display = "block";
    icon.style.transform = "rotate(180deg)";
  } else {
    el.style.display = "none";
    icon.style.transform = "rotate(0deg)";
  }
}

function toggleFilterPill(type, value) {
  if (filterState.attributes[type] === value) delete filterState.attributes[type];
  else filterState.attributes[type] = value;
  buildFilterSheetUI(); 
}

function resetFilters(rerender = true) {
  filterState = { sort: "relevance", category: null, minPrice: minProductPrice, maxPrice: maxProductPrice, attributes: {} };
  if (rerender) {
    buildFilterSheetUI();
    applyFilters();
  }
}

// --- LOCAL FILTERING (100% ACCURATE, NO ERRORS) ---
function applyFilters() {
  closeFilterSheet();
  
  // 1. Start with all products
  let products = [...globalProducts];

  // 2. Filter by Query
  if (currentSearchQuery) {
    products = products.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
  }

  // 3. Filter by Category
  if (filterState.category) {
    products = products.filter(p => p.categories.some(c => c.name === filterState.category));
  }

  // 4. Filter by Price (Remember, prices are in cents! 1800 = $18)
  products = products.filter(p => {
    const price = parseInt(p.prices.price) / 100; 
    return price >= filterState.minPrice && price <= filterState.maxPrice;
  });

  // 5. Filter by Attributes (Color, Size, etc)
  for (let [key, value] of Object.entries(filterState.attributes)) {
    products = products.filter(p => {
      if (!p.attributes) return false;
      const attr = p.attributes.find(a => a.name === key);
      return attr && attr.terms.some(t => t.name === value);
    });
  }

  // 6. Sort Products
  if (filterState.sort === 'price-low') {
    products.sort((a, b) => parseInt(a.prices.price) - parseInt(b.prices.price));
  } else if (filterState.sort === 'price-high') {
    products.sort((a, b) => parseInt(b.prices.price) - parseInt(a.prices.price));
  } else if (filterState.sort === 'rating') {
    products.sort((a, b) => parseInt(b.average_rating) - parseInt(a.average_rating));
  }

  // Update Active Filter Badge
  let activeCount = (filterState.category ? 1 : 0) + (filterState.sort !== 'relevance' ? 1 : 0) + Object.keys(filterState.attributes).length;
  if (filterState.minPrice > minProductPrice || filterState.maxPrice < maxProductPrice) activeCount++;
  
  const badge = document.getElementById("active-filter-count");
  badge.style.display = activeCount > 0 ? "flex" : "none";
  badge.textContent = activeCount;

  // Render Results
  renderSearchResultsGrid(products);
}

function renderSearchResultsGrid(products) {
  const grid = document.getElementById("final-results-grid");
  const wishlist = getWishlist();
  
  if (!products || products.length === 0) {
    grid.innerHTML = `<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No products found</h3><p style="color:#666; font-size:14px; margin-top:8px;">Try adjusting your filters.</p></div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    let discountTag = "";
    if (p.on_sale && parseInt(p.prices.regular_price) > parseInt(p.prices.price)) {
      const percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
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
        <button onclick="event.stopPropagation(); addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="background: #fff; border: 1px solid #008C4A; color: #008C4A; font-weight: 700; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">+</button>
      </div>
    </div>`;
  }).join("");
}

// --- FILTER BOTTOM SHEET UI ---
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

// --- OTHER PAGES ---
async function loadProducts(containerId) {
  const el = document.getElementById(containerId); if (!el) return;
  if (globalProducts.length > 0) { renderProductGrid(containerId, globalProducts); return; }
  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";
  try { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`); globalProducts = await res.json(); renderProductGrid(containerId, globalProducts); } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>"; }
}
function renderProductGrid(containerId, products) {
  const el = document.getElementById(containerId); if (!el) return;
  if (products.length === 0) { el.innerHTML = "<p>No products found.</p>"; return; }
  el.innerHTML = products.map(p => `<div class="card" onclick="navigate('product', ${p.id})"><img src="${p.images[0]?.thumbnail || ''}" loading="lazy" alt="${p.name}"><h3>${p.name}</h3><div class="price">${p.price_html}</div></div>`).join("");
}

async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail"); el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";
  try {
    let p = globalProducts.find(item => item.id == id);
    if (!p) { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`); p = await res.json(); }
    el.innerHTML = `
      <div style="padding-bottom: 80px;">
        <img src="${p.images[0]?.src}" style="width:100%; border-radius:12px; margin-bottom:16px;">
        <h1 style="font-size:24px; margin-bottom:8px; color:#111;">${p.name}</h1>
        <div style="font-size:20px; font-weight:bold; color:#111; margin-bottom:16px;">${p.price_html}</div>
        <div style="font-size:14px; color:#555; line-height:1.5; margin-bottom:24px;">${p.description || ''}</div>
      </div>
      <div style="position:fixed; bottom:60px; left:0; right:0; padding:16px; background:#fff; border-top:1px solid #eee;">
        <button onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="width:100%; padding:16px; background:#111; color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:bold;">Add to Cart</button>
      </div>`;
  } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>"; }
}

// --- WISHLIST & CART ---
function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function saveWishlist(w) { localStorage.setItem("native_wishlist", JSON.stringify(w)); }
function toggleWishlist(id, name, price, image) {
  let w = getWishlist(); let exists = w.find(item => item.id === id);
  if (exists) { w = w.filter(item => item.id !== id); showToast("Removed from Wishlist"); } 
  else { w.push({ id, name, price: parseFloat(price), image }); showToast("✓ Added to Wishlist"); }
  saveWishlist(w);
  if (window.location.hash === "#search-results") applyFilters();
  if (window.location.hash === "#wishlist") renderWishlistPage();
}
function renderWishlistPage() {
  const w = getWishlist(); const grid = document.getElementById("wishlist-grid");
  if (w.length === 0) { grid.innerHTML = "<div style='grid-column: span 2; text-align: center; padding: 40px;'><i class='fa-regular fa-heart' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h3>Your wishlist is empty</h3></div>"; return; }
  grid.innerHTML = w.map(p => `<div class="card" onclick="navigate('product', ${p.id})"><img src="${p.image}" loading="lazy"><div style="padding: 8px 12px;"><h3>${p.name}</h3></div></div>`).join("");
}

function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); }
function addToCart(id, name, price, image) {
  let cart = getCart(); let existing = cart.find(item => item.id === id);
  if (existing) { existing.qty += 1; } else { cart.push({ id, name, price: parseFloat(price), image, qty: 1 }); }
  saveCart(cart); showToast("✓ Added to Cart");
}
function updateCartBadge() {
  const cart = getCart(); const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTab = document.querySelector('.tab[data-id="cart"]');
  if (cartTab) {
    let badge = cartTab.querySelector(".cart-badge");
    if (!badge) { badge = document.createElement("div"); badge.className = "cart-badge"; badge.style.cssText = "position:absolute; top:10px; right:25%; background:#FF4B2B; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center;"; cartTab.appendChild(badge); }
    badge.textContent = totalItems; badge.style.display = totalItems > 0 ? "flex" : "none";
  }
}
function renderCart() {
  const cart = getCart(); const el = document.getElementById("cart-items"); const summary = document.getElementById("cart-summary");
  if (cart.length === 0) { el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2><p style='color:#666; margin-top:8px;'>Looks like you haven't added anything yet.</p></div>"; summary.style.display = "none"; return; }
  let total = 0;
  el.innerHTML = cart.map(item => {
    total += (item.price * item.qty); let displayPrice = (item.price / 100).toFixed(2); let totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    return `<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="${item.image}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;"><div style="flex:1;"><h3 style="font-size:14px; margin-bottom:4px;">${item.name}</h3><div style="color:#666; font-size:13px;">$${displayPrice}</div></div><div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;"><button onclick="changeQty(${item.id}, -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button><span style="font-size:14px; font-weight:600;">${item.qty}</span><button onclick="changeQty(${item.id}, 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button></div><div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$${totalForItem}</div></div>`;
  }).join("");
  document.getElementById("cart-total").textContent = `$${(total / 100).toFixed(2)}`; summary.style.display = "block";
}
function changeQty(id, change) {
  let cart = getCart(); let item = cart.find(i => i.id === id);
  if (item) { item.qty += change; if (item.qty <= 0) cart = cart.filter(i => i.id !== id); saveCart(cart); renderCart(); }
}
function checkout() { navigate("checkout"); }

updateCartBadge();
handleRoute();
