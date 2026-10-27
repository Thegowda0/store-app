// ==========================================
// 1. GLOBAL STATE & INITIALIZATION
// ==========================================
const container = document.getElementById("page-container");

let globalProducts = [];
let currentSearchQuery = "";
let appliedFilters = { sort: "relevance", category: null, minPrice: 0, maxPrice: 10000, minDiscount: 0, attributes: {} };
let draftFilters = { sort: "relevance", category: null, minPrice: 0, maxPrice: 10000, minDiscount: 0, attributes: {} };
let minProductPrice = 0;
let maxProductPrice = 10000;
let activeSidebarTab = "sort";
let currentPage = 1;
let paginatedCache = [];

let currentProduct = null;
let selectedAttributes = {};

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px); background:#111; color:#fff; padding:12px 24px; border-radius:30px; font-size:14px; font-weight:500; opacity:0; transition:all 0.3s; z-index:9999;";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  setTimeout(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }, 10);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(-50%) translateY(20px)"; }, 2500);
}

// ==========================================
// 2. ROUTING & NAVIGATION
// ==========================================
window.addEventListener('hashchange', handleRoute);

function handleRoute() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) navigate("home", null, false);
  else if (hash.startsWith('product-')) navigate("product", hash.split('-')[1], false);
  else if (hash.startsWith('reviews-')) navigate("reviews", hash.split('-')[1], false);
  else navigate(hash, null, false);
}

async function navigate(pageId, param = null, pushHistory = true) {
  if (pushHistory) {
    if (pageId === "home") history.pushState(null, "", window.location.pathname);
    else if (pageId === "product") history.pushState(null, "", `#product-${param}`);
    else if (pageId === "reviews") history.pushState(null, "", `#reviews-${param}`);
    else history.pushState(null, "", `#${pageId}`);
  }
  
  if (pageId === "product") document.body.classList.add("on-product-page");
  else document.body.classList.remove("on-product-page");

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
      if (pageId === "reviews" && param) loadReviewsPage(param);
      if (pageId === "cart") renderCart();
    } catch (e) { 
      container.innerHTML = `<p style="padding:20px;">Error loading page: ${pageId}</p>`; 
      console.log("Navigation error:", e);
    }
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.id === pageId));
  if (typeof updateFloatingCartBubble === "function") setTimeout(updateFloatingCartBubble, 100);
  window.scrollTo(0, 0);
}

// ==========================================
// 3. SEARCH & FILTERS (Fixed)
// ==========================================
function initSearchPage() {
  if (globalProducts.length === 0) {
    fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`)
      .then(res => res.json())
      .then(data => { globalProducts = data; renderTrending(); })
      .catch(e => console.log(e));
  } else {
    renderTrending();
  }
  
  function renderTrending() {
    const trending = document.getElementById("trending-search");
    if (trending) {
      trending.innerHTML = globalProducts.slice(0, 4).map(p => `
        <div class="card" onclick="navigate('product', ${p.id})"><img src="${p.images[0]?.thumbnail || ''}" loading="lazy"><h3>${p.name}</h3><div class="price">${p.price_html}</div></div>
      `).join("");
    }
  }
  renderRecentSearches();
  setTimeout(() => { const inp = document.getElementById("search-page-input"); if(inp) inp.focus(); }, 100);
}

function renderRecentSearches() {
  const recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  const el = document.getElementById("recent-searches");
  if (!el) return;
  if (recents.length === 0) { el.innerHTML = `<span style="font-size: 13px; color: #888;">No recent searches yet.</span>`; return; }
  el.innerHTML = recents.map(term => `<div onclick="clickRecent('${term}')" style="padding: 8px 16px; border: 1px solid #eee; border-radius: 8px; font-size: 13px; color: #333; background: #fff; cursor: pointer;">${term}</div>`).join("");
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
  if (query.length === 0) { if(defaultState) defaultState.style.display = "block"; if(activeState) activeState.style.display = "none"; return; } 
  else { if(defaultState) defaultState.style.display = "none"; if(activeState) activeState.style.display = "block"; }
  
  const filtered = globalProducts.filter(p => p.name.toLowerCase().includes(query));
  const listEl = document.getElementById("autocomplete-list");
  if (!listEl) return;
  if (filtered.length === 0) { listEl.innerHTML = `<p style="font-size:14px; color:#666;">No results for "${query}"</p>`; return; }
  listEl.innerHTML = filtered.slice(0, 6).map(p => `<div onclick="saveSearchHistory('${p.name.replace(/'/g, "\\'")}'); navigate('product', ${p.id})" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;"><img src="${p.images[0]?.thumbnail || ''}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;"><span style="font-size: 15px; font-weight: 500; color: #333;">${p.name}</span></div>`).join("");
}

function goToSearchResults() { saveSearchHistory(currentSearchQuery); appliedFilters = { sort: "relevance", category: null, minPrice: 0, maxPrice: 10000, minDiscount: 0, attributes: {} }; navigate('search-results'); }

function initSearchResultsPage() {
  const label = document.getElementById("results-search-label");
  if (label) label.textContent = currentSearchQuery || "All Products";
  currentPage = 1;
  
  if (globalProducts.length === 0) {
    fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`)
      .then(res => res.json())
      .then(data => { globalProducts = data; processSearchResults(); })
      .catch(e => console.log(e));
  } else {
    processSearchResults();
  }
  
  function processSearchResults() {
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
    if (typeof buildAmazonSidebar === "function") buildAmazonSidebar();
  }
}

