const container = document.getElementById("page-container");
const tabbar = document.getElementById("tabbar");

let globalProducts = [];
let currentSearchQuery = "";

let appliedFilters = getEmptyFilters();
let draftFilters = getEmptyFilters();
let minProductPrice = 0;
let maxProductPrice = 10000;
let activeSidebarTab = "sort";
let currentPage = 1;
let paginatedCache = [];

let currentProduct = null;
let selectedAttributes = {};
let productQty = 1;

function getEmptyFilters() {
  return { sort: "relevance", category: null, minPrice: 0, maxPrice: 10000, minDiscount: 0, attributes: {} };
}

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

async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  const stickyBar = document.getElementById("product-sticky-bar");
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";
  stickyBar.style.display = "none";
  
  productQty = 1;
  document.getElementById("product-qty").textContent = "1";
  selectedAttributes = {};

  try {
    let p = globalProducts.find(item => item.id == id);
    if (!p) { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`); p = await res.json(); }
    currentProduct = p;

    let attributesHtml = "";
    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(attr => {
        if (attr.terms.length === 0) return;
        selectedAttributes[attr.name] = attr.terms[0].name;
        
        attributesHtml += `
          <div style="margin-bottom: 24px;">
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #333;">Select ${attr.name}</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${attr.terms.map((term, index) => `
                <div onclick="selectAttribute('${attr.name}', '${term.name}')" 
                     id="attr-${attr.name.replace(/\s/g, '')}-${term.name.replace(/\s/g, '')}"
                     style="padding: 8px 16px; border-radius: 8px; border: 1px solid ${index === 0 ? '#111' : '#ddd'}; background: ${index === 0 ? '#111' : '#fff'}; color: ${index === 0 ? '#fff' : '#333'}; font-size: 14px; cursor: pointer; transition: 0.2s;">
                  ${term.name}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    }

    el.innerHTML = `
      <div style="position: relative;">
        <i class="fa-solid fa-arrow-left" onclick="history.back()" style="position: absolute; top: 16px; left: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10;"></i>
        <img src="${p.images[0]?.src}" style="width:100%; aspect-ratio: 1/1; object-fit: cover; border-bottom: 1px solid #eee;">
      </div>
      
      <div style="padding: 20px 16px;">
        <div style="font-size: 28px; font-weight: 700; color: #111; margin-bottom: 8px;">${p.price_html}</div>
        <h1 style="font-size: 22px; font-weight: 600; color: #333; margin-bottom: 16px; line-height: 1.3;">${p.name}</h1>
        
        <div style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 24px;">
          ${p.description || 'No description available.'}
        </div>

        ${attributesHtml}
      </div>
    `;
    stickyBar.style.display = "block";
  } catch(e) { 
    el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>"; 
  }
}

function selectAttribute(attrName, termName) {
  selectedAttributes[attrName] = termName;
  const container = document.getElementById("product-detail");
  const pills = container.querySelectorAll(`[id^="attr-${attrName.replace(/\s/g, '')}-"]`);
  
  pills.forEach(pill => {
    if (pill.id === `attr-${attrName.replace(/\s/g, '')}-${termName.replace(/\s/g, '')}`) {
      pill.style.border = "1px solid #111"; pill.style.background = "#111"; pill.style.color = "#fff";
    } else {
      pill.style.border = "1px solid #ddd"; pill.style.background = "#fff"; pill.style.color = "#333";
    }
  });
}

function changeProductQty(change) {
  if (productQty + change < 1) return;
  productQty += change;
  document.getElementById("product-qty").textContent = productQty;
}

function handleAddToCart() {
  if (!currentProduct) return;
  if (currentProduct.attributes && currentProduct.attributes.length > 0) {
    for (let attr of currentProduct.attributes) {
      if (!selectedAttributes[attr.name]) { showToast(`Please select ${attr.name}`); return; }
    }
  }

  let attributesString = Object.values(selectedAttributes).join(", ");
  let cartName = currentProduct.name;
  if (attributesString) cartName += ` (${attributesString})`;

  addToCart(currentProduct.id, cartName, currentProduct.prices.price, currentProduct.images[0]?.thumbnail || '', productQty);
}

function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); }

