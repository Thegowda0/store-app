// ==========================================
// GLOBAL STATE & VARIABLES
// ==========================================
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
let activeThumb = null;
let viewerImages = [];
let viewerIndex = 0;

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

// ==========================================
// ROUTING
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
    }
  } else {
    const path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = `<iframe src="${APP_CONFIG.siteUrl}${path}" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:60px;"></iframe>`;
  }
  
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.id === pageId));
  if (typeof updateFloatingCartBubble === "function") setTimeout(updateFloatingCartBubble, 100);
}

// ==========================================
// PRODUCT PAGE (With Direct HTML Reviews)
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
      p = await res.json(); 
    }
    currentProduct = p;

    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(attr => {
        if (attr.terms && attr.terms.length > 0) selectedAttributes[attr.name] = attr.terms[0].name;
      });
    }

    let imgHtml = `<div style="position: relative;">
        <i class="fa-solid fa-arrow-left" onclick="history.back()" style="position: absolute; top: 16px; left: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10; backdrop-filter: blur(4px;"></i>
        <i class="fa-regular fa-heart" onclick="toggleWishlist(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.prices.price}, '${p.images[0]?.thumbnail || ''}')" style="position: absolute; top: 16px; right: 16px; font-size: 20px; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 50%; cursor: pointer; z-index: 10; backdrop-filter: blur(4px;"></i>
        <img src="${p.images[0]?.src || ''}" style="width:100%; aspect-ratio: 1/1; object-fit: cover; border-bottom: 1px solid #eee;">
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

    let groupedHtml = "";
    if (p.type === "grouped" && p.grouped_products && p.grouped_products.length > 0) {
      groupedHtml = `<div style="background:#fff; padding:16px; margin-top:8px;"><h3 style="font-size:16px; margin-bottom:12px;">Products in this Collection</h3><div id="grouped-list-${p.id}">Loading items...</div></div>`;
      setTimeout(() => loadGroupedList(p), 100);
    }

    let extHtml = "";
    if (p.type === "external") {
      const extUrl = p.external_url || p.permalink;
      extHtml = `<div style="padding:16px;"><a href="${extUrl}" target="_blank" style="display:block; text-align:center; background:#111; color:#fff; padding:16px; border-radius:12px; text-decoration:none; font-weight:700;">Buy Now on External Site</a></div>`;
    }

    // Build Reviews Section HTML (Will be populated by parseHtmlReviews)
    let reviewHtml = `
      <div id="reviews-section-card" style="background: #fff; padding: 16px; margin-top: 8px;">
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
        <h1 style="font-size: 24px; font-weight: 600; color: #333; margin-bottom: 16px; line-height: 1.3;">${p.name}</h1>
        <div style="font-size: 14px; color: #666; line-height: 1.6;">${p.description || p.short_description || 'No description available.'}</div>
      </div>
      ${attrHtml}
      ${groupedHtml}
      ${extHtml}
      ${reviewHtml}
    `;
    
    document.getElementById("main-btn-price").textContent = (parseInt(p.prices.price) / 100).toFixed(2);
    stickyBar.style.display = (p.type === 'external' || p.type === 'grouped') ? "none" : "block";
    updateProductAddButton();

    // Fetch HTML to extract reviews (fixes images and stuck loading)
    if (p.review_count > 0) fetchProductPageReviews(p.id);

  } catch(e) { 
    el.innerHTML = "<p style='padding:16px;'>Error loading product.</p>"; 
    console.log(e); 
  }
}

async function fetchProductPageReviews(productId) {
  const container = document.getElementById("inline-reviews-container");
  if (!container) return;

  try {
    // 1. Fetch product HTML via CORS proxy to bypass API limits and get images
    const proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(APP_CONFIG.siteUrl + "/?p=" + productId);
    const res = await fetch(proxyUrl);
    const data = await res.json();
    
    // 2. Parse HTML
    const doc = new DOMParser().parseFromString(data.contents, "text/html");
    const items = doc.querySelectorAll(".ns-product-review");
    
    if (items.length === 0) {
      container.innerHTML = "<p style='color:#888;font-size:13px;'>No reviews found.</p>";
      return;
    }

    let html = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    // Only take top 3 for inline display
    for (let i = 0; i < Math.min(items.length, 3); i++) {
      let item = items[i];
      let author = item.querySelector(".woocommerce-review__author")?.textContent.trim() || "User";
      let text = item.querySelector(".description")?.textContent.replace("[...]", "").trim() || "";
      let avatar = item.querySelector(".avatar")?.src || "";
      
      // Extract images uploaded with review
      let imagesHtml = "";
      let imgEls = item.querySelectorAll(".nasa-wrap-review-thumb img");
      if (imgEls.length > 0) {
        imagesHtml = `<div style="display:flex; gap:8px; margin-top:8px; overflow-x:auto;">` + 
          Array.from(imgEls).map(img => `<img src="${img.src}" style="height:60px; width:60px; object-fit:cover; border-radius:6px;">`).join("") + 
          `</div>`;
      }

      html += `
        <div style="display:flex; gap:12px; border-bottom:1px solid #eee; padding-bottom:12px;">
          <img src="${avatar}" style="width:36px; height:36px; border-radius:50%;">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:700;">${author}</div>
            <div style="color:#FFD700; font-size:12px;">★★★★★</div>
            <div style="font-size:13px; color:#555; margin-top:4px;">${text}</div>
            ${imagesHtml}
          </div>
        </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;

  } catch (err) {
    console.log("Inline review error:", err);
    container.innerHTML = "<p style='color:#888;font-size:13px;'>Unable to load images for reviews.</p>";
  }
}