function applyFilters() {
  appliedFilters = JSON.parse(JSON.stringify(draftFilters)); 
  if (typeof closeFilterSheet === "function") closeFilterSheet();
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

function renderSearchResultsGrid(products) {
  const grid = document.getElementById("final-results-grid");
  if (!grid) return;
  
  if (!products || products.length === 0) { 
    grid.innerHTML = `<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No products found</h3></div>`; 
    const pc = document.getElementById("pagination-controls");
    if (pc) pc.style.display = "none"; 
    return; 
  }
  
  const itemsPerPage = 20; const totalPages = Math.ceil(products.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = products.slice(startIndex, startIndex + itemsPerPage);
  
  const pcontrols = document.getElementById("pagination-controls");
  if (pcontrols) {
    if (totalPages > 1) {
      pcontrols.style.display = "flex";
      const pi = document.getElementById("page-indicator");
      if (pi) pi.textContent = `Page ${currentPage} of ${totalPages}`;
      const pb = document.getElementById("prev-btn"); if(pb) { pb.disabled = currentPage === 1; pb.style.opacity = currentPage === 1 ? "0.5" : "1"; }
      const nb = document.getElementById("next-btn"); if(nb) { nb.disabled = currentPage === totalPages; nb.style.opacity = currentPage === totalPages ? "0.5" : "1"; }
    } else { pcontrols.style.display = "none"; }
  }

  grid.innerHTML = paginatedProducts.map(p => {
    let discountTag = "";
    if (p.on_sale && parseInt(p.prices.regular_price) > parseInt(p.prices.price)) {
      const percent = Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
      discountTag = `<div style="background: #FFD700; color: #111; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${percent}% OFF</div>`;
    }
    return `<div style="background: #fff; border-radius: 12px; padding: 12px; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.04); cursor: pointer;" onclick="navigate('product', ${p.id})"><img src="${p.images[0]?.thumbnail || ''}" style="width: 100%; aspect-ratio: 1/1; object-fit: contain; margin-bottom: 8px;">${discountTag}<div style="font-size: 15px; font-weight: 700; color: #111; margin-bottom: 4px;">${p.price_html}</div><h3 style="font-size: 13px; color: #555; line-height: 1.3; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.name}</h3><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 11px; color: #888;">1 unit</span><button onclick="event.stopPropagation(); addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="background: #fff; border: 1px solid #008C4A; color: #008C4A; font-weight: 700; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer;">+</button></div></div>`;
  }).join("");
}

// ==========================================
// 4. PRODUCT PAGE (Bulletproof Rendering)
// ==========================================
async function loadSingleProduct(id) {
  const el = document.getElementById("product-detail");
  const stickyBar = document.getElementById("product-sticky-bar");
  if (!el || !stickyBar) return;
  
  el.innerHTML = "<p style='padding:16px;'>Loading product...</p>"; 
  stickyBar.style.display = "none";
  selectedAttributes = {};

  try {
    let p = globalProducts.find(item => item.id == id);
    if (!p) { 
      const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/${id}`); 
      if (!res.ok) throw new Error("Product not found");
      p = await res.json(); 
    }
    currentProduct = p;

    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(attr => {
        if (attr.terms && attr.terms.length > 0) selectedAttributes[attr.name] = attr.terms[0].name;
      });
    }

    let imgHtml = `<div style="position: relative;">
        <i class="fa-solid fa-arrow-left" onclick="history.back()" style="position: absolute; top: 16px; left: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10;"></i>
        <img src="${p.images[0]?.src || ''}" style="width:100%; aspect-ratio: 1/1; object-fit: cover;">
      </div>`;

    let attrHtml = "";
    if (p.attributes && p.attributes.length > 0) {
      attrHtml = `<div style="background:#fff; padding:16px; margin-top:8px;">`;
      p.attributes.forEach(attr => {
        attrHtml += `<div style="margin-bottom:16px;"><h4 style="font-size:13px; font-weight:700; margin-bottom:8px;">${attr.name}</h4><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
        attr.terms.forEach(term => {
          const isSel = selectedAttributes[attr.name] === term.name;
          attrHtml += `<div onclick="selectAttribute('${attr.name}', '${term.name}')" style="padding:10px 16px; border-radius:50px; border:1px solid ${isSel ? '#111' : '#ddd'}; background:${isSel ? '#111' : '#fff'}; color:${isSel ? '#fff' : '#333'}; cursor:pointer; font-size:13px;">${term.name}</div>`;
        });
        attrHtml += `</div></div>`;
      });
      attrHtml += `</div>`;
    }

    let reviewHtml = `
      <div style="background: #fff; padding: 16px; margin-top: 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="font-size: 16px; font-weight: 700;">Reviews (${p.review_count || 0})</h3>
          <div onclick="navigate('reviews', ${p.id})" style="font-size:13px;color:#FF4B2B;font-weight:600;cursor:pointer;">See All</div>
        </div>
        <div id="inline-reviews-container">
          <p style="color:#888;font-size:13px;">Loading reviews...</p>
        </div>
      </div>`;

    el.innerHTML = `
      ${imgHtml}
      <div style="padding: 20px 16px; background:#fff;">
        <div style="font-size: 28px; font-weight: 800; color: #111; margin-bottom: 8px;">${p.price_html}</div>
        <h1 style="font-size: 24px; font-weight: 600; color: #333; margin-bottom: 16px;">${p.name}</h1>
        <div style="font-size: 14px; color: #666;">${p.description || ''}</div>
      </div>
      ${attrHtml}
      ${reviewHtml}
    `;
    
    document.getElementById("main-btn-price").textContent = (parseInt(p.prices.price) / 100).toFixed(2);
    stickyBar.style.display = "block";
    updateProductAddButton();

    if (p.review_count > 0) fetchInlineReviews(p.id);

  } catch(e) { 
    el.innerHTML = `<p style='padding:16px;'>Error loading product.</p>`; 
    console.log("Product error:", e); 
  }
}