function addToCart(id, name, price, image, qty = 1) {
  let cart = getCart();
  let existing = cart.find(item => item.id === id && item.name === name);
  if (existing) { existing.qty += qty; } else { cart.push({ id, name, price: parseFloat(price), image, qty: qty }); }
  saveCart(cart); showToast(`✓ Added ${qty} to Cart`);
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

function renderCart() {
  const cart = getCart(); const el = document.getElementById("cart-items"); const summary = document.getElementById("cart-summary");
  if (cart.length === 0) { el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2><p style='color:#666; margin-top:8px;'>Looks like you haven't added anything yet.</p></div>"; summary.style.display = "none"; return; }
  let total = 0;
  el.innerHTML = cart.map((item, index) => {
    total += (item.price * item.qty); let displayPrice = (item.price / 100).toFixed(2); let totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    return `<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="${item.image}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;"><div style="flex:1;"><h3 style="font-size:14px; margin-bottom:4px;">${item.name}</h3><div style="color:#666; font-size:13px;">$${displayPrice}</div></div><div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;"><button onclick="changeQty(${index}, -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button><span style="font-size:14px; font-weight:600;">${item.qty}</span><button onclick="changeQty(${index}, 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button></div><div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$${totalForItem}</div></div>`;
  }).join("");
  document.getElementById("cart-total").textContent = `$${(total / 100).toFixed(2)}`; summary.style.display = "block";
}

function changeQty(index, change) {
  let cart = getCart(); 
  if (cart[index]) {
    cart[index].qty += change; 
    if (cart[index].qty <= 0) cart.splice(index, 1); 
    saveCart(cart); renderCart(); 
  }
}

function checkout() { navigate("checkout"); }

updateCartBadge();
handleRoute();

// --- RESTORED SEARCH LOGIC ---
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
  appliedFilters = getEmptyFilters();
  navigate('search-results'); 
}

function initSearchResultsPage() {
  document.getElementById("results-search-label").textContent = currentSearchQuery || "All Products";
  currentPage = 1;
  let searchProducts = globalProducts;
  if (currentSearchQuery) {
    searchProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
  }
  if (searchProducts.length > 0) {
    const prices = searchProducts.map(p => parseInt(p.prices.price) / 100);
    minProductPrice = Math.floor(Math.min(...prices));
    maxProductPrice = Math.ceil(Math.max(...prices));
    appliedFilters.minPrice = minProductPrice;
    appliedFilters.maxPrice = maxProductPrice;
    draftFilters = JSON.parse(JSON.stringify(appliedFilters));
  }
  applyFilters(); 
  buildAmazonSidebar(); 
}

function applyFilters() {
  appliedFilters = JSON.parse(JSON.stringify(draftFilters)); 
  closeFilterSheet();
  currentPage = 1; 
  const products = filterProductList(appliedFilters);
  renderSearchResultsGrid(products);
}

function filterProductList(filters) {
  let products = [...globalProducts];
  if (currentSearchQuery) {
    products = products.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
  }
  if (filters.category) products = products.filter(p => p.categories.some(c => c.name === filters.category));
  products = products.filter(p => { const price = parseInt(p.prices.price) / 100; return price >= filters.minPrice && price <= filters.maxPrice; });
  if (filters.minDiscount > 0) {
    products = products.filter(p => {
      if (!p.on_sale || parseInt(p.prices.regular_price) <= parseInt(p.prices.price)) return false;
      const percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
      return percent >= filters.minDiscount;
    });
  }
  for (let [key, value] of Object.entries(filters.attributes)) {
    products = products.filter(p => { if (!p.attributes) return false; const attr = p.attributes.find(a => a.name === key); return attr && attr.terms.some(t => t.name === value); });
  }
  if (filters.sort === 'price-low') products.sort((a, b) => parseInt(a.prices.price) - parseInt(b.prices.price));
  if (filters.sort === 'price-high') products.sort((a, b) => parseInt(b.prices.price) - parseInt(a.prices.price));
  if (filters.sort === 'rating') products.sort((a, b) => parseInt(b.average_rating) - parseInt(a.average_rating));
  paginatedCache = products;
  return products;
}

function changePage(direction) {
  currentPage += direction;
  renderSearchResultsGrid(paginatedCache);
}

function resetSpecificFilter(type, key) {
  if (type === 'category') appliedFilters.category = null;
  if (type === 'minDiscount') appliedFilters.minDiscount = 0;
  if (type === 'sort') appliedFilters.sort = 'relevance';
  if (type === 'price') { appliedFilters.minPrice = minProductPrice; appliedFilters.maxPrice = maxProductPrice; }
  if (type === 'attr') delete appliedFilters.attributes[key];
  const products = filterProductList(appliedFilters);
  renderSearchResultsGrid(products);
}

function openFilterSheet() {
  draftFilters = JSON.parse(JSON.stringify(appliedFilters));
  activeSidebarTab = "sort";
  buildAmazonSidebar();
  updateFilterCountPreview();
  document.getElementById("filter-overlay").style.display = "block";
  setTimeout(() => { document.getElementById("filter-overlay").style.opacity = "1"; document.getElementById("filter-sheet").classList.add("open"); }, 10);
}
function closeFilterSheet() {
  document.getElementById("filter-overlay").style.opacity = "0";
  document.getElementById("filter-sheet").classList.remove("open");
  setTimeout(() => document.getElementById("filter-overlay").style.display = "none", 300);
}
function resetFilters() {
  draftFilters = getEmptyFilters();
  draftFilters.minPrice = minProductPrice;
  draftFilters.maxPrice = maxProductPrice;
  buildAmazonSidebar();
  updateFilterCountPreview();
}
function resetDraftFilters() {
  draftFilters = getEmptyFilters();
  draftFilters.minPrice = minProductPrice;
  draftFilters.maxPrice = maxProductPrice;
  buildAmazonSidebar();
  updateFilterCountPreview();
}
function updateDraft(key, value) {
  draftFilters[key] = value;
  if (key === 'minPrice' && value >= draftFilters.maxPrice) draftFilters.minPrice = draftFilters.maxPrice - 1;
  if (key === 'maxPrice' && value <= draftFilters.minPrice) draftFilters.maxPrice = draftFilters.minPrice + 1;
  renderFilterContent();
  updateFilterCountPreview();
}
function toggleDraftAttr(attrName, term) {
  if (draftFilters.attributes[attrName] === term) delete draftFilters.attributes[attrName];
  else draftFilters.attributes[attrName] = term;
  renderFilterContent();
  updateFilterCountPreview();
}
function updateFilterCountPreview() {
  const tempProducts = filterProductList(draftFilters);
  document.getElementById("filter-result-count").textContent = tempProducts.length;
}
function executeFilterSearch() { buildAmazonSidebar(); }