async function loadGroupedList(p) {
  const el = document.getElementById(`grouped-list-${p.id}`);
  if(!el) return;
  try {
    let res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?include=${p.grouped_products.join(',')}`);
    let items = await res.json();
    el.innerHTML = items.map(item => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #eee;">
        <img src="${item.images[0]?.thumbnail}" style="width:50px; height:50px; border-radius:6px; object-fit:cover;">
        <div style="flex:1;">
          <div style="font-size:14px; font-weight:600;">${item.name}</div>
          <div style="font-size:13px; color:#666;">${item.price_html}</div>
        </div>
        <button onclick="addToCart(${item.id}, '${item.name.replace(/'/g, "\\'")}', ${item.prices.price}, '${item.images[0]?.thumbnail}', 1)" style="background:#111; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:600;">Add</button>
      </div>
    `).join("");
  } catch(e) { el.innerHTML = "Error loading grouped items."; }
}

function selectAttribute(attrName, termName) {
  selectedAttributes[attrName] = termName;
  loadSingleProduct(currentProduct.id); // Re-render
}

// ==========================================
// REVIEWS PAGE (Full List)
// ==========================================
async function loadReviewsPage(productId) {
  container.innerHTML = "<p style='padding:16px;'>Loading reviews...</p>";
  
  try {
    // Fetch directly from API (No CORS proxy needed for JSON API)
    let res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products/reviews?product_id=${productId}&per_page=50`);
    let reviews = await res.json();

    if (!reviews || reviews.length === 0) {
      container.innerHTML = `<div style="padding:16px;"><i class="fa-solid fa-arrow-left" onclick="history.back()" style="font-size:20px; margin-bottom:16px; cursor:pointer;"></i><h2>No reviews yet</h2></div>`;
      return;
    }

    let html = `
      <div style="background:#fff; min-height:100vh; padding-bottom:20px;">
        <div style="padding:16px; border-bottom:1px solid #eee; display:flex; align-items:center; gap:12px;">
          <i class="fa-solid fa-arrow-left" onclick="history.back()" style="font-size:20px; cursor:pointer;"></i>
          <h1 style="font-size:18px; font-weight:700;">Reviews (${reviews.length})</h1>
        </div>
        <div style="padding:16px;">
    `;

    reviews.forEach(r => {
      let avatar = r.reviewer_avatar_urls?.["48"] || "";
      let text = (r.review || "").replace(/<[^>]*>/g, "").trim();
      html += `
        <div style="display:flex; gap:12px; border-bottom:1px solid #eee; padding-bottom:16px; margin-bottom:16px;">
          <img src="${avatar}" style="width:40px; height:40px; border-radius:50%;">
          <div>
            <div style="font-size:14px; font-weight:700;">${r.reviewer}</div>
            <div style="color:#FFD700; font-size:13px; margin-bottom:4px;">★★★★★</div>
            <div style="font-size:14px; color:#444;">${text}</div>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    container.innerHTML = html;

  } catch(e) {
    container.innerHTML = `<p style="padding:16px; color:red;">Error loading reviews: ${e.message}</p>`;
  }
}

