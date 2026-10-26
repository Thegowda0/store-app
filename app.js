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