function selectAttribute(attrName, termName) {
  selectedAttributes[attrName] = termName;
  loadSingleProduct(currentProduct.id); 
}

async function fetchInlineReviews(productId) {
  const box = document.getElementById("inline-reviews-container");
  if (!box) return;
  
  try {
    const proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(APP_CONFIG.siteUrl + "/?p=" + productId);
    const res = await fetch(proxyUrl);
    const data = await res.json();
    
    const doc = new DOMParser().parseFromString(data.contents, "text/html");
    const items = doc.querySelectorAll(".ns-product-review");
    
    if (items.length === 0) {
      box.innerHTML = "<p style='color:#888;font-size:13px;'>No reviews found.</p>";
      return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    for (let i = 0; i < Math.min(items.length, 3); i++) {
      let item = items[i];
      let author = item.querySelector(".woocommerce-review__author")?.textContent.trim() || "User";
      let text = item.querySelector(".description")?.textContent.replace("[...]", "").trim() || "";
      let avatar = item.querySelector(".avatar")?.src || "";
      
      let imagesHtml = "";
      let imgEls = item.querySelectorAll(".nasa-wrap-review-thumb img");
      if (imgEls.length > 0) {
        imagesHtml = `<div style="display:flex; gap:8px; margin-top:8px; overflow-x:auto;">` + 
          Array.from(imgEls).map(img => `<img src="${img.src}" style="height:60px; width:60px; object-fit:cover; border-radius:6px;">`).join("") + 
          `</div>`;
      }

      html += `<div style="display:flex; gap:12px; border-bottom:1px solid #eee; padding-bottom:12px;"><img src="${avatar}" style="width:36px; height:36px; border-radius:50%;"><div style="flex:1;"><div style="font-size:13px; font-weight:700;">${author}</div><div style="color:#FFD700; font-size:12px;">★★★★★</div><div style="font-size:13px; color:#555; margin-top:4px;">${text}</div>${imagesHtml}</div></div>`;
    }
    html += `</div>`;
    box.innerHTML = html;

  } catch (err) {
    box.innerHTML = "<p style='color:#888;font-size:13px;'>Unable to load reviews.</p>";
  }
}

// ==========================================
// 5. FULL REVIEWS PAGE
// ==========================================
async function loadReviewsPage(productId) {
  container.innerHTML = "<p style='padding:16px;'>Loading reviews...</p>";
  try {
    const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/reviews?product_id=${productId}&per_page=50`);
    const reviews = await res.json();
    if (!reviews || reviews.length === 0) {
      container.innerHTML = `<div style="padding:16px;"><i class="fa-solid fa-arrow-left" onclick="history.back()" style="font-size:20px; margin-bottom:16px; cursor:pointer;"></i><h2>No reviews yet</h2></div>`;
      return;
    }
    let html = `<div style="background:#fff; min-height:100vh; padding-bottom:20px;"><div style="padding:16px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:12px;"><i class="fa-solid fa-arrow-left" onclick="history.back()" style="font-size:20px; cursor:pointer;"></i><h1 style="font-size:18px; font-weight:700;">Reviews (${reviews.length})</h1></div><div style="padding:16px;">`;
    reviews.forEach(r => {
      let avatar = r.reviewer_avatar_urls?.["48"] || "";
      let text = (r.review || "").replace(/<[^>]*>/g, "").trim();
      html += `<div style="display:flex; gap:12px; border-bottom:1px solid #eee; padding-bottom:16px; margin-bottom:16px;"><img src="${avatar}" style="width:40px; height:40px; border-radius:50%;"><div><div style="font-size:14px; font-weight:700;">${r.reviewer}</div><div style="color:#FFD700; font-size:13px; margin-bottom:4px;">★★★★★</div><div style="font-size:14px; color:#444;">${text}</div></div></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
  } catch(e) { container.innerHTML = `<p style="padding:16px; color:red;">Error: ${e.message}</p>`; }
}

// ==========================================
// 6. UTILITIES (Cart, Wishlist, Add Button)
// ==========================================
function updateProductAddButton() {
  if (!currentProduct) return;
  let attrString = Object.values(selectedAttributes).join(", ");
  let cartName = currentProduct.name + (attrString ? ` (${attrString})` : "");
  let existing = getCart().find(i => i.id === currentProduct.id && i.name === cartName);
  let btnHtml = "";
  if (existing) {
    btnHtml = `<div style="display:flex; align-items:center; gap:16px; background:#111; color:#fff; padding:12px 20px; border-radius:12px; font-weight:700;"><button onclick="changeQty('${cartName.replace(/'/g, "\\'")}', -1)" style="border:none; background:none; color:#fff; font-size:20px; cursor:pointer;">-</button><span>${existing.qty}</span><button onclick="changeQty('${cartName.replace(/'/g, "\\'")}', 1)" style="border:none; background:none; color:#fff; font-size:20px; cursor:pointer;">+</button></div>`;
  } else {
    btnHtml = `<button onclick="handleAddToCart()" style="padding:14px 32px; background:#111; color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:700; cursor:pointer;">Add to Cart</button>`;
  }
  document.getElementById("sticky-btn-wrap").innerHTML = btnHtml;
}

function handleAddToCart() {
  let attrString = Object.values(selectedAttributes).join(", ");
  let cartName = currentProduct.name + (attrString ? ` (${attrString})` : "");
  addToCart(currentProduct.id, cartName, currentProduct.prices.price, currentProduct.images[0]?.thumbnail, 1);
  updateProductAddButton();
}

function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) { localStorage.setItem("native_cart", JSON.stringify(cart)); updateCartBadge(); if (typeof updateFloatingCartBubble === "function") updateFloatingCartBubble(); }