// ==========================================
// UTILITIES (Cart, Wishlist, Add Button, Viewer)
// ==========================================
function updateProductAddButton() {
  if (!currentProduct) return;
  let cart = getCart();
  let attrString = Object.values(selectedAttributes).join(", ");
  let cartName = currentProduct.name + (attrString ? ` (${attrString})` : "");
  let existing = cart.find(i => i.id === currentProduct.id && i.name === cartName);

  let btnHtml = "";
  if (existing) {
    btnHtml = `<div style="display:flex; align-items:center; gap:16px; background:#111; color:#fff; padding:12px 20px; border-radius:12px; font-weight:700;">
      <button onclick="changeQty('${cartName.replace(/'/g, "\\'")}', -1)" style="border:none; background:none; color:#fff; font-size:20px; cursor:pointer;">-</button>
      <span>${existing.qty}</span>
      <button onclick="changeQty('${cartName.replace(/'/g, "\\'")}', 1)" style="border:none; background:none; color:#fff; font-size:20px; cursor:pointer;">+</button>
    </div>`;
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
    saveCart(cart);
    updateProductAddButton();
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
  
  let totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById("bubble-count").textContent = totalItems + " items";
  
  let recent = cart.slice().reverse().slice(0,3);
  document.getElementById("bubble-images").innerHTML = recent.map((item, i) => 
    `<img src="${item.image}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #fff;margin-left:${i===0?'0':'-10px'};z-index:${10-i};">`
  ).join("");
}

// Wishlist
function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function toggleWishlist(id, name, price, image) {
  let w = getWishlist();
  let idx = w.findIndex(i => i.id === id);
  if (idx > -1) { w.splice(idx, 1); showToast("Removed from Wishlist"); }
  else { w.push({ id, name, price: parseFloat(price), image }); showToast("✓ Added to Wishlist"); }
  localStorage.setItem("native_wishlist", JSON.stringify(w));
}

// Other Pages Basic Loads
async function loadProducts(containerId) {
  const el = document.getElementById(containerId); if (!el) return;
  if (globalProducts.length > 0) { renderProductGrid(containerId, globalProducts); return; }
  el.innerHTML = "<p style='padding:16px;'>Loading products...</p>";
  try { const res = await fetch(`${APP_CONFIG.siteUrl}/wp-json/wc/store/v1/products?per_page=50`); globalProducts = await res.json(); renderProductGrid(containerId, globalProducts); } catch(e) { el.innerHTML = "<p style='padding:16px;'>Error loading products.</p>"; }
}
function renderProductGrid(containerId, products) {
  const el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = products.map(p => `<div class="card" onclick="navigate('product', ${p.id})"><img src="${p.images[0]?.thumbnail || ''}" loading="lazy"><h3>${p.name}</h3><div class="price">${p.price_html}</div></div>`).join("");
}
function renderCart() {
  let cart = getCart(); const el = document.getElementById("cart-items"); if (!el) return;
  if (cart.length === 0) { el.innerHTML = "<p style='padding:20px;'>Cart empty.</p>"; return; }
  let html = ""; let total = 0;
  cart.forEach(item => {
    total += (item.price * item.qty);
    html += `<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="${item.image}" style="width:60px; height:60px; object-fit:cover;"><div><h3>${item.name}</h3><p>$${(item.price/100).toFixed(2)}</p></div></div>`;
  });
  html += `<div style="padding:16px;"><h3>Total: $${(total/100).toFixed(2)}</h3></div>`;
  el.innerHTML = html;
}

// Init
updateCartBadge();
handleRoute();
