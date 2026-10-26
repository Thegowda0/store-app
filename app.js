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
  setTimeout(function() { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }, 10);
  setTimeout(function() { toast.style.opacity = "0"; toast.style.transform = "translateX(-50%) translateY(20px)"; }, 2500);
}

window.addEventListener('hashchange', handleRoute);
function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) navigate("home", null, false);
  else if (hash.indexOf('product-') === 0) navigate("product", hash.split('-')[1], false);
  else navigate(hash, null, false);
}

async function navigate(pageId, param, pushHistory) {
  if (param === undefined) param = null;
  if (pushHistory === undefined) pushHistory = true;
  if (pushHistory) {
    if (pageId === "home") history.pushState(null, "", window.location.pathname);
    else if (pageId === "product") history.pushState(null, "", "#product-" + param);
    else history.pushState(null, "", "#" + pageId);
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
    } catch (e) { container.innerHTML = "<p style='padding:20px;'>Error loading page: " + pageId + "</p>"; }
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = '<iframe src="' + APP_CONFIG.siteUrl + path + '" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>';
  }
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.toggle("active", t.dataset.id === pageId); }); if (pageId === "product") { document.body.classList.add("on-product-page"); } else { document.body.classList.remove("on-product-page"); } if (typeof updateFloatingCartBubble === "function") setTimeout(updateFloatingCartBubble, 100);
}

// --- SEARCH PAGE ---
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try { const res = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products?per_page=50"); globalProducts = await res.json(); } catch(e) { return; }
  }
  var trending = document.getElementById("trending-search");
  if (trending) trending.innerHTML = globalProducts.slice(0, 4).map(function(p) {
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + (p.images[0] ? p.images[0].thumbnail : '') + '" loading="lazy"><h3>' + p.name + '</h3><div class="price">' + p.price_html + '</div></div>';
  }).join("");
  renderRecentSearches();
  setTimeout(function() { var inp = document.getElementById("search-page-input"); if (inp) inp.focus(); }, 100);
}

function renderRecentSearches() {
  var recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  var el = document.getElementById("recent-searches");
  if (!el) return;
  if (recents.length === 0) { el.innerHTML = '<span style="font-size: 13px; color: #888;">No recent searches yet.</span>'; return; }
  el.innerHTML = recents.map(function(term) {
    return '<div onclick="clickRecent(\'' + term + '\')" style="padding: 8px 16px; border: 1px solid #eee; border-radius: 8px; font-size: 13px; color: #333; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-clock-rotate-left" style="color: #999; font-size: 12px;"></i> ' + term + '</div>';
  }).join("");
}

function clickRecent(term) { document.getElementById("search-page-input").value = term; saveSearchHistory(term); goToSearchResults(); }
function saveSearchHistory(term) {
  term = term.trim().toLowerCase(); if (term.length < 2) return;
  var recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  if (recents.indexOf(term) === -1) { recents.unshift(term); if (recents.length > 6) recents.pop(); localStorage.setItem("recent_searches", JSON.stringify(recents)); renderRecentSearches(); }
}
function clearRecent() { localStorage.removeItem("recent_searches"); renderRecentSearches(); }

function executeSearch() {
  var query = document.getElementById("search-page-input").value.trim().toLowerCase();
  currentSearchQuery = query;
  var defaultState = document.getElementById("default-search-state");
  var activeState = document.getElementById("active-search-state");
  if (query.length === 0) { defaultState.style.display = "block"; activeState.style.display = "none"; return; }
  else { defaultState.style.display = "none"; activeState.style.display = "block"; }
  var filtered = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(query) !== -1; });
  var listEl = document.getElementById("autocomplete-list");
  if (filtered.length === 0) { listEl.innerHTML = '<p style="font-size:14px; color:#666;">No results for "' + query + '"</p>'; return; }
  listEl.innerHTML = filtered.slice(0, 6).map(function(p) {
    return '<div onclick="saveSearchHistory(\'' + p.name.replace(/'/g, "\\'") + '\'); navigate(\'product\', ' + p.id + ')" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;"><img src="' + (p.images[0] ? p.images[0].thumbnail : '') + '" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;"><span style="font-size: 15px; font-weight: 500; color: #333;">' + p.name + '</span></div>';
  }).join("");
}
function goToSearchResults() { saveSearchHistory(currentSearchQuery); appliedFilters = getEmptyFilters(); navigate('search-results'); }