function addToCart(id, name, price, image, qty = 1) {
  let cart = getCart(); 
  let existing = cart.find(item => item.id === id && item.name === name);
  if (existing) existing.qty += qty;
  else cart.push({ id, name, price: parseFloat(price), image, qty });
  saveCart(cart); showToast(`✓ Added to Cart`);
}

function changeQty(cartName, change) {
  let cart = getCart();
  let idx = cart.findIndex(i => i.name === cartName);
  if (idx > -1) {
    cart[idx].qty += change;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart); updateProductAddButton();
  }
}

function updateCartBadge() {
  const cart = getCart(); 
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTab = document.querySelector('.tab[data-id="cart"]');
  if (cartTab) {
    let badge = cartTab.querySelector(".cart-badge");
    if (!badge) { badge = document.createElement("div"); badge.className = "cart-badge"; badge.style.cssText = "position:absolute; top:10px; right:25%; background:#FF4B2B; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center;"; cartTab.appendChild(badge); }
    badge.textContent = totalItems; badge.style.display = totalItems > 0 ? "flex" : "none";
  }
}

function updateFloatingCartBubble() {
  let bubble = document.getElementById("floating-cart-bubble");
  if (!bubble) return;
  let cart = getCart();
  let isProductPage = document.body.classList.contains("on-product-page");
  if (cart.length === 0 || !isProductPage) { bubble.style.display = "none"; return; }
  bubble.style.display = "flex";
  let total = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById("bubble-count").textContent = total + " items";
  let recent = cart.slice().reverse().slice(0,3);
  document.getElementById("bubble-images").innerHTML = recent.map((item, i) => `<img src="${item.image}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #fff;margin-left:${i===0?'0':'-10px'};z-index:${10-i};">`).join("");
}

