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
let sheetQty = 1;
let activeThumb = null;

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

// --- SEARCH PAGE ---
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`); globalProducts = await res.json(); } catch(e) { return; }
  }
  document.getElementById("trending-search").innerHTML = globalProducts.slice(0, 4).map(p => `
    <div class="card" onclick="navigate('product', ${p.id})"><img src="${p.images[0]?.thumbnail || ''}" loading="lazy"><h3>${p.name}</h3><div class="price">${p.price_html}</div></div>
  `).join("");
  renderRecentSearches();
  setTimeout(() => document.getElementById("search-page-input").focus(), 100);
}
function renderRecentSearches() {
  const recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  const el = document.getElementById("recent-searches");
  if (recents.length === 0) { el.innerHTML = `<span style="font-size: 13px; color: #888;">No recent searches yet.</span>`; return; }
  el.innerHTML = recents.map(term => `<div onclick="clickRecent('${term}')" style="padding: 8px 16px; border: 1px solid #eee; border-radius: 8px; font-size: 13px; color: #333; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-clock-rotate-left" style="color: #999; font-size: 12px;"></i> ${term}</div>`).join("");
}
function clickRecent(term) { document.getElementById("search-page-input").value = term; saveSearchHistory(term); goToSearchResults(); }
function saveSearchHistory(term) {
  term = term.trim().toLowerCase(); if (term.length < 2) return;
  let recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  if (!recents.includes(term)) { recents.unshift(term); if (recents.length > 6) recents.pop(); localStorage.setItem("recent_searches", JSON.stringify(recents)); renderRecentSearches(); }
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
  listEl.innerHTML = filtered.slice(0, 6).map(p => `<div onclick="saveSearchHistory('${p.name.replace(/'/g, "\\'")}'); navigate('product', ${p.id})" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;"><img src="${p.images[0]?.thumbnail || ''}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;"><span style="font-size: 15px; font-weight: 500; color: #333;">${p.name}</span></div>`).join("");
}
function goToSearchResults() { saveSearchHistory(currentSearchQuery); appliedFilters = getEmptyFilters(); navigate('search-results'); }

// --- SEARCH RESULTS & FILTERS ---
function initSearchResultsPage() {
  document.getElementById("results-search-label").textContent = currentSearchQuery || "All Products";
  currentPage = 1;
  let searchProducts = globalProducts;
  if (currentSearchQuery) searchProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
  
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
  if (currentSearchQuery) products = products.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
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

function buildAmazonSidebar() {
  const sidebar = document.getElementById("filter-sidebar");
  const searchVal = document.getElementById("filter-search-input")?.value.toLowerCase() || "";
  let currentProducts = globalProducts;
  if (currentSearchQuery) currentProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));

  let tabs = [ { id: "sort", label: "Sort By" }, { id: "price", label: "Price and Deals" } ];
  const validCats = [...new Set(currentProducts.flatMap(p => p.categories.map(c => c.name)))];
  if (validCats.length > 0) tabs.push({ id: "category", label: "Categories" });
  const validAttributes = [...new Set(currentProducts.flatMap(p => p.attributes?.map(a => a.name) || []))];
  validAttributes.forEach(attr => { if (currentProducts.some(p => p.attributes?.find(a => a.name === attr)?.terms.length > 0)) tabs.push({ id: `attr-${attr}`, label: attr }); });
  const filteredTabs = tabs.filter(t => t.label.toLowerCase().includes(searchVal));

  if (filteredTabs.length === 0) { sidebar.innerHTML = `<div style="padding: 16px; color: #888; font-size: 14px;">No filters found.</div>`; document.getElementById("filter-content").innerHTML = ""; return; }
  if (!filteredTabs.find(t => t.id === activeSidebarTab)) activeSidebarTab = filteredTabs[0].id;
  sidebar.innerHTML = filteredTabs.map(t => `<div onclick="switchFilterTab('${t.id}')" style="padding: 16px; font-size: 14px; border-bottom: 1px solid #eee; cursor: pointer; background: ${activeSidebarTab === t.id ? '#fff' : '#f9f9f9'}; border-left: 3px solid ${activeSidebarTab === t.id ? '#111' : 'transparent'}; font-weight: ${activeSidebarTab === t.id ? '600' : '400'}; color: ${activeSidebarTab === t.id ? '#111' : '#555'};">${t.label}</div>`).join("");
  renderFilterContent();
}

function switchFilterTab(tabId) { activeSidebarTab = tabId; buildAmazonSidebar(); }

function renderFilterContent() {
  const content = document.getElementById("filter-content");
  const searchVal = document.getElementById("filter-search-input")?.value.toLowerCase() || "";
  let html = "";
  if (activeSidebarTab === "sort") {
    const sorts = [{id: 'relevance', label: 'Relevance'},{id: 'price-low', label: 'Price: Low to High'},{id: 'price-high', label: 'Price: High to Low'},{id: 'rating', label: 'Customer Rating'}].filter(s => s.label.toLowerCase().includes(searchVal));
    if (sorts.length === 0) { content.innerHTML = "<p style='color:#888;'>No sort options found.</p>"; return; }
    html += `<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Sort By</h3>`;
    html += sorts.map(s => `<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:12px 0; cursor:pointer;"><input type="radio" name="sort" value="${s.id}" ${draftFilters.sort === s.id ? 'checked' : ''} onchange="updateDraft('sort', '${s.id}')" style="width:20px; height:20px; accent-color:#111;"><span>${s.label}</span></label>`).join('');
  }
  if (activeSidebarTab === "price") {
    html += `<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Price and Deals</h3>`;
    let currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
    const availableDiscounts = currentProducts.map(p => { if (!p.on_sale || parseInt(p.prices.regular_price) <= parseInt(p.prices.price)) return 0; return Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100); }).filter(d => d > 0);
    if (availableDiscounts.length > 0 && "discount".includes(searchVal)) {
      const maxDiscount = Math.max(...availableDiscounts);
      let discountOptions = [];
      if (maxDiscount >= 10) discountOptions.push(10);
      if (maxDiscount >= 20) discountOptions.push(20);
      if (maxDiscount >= 30) discountOptions.push(30);
      if (maxDiscount >= 50) discountOptions.push(50);
      if (maxDiscount >= 70) discountOptions.push(70);
      html += `<h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Discount</h4>`;
      html += `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom: 24px;">${discountOptions.map(d => `<div onclick="updateDraft('minDiscount', ${d === draftFilters.minDiscount ? 0 : d})" style="padding: 8px 16px; border-radius: 20px; border: 1px solid ${draftFilters.minDiscount === d ? '#111' : '#ddd'}; background: ${draftFilters.minDiscount === d ? '#111' : '#fff'}; color: ${draftFilters.minDiscount === d ? '#fff' : '#333'}; font-size: 13px; cursor: pointer;">${d}% Off or more</div>`).join('')}</div>`;
    }
    if ("price".includes(searchVal)) {
      html += `<h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Price</h4>`;
      html += `<div style="font-size: 16px; font-weight: 700; margin-bottom: 16px;">$${draftFilters.minPrice} - $${draftFilters.maxPrice}</div>`;
      const minPercent = ((draftFilters.minPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      const maxPercent = ((draftFilters.maxPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      html += `<div class="custom-slider-container" style="width: 100%;"><div class="custom-slider-track"></div><div class="custom-slider-fill" style="left: ${minPercent}%; width: ${maxPercent - minPercent}%;"></div><div class="custom-slider-thumb" id="thumb-min" style="left: ${minPercent}%;" onpointerdown="startDrag(this, event)"></div><div class="custom-slider-thumb" id="thumb-max" style="left: ${maxPercent}%;" onpointerdown="startDrag(this, event)"></div></div>`;
    }
  }
  if (activeSidebarTab === "category") {
    let currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
    let cats = [...new Set(currentProducts.flatMap(p => p.categories.map(c => c.name)))].filter(c => c.toLowerCase().includes(searchVal));
    if (cats.length === 0) { content.innerHTML = "<p style='color:#888;'>No categories found.</p>"; return; }
    html += `<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Categories</h3>`;
    html += cats.map(c => `<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:10px 0; cursor:pointer;"><input type="radio" name="cat" ${draftFilters.category === c ? 'checked' : ''} onchange="updateDraft('category', '${c}')" style="width:20px; height:20px; accent-color:#111;"><span>${c}</span></label>`).join('');
  }
  if (activeSidebarTab.startsWith("attr-")) {
    const attrName = activeSidebarTab.replace("attr-", "");
    let currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(p => p.name.toLowerCase().includes(currentSearchQuery) || (p.description || "").toLowerCase().includes(currentSearchQuery));
    let terms = [...new Set(currentProducts.flatMap(p => p.attributes?.filter(a => a.name === attrName).flatMap(a => a.terms.map(t => t.name)) || []))].filter(t => t.toLowerCase().includes(searchVal));
    if (terms.length === 0) { content.innerHTML = "<p style='color:#888;'>No options found.</p>"; return; }
    html += `<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">${attrName}</h3>`;
    html += `<div style="display:flex; flex-wrap:wrap; gap:10px;">${terms.map(t => { const isActive = draftFilters.attributes[attrName] === t; return `<div onclick="toggleDraftAttr('${attrName}', '${t}')" style="padding: 10px 16px; border-radius: 20px; border: 1px solid ${isActive ? '#111' : '#ddd'}; background: ${isActive ? '#111' : '#fff'}; color: ${isActive ? '#fff' : '#333'}; font-size: 14px; cursor: pointer;">${t}</div>`; }).join('')}</div>`;
  }
  content.innerHTML = html;
}

function updateDraft(key, value) {
  draftFilters[key] = value;
  if (key === 'minPrice' && value >= draftFilters.maxPrice) draftFilters.minPrice = draftFilters.maxPrice - 1;
  if (key === 'maxPrice' && value <= draftFilters.minPrice) draftFilters.maxPrice = draftFilters.minPrice + 1;
  renderFilterContent(); updateFilterCountPreview();
}
function toggleDraftAttr(attrName, term) {
  if (draftFilters.attributes[attrName] === term) delete draftFilters.attributes[attrName];
  else draftFilters.attributes[attrName] = term;
  renderFilterContent(); updateFilterCountPreview();
}
function updateFilterCountPreview() {
  const tempProducts = filterProductList(draftFilters);
  document.getElementById("filter-result-count").textContent = tempProducts.length;
}
function executeFilterSearch() { buildAmazonSidebar(); }

function renderSearchResultsGrid(products) {
  const grid = document.getElementById("final-results-grid");
  const wishlist = getWishlist();
  const pillsContainer = document.getElementById("active-filters-container");
  let activePillsHtml = "", activeCount = 0;
  if (appliedFilters.category) { activePillsHtml += `<div onclick="resetSpecificFilter('category')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">${appliedFilters.category} <i class="fa-solid fa-xmark"></i></div>`; activeCount++; }
  if (appliedFilters.minDiscount > 0) { activePillsHtml += `<div onclick="resetSpecificFilter('minDiscount')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">${appliedFilters.minDiscount}% Off+ <i class="fa-solid fa-xmark"></i></div>`; activeCount++; }
  if (appliedFilters.sort !== 'relevance') { activePillsHtml += `<div onclick="resetSpecificFilter('sort')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">Sorted <i class="fa-solid fa-xmark"></i></div>`; activeCount++; }
  for (let [k, v] of Object.entries(appliedFilters.attributes)) { activePillsHtml += `<div onclick="resetSpecificFilter('attr','${k}')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">${v} <i class="fa-solid fa-xmark"></i></div>`; activeCount++; }
  if (appliedFilters.minPrice > minProductPrice || appliedFilters.maxPrice < maxProductPrice) { activePillsHtml += `<div onclick="resetSpecificFilter('price')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">$${appliedFilters.minPrice}-$${appliedFilters.maxPrice} <i class="fa-solid fa-xmark"></i></div>`; activeCount++; }
  if (activeCount > 0) { pillsContainer.style.display = "flex"; pillsContainer.innerHTML = activePillsHtml + `<span onclick="resetFilters()" style="font-size:13px; color:#FF4B2B; font-weight:600; cursor:pointer; white-space:nowrap;">Clear All</span>`; } else { pillsContainer.style.display = "none"; }
  const badge = document.getElementById("active-filter-count"); badge.style.display = activeCount > 0 ? "flex" : "none"; badge.textContent = activeCount;

  if (!products || products.length === 0) { grid.innerHTML = `<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No products found</h3><p style="color:#666; font-size:14px; margin-top:8px;">Try adjusting your filters.</p></div>`; document.getElementById("pagination-controls").style.display = "none"; return; }
  
  const itemsPerPage = 20; const totalPages = Math.ceil(products.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = products.slice(startIndex, startIndex + itemsPerPage);
  
  if (totalPages > 1) {
    document.getElementById("pagination-controls").style.display = "flex";
    document.getElementById("page-indicator").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prev-btn").disabled = currentPage === 1; document.getElementById("prev-btn").style.opacity = currentPage === 1 ? "0.5" : "1";
    document.getElementById("next-btn").disabled = currentPage === totalPages; document.getElementById("next-btn").style.opacity = currentPage === totalPages ? "0.5" : "1";
  } else { document.getElementById("pagination-controls").style.display = "none"; }

  grid.innerHTML = paginatedProducts.map(p => {
    let discountTag = "";
    if (p.on_sale && parseInt(p.prices.regular_price) > parseInt(p.prices.price)) {
      const percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
      discountTag = `<div style="background: #FFD700; color: #111; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${percent}% OFF</div>`;
    }
    const isSaved = wishlist.some(item => item.id === p.id); const heartColor = isSaved ? "#FF4B2B" : "#aaa"; const heartIcon = isSaved ? "fa-solid fa-heart" : "fa-regular fa-heart";
    return `<div style="background: #fff; border-radius: 12px; padding: 12px; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;" onclick="navigate('product', ${p.id})"><button onclick="event.stopPropagation(); toggleWishlist(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="position: absolute; top: 12px; right: 12px; background: none; border: none; z-index: 2;"><i class="${heartIcon}" style="font-size: 18px; color: ${heartColor};"></i></button><img src="${p.images[0]?.thumbnail || ''}" style="width: 100%; aspect-ratio: 1/1; object-fit: contain; margin-bottom: 8px;">${discountTag}<div style="font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px;">${p.price_html}</div><h3 style="font-size: 13px; color: #555; line-height: 1.3; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.name}</h3><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 11px; color: #888;">1 unit</span><button onclick="event.stopPropagation(); addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="background: #fff; border: 1px solid #008C4A; color: #008C4A; font-weight: 700; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">+</button></div></div>`;
  }).join("");
}

// --- PRODUCT DETAILS PAGE ---
async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  const stickyBar = document.getElementById("product-sticky-bar");
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>"; stickyBar.style.display = "none";
  
  selectedAttributes = {};

  try {
    let p = globalProducts.find(item => item.id == id);
    if (!p) { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`); p = await res.json(); }
    currentProduct = p;

    // Pre-select first attribute term
    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(attr => {
        if (attr.terms.length > 0) selectedAttributes[attr.name] = attr.terms[0].name;
      });
    }

    el.innerHTML = `
      <div style="position: relative;">
        <i class="fa-solid fa-arrow-left" onclick="history.back()" style="position: absolute; top: 16px; left: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10; backdrop-filter: blur(4px);"></i>
        <i class="fa-regular fa-heart" onclick="toggleWishlist(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="position: absolute; top: 16px; right: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10; backdrop-filter: blur(4px);"></i>
        <img src="${p.images[0]?.src}" style="width:100%; aspect-ratio: 1/1; object-fit: cover; border-bottom: 1px solid #eee;">
      </div>
      
      <div style="padding: 20px 16px;">
        <div style="font-size: 28px; font-weight: 800; color: #111; margin-bottom: 8px;">${p.price_html}</div>
        <h1 style="font-size: 24px; font-weight: 600; color: #333; margin-bottom: 16px; line-height: 1.3;">${p.name}</h1>
        
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
          <div style="color: #FFD700; font-size: 14px;">★★★★★</div>
          <span style="font-size: 13px; color: #888;">(${p.review_count} reviews)</span>
        </div>

        <div style="font-size: 14px; color: #666; line-height: 1.6; margin-bottom: 24px; border-bottom: 1px solid #eee; padding-bottom: 24px;">
          ${p.description || 'No description available.'}
        </div>
      </div>
    `;
    
    document.getElementById("main-btn-price").textContent = (parseInt(p.prices.price) / 100).toFixed(2);
    stickyBar.style.display = "block";

  } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>"; console.log(e)}
}

// --- VARIATION BOTTOM SHEET LOGIC ---
function openVariationSheet() {
  if (!currentProduct) return;
  
  document.getElementById("sheet-img").src = currentProduct.images[0]?.src || '';
  document.getElementById("sheet-price").textContent = `$${(parseInt(currentProduct.prices.price) / 100).toFixed(2)}`;
  
  sheetQty = 1;
  document.getElementById("sheet-qty").textContent = sheetQty;

  let attributesHtml = "";
  if (currentProduct.attributes && currentProduct.attributes.length > 0) {
    currentProduct.attributes.forEach(attr => {
      if (attr.terms.length === 0) return;
      
      attributesHtml += `
        <div style="margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <h4 style="font-size: 14px; font-weight: 700; color: #333; text-transform: uppercase;">${attr.name}</h4>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            ${attr.terms.map(term => {
              const isSelected = selectedAttributes[attr.name] === term.name;
              return `
                <div onclick="selectSheetAttribute('${attr.name}', '${term.name}')" 
                     id="sheet-attr-${attr.name.replace(/\s/g, '')}-${term.name.replace(/\s/g, '')}"
                     style="padding: 10px 18px; border-radius: 50px; border: 1px solid ${isSelected ? '#111' : '#ddd'}; background: ${isSelected ? '#111' : '#fff'}; color: ${isSelected ? '#fff' : '#333'}; font-size: 14px; cursor: pointer; transition: 0.2s; font-weight: 500;">
                  ${term.name}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });
  } else {
    attributesHtml = `<p style="color: #666; text-align: center; padding: 20px;">No options needed for this product.</p>`;
  }

  document.getElementById("sheet-attributes").innerHTML = attributesHtml;

  document.getElementById("variation-overlay").style.display = "block";
  setTimeout(() => {
    document.getElementById("variation-overlay").style.opacity = "1";
    document.getElementById("variation-sheet").style.bottom = "0";
  }, 10);
}

function closeVariationSheet() {
  document.getElementById("variation-overlay").style.opacity = "0";
  document.getElementById("variation-sheet").style.bottom = "-100%";
  setTimeout(() => {
    document.getElementById("variation-overlay").style.display = "none";
  }, 300);
}

function selectSheetAttribute(attrName, termName) {
  selectedAttributes[attrName] = termName;
  
  const sheetContent = document.getElementById("sheet-attributes");
  const pills = sheetContent.querySelectorAll(`[id^="sheet-attr-${attrName.replace(/\s/g, '')}-"]`);
  
  pills.forEach(pill => {
    if (pill.id === `sheet-attr-${attrName.replace(/\s/g, '')}-${termName.replace(/\s/g, '')}`) {
      pill.style.border = "1px solid #111"; pill.style.background = "#111"; pill.style.color = "#fff";
    } else {
      pill.style.border = "1px solid #ddd"; pill.style.background = "#fff"; pill.style.color = "#333";
    }
  });
}

function changeSheetQty(change) {
  if (sheetQty + change < 1) return;
  sheetQty += change;
  document.getElementById("sheet-qty").textContent = sheetQty;
}

function confirmAddToCart() {
  if (!currentProduct) return;
  
  let attributesString = Object.values(selectedAttributes).join(", ");
  let cartName = currentProduct.name;
  if (attributesString) cartName += ` (${attributesString})`;

  addToCart(currentProduct.id, cartName, currentProduct.prices.price, currentProduct.images[0]?.thumbnail || '', sheetQty);
  
  closeVariationSheet();
  
  const btn = document.getElementById("product-sticky-bar").querySelector("button");
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-check"></i> Added to Cart!`;
  btn.style.background = "#008C4A";
  
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    btn.style.background = "#111";
  }, 2000);
}

// --- UTILITIES & OTHER PAGES ---
function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); }
function addToCart(id, name, price, image, qty = 1) {
  let cart = getCart(); let existing = cart.find(item => item.id === id && item.name === name);
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

function changeQty(index, change) { let cart = getCart(); if (cart[index]) { cart[index].qty += change; if (cart[index].qty <= 0) cart.splice(index, 1); saveCart(cart); renderCart(); } }
function checkout() { navigate("checkout"); }
function changePage(direction) { currentPage += direction; renderSearchResultsGrid(paginatedCache); }
function resetSpecificFilter(type, key) { if (type === 'category') appliedFilters.category = null; if (type === 'minDiscount') appliedFilters.minDiscount = 0; if (type === 'sort') appliedFilters.sort = 'relevance'; if (type === 'price') { appliedFilters.minPrice = minProductPrice; appliedFilters.maxPrice = maxProductPrice; } if (type === 'attr') delete appliedFilters.attributes[key]; const products = filterProductList(appliedFilters); renderSearchResultsGrid(products); }

function openFilterSheet() { draftFilters = JSON.parse(JSON.stringify(appliedFilters)); activeSidebarTab = "sort"; buildAmazonSidebar(); updateFilterCountPreview(); document.getElementById("filter-overlay").style.display = "block"; setTimeout(() => { document.getElementById("filter-overlay").style.opacity = "1"; document.getElementById("filter-sheet").classList.add("open"); }, 10); }
function closeFilterSheet() { document.getElementById("filter-overlay").style.opacity = "0"; document.getElementById("filter-sheet").classList.remove("open"); setTimeout(() => document.getElementById("filter-overlay").style.display = "none", 300); }
function resetFilters() { draftFilters = getEmptyFilters(); draftFilters.minPrice = minProductPrice; draftFilters.maxPrice = maxProductPrice; buildAmazonSidebar(); updateFilterCountPreview(); }
function resetDraftFilters() { draftFilters = getEmptyFilters(); draftFilters.minPrice = minProductPrice; draftFilters.maxPrice = maxProductPrice; buildAmazonSidebar(); updateFilterCountPreview(); }

function startDrag(thumb, e) { activeThumb = thumb; document.addEventListener("pointermove", onDrag); document.addEventListener("pointerup", stopDrag); }
function onDrag(e) { if (!activeThumb) return; const container = activeThumb.parentElement; const rect = container.getBoundingClientRect(); let x = e.clientX - rect.left; x = Math.max(0, Math.min(x, rect.width)); const percent = x / rect.width; const value = Math.round(minProductPrice + percent * (maxProductPrice - minProductPrice)); if (activeThumb.id === "thumb-min") { if (value < draftFilters.maxPrice) updateDraft('minPrice', value); } else { if (value > draftFilters.minPrice) updateDraft('maxPrice', value); } }
function stopDrag() { activeThumb = null; document.removeEventListener("pointermove", onDrag); document.removeEventListener("pointerup", stopDrag); }

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

updateCartBadge();
handleRoute();