// --- SEARCH RESULTS & FILTERS ---
function initSearchResultsPage() {
  document.getElementById("results-search-label").textContent = currentSearchQuery || "All Products";
  currentPage = 1;
  var searchProducts = globalProducts;
  if (currentSearchQuery) searchProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
  if (searchProducts.length > 0) {
    var prices = searchProducts.map(function(p) { return parseInt(p.prices.price) / 100; });
    minProductPrice = Math.floor(Math.min.apply(null, prices));
    maxProductPrice = Math.ceil(Math.max.apply(null, prices));
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
  var products = filterProductList(appliedFilters);
  renderSearchResultsGrid(products);
}

function filterProductList(filters) {
  var products = globalProducts.slice();
  if (currentSearchQuery) products = products.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
  if (filters.category) products = products.filter(function(p) { return p.categories.some(function(c) { return c.name === filters.category; }); });
  products = products.filter(function(p) { var price = parseInt(p.prices.price) / 100; return price >= filters.minPrice && price <= filters.maxPrice; });
  if (filters.minDiscount > 0) {
    products = products.filter(function(p) {
      if (!p.on_sale || parseInt(p.prices.regular_price) <= parseInt(p.prices.price)) return false;
      var percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
      return percent >= filters.minDiscount;
    });
  }
  Object.keys(filters.attributes).forEach(function(key) {
    var value = filters.attributes[key];
    products = products.filter(function(p) { if (!p.attributes) return false; var attr = p.attributes.find(function(a) { return a.name === key; }); return attr && attr.terms.some(function(t) { return t.name === value; }); });
  });
  if (filters.sort === 'price-low') products.sort(function(a, b) { return parseInt(a.prices.price) - parseInt(b.prices.price); });
  if (filters.sort === 'price-high') products.sort(function(a, b) { return parseInt(b.prices.price) - parseInt(a.prices.price); });
  if (filters.sort === 'rating') products.sort(function(a, b) { return parseInt(b.average_rating || 0) - parseInt(a.average_rating || 0); });
  paginatedCache = products;
  return products;
}

function buildAmazonSidebar() {
  var sidebar = document.getElementById("filter-sidebar");
  if (!sidebar) return;
  var searchInput = document.getElementById("filter-search-input");
  var searchVal = searchInput ? searchInput.value.toLowerCase() : "";
  var currentProducts = globalProducts;
  if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
  var tabs = [ { id: "sort", label: "Sort By" }, { id: "price", label: "Price and Deals" } ];
  var validCats = [];
  currentProducts.forEach(function(p) { p.categories.forEach(function(c) { if (validCats.indexOf(c.name) === -1) validCats.push(c.name); }); });
  if (validCats.length > 0) tabs.push({ id: "category", label: "Categories" });
  var validAttributes = [];
  currentProducts.forEach(function(p) { if (p.attributes) p.attributes.forEach(function(a) { if (validAttributes.indexOf(a.name) === -1) validAttributes.push(a.name); }); });
  validAttributes.forEach(function(attr) {
    var hasTerms = currentProducts.some(function(p) { var a = p.attributes ? p.attributes.find(function(x) { return x.name === attr; }) : null; return a && a.terms.length > 0; });
    if (hasTerms) tabs.push({ id: "attr-" + attr, label: attr });
  });
  var filteredTabs = tabs.filter(function(t) { return t.label.toLowerCase().indexOf(searchVal) !== -1; });
  if (filteredTabs.length === 0) { sidebar.innerHTML = '<div style="padding: 16px; color: #888; font-size: 14px;">No filters found.</div>'; document.getElementById("filter-content").innerHTML = ""; return; }
  if (!filteredTabs.find(function(t) { return t.id === activeSidebarTab; })) activeSidebarTab = filteredTabs[0].id;
  sidebar.innerHTML = filteredTabs.map(function(t) {
    return '<div onclick="switchFilterTab(\'' + t.id + '\')" style="padding: 16px; font-size: 14px; border-bottom: 1px solid #eee; cursor: pointer; background: ' + (activeSidebarTab === t.id ? '#fff' : '#f9f9f9') + '; border-left: 3px solid ' + (activeSidebarTab === t.id ? '#111' : 'transparent') + '; font-weight: ' + (activeSidebarTab === t.id ? '600' : '400') + '; color: ' + (activeSidebarTab === t.id ? '#111' : '#555') + ';">' + t.label + '</div>';
  }).join("");
  renderFilterContent();
}

function switchFilterTab(tabId) { activeSidebarTab = tabId; buildAmazonSidebar(); }

function renderFilterContent() {
  var content = document.getElementById("filter-content");
  if (!content) return;
  var searchInput = document.getElementById("filter-search-input");
  var searchVal = searchInput ? searchInput.value.toLowerCase() : "";
  var html = "";
  if (activeSidebarTab === "sort") {
    var sorts = [{id: 'relevance', label: 'Relevance'},{id: 'price-low', label: 'Price: Low to High'},{id: 'price-high', label: 'Price: High to Low'},{id: 'rating', label: 'Customer Rating'}].filter(function(s) { return s.label.toLowerCase().indexOf(searchVal) !== -1; });
    if (sorts.length === 0) { content.innerHTML = "<p style='color:#888;'>No sort options found.</p>"; return; }
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Sort By</h3>';
    html += sorts.map(function(s) {
      return '<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:12px 0; cursor:pointer;"><input type="radio" name="sort" value="' + s.id + '" ' + (draftFilters.sort === s.id ? 'checked' : '') + ' onchange="updateDraft(\'sort\', \'' + s.id + '\')" style="width:20px; height:20px; accent-color:#111;"><span>' + s.label + '</span></label>';
    }).join('');
  }
  if (activeSidebarTab === "price") {
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Price and Deals</h3>';
    var currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
    var availableDiscounts = currentProducts.map(function(p) { if (!p.on_sale || parseInt(p.prices.regular_price) <= parseInt(p.prices.price)) return 0; return Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100); }).filter(function(d) { return d > 0; });
    if (availableDiscounts.length > 0 && "discount".indexOf(searchVal) !== -1) {
      var maxDiscount = Math.max.apply(null, availableDiscounts);
      var discountOptions = [];
      if (maxDiscount >= 10) discountOptions.push(10);
      if (maxDiscount >= 20) discountOptions.push(20);
      if (maxDiscount >= 30) discountOptions.push(30);
      if (maxDiscount >= 50) discountOptions.push(50);
      if (maxDiscount >= 70) discountOptions.push(70);
      html += '<h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Discount</h4>';
      html += '<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom: 24px;">' + discountOptions.map(function(d) {
        return '<div onclick="updateDraft(\'minDiscount\', ' + (d === draftFilters.minDiscount ? 0 : d) + ')" style="padding: 8px 16px; border-radius: 20px; border: 1px solid ' + (draftFilters.minDiscount === d ? '#111' : '#ddd') + '; background: ' + (draftFilters.minDiscount === d ? '#111' : '#fff') + '; color: ' + (draftFilters.minDiscount === d ? '#fff' : '#333') + '; font-size: 13px; cursor: pointer;">' + d + '% Off or more</div>';
      }).join('') + '</div>';
    }
    if ("price".indexOf(searchVal) !== -1) {
      html += '<h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Price</h4>';
      html += '<div style="font-size: 16px; font-weight: 700; margin-bottom: 16px;">$' + draftFilters.minPrice + ' - $' + draftFilters.maxPrice + '</div>';
      var minPercent = ((draftFilters.minPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      var maxPercent = ((draftFilters.maxPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      html += '<div class="custom-slider-container" style="width: 100%;"><div class="custom-slider-track"></div><div class="custom-slider-fill" style="left: ' + minPercent + '%; width: ' + (maxPercent - minPercent) + '%;"></div><div class="custom-slider-thumb" id="thumb-min" style="left: ' + minPercent + '%;" onpointerdown="startDrag(this, event)"></div><div class="custom-slider-thumb" id="thumb-max" style="left: ' + maxPercent + '%;" onpointerdown="startDrag(this, event)"></div></div>';
    }
  }
  if (activeSidebarTab === "category") {
    var currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
    var cats = [];
    currentProducts.forEach(function(p) { p.categories.forEach(function(c) { if (cats.indexOf(c.name) === -1) cats.push(c.name); }); });
    cats = cats.filter(function(c) { return c.toLowerCase().indexOf(searchVal) !== -1; });
    if (cats.length === 0) { content.innerHTML = "<p style='color:#888;'>No categories found.</p>"; return; }
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Categories</h3>';
    html += cats.map(function(c) {
      return '<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:10px 0; cursor:pointer;"><input type="radio" name="cat" ' + (draftFilters.category === c ? 'checked' : '') + ' onchange="updateDraft(\'category\', \'' + c + '\')" style="width:20px; height:20px; accent-color:#111;"><span>' + c + '</span></label>';
    }).join('');
  }
  if (activeSidebarTab.indexOf("attr-") === 0) {
    var attrName = activeSidebarTab.replace("attr-", "");
    var currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
    var terms = [];
    currentProducts.forEach(function(p) { if (p.attributes) p.attributes.filter(function(a) { return a.name === attrName; }).forEach(function(a) { a.terms.forEach(function(t) { if (terms.indexOf(t.name) === -1) terms.push(t.name); }); }); });
    terms = terms.filter(function(t) { return t.toLowerCase().indexOf(searchVal) !== -1; });
    if (terms.length === 0) { content.innerHTML = "<p style='color:#888;'>No options found.</p>"; return; }
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">' + attrName + '</h3>';
    html += '<div style="display:flex; flex-wrap:wrap; gap:10px;">' + terms.map(function(t) {
      var isActive = draftFilters.attributes[attrName] === t;
      return '<div onclick="toggleDraftAttr(\'' + attrName + '\', \'' + t + '\')" style="padding: 10px 16px; border-radius: 20px; border: 1px solid ' + (isActive ? '#111' : '#ddd') + '; background: ' + (isActive ? '#111' : '#fff') + '; color: ' + (isActive ? '#fff' : '#333') + '; font-size: 14px; cursor: pointer;">' + t + '</div>';
    }).join('') + '</div>';
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
  var tempProducts = filterProductList(draftFilters);
  var el = document.getElementById("filter-result-count");
  if (el) el.textContent = tempProducts.length;
}
function executeFilterSearch() { buildAmazonSidebar(); }

function renderSearchResultsGrid(products) {
  var grid = document.getElementById("final-results-grid");
  if (!grid) return;
  var wishlist = getWishlist();
  var pillsContainer = document.getElementById("active-filters-container");
  var activePillsHtml = "", activeCount = 0;
  if (appliedFilters.category) { activePillsHtml += '<div onclick="resetSpecificFilter(\'category\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + appliedFilters.category + ' <i class="fa-solid fa-xmark"></i></div>'; activeCount++; }
  if (appliedFilters.minDiscount > 0) { activePillsHtml += '<div onclick="resetSpecificFilter(\'minDiscount\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + appliedFilters.minDiscount + '% Off+ <i class="fa-solid fa-xmark"></i></div>'; activeCount++; }
  if (appliedFilters.sort !== 'relevance') { activePillsHtml += '<div onclick="resetSpecificFilter(\'sort\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">Sorted <i class="fa-solid fa-xmark"></i></div>'; activeCount++; }
  Object.keys(appliedFilters.attributes).forEach(function(k) {
    var v = appliedFilters.attributes[k];
    activePillsHtml += '<div onclick="resetSpecificFilter(\'attr\',\'' + k + '\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + v + ' <i class="fa-solid fa-xmark"></i></div>'; activeCount++;
  });
  if (appliedFilters.minPrice > minProductPrice || appliedFilters.maxPrice < maxProductPrice) { activePillsHtml += '<div onclick="resetSpecificFilter(\'price\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">$' + appliedFilters.minPrice + '-$' + appliedFilters.maxPrice + ' <i class="fa-solid fa-xmark"></i></div>'; activeCount++; }
  if (pillsContainer) {
    if (activeCount > 0) { pillsContainer.style.display = "flex"; pillsContainer.innerHTML = activePillsHtml + '<span onclick="resetFilters()" style="font-size:13px; color:#FF4B2B; font-weight:600; cursor:pointer; white-space:nowrap;">Clear All</span>'; } else { pillsContainer.style.display = "none"; }
  }
  var badge = document.getElementById("active-filter-count");
  if (badge) { badge.style.display = activeCount > 0 ? "flex" : "none"; badge.textContent = activeCount; }

  if (!products || products.length === 0) { grid.innerHTML = '<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No products found</h3><p style="color:#666; font-size:14px; margin-top:8px;">Try adjusting your filters.</p></div>'; var pc = document.getElementById("pagination-controls"); if (pc) pc.style.display = "none"; return; }

  var itemsPerPage = 20;
  var totalPages = Math.ceil(products.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var startIndex = (currentPage - 1) * itemsPerPage;
  var paginatedProducts = products.slice(startIndex, startIndex + itemsPerPage);

  var pcontrols = document.getElementById("pagination-controls");
  if (pcontrols) {
    if (totalPages > 1) {
      pcontrols.style.display = "flex";
      document.getElementById("page-indicator").textContent = "Page " + currentPage + " of " + totalPages;
      document.getElementById("prev-btn").disabled = currentPage === 1;
      document.getElementById("prev-btn").style.opacity = currentPage === 1 ? "0.5" : "1";
      document.getElementById("next-btn").disabled = currentPage === totalPages;
      document.getElementById("next-btn").style.opacity = currentPage === totalPages ? "0.5" : "1";
    } else { pcontrols.style.display = "none"; }
  }

  grid.innerHTML = paginatedProducts.map(function(p) {
    var discountTag = "";
    if (p.on_sale && parseInt(p.prices.regular_price) > parseInt(p.prices.price)) {
      var percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
      discountTag = '<div style="background: #FFD700; color: #111; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">' + percent + '% OFF</div>';
    }
    var isSaved = wishlist.some(function(item) { return item.id === p.id; });
    var heartColor = isSaved ? "#FF4B2B" : "#aaa";
    var heartIcon = isSaved ? "fa-solid fa-heart" : "fa-regular fa-heart";
    var safeName = p.name.replace(/'/g, "\\'");
    var thumb = p.images[0] ? p.images[0].thumbnail : '';
    return '<div style="background: #fff; border-radius: 12px; padding: 12px; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;" onclick="navigate(\'product\', ' + p.id + ')">' +
      '<button onclick="event.stopPropagation(); toggleWishlist(' + p.id + ', \'' + safeName + '\', ' + p.prices.price + ', \'' + thumb + '\')" style="position: absolute; top: 12px; right: 12px; background: none; border: none; z-index: 2;"><i class="' + heartIcon + '" style="font-size: 18px; color: ' + heartColor + ';"></i></button>' +
      '<img src="' + thumb + '" style="width: 100%; aspect-ratio: 1/1; object-fit: contain; margin-bottom: 8px;">' +
      discountTag +
      '<div style="font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px;">' + p.price_html + '</div>' +
      '<h3 style="font-size: 13px; color: #555; line-height: 1.3; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">' + p.name + '</h3>' +
      '<div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 11px; color: #888;">1 unit</span><button onclick="event.stopPropagation(); addToCart(' + p.id + ', \'' + safeName + '\', ' + p.prices.price + ', \'' + thumb + '\')" style="background: #fff; border: 1px solid #008C4A; color: #008C4A; font-weight: 700; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">+</button></div>' +
    '</div>';
  }).join("");
}

// --- PRODUCT DETAILS PAGE ---

// --- VARIATION BOTTOM SHEET LOGIC ---





// --- UTILITIES & OTHER PAGES ---
function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); if (typeof updateFloatingCartBubble === "function") updateFloatingCartBubble(); }
function addToCart(id, name, price, image, qty) {
  if (qty === undefined) qty = 1;
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === id && item.name === name; });
  if (existing) { existing.qty += qty; } else { cart.push({ id: id, name: name, price: parseFloat(price), image: image, qty: qty }); }
  saveCart(cart); showToast("✓ Added " + qty + " to Cart");
}
function updateCartBadge() {
  var cart = getCart();
  var totalItems = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
  var cartTab = document.querySelector('.tab[data-id="cart"]');
  if (cartTab) {
    var badge = cartTab.querySelector(".cart-badge");
    if (!badge) { badge = document.createElement("div"); badge.className = "cart-badge"; badge.style.cssText = "position:absolute; top:10px; right:25%; background:#FF4B2B; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center;"; cartTab.appendChild(badge); }
    badge.textContent = totalItems; badge.style.display = totalItems > 0 ? "flex" : "none";
  }
}

function renderCart() {
  var cart = getCart();
  var el = document.getElementById("cart-items");
  var summary = document.getElementById("cart-summary");
  if (!el || !summary) return;
  if (cart.length === 0) { el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2><p style='color:#666; margin-top:8px;'>Looks like you haven't added anything yet.</p></div>"; summary.style.display = "none"; return; }
  var total = 0;
  el.innerHTML = cart.map(function(item, index) {
    total += (item.price * item.qty);
    var displayPrice = (item.price / 100).toFixed(2);
    var totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    return '<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="' + item.image + '" style="width:64px; height:64px; border-radius:8px; object-fit:cover;"><div style="flex:1;"><h3 style="font-size:14px; margin-bottom:4px;">' + item.name + '</h3><div style="color:#666; font-size:13px;">$' + displayPrice + '</div></div><div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;"><button onclick="changeQty(' + index + ', -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button><span style="font-size:14px; font-weight:600;">' + item.qty + '</span><button onclick="changeQty(' + index + ', 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button></div><div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$' + totalForItem + '</div></div>';
  }).join("");
  document.getElementById("cart-total").textContent = "$" + (total / 100).toFixed(2);
  summary.style.display = "block";
}

function changeQty(index, change) {
  var cart = getCart();
  if (cart[index]) { cart[index].qty += change; if (cart[index].qty <= 0) cart.splice(index, 1); saveCart(cart); renderCart(); }
}

function checkout() { navigate("checkout"); }
function changePage(direction) { currentPage += direction; renderSearchResultsGrid(paginatedCache); }

function resetSpecificFilter(type, key) {
  if (type === 'category') appliedFilters.category = null;
  if (type === 'minDiscount') appliedFilters.minDiscount = 0;
  if (type === 'sort') appliedFilters.sort = 'relevance';
  if (type === 'price') { appliedFilters.minPrice = minProductPrice; appliedFilters.maxPrice = maxProductPrice; }
  if (type === 'attr') delete appliedFilters.attributes[key];
  var products = filterProductList(appliedFilters);
  renderSearchResultsGrid(products);
}

function openFilterSheet() {
  draftFilters = JSON.parse(JSON.stringify(appliedFilters));
  activeSidebarTab = "sort";
  buildAmazonSidebar();
  updateFilterCountPreview();
  var overlay = document.getElementById("filter-overlay");
  var sheet = document.getElementById("filter-sheet");
  if (overlay) overlay.style.display = "block";
  setTimeout(function() {
    if (overlay) overlay.style.opacity = "1";
    if (sheet) sheet.classList.add("open");
  }, 10);
}
function closeFilterSheet() {
  var overlay = document.getElementById("filter-overlay");
  var sheet = document.getElementById("filter-sheet");
  if (overlay) overlay.style.opacity = "0";
  if (sheet) sheet.classList.remove("open");
  setTimeout(function() { if (overlay) overlay.style.display = "none"; }, 300);
}
function resetFilters() { draftFilters = getEmptyFilters(); draftFilters.minPrice = minProductPrice; draftFilters.maxPrice = maxProductPrice; buildAmazonSidebar(); updateFilterCountPreview(); }
function resetDraftFilters() { draftFilters = getEmptyFilters(); draftFilters.minPrice = minProductPrice; draftFilters.maxPrice = maxProductPrice; buildAmazonSidebar(); updateFilterCountPreview(); }

function startDrag(thumb, e) {
  activeThumb = thumb;
  document.addEventListener("pointermove", onDrag);
  document.addEventListener("pointerup", stopDrag);
}
function onDrag(e) {
  if (!activeThumb) return;
  var container = activeThumb.parentElement;
  var rect = container.getBoundingClientRect();
  var x = e.clientX - rect.left;
  x = Math.max(0, Math.min(x, rect.width));
  var percent = x / rect.width;
  var value = Math.round(minProductPrice + percent * (maxProductPrice - minProductPrice));
  if (activeThumb.id === "thumb-min") { if (value < draftFilters.maxPrice) updateDraft('minPrice', value); }
  else { if (value > draftFilters.minPrice) updateDraft('maxPrice', value); }
}
function stopDrag() {
  activeThumb = null;
  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", stopDrag);
}

async function loadProducts(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (globalProducts.length > 0) { renderProductGrid(containerId, globalProducts); return; }
  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";
  try {
    var res = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products?per_page=50");
    globalProducts = await res.json();
    renderProductGrid(containerId, globalProducts);
  } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>"; }
}

function renderProductGrid(containerId, products) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (products.length === 0) { el.innerHTML = "<p>No products found.</p>"; return; }
  el.innerHTML = products.map(function(p) {
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + (p.images[0] ? p.images[0].thumbnail : '') + '" loading="lazy" alt="' + p.name + '"><h3>' + p.name + '</h3><div class="price">' + p.price_html + '</div></div>';
  }).join("");
}

function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function saveWishlist(w) { localStorage.setItem("native_wishlist", JSON.stringify(w)); }
function toggleWishlist(id, name, price, image) {
  var w = getWishlist();
  var exists = w.find(function(item) { return item.id === id; });
  if (exists) { w = w.filter(function(item) { return item.id !== id; }); showToast("Removed from Wishlist"); }
  else { w.push({ id: id, name: name, price: parseFloat(price), image: image }); showToast("✓ Added to Wishlist"); }
  saveWishlist(w);
  if (window.location.hash === "#search-results") applyFilters();
  if (window.location.hash === "#wishlist") renderWishlistPage();
}
function renderWishlistPage() {
  var w = getWishlist();
  var grid = document.getElementById("wishlist-grid");
  if (!grid) return;
  if (w.length === 0) { grid.innerHTML = "<div style='grid-column: span 2; text-align: center; padding: 40px;'><i class='fa-regular fa-heart' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h3>Your wishlist is empty</h3></div>"; return; }
  grid.innerHTML = w.map(function(p) {
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + p.image + '" loading="lazy"><div style="padding: 8px 12px;"><h3>' + p.name + '</h3></div></div>';
  }).join("");
}

updateCartBadge();
handleRoute();

// --- GUARANTEED TABBAR FIX ---
function forceBuildTabbar() {
  var tabbarEl = document.getElementById("tabbar");
  if (!tabbarEl) {
    tabbarEl = document.createElement("nav");
    tabbarEl.id = "tabbar";
    document.body.appendChild(tabbarEl);
  }
  tabbarEl.style.cssText = "position:fixed;bottom:0;left:0;right:0;height:60px;display:flex;background:#fff;border-top:1px solid #eee;z-index:500;padding-bottom:env(safe-area-inset-bottom);";
  tabbarEl.innerHTML = "";
  if (typeof APP_CONFIG === "undefined" || !APP_CONFIG.tabs) return;
  APP_CONFIG.tabs.forEach(function(tab) {
    var btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.id = tab.id;
    btn.style.cssText = "flex:1;border:0;background:none;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:#888;cursor:pointer;position:relative;padding:4px 0;";
    btn.innerHTML = '<span style="font-size:20px;">' + tab.icon + '</span><small style="font-size:10px;">' + tab.label + '</small>';
    btn.onclick = function() { navigate(tab.id, null, true); };
    tabbarEl.appendChild(btn);
  });
  // highlight active tab based on current hash
  var hash = window.location.hash.replace('#', '') || 'home';
  var activeId = hash.indexOf('product-') === 0 ? 'home' : (hash.indexOf('-') > -1 ? hash.split('-')[0] : hash);
  tabbarEl.querySelectorAll(".tab").forEach(function(t) {
    if (t.dataset.id === activeId || t.dataset.id === hash) {
      t.style.color = "#111";
    }
  });
  updateCartBadge();
}

// Run on load
setTimeout(forceBuildTabbar, 50);
setTimeout(forceBuildTabbar, 300);

// Wrap navigate to always rebuild after page change
var _origNavigate = navigate;
navigate = async function(pageId, param, pushHistory) {
  await _origNavigate(pageId, param, pushHistory);
  setTimeout(forceBuildTabbar, 20);
};

// ============ PRODUCT PAGE — FULL BUILD ============
var _currentProduct = null;
var _selectedAttributes = {};
var _productQty = 1;
var _productImages = [];
var _viewerIndex = 0;
var _pendingSmartAdd = null;

async function loadSingleProduct(id) {
  var el = document.getElementById("product-detail");
  var stickyBar = document.getElementById("product-sticky-bar");
  if (!el || !stickyBar) return;
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>";
  stickyBar.style.display = "none";
  _selectedAttributes = {};
  _productQty = 1;

  try {
    var p = globalProducts.find(function(item) { return item.id == id; });
    if (!p) {
      var res = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/" + id);
      if (!res.ok) throw new Error("API error: " + res.status);
      p = await res.json();
    }
    if (!p || !p.id) throw new Error("Product not found");
    _currentProduct = p;

    _productImages = (p.images || []).map(function(img) { return img.src; });
    if (_productImages.length === 0) _productImages = [""];

    // Auto-select first attribute term
    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(function(attr) {
        if (attr.terms && attr.terms.length > 0) _selectedAttributes[attr.name] = attr.terms[0].name;
      });
    }

    renderProductPage(p);
  } catch(e) {
    console.log("Product load error:", e);
    el.innerHTML = '<div style="padding:20px; text-align:center;"><p>Error loading product.</p><p style="font-size:12px; color:#888; margin-top:8px;">' + e.message + '</p><button onclick="history.back()" style="margin-top:16px; padding:10px 20px; background:#111; color:#fff; border:none; border-radius:8px;">Go Back</button></div>';
  }
}

function renderProductPage(p) {
  var el = document.getElementById("product-detail");
  var stickyBar = document.getElementById("product-sticky-bar");
  var mainImg = _productImages[0] || "";
  var category = (p.categories && p.categories.length > 0) ? p.categories[0].name : "";
  var categorySlug = (p.categories && p.categories.length > 0) ? p.categories[0].slug : "";
  var brand = (p.brands && p.brands.length > 0) ? p.brands[0].name : "";

  var html = "";

  // --- HEADER IMAGE WITH GLASSOMORPHIC BUTTONS ---
  html += '<div style="position: relative; background: #fff;">';
  html += '<img id="main-product-img" onclick="openImageViewer(0)" src="' + mainImg + '" style="width:100%; aspect-ratio: 1/1; object-fit: cover; cursor: pointer;">';
  // Glass header
  html += '<div style="position: absolute; top: 0; left: 0; right: 0; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">';
  html += '  <div onclick="navigate(\'home\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-arrow-down" style="color: #111; font-size: 16px;"></i></div>';
  html += '  <div style="display: flex; gap: 8px;">';
  html += '    <div onclick="toggleWishlist(' + p.id + ', \'' + (p.name || "").replace(/'/g, "\\'") + '\', ' + (p.prices ? p.prices.price : 0) + ', \'' + ((p.images && p.images[0]) ? p.images[0].thumbnail : '') + '\')" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">var __inWish = getWishlist().some(function(w) { return w.id === p.id; });
  <div id="product-heart-btn" onclick="toggleProductHeart()" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i id="product-heart-icon" class="' + (__inWish ? 'fa-solid' : 'fa-regular') + ' fa-heart" style="color: ' + (__inWish ? '#FF4B2B' : '#111') + '; font-size: 16px;"></i></div>';';
  html += '    <div onclick="navigate(\'search\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-magnifying-glass" style="color: #111; font-size: 16px;"></i></div>';
  html += '    <div onclick="shareProduct(\'' + (p.name || "").replace(/'/g, "\\'") + '\', \'' + (p.permalink || "") + '\')" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-share-nodes" style="color: #111; font-size: 16px;"></i></div>';
  html += '  </div>';
  html += '</div>';
  html += '</div>';

  // --- THUMBNAILS (under image) ---
  if (_productImages.length > 1) {
    html += '<div style="display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; background: #fff; border-bottom: 1px solid #eee;">';
    _productImages.forEach(function(img, i) {
      html += '<img onclick="openImageViewer(' + i + ')" src="' + img + '" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid #eee;">';
    });
    html += '</div>';
  }

  // --- TITLE + PRICE BLOCK ---
  html += '<div style="background: #fff; padding: 16px;">';
  html += '<div style="font-size: 26px; font-weight: 800; color: #111; margin-bottom: 8px;">' + (p.price_html || "") + '</div>';
  html += '<h1 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 12px; line-height: 1.3;">' + (p.name || "") + '</h1>';
  html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">';
  html += '<div style="color: #FFD700; font-size: 14px;">★★★★★</div>';
  html += '<span style="font-size: 13px; color: #888;">(' + (p.review_count || 0) + ' reviews)</span>';
  html += '</div>';

  // --- BRAND + CATEGORY CHIPS ---
  if (brand || category) {
    html += '<div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">';
    if (brand) html += '<div onclick="navigate(\'webview\', \'brand/' + (p.brands[0].slug || "") + '\', true)" style="padding: 6px 12px; background: #f0f0f0; border-radius: 20px; font-size: 12px; font-weight: 600; color: #333; cursor: pointer;">Brand: ' + brand + '</div>';
    if (category) html += '<div onclick="navigate(\'webview\', \'category/' + categorySlug + '\', true)" style="padding: 6px 12px; background: #f0f0f0; border-radius: 20px; font-size: 12px; font-weight: 600; color: #333; cursor: pointer;">Category: ' + category + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // --- ATTRIBUTES (INLINE) ---
  if (p.attributes && p.attributes.length > 0) {
    html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
    p.attributes.forEach(function(attr) {
      if (!attr.terms || attr.terms.length === 0) return;
      html += '<div style="margin-bottom: 20px;">';
      html += '<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">';
      html += '<h4 style="font-size: 13px; font-weight: 700; color: #333; text-transform: uppercase;">' + attr.name + '</h4>';
      html += '<span style="font-size: 12px; color: #888;">' + _selectedAttributes[attr.name] + '</span>';
      html += '</div>';
      html += '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
      attr.terms.forEach(function(term) {
        var isSelected = _selectedAttributes[attr.name] === term.name;
        var attrKey = attr.name.replace(/\s/g, '');
        var termKey = term.name.replace(/\s/g, '');
        html += '<div onclick="selectProductAttribute(\'' + attr.name + '\', \'' + term.name + '\')" id="prod-attr-' + attrKey + '-' + termKey + '" style="padding: 10px 18px; border-radius: 50px; border: 1px solid ' + (isSelected ? '#111' : '#ddd') + '; background: ' + (isSelected ? '#111' : '#fff') + '; color: ' + (isSelected ? '#fff' : '#333') + '; font-size: 14px; cursor: pointer; font-weight: 500;">' + term.name + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
  }

  // --- PRODUCT INFORMATION ---
  html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Product Information</h3>';
  html += '<div style="font-size: 14px; color: #555; line-height: 1.6;">' + (p.description || p.short_description || "No description available.") + '</div>';
  if (p.sku) html += '<div style="margin-top: 12px; font-size: 13px; color: #888;">SKU: ' + p.sku + '</div>';
  if (p.is_in_stock === false) html += '<div style="margin-top: 8px; font-size: 13px; color: #d33; font-weight: 600;">Out of Stock</div>';
  else html += '<div style="margin-top: 8px; font-size: 13px; color: #008C4A; font-weight: 600;">In Stock</div>';
  html += '</div>';

  // --- SIMILAR PRODUCTS (same category) ---
  if (categorySlug) {
    var similar = globalProducts.filter(function(x) { return x.id !== p.id && x.categories.some(function(c) { return c.slug === categorySlug; }); }).slice(0, 10);
    if (similar.length > 0) {
      html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
      html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Similar Products</h3>';
      html += '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
      similar.forEach(function(s) {
        html += '<div onclick="navigate(\'product\', ' + s.id + ')" style="min-width: 140px; cursor: pointer;">';
        html += '<img src="' + ((s.images && s.images[0]) ? s.images[0].thumbnail : '') + '" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover; background: #f5f5f5;">';
        html += '<div style="font-size: 13px; font-weight: 600; margin-top: 6px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + s.name + '</div>';
        html += '<div style="font-size: 12px; color: #666; margin-top: 2px;">' + (s.price_html || "").replace(/<[^>]*>/g, "").trim() + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  // --- TOP PRODUCTS IN CATEGORY (sorted by rating) ---
  if (categorySlug) {
    var topProducts = globalProducts.filter(function(x) { return x.id !== p.id && x.categories.some(function(c) { return c.slug === categorySlug; }); }).sort(function(a, b) { return parseFloat(b.average_rating || 0) - parseFloat(a.average_rating || 0); }).slice(0, 10);
    if (topProducts.length > 0 && topProducts[0].average_rating > 0) {
      html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
      html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Top Rated in ' + category + '</h3>';
      html += '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
      topProducts.forEach(function(s) {
        html += '<div onclick="navigate(\'product\', ' + s.id + ')" style="min-width: 140px; cursor: pointer;">';
        html += '<img src="' + ((s.images && s.images[0]) ? s.images[0].thumbnail : '') + '" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover; background: #f5f5f5;">';
        html += '<div style="font-size: 13px; font-weight: 600; margin-top: 6px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + s.name + '</div>';
        html += '<div style="font-size: 12px; color: #666; margin-top: 2px;">★ ' + (parseFloat(s.average_rating || 0).toFixed(1)) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  // --- REVIEWS ---
  html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Reviews (' + (p.review_count || 0) + ')</h3>';
  if (p.review_count > 0) {
    html += '<div style="font-size: 14px; color: #666;">Customer reviews are available. Tap to read more.</div>';
    html += '<button onclick="navigate(\'product-\' + ' + p.id + ' + \'-reviews\')" style="margin-top: 12px; padding: 10px 20px; background: #f5f5f5; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Read Reviews</button>';
  } else {
    html += '<div style="font-size: 14px; color: #888;">No reviews yet. Be the first to review this product.</div>';
  }
  html += '</div>';

  el.innerHTML = html;

  // Update sticky bar
  var stickyPrice = document.getElementById("sticky-price");
  var stickySummary = document.getElementById("sticky-attr-summary");
  if (stickyPrice) stickyPrice.textContent = (p.prices && p.prices.price) ? "$" + (parseInt(p.prices.price) / 100).toFixed(2) : "$0.00";
  if (stickySummary) stickySummary.textContent = Object.values(_selectedAttributes).join(", ");
  stickyBar.style.display = "block";
  if (typeof updateProductAddButton === "function") setTimeout(updateProductAddButton, 50);
}

function selectProductAttribute(attrName, termName) {
  _selectedAttributes[attrName] = termName;
  // Update UI
  if (!_currentProduct || !_currentProduct.attributes) return;
  _currentProduct.attributes.forEach(function(attr) {
    if (!attr.terms) return;
    var attrKey = attr.name.replace(/\s/g, '');
    attr.terms.forEach(function(term) {
      var termKey = term.name.replace(/\s/g, '');
      var pill = document.getElementById("prod-attr-" + attrKey + "-" + termKey);
      if (!pill) return;
      var isSelected = _selectedAttributes[attr.name] === term.name;
      pill.style.border = "1px solid " + (isSelected ? "#111" : "#ddd");
      pill.style.background = isSelected ? "#111" : "#fff";
      pill.style.color = isSelected ? "#fff" : "#333";
    });
  });
  // Update sticky summary
  var summary = document.getElementById("sticky-attr-summary");
  if (summary) summary.textContent = Object.values(_selectedAttributes).join(", ");
  if (typeof updateProductAddButton === "function") updateProductAddButton();
}

function handleStickyAddToCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;

  // If product has attributes
  if (p.attributes && p.attributes.length > 0) {
    // Check if all attributes are selected
    var missing = null;
    for (var i = 0; i < p.attributes.length; i++) {
      var attr = p.attributes[i];
      if (!attr.terms || attr.terms.length === 0) continue;
      if (!_selectedAttributes[attr.name]) { missing = attr.name; break; }
    }
    if (missing) {
      showToast("Please select " + missing);
      return;
    }
    // All selected — add to cart directly
    doAddToCart();
  } else {
    // No attributes — add directly, no popup
    doAddToCart();
  }
}

function openSmartPopup() {
  var popup = document.getElementById("smart-popup");
  if (popup) popup.style.display = "flex";
}
function closeSmartPopup() {
  var popup = document.getElementById("smart-popup");
  if (popup) popup.style.display = "none";
  _pendingSmartAdd = null;
}
function confirmSmartAdd() {
  closeSmartPopup();
  doAddToCart();
}

function doAddToCart() {
  var p = _currentProduct;
  if (!p) return;
  var attrString = Object.values(_selectedAttributes).join(", ");
  var cartName = p.name;
  if (attrString) cartName += " (" + attrString + ")";
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === p.id && item.name === cartName; });
  if (existing) {
    existing.qty += 1;
    saveCart(cart);
  } else {
    addToCart(p.id, cartName, (p.prices ? p.prices.price : 0), ((p.images && p.images[0]) ? p.images[0].thumbnail : ""), 1);
  }
  updateProductAddButton();
}

function shareProduct(name, url) {
  if (navigator.share) {
    navigator.share({ title: name, url: url });
  } else {
    showToast("Share link copied");
    if (navigator.clipboard) navigator.clipboard.writeText(url);
  }
}

// --- FULLSCREEN IMAGE VIEWER ---
function openImageViewer(index) {
  _viewerIndex = index;
  var viewer = document.getElementById("image-viewer");
  var largeImg = document.getElementById("viewer-large-img");
  var thumbs = document.getElementById("image-viewer-thumbs");
  if (!viewer || !largeImg || !thumbs) return;
  viewer.style.display = "flex";
  largeImg.src = _productImages[_viewerIndex];
  thumbs.innerHTML = "";
  _productImages.forEach(function(img, i) {
    var t = document.createElement("img");
    t.src = img;
    t.style.cssText = "width:60px;height:60px;border-radius:6px;object-fit:cover;cursor:pointer;border:2px solid " + (i === _viewerIndex ? "#fff" : "transparent");
    t.onclick = function() { _viewerIndex = i; largeImg.src = img; updateViewerThumbs(); };
    thumbs.appendChild(t);
  });
}
function updateViewerThumbs() {
  var thumbs = document.getElementById("image-viewer-thumbs");
  var largeImg = document.getElementById("viewer-large-img");
  if (!thumbs || !largeImg) return;
  largeImg.src = _productImages[_viewerIndex];
  Array.from(thumbs.children).forEach(function(t, i) {
    t.style.border = "2px solid " + (i === _viewerIndex ? "#fff" : "transparent");
  });
}
function viewerPrev() {
  _viewerIndex = (_viewerIndex - 1 + _productImages.length) % _productImages.length;
  updateViewerThumbs();
}
function viewerNext() {
  _viewerIndex = (_viewerIndex + 1) % _productImages.length;
  updateViewerThumbs();
}
function closeImageViewer() {
  var viewer = document.getElementById("image-viewer");
  if (viewer) viewer.style.display = "none";
}


function toggleProductHeart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  toggleWishlist(p.id, p.name, (p.prices ? p.prices.price : 0), ((p.images && p.images[0]) ? p.images[0].thumbnail : ''));
  var isIn = getWishlist().some(function(w) { return w.id === p.id; });
  var icon = document.getElementById("product-heart-icon");
  if (icon) {
    icon.className = (isIn ? "fa-solid" : "fa-regular") + " fa-heart";
    icon.style.color = isIn ? "#FF4B2B" : "#111";
  }
}

// --- SWIPE SUPPORT FOR IMAGE VIEWER ---
var _viewerTouchStartX = 0;
var _viewerTouchEndX = 0;
document.addEventListener("DOMContentLoaded", function() {
  var viewerMain = document.getElementById("image-viewer-main");
  if (!viewerMain) return;
  viewerMain.addEventListener("touchstart", function(e) {
    _viewerTouchStartX = e.changedTouches[0].screenX;
  }, false);
  viewerMain.addEventListener("touchend", function(e) {
    _viewerTouchEndX = e.changedTouches[0].screenX;
    handleViewerSwipe();
  }, false);
});

function handleViewerSwipe() {
  var diff = _viewerTouchEndX - _viewerTouchStartX;
  if (Math.abs(diff) < 50) return; // ignore small taps
  if (diff > 0) { viewerPrev(); } else { viewerNext(); }
}

// --- FLOATING CART BUBBLE ---
function updateFloatingCartBubble() {
  var bubble = document.getElementById("floating-cart-bubble");
  var imagesEl = document.getElementById("bubble-images");
  var countEl = document.getElementById("bubble-count");
  if (!bubble || !imagesEl || !countEl) return;

  var cart = getCart();
  var isProductPage = document.body.classList.contains("on-product-page");

  if (cart.length === 0 || !isProductPage) {
    bubble.style.display = "none";
    return;
  }

  bubble.style.display = "flex";
  var totalItems = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
  countEl.textContent = totalItems + (totalItems === 1 ? " item" : " items");

  // Show up to 3 latest product images (newest first) as overlapping circles
  var recentItems = cart.slice().reverse().slice(0, 3);
  imagesEl.innerHTML = "";
  recentItems.forEach(function(item, i) {
    var img = document.createElement("img");
    img.src = item.image;
    img.style.cssText = "width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; background: #fff; margin-left: " + (i === 0 ? "0" : "-10px") + "; z-index: " + (10 - i) + ";";
    imagesEl.appendChild(img);
  });

  // Bounce animation on update
  bubble.style.transform = "scale(1.05)";
  setTimeout(function() { bubble.style.transform = "scale(1)"; }, 200);
}


function updateProductAddButton() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var attrString = Object.values(_selectedAttributes).join(", ");
  var cartName = p.name;
  if (attrString) cartName += " (" + attrString + ")";
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === p.id && item.name === cartName; });
  var bar = document.getElementById("product-sticky-bar");
  if (!bar) return;
  var btnContainer = bar.querySelector("div");
  if (!btnContainer) return;

  // Clear the button area and rebuild
  var oldBtn = document.getElementById("sticky-add-btn");
  var oldQty = document.getElementById("sticky-qty-control");
  if (oldBtn) oldBtn.remove();
  if (oldQty) oldQty.remove();

  if (existing && existing.qty > 0) {
    // Show + / qty / - control
    var qtyDiv = document.createElement("div");
    qtyDiv.id = "sticky-qty-control";
    qtyDiv.style.cssText = "display:flex; align-items:center; gap:16px; background:#111; color:#fff; padding:12px 20px; border-radius:12px; font-size:15px; font-weight:700;";
    qtyDiv.innerHTML = '<button onclick="decrementProductInCart()" style="border:none;background:none;color:#fff;font-size:20px;font-weight:bold;cursor:pointer;padding:0 4px;">−</button>' +
                       '<span style="min-width:20px; text-align:center;">' + existing.qty + '</span>' +
                       '<button onclick="incrementProductInCart()" style="border:none;background:none;color:#fff;font-size:20px;font-weight:bold;cursor:pointer;padding:0 4px;">+</button>';
    btnContainer.appendChild(qtyDiv);
  } else {
    // Show Add to Cart
    var btn = document.createElement("button");
    btn.id = "sticky-add-btn";
    btn.onclick = handleStickyAddToCart;
    btn.style.cssText = "padding:14px 32px; background:#111; color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:700; cursor:pointer;";
    btn.textContent = "Add to Cart";
    btnContainer.appendChild(btn);
  }
}

function incrementProductInCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var attrString = Object.values(_selectedAttributes).join(", ");
  var cartName = p.name;
  if (attrString) cartName += " (" + attrString + ")";
  var cart = getCart();
  var item = cart.find(function(i) { return i.id === p.id && i.name === cartName; });
  if (item) {
    item.qty += 1;
    saveCart(cart);
    updateProductAddButton();
  }
}

function decrementProductInCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var attrString = Object.values(_selectedAttributes).join(", ");
  var cartName = p.name;
  if (attrString) cartName += " (" + attrString + ")";
  var cart = getCart();
  var idx = cart.findIndex(function(i) { return i.id === p.id && i.name === cartName; });
  if (idx > -1) {
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart);
    updateProductAddButton();
  }
}