// Wishlist
function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function saveWishlist(w) { localStorage.setItem("native_wishlist", JSON.stringify(w)); }
function toggleWishlist(id, name, price, image) {
  let w = getWishlist(); let idx = w.findIndex(i => i.id === id);
  if (idx > -1) { w.splice(idx, 1); showToast("Removed from Wishlist"); }
  else { w.push({ id, name, price: parseFloat(price), image }); showToast("✓ Added to Wishlist"); }
  saveWishlist(w);
  if (window.location.hash === "#wishlist") renderWishlistPage();
}

function renderWishlistPage() {
  const w = getWishlist(); const grid = document.getElementById("wishlist-grid");
  if (!grid) return;
  if (w.length === 0) { grid.innerHTML = "<div style='grid-column: span 2; text-align: center; padding: 40px;'><i class='fa-regular fa-heart' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h3>Your wishlist is empty</h3></div>"; return; }
  grid.innerHTML = w.map(p => `<div class="card" onclick="navigate('product', ${p.id})"><img src="${p.image}" loading="lazy"><div style="padding: 8px 12px;"><h3>${p.name}</h3></div></div>`).join("");
}

// ==========================================
// 7. HOME, SHOP & CART
// ==========================================
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
  if (!el || !summary) return;
  if (cart.length === 0) { el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2></div>"; summary.style.display = "none"; return; }
  let total = 0;
  el.innerHTML = cart.map((item, index) => {
    total += (item.price * item.qty); 
    let displayPrice = (item.price / 100).toFixed(2); 
    let totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    return `<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="${item.image}" style="width:64px; height:64px; border-radius:8px; object-fit:cover;"><div style="flex:1;"><h3 style="font-size:14px; margin-bottom:4px;">${item.name}</h3><div style="color:#666; font-size:13px;">$${displayPrice}</div></div><div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;"><button onclick="changeQty('${item.name.replace(/'/g, "\\'")}', -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button><span style="font-size:14px; font-weight:600;">${item.qty}</span><button onclick="changeQty('${item.name.replace(/'/g, "\\'")}', 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button></div><div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$${totalForItem}</div></div>`;
  }).join("");
  document.getElementById("cart-total").textContent = `$${(total / 100).toFixed(2)}`; summary.style.display = "block";
}

// INIT
updateCartBadge();
handleRoute();
