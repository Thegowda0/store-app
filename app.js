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
let activeThumb = null;

let _currentProduct = null;
let _selectedAttributes = {};
let _productQty = 1;
let _productImages = [];
let _viewerIndex = 0;

function getEmptyFilters() {
  return { sort: "relevance", category: null, minPrice: 0, maxPrice: 10000, minDiscount: 0, attributes: {} };
}

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px); background:#111; color:#fff; padding:12px 24px; border-radius:30px; font-size:14px; font-weight:500; opacity:0; transition:all 0.3s; z-index:9999;";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  setTimeout(function() { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }, 10);
  setTimeout(function() { toast.style.opacity = "0"; toast.style.transform = "translateX(-50%) translateY(20px)"; }, 2500);
}

window.addEventListener("hashchange", handleRoute);

function handleRoute() {
  var hash = window.location.hash.replace("#", "");
  if (!hash) navigate("home", null, false);
  else if (hash.indexOf("product-") === 0) navigate("product", hash.split("-")[1], false);
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
      var res = await fetch(APP_CONFIG.nativePages[pageId]);
      container.innerHTML = await res.text();
      if (pageId === "home") loadProducts("home-featured");
      if (pageId === "shop") loadProducts("product-list");
      if (pageId === "search") initSearchPage();
      if (pageId === "search-results") initSearchResultsPage();
      if (pageId === "wishlist") renderWishlistPage();
      if (pageId === "product" && param) loadSingleProduct(param);
      if (pageId === "reviews" && param) loadReviewsPage(param);
      if (pageId === "cart") renderCart();
    } catch (e) { container.innerHTML = "<p style='padding:20px;'>Error loading page: " + pageId + "</p>"; }
  } else {
    var path = APP_CONFIG.webviewRoutes[pageId] || "/" + pageId;
    container.innerHTML = '<iframe src="' + APP_CONFIG.siteUrl + path + '" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:0;"></iframe>';
  }
  var tabs = document.querySelectorAll(".tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].dataset.id === pageId);
  }
  if (pageId === "product") {
    document.body.classList.add("on-product-page");
  } else {
    document.body.classList.remove("on-product-page");
  }
  if (typeof updateFloatingCartBubble === "function") setTimeout(updateFloatingCartBubble, 100);
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
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + (p.images[0] ? p.images[0].thumbnail : '') + '" loading="lazy"><h3>' + p.name + '</h3><div class="price">' + p.price_html + '</div></div>';
  }).join("");
}

// ==================== PRODUCT PAGE ====================
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

    // Handle grouped products
    if (p.type === "grouped") {
      await renderGroupedProduct(p);
      return;
    }

    // Handle external products
    if (p.type === "external") {
      renderExternalProduct(p);
      return;
    }

    // Simple and variable products
    _productImages = (p.images || []).map(function(img) { return img.src; });
    if (_productImages.length === 0) _productImages = [""];
    if (p.attributes && p.attributes.length > 0) {
      p.attributes.forEach(function(attr) {
        if (attr.terms && attr.terms.length > 0) _selectedAttributes[attr.name] = attr.terms[0].name;
      });
    }
    renderProductPage(p);
  } catch(e) {
    console.log("Product load error:", e);
    el.innerHTML = '<div style="padding:20px; text-align:center;"><p>Error loading product.</p><p style="font-size:12px; color:#888;">' + e.message + '</p><button onclick="history.back()" style="margin-top:16px; padding:10px 20px; background:#111; color:#fff; border:none; border-radius:8px;">Go Back</button></div>';
  }
}

async function renderGroupedProduct(p) {
  var el = document.getElementById("product-detail");
  var stickyBar = document.getElementById("product-sticky-bar");
  stickyBar.style.display = "none";

  var html = "";
  html += '<div style="position: relative; background: #fff;">';
  html += '<img src="' + ((p.images && p.images[0]) ? p.images[0].src : "") + '" style="width:100%; aspect-ratio: 1/1; object-fit: cover;">';
  html += '<div style="position: absolute; top: 12px; left: 16px;"><div onclick="navigate(\'home\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="fa-solid fa-arrow-down" style="color: #111;"></i></div></div>';
  html += '</div>';

  html += '<div style="background: #fff; padding: 16px;">';
  html += '<h1 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 12px;">' + (p.name || "") + '</h1>';
  html += '<div style="font-size: 14px; color: #555; line-height: 1.6;">' + (p.description || "Grouped product.") + '</div>';
  html += '</div>';

  html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Products in this group</h3>';
  html += '<div id="grouped-items-container"><p style="color:#888;">Loading group items...</p></div>';
  html += '</div>';

  el.innerHTML = html;

  // Fetch grouped product ids
  try {
    var res = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products?include=" + (p.grouped_products || []).join(",") + "&per_page=50");
    var items = await res.json();
    var container = document.getElementById("grouped-items-container");
    if (!items || items.length === 0) { container.innerHTML = "<p style='color:#888;'>No items in this group.</p>"; return; }
    container.innerHTML = items.map(function(item) {
      var thumb = (item.images && item.images[0]) ? item.images[0].thumbnail : "";
      var inCart = getCart().find(function(c) { return c.id === item.id && c.name === item.name; });
      var btnHtml = inCart
        ? '<div style="display:flex;align-items:center;gap:12px;background:#111;color:#fff;padding:8px 12px;border-radius:8px;font-size:14px;font-weight:700;"><button onclick="groupItemDecrement(' + item.id + ')" style="border:none;background:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">-</button><span>' + inCart.qty + '</span><button onclick="groupItemIncrement(' + item.id + ')" style="border:none;background:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">+</button></div>'
        : '<button onclick="groupItemAdd(' + item.id + ')" style="padding:10px 20px;background:#111;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">Add</button>';
      return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #eee;">' +
        '<img src="' + thumb + '" style="width:60px;height:60px;border-radius:8px;object-fit:cover;background:#f5f5f5;">' +
        '<div style="flex:1;"><div style="font-size:14px;font-weight:600;color:#111;">' + item.name + '</div><div style="font-size:13px;color:#666;margin-top:2px;">' + (item.price_html || "").replace(/<[^>]*>/g, "").trim() + '</div></div>' +
        btnHtml + '</div>';
    }).join("");
  } catch(e) {
    document.getElementById("grouped-items-container").innerHTML = "<p style='color:#d33;'>Failed to load group items.</p>";
  }
}

function groupItemAdd(id) {
  var item = globalProducts.find(function(x) { return x.id === id; });
  if (!item) { fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/" + id).then(function(r) { return r.json(); }).then(function(item) { _groupAddItem(item); }); return; }
  _groupAddItem(item);
}
function _groupAddItem(item) {
  var cart = getCart();
  cart.push({ id: item.id, name: item.name, price: parseFloat(item.prices.price), image: (item.images && item.images[0]) ? item.images[0].thumbnail : "", qty: 1 });
  saveCart(cart);
  if (_currentProduct && _currentProduct.type === "grouped") renderGroupedProduct(_currentProduct);
}
function groupItemIncrement(id) {
  var cart = getCart();
  var item = cart.find(function(c) { return c.id === id; });
  if (item) { item.qty += 1; saveCart(cart); if (_currentProduct) renderGroupedProduct(_currentProduct); }
}
function groupItemDecrement(id) {
  var cart = getCart();
  var idx = -1;
  for (var i = 0; i < cart.length; i++) { if (cart[i].id === id) { idx = i; break; } }
  if (idx > -1) {
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart);
    if (_currentProduct) renderGroupedProduct(_currentProduct);
  }
}

function renderExternalProduct(p) {
  var el = document.getElementById("product-detail");
  var stickyBar = document.getElementById("product-sticky-bar");
  stickyBar.style.display = "none";

  var html = "";
  html += '<div style="position: relative; background: #fff;">';
  html += '<img src="' + ((p.images && p.images[0]) ? p.images[0].src : "") + '" style="width:100%; aspect-ratio: 1/1; object-fit: cover;">';
  html += '<div style="position: absolute; top: 12px; left: 16px;"><div onclick="navigate(\'home\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="fa-solid fa-arrow-down" style="color: #111;"></i></div></div>';
  html += '</div>';
  html += '<div style="background: #fff; padding: 16px;">';
  html += '<div style="font-size: 26px; font-weight: 800; color: #111; margin-bottom: 8px;">' + (p.price_html || "") + '</div>';
  html += '<h1 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 16px;">' + (p.name || "") + '</h1>';
  html += '<div style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 24px;">' + (p.description || "") + '</div>';
  var buyUrl = p.external_url || p.permalink || "";
  var buyLabel = p.button_text || "Buy Now";
  if (buyUrl) {
    html += '<a href="' + buyUrl + '" target="_blank" rel="noopener" style="display:block;text-align:center;padding:16px;background:#111;color:#fff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;">' + buyLabel + ' →</a>';
  } else {
    html += '<p style="color:#d33;text-align:center;">This product has no external link configured on WooCommerce.</p>';
  }
  html += '</div>';
  el.innerHTML = html;
}


function renderProductPage(p) {
  var el = document.getElementById("product-detail");
  var stickyBar = document.getElementById("product-sticky-bar");
  var mainImg = _productImages[0] || "";
  var catName = (p.categories && p.categories.length > 0) ? p.categories[0].name : "";
  var catSlug = (p.categories && p.categories.length > 0) ? p.categories[0].slug : "";
  var brandName = (p.brands && p.brands.length > 0) ? p.brands[0].name : "";
  var brandSlug = (p.brands && p.brands.length > 0) ? p.brands[0].slug : "";
  var isWished = getWishlist().some(function(w) { return w.id === p.id; });

  var html = "";

  // Main image + glass header
  html += '<div style="position: relative; background: #fff;">';
  html += '<img id="main-product-img" onclick="openImageViewer(0)" src="' + mainImg + '" style="width:100%; aspect-ratio: 1/1; object-fit: cover; cursor: pointer;">';
  html += '<div style="position: absolute; top: 0; left: 0; right: 0; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">';
  html += '<div onclick="navigate(\'home\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-arrow-down" style="color: #111; font-size: 16px;"></i></div>';
  html += '<div style="display: flex; gap: 8px;">';
  html += '<div onclick="toggleProductHeart()" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i id="product-heart-icon" class="' + (isWished ? "fa-solid" : "fa-regular") + ' fa-heart" style="color: ' + (isWished ? "#FF4B2B" : "#111") + '; font-size: 16px;"></i></div>';
  html += '<div onclick="navigate(\'search\', null, true)" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-magnifying-glass" style="color: #111; font-size: 16px;"></i></div>';
  html += '<div onclick="shareProduct()" style="width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-share-nodes" style="color: #111; font-size: 16px;"></i></div>';
  html += '</div></div></div>';

  // Thumbnails
  if (_productImages.length > 1) {
    html += '<div style="display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; background: #fff; border-bottom: 1px solid #eee;">';
    _productImages.forEach(function(img, i) {
      html += '<img onclick="openImageViewer(' + i + ')" src="' + img + '" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid #eee; flex-shrink: 0;">';
    });
    html += '</div>';
  }

  // Price, title, rating
  html += '<div style="background: #fff; padding: 16px;">';
  html += '<div style="font-size: 26px; font-weight: 800; color: #111; margin-bottom: 8px;">' + (p.price_html || "") + '</div>';
  html += '<h1 style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 12px; line-height: 1.3;">' + (p.name || "") + '</h1>';
  html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">';
  html += '<div style="color: #FFD700; font-size: 14px;">★★★★★</div>';
  html += '<span style="font-size: 13px; color: #888;">(' + (p.review_count || 0) + ' reviews)</span>';
  html += '</div>';
  if (brandName || catName) {
    html += '<div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">';
    if (brandName) html += '<div onclick="navigate(\'webview\', \'brand/' + brandSlug + '\', true)" style="padding: 6px 12px; background: #f0f0f0; border-radius: 20px; font-size: 12px; font-weight: 600; color: #333; cursor: pointer;">Brand: ' + brandName + '</div>';
    if (catName) html += '<div onclick="navigate(\'webview\', \'category/' + catSlug + '\', true)" style="padding: 6px 12px; background: #f0f0f0; border-radius: 20px; font-size: 12px; font-weight: 600; color: #333; cursor: pointer;">Category: ' + catName + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Attributes
  if (p.attributes && p.attributes.length > 0) {
    html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
    p.attributes.forEach(function(attr) {
      if (!attr.terms || attr.terms.length === 0) return;
      html += '<div style="margin-bottom: 20px;">';
      html += '<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">';
      html += '<h4 style="font-size: 13px; font-weight: 700; color: #333; text-transform: uppercase;">' + attr.name + '</h4>';
      html += '<span style="font-size: 12px; color: #888;" id="attr-label-' + attr.name.replace(/\s/g, "") + '">' + (_selectedAttributes[attr.name] || "") + '</span>';
      html += '</div><div style="display: flex; flex-wrap: wrap; gap: 8px;">';
      attr.terms.forEach(function(term) {
        var isSelected = _selectedAttributes[attr.name] === term.name;
        var attrKey = attr.name.replace(/\s/g, "");
        var termKey = term.name.replace(/\s/g, "");
        html += '<div onclick="selectProductAttribute(\'' + attr.name + '\', \'' + term.name + '\')" id="prod-attr-' + attrKey + "-" + termKey + '" style="padding: 10px 18px; border-radius: 50px; border: 1px solid ' + (isSelected ? "#111" : "#ddd") + '; background: ' + (isSelected ? "#111" : "#fff") + '; color: ' + (isSelected ? "#fff" : "#333") + '; font-size: 14px; cursor: pointer; font-weight: 500;">' + term.name + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
  }

  // Product Information
  html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Product Information</h3>';
  html += '<div style="font-size: 14px; color: #555; line-height: 1.6;">' + (p.description || p.short_description || "No description available.") + '</div>';
  if (p.sku) html += '<div style="margin-top: 12px; font-size: 13px; color: #888;">SKU: ' + p.sku + '</div>';
  if (p.is_in_stock === false) html += '<div style="margin-top: 8px; font-size: 13px; color: #d33; font-weight: 600;">Out of Stock</div>';
  else html += '<div style="margin-top: 8px; font-size: 13px; color: #008C4A; font-weight: 600;">In Stock</div>';
  html += '</div>';

  // Similar products
  if (catSlug) {
    var similar = globalProducts.filter(function(x) {
      return x.id !== p.id && x.categories.some(function(c) { return c.slug === catSlug; });
    }).slice(0, 10);
    if (similar.length > 0) {
      html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
      html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Similar Products</h3>';
      html += '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
      similar.forEach(function(s) {
        var thumb = (s.images && s.images[0]) ? s.images[0].thumbnail : "";
        html += '<div onclick="navigate(\'product\', ' + s.id + ')" style="min-width: 140px; cursor: pointer;">';
        html += '<img src="' + thumb + '" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover; background: #f5f5f5;">';
        html += '<div style="font-size: 13px; font-weight: 600; margin-top: 6px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + s.name + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  // Top rated
  if (catSlug) {
    var top = globalProducts.filter(function(x) {
      return x.id !== p.id && x.categories.some(function(c) { return c.slug === catSlug; });
    }).sort(function(a, b) { return parseFloat(b.average_rating || 0) - parseFloat(a.average_rating || 0); }).slice(0, 10);
    if (top.length > 0 && parseFloat(top[0].average_rating) > 0) {
      html += '<div style="background: #fff; padding: 16px; margin-top: 8px;">';
      html += '<h3 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Top Rated in ' + catName + '</h3>';
      html += '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
      top.forEach(function(s) {
        var thumb = (s.images && s.images[0]) ? s.images[0].thumbnail : "";
        html += '<div onclick="navigate(\'product\', ' + s.id + ')" style="min-width: 140px; cursor: pointer;">';
        html += '<img src="' + thumb + '" style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover; background: #f5f5f5;">';
        html += '<div style="font-size: 13px; font-weight: 600; margin-top: 6px; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + s.name + '</div>';
        html += '<div style="font-size: 12px; color: #666; margin-top: 2px;">Star ' + parseFloat(s.average_rating || 0).toFixed(1) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  // Reviews - always show section, carousel handles empty state
  html += '<div id="reviews-section-card" style="background: #fff; padding: 16px; margin-top: 8px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">';
  html += '<h3 style="font-size: 16px; font-weight: 700;">What Customers Say <span id="reviews-heading-count"></span></h3>';
  html += '<div onclick="navigate(\'reviews\', ' + p.id + ', true)" style="font-size:13px;color:#FF4B2B;font-weight:600;cursor:pointer;">See All</div>';
  html += '</div>';
  html += '<div id="reviews-carousel" style="position:relative;overflow:hidden;min-height:130px;">';
  html += '<p style="color:#888;padding:20px 0;">Loading reviews...</p>';
  html += '</div>';
  html += '<div id="carousel-dots" style="display:flex;justify-content:center;gap:6px;margin-top:10px;"></div>';
  html += '</div>';

  el.innerHTML = html;

  var stickyPrice = document.getElementById("sticky-price");
  var stickySummary = document.getElementById("sticky-attr-summary");
  if (stickyPrice) stickyPrice.textContent = (p.prices && p.prices.price) ? "$" + (parseInt(p.prices.price) / 100).toFixed(2) : "$0.00";
  if (stickySummary) stickySummary.textContent = Object.values(_selectedAttributes).join(", ");
  stickyBar.style.display = "block";
  updateProductAddButton();
}

// ==================== REVIEWS CAROUSEL ====================
var _carouselData = [];
var _carouselIndex = 0;
var _carouselTimer = null;

async function loadReviewsCarousel(productId) {
  var el = document.getElementById("reviews-carousel");
  var dots = document.getElementById("carousel-dots");
  var headingCount = document.getElementById("reviews-heading-count");

  console.log("[REVIEWS] loadReviewsCarousel called with productId =", productId);
  console.log("[REVIEWS] el found:", !!el, "dots:", !!dots, "heading:", !!headingCount);

  if (!el) {
    console.log("[REVIEWS] ABORT: #reviews-carousel not in DOM");
    return;
  }

  el.innerHTML = '<p style="color:#888;padding:20px 0;">Loading reviews...</p>';

  var reviews = [];
  var fetchUrl = APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/reviews?product_id=" + productId + "&per_page=100&order=desc&orderby=date";
  console.log("[REVIEWS] fetching:", fetchUrl);

  try {
    var res = await fetch(fetchUrl);
    console.log("[REVIEWS] HTTP status:", res.status, res.statusText);
    if (!res.ok) {
      el.innerHTML = '<p style="color:#d33;padding:20px 0;">HTTP ' + res.status + " - " + res.statusText + '</p>';
      if (headingCount) headingCount.textContent = "(0)";
      return;
    }
    var data = await res.json();
    console.log("[REVIEWS] JSON type:", Array.isArray(data) ? "array[" + data.length + "]" : typeof data);
    console.log("[REVIEWS] first item:", data && data[0] ? data[0].reviewer + " / rating " + data[0].rating : "none");

    if (Array.isArray(data)) {
      reviews = data.map(function(r) {
        return {
          name: r.reviewer || "Anonymous",
          text: (r.review || "").replace(/<[^>]*>/g, "").trim(),
          rating: parseInt(r.rating) || 5,
          avatar: r.reviewer_avatar_urls ? (r.reviewer_avatar_urls["48"] || "") : "",
          date: r.date_created || ""
        };
      });
    }
  } catch(err) {
    console.log("[REVIEWS] FETCH THREW:", err);
    el.innerHTML = '<p style="color:#d33;padding:20px 0;">Fetch failed: ' + err.message + '</p>';
    if (headingCount) headingCount.textContent = "(0)";
    return;
  }

  if (reviews.length === 0) {
    console.log("[REVIEWS] no reviews returned");
    if (headingCount) headingCount.textContent = "(0)";
    el.innerHTML = '<p style="color:#888;padding:20px 0;">No reviews yet - be the first to review this product.</p>';
    if (dots) dots.innerHTML = "";
    return;
  }

  console.log("[REVIEWS] rendering", reviews.length, "reviews");
  if (headingCount) headingCount.textContent = "(" + reviews.length + ")";
  _carouselData = reviews;
  _carouselIndex = 0;

  try {
    renderCarouselSlide();
    console.log("[REVIEWS] slide rendered OK");
  } catch(e) {
    console.log("[REVIEWS] renderCarouselSlide THREW:", e);
    el.innerHTML = '<p style="color:#d33;padding:20px 0;">Render error: ' + e.message + '</p>';
    return;
  }

  if (_carouselTimer) clearInterval(_carouselTimer);
  _carouselTimer = setInterval(function() {
    if (_carouselData.length < 2) return;
    _carouselIndex = (_carouselIndex + 1) % _carouselData.length;
    renderCarouselSlide();
  }, 10000);
}

function renderCarouselSlide() {
  var el = document.getElementById("reviews-carousel");
  var dots = document.getElementById("carousel-dots");
  if (!el || _carouselData.length === 0) return;
  var r = _carouselData[_carouselIndex];
  var stars = "";
  for (var i = 0; i < 5; i++) stars += (i < r.rating ? "\u2605" : "\u2606");
  var initials = (r.name || "A").substring(0, 1).toUpperCase();
  var idxLabel = (_carouselIndex + 1) + "/" + _carouselData.length;
  el.innerHTML =
    '<div style="position:absolute;top:0;left:0;right:0;bottom:0;padding:12px;background:#f9f9f9;border-radius:12px;">' +
      '<div style="position:absolute;top:8px;right:12px;font-size:11px;color:#888;">' + idxLabel + '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
        (r.avatar
          ? '<img src="' + r.avatar + '" style="width:36px;height:36px;border-radius:50%;">'
          : '<div style="width:36px;height:36px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">' + initials + '</div>') +
        '<div><div style="font-size:14px;font-weight:700;color:#111;">' + r.name + '</div><div style="font-size:12px;color:#FFD700;">' + stars + '</div></div>' +
      '</div>' +
      '<div style="font-size:13px;color:#555;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">"' + r.text + '"</div>' +
    '</div>';

  if (dots) {
    var dotHtml = "";
    for (var j = 0; j < _carouselData.length; j++) {
      dotHtml += '<div onclick="jumpCarousel(' + j + ')" style="width:6px;height:6px;border-radius:50%;background:' + (j === _carouselIndex ? "#111" : "#ccc") + ';cursor:pointer;"></div>';
    }
    dots.innerHTML = dotHtml;
  }
}

function jumpCarousel(i) {
  _carouselIndex = i;
  renderCarouselSlide();
  if (_carouselTimer) { clearInterval(_carouselTimer); _carouselTimer = setInterval(function() {
    if (_carouselData.length < 2) return;
    _carouselIndex = (_carouselIndex + 1) % _carouselData.length;
    renderCarouselSlide();
  }, 10000); }
}

function toggleProductHeart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  toggleWishlist(p.id, p.name, (p.prices ? p.prices.price : 0), ((p.images && p.images[0]) ? p.images[0].thumbnail : ""));
  var isIn = getWishlist().some(function(w) { return w.id === p.id; });
  var icon = document.getElementById("product-heart-icon");
  if (icon) {
    icon.className = (isIn ? "fa-solid" : "fa-regular") + " fa-heart";
    icon.style.color = isIn ? "#FF4B2B" : "#111";
  }
}

function selectProductAttribute(attrName, termName) {
  _selectedAttributes[attrName] = termName;
  if (!_currentProduct || !_currentProduct.attributes) return;
  _currentProduct.attributes.forEach(function(attr) {
    if (!attr.terms) return;
    var attrKey = attr.name.replace(/\s/g, "");
    attr.terms.forEach(function(term) {
      var termKey = term.name.replace(/\s/g, "");
      var pill = document.getElementById("prod-attr-" + attrKey + "-" + termKey);
      if (!pill) return;
      var isSelected = _selectedAttributes[attr.name] === term.name;
      pill.style.border = "1px solid " + (isSelected ? "#111" : "#ddd");
      pill.style.background = isSelected ? "#111" : "#fff";
      pill.style.color = isSelected ? "#fff" : "#333";
    });
    var label = document.getElementById("attr-label-" + attrKey);
    if (label) label.textContent = _selectedAttributes[attr.name] || "";
  });
  var summary = document.getElementById("sticky-attr-summary");
  if (summary) summary.textContent = Object.values(_selectedAttributes).join(", ");
  updateProductAddButton();
}

function getCurrentCartName() {
  if (!_currentProduct) return "";
  var attrString = Object.values(_selectedAttributes).join(", ");
  var name = _currentProduct.name;
  if (attrString) name += " (" + attrString + ")";
  return name;
}

function updateProductAddButton() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var cartName = getCurrentCartName();
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === p.id && item.name === cartName; });
  var wrap = document.getElementById("sticky-btn-wrap");
  if (!wrap) return;
  if (existing && existing.qty > 0) {
    wrap.innerHTML = '<div style="display:flex;align-items:center;gap:16px;background:#111;color:#fff;padding:12px 20px;border-radius:12px;font-size:15px;font-weight:700;">' +
      '<button onclick="decrementProductInCart()" style="border:none;background:none;color:#fff;font-size:22px;font-weight:bold;cursor:pointer;padding:0 6px;line-height:1;">-</button>' +
      '<span style="min-width:24px;text-align:center;">' + existing.qty + '</span>' +
      '<button onclick="incrementProductInCart()" style="border:none;background:none;color:#fff;font-size:22px;font-weight:bold;cursor:pointer;padding:0 6px;line-height:1;">+</button>' +
    '</div>';
  } else {
    wrap.innerHTML = '<button onclick="handleStickyAddToCart()" style="padding:14px 32px;background:#111;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Add to Cart</button>';
  }
}

function incrementProductInCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var cartName = getCurrentCartName();
  var cart = getCart();
  var item = cart.find(function(i) { return i.id === p.id && i.name === cartName; });
  if (item) {
    item.qty += 1;
    saveCart(cart);
    updateProductAddButton();
    updateFloatingCartBubble();
  }
}

function decrementProductInCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  var cartName = getCurrentCartName();
  var cart = getCart();
  var idx = -1;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].id === p.id && cart[i].name === cartName) { idx = i; break; }
  }
  if (idx > -1) {
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart);
    updateProductAddButton();
    updateFloatingCartBubble();
  }
}

function handleStickyAddToCart() {
  if (!_currentProduct) return;
  var p = _currentProduct;
  if (p.is_in_stock === false) { showToast("This product is out of stock"); return; }
  if (p.attributes && p.attributes.length > 0) {
    var missing = null;
    for (var i = 0; i < p.attributes.length; i++) {
      var attr = p.attributes[i];
      if (!attr.terms || attr.terms.length === 0) continue;
      if (!_selectedAttributes[attr.name]) { missing = attr.name; break; }
    }
    if (missing) { showToast("Please select " + missing); return; }
  }
  var p2 = _currentProduct;
  var cartName = getCurrentCartName();
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === p2.id && item.name === cartName; });
  if (existing) {
    existing.qty += 1;
    saveCart(cart);
  } else {
    cart.push({ id: p2.id, name: cartName, price: parseFloat(p2.prices ? p2.prices.price : 0), image: ((p2.images && p2.images[0]) ? p2.images[0].thumbnail : ""), qty: 1 });
    saveCart(cart);
  }
  updateProductAddButton();
  updateFloatingCartBubble();
}

function shareProduct() {
  if (!_currentProduct) return;
  var url = _currentProduct.permalink || window.location.href;
  var name = _currentProduct.name || "";
  if (navigator.share) {
    navigator.share({ title: name, url: url });
  } else {
    showToast("Link copied");
    if (navigator.clipboard) navigator.clipboard.writeText(url);
  }
}

// ==================== IMAGE VIEWER ====================
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
    t.onclick = (function(idx) { return function() { _viewerIndex = idx; largeImg.src = _productImages[idx]; updateViewerThumbs(); }; })(i);
    thumbs.appendChild(t);
  });
  initViewerSwipe();
}

function updateViewerThumbs() {
  var thumbs = document.getElementById("image-viewer-thumbs");
  var largeImg = document.getElementById("viewer-large-img");
  if (!thumbs || !largeImg) return;
  largeImg.src = _productImages[_viewerIndex];
  for (var i = 0; i < thumbs.children.length; i++) {
    thumbs.children[i].style.border = "2px solid " + (i === _viewerIndex ? "#fff" : "transparent");
  }
}

function viewerPrev() { _viewerIndex = (_viewerIndex - 1 + _productImages.length) % _productImages.length; updateViewerThumbs(); }
function viewerNext() { _viewerIndex = (_viewerIndex + 1) % _productImages.length; updateViewerThumbs(); }
function closeImageViewer() { var v = document.getElementById("image-viewer"); if (v) v.style.display = "none"; }

var _viewerTouchStartX = 0;
var _viewerTouchEndX = 0;
function initViewerSwipe() {
  var vm = document.getElementById("image-viewer-main");
  if (!vm || vm.dataset.swipeInit) return;
  vm.dataset.swipeInit = "1";
  vm.addEventListener("touchstart", function(e) { _viewerTouchStartX = e.changedTouches[0].screenX; }, false);
  vm.addEventListener("touchend", function(e) {
    _viewerTouchEndX = e.changedTouches[0].screenX;
    var diff = _viewerTouchEndX - _viewerTouchStartX;
    if (Math.abs(diff) < 50) return;
    if (diff > 0) viewerPrev(); else viewerNext();
  }, false);
}

// ==================== FLOATING CART BUBBLE ====================
function updateFloatingCartBubble() {
  var bubble = document.getElementById("floating-cart-bubble");
  var imagesEl = document.getElementById("bubble-images");
  var countEl = document.getElementById("bubble-count");
  if (!bubble || !imagesEl || !countEl) return;
  var cart = getCart();
  var isProductPage = document.body.classList.contains("on-product-page");
  if (cart.length === 0 || !isProductPage) { bubble.style.display = "none"; return; }
  bubble.style.display = "flex";
  var totalItems = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
  countEl.textContent = totalItems + (totalItems === 1 ? " item" : " items");
  var recentItems = cart.slice().reverse().slice(0, 3);
  imagesEl.innerHTML = "";
  recentItems.forEach(function(item, i) {
    var img = document.createElement("img");
    img.src = item.image;
    img.style.cssText = "width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #fff;background:#fff;margin-left:" + (i === 0 ? "0" : "-10px") + ";z-index:" + (10 - i) + ";";
    imagesEl.appendChild(img);
  });
  bubble.style.transform = "scale(1.05)";
  setTimeout(function() { bubble.style.transform = "scale(1)"; }, 200);
}

// ==================== SEARCH ====================
async function initSearchPage() {
  if (globalProducts.length === 0) {
    try { var res = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products?per_page=50"); globalProducts = await res.json(); } catch(e) { return; }
  }
  var trending = document.getElementById("trending-search");
  if (trending) trending.innerHTML = globalProducts.slice(0, 4).map(function(p) {
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + (p.images[0] ? p.images[0].thumbnail : "") + '" loading="lazy"><h3>' + p.name + '</h3><div class="price">' + p.price_html + '</div></div>';
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

function clickRecent(term) {
  var inp = document.getElementById("search-page-input");
  if (inp) inp.value = term;
  currentSearchQuery = term;
  saveSearchHistory(term);
  goToSearchResults();
}
function saveSearchHistory(term) {
  term = term.trim().toLowerCase(); if (term.length < 2) return;
  var recents = JSON.parse(localStorage.getItem("recent_searches") || "[]");
  if (recents.indexOf(term) === -1) {
    recents.unshift(term);
    if (recents.length > 6) recents.pop();
    localStorage.setItem("recent_searches", JSON.stringify(recents));
    renderRecentSearches();
  }
}
function clearRecent() { localStorage.removeItem("recent_searches"); renderRecentSearches(); }

function executeSearch() {
  var input = document.getElementById("search-page-input");
  if (!input) return;
  var query = input.value.trim().toLowerCase();
  currentSearchQuery = query;
  var defaultState = document.getElementById("default-search-state");
  var activeState = document.getElementById("active-search-state");
  if (query.length === 0) { defaultState.style.display = "block"; activeState.style.display = "none"; return; }
  else { defaultState.style.display = "none"; activeState.style.display = "block"; }
  var filtered = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(query) !== -1; });
  var listEl = document.getElementById("autocomplete-list");
  if (filtered.length === 0) { listEl.innerHTML = '<p style="font-size:14px; color:#666;">No results for "' + query + '"</p>'; return; }
  listEl.innerHTML = filtered.slice(0, 6).map(function(p) {
    return '<div onclick="saveSearchHistory(\'' + p.name.replace(/\x27/g, "\\\x27") + '\'); navigate(\'product\', ' + p.id + ')" style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer;"><img src="' + (p.images[0] ? p.images[0].thumbnail : "") + '" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;"><span style="font-size: 15px; font-weight: 500; color: #333;">' + p.name + '</span></div>';
  }).join("");
}
function goToSearchResults() {
  saveSearchHistory(currentSearchQuery);
  appliedFilters = getEmptyFilters();
  navigate("search-results");
}

// ==================== SEARCH RESULTS & FILTERS ====================
function initSearchResultsPage() {
  var label = document.getElementById("results-search-label");
  if (label) label.textContent = currentSearchQuery || "All Products";
  currentPage = 1;
  var searchProducts = globalProducts;
  if (currentSearchQuery) {
    searchProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
  }
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
    products = products.filter(function(p) {
      if (!p.attributes) return false;
      var attr = p.attributes.find(function(a) { return a.name === key; });
      return attr && attr.terms.some(function(t) { return t.name === value; });
    });
  });
  if (filters.sort === "price-low") products.sort(function(a, b) { return parseInt(a.prices.price) - parseInt(b.prices.price); });
  if (filters.sort === "price-high") products.sort(function(a, b) { return parseInt(b.prices.price) - parseInt(a.prices.price); });
  if (filters.sort === "rating") products.sort(function(a, b) { return parseInt(b.average_rating || 0) - parseInt(a.average_rating || 0); });
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
  if (filteredTabs.length === 0) {
    sidebar.innerHTML = '<div style="padding: 16px; color: #888; font-size: 14px;">No filters found.</div>';
    var fc = document.getElementById("filter-content"); if (fc) fc.innerHTML = "";
    return;
  }
  if (!filteredTabs.find(function(t) { return t.id === activeSidebarTab; })) activeSidebarTab = filteredTabs[0].id;
  sidebar.innerHTML = filteredTabs.map(function(t) {
    return '<div onclick="switchFilterTab(\'' + t.id + '\')" style="padding: 16px; font-size: 14px; border-bottom: 1px solid #eee; cursor: pointer; background: ' + (activeSidebarTab === t.id ? "#fff" : "#f9f9f9") + "; border-left: 3px solid " + (activeSidebarTab === t.id ? "#111" : "transparent") + "; font-weight: " + (activeSidebarTab === t.id ? "600" : "400") + "; color: " + (activeSidebarTab === t.id ? "#111" : "#555") + ';">' + t.label + '</div>';
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
    var sorts = [{id: "relevance", label: "Relevance"},{id: "price-low", label: "Price: Low to High"},{id: "price-high", label: "Price: High to Low"},{id: "rating", label: "Customer Rating"}].filter(function(s) { return s.label.toLowerCase().indexOf(searchVal) !== -1; });
    if (sorts.length === 0) { content.innerHTML = "<p style='color:#888;'>No sort options found.</p>"; return; }
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Sort By</h3>';
    html += sorts.map(function(s) {
      return '<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:12px 0; cursor:pointer;"><input type="radio" name="sort" value="' + s.id + '" ' + (draftFilters.sort === s.id ? "checked" : "") + ' onchange="updateDraft(\'sort\', \'' + s.id + '\')" style="width:20px; height:20px;"><span>' + s.label + '</span></label>';
    }).join("");
  }

  if (activeSidebarTab === "price") {
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Price and Deals</h3>';
    var currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
    var availableDiscounts = currentProducts.map(function(p) {
      if (!p.on_sale || parseInt(p.prices.regular_price) <= parseInt(p.prices.price)) return 0;
      return Math.round(((parseInt(p.prices.regular_price) - parseInt(p.prices.price)) / parseInt(p.prices.regular_price)) * 100);
    }).filter(function(d) { return d > 0; });
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
        return '<div onclick="updateDraft(\'minDiscount\', ' + (d === draftFilters.minDiscount ? 0 : d) + ')" style="padding: 8px 16px; border-radius: 20px; border: 1px solid ' + (draftFilters.minDiscount === d ? "#111" : "#ddd") + "; background: " + (draftFilters.minDiscount === d ? "#111" : "#fff") + "; color: " + (draftFilters.minDiscount === d ? "#fff" : "#333") + '; font-size: 13px; cursor: pointer;">' + d + '% Off or more</div>';
      }).join("") + "</div>";
    }
    if ("price".indexOf(searchVal) !== -1) {
      html += '<h4 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Price</h4>';
      html += '<div style="font-size: 16px; font-weight: 700; margin-bottom: 16px;">$' + draftFilters.minPrice + " - $" + draftFilters.maxPrice + "</div>";
      var minPercent = ((draftFilters.minPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      var maxPercent = ((draftFilters.maxPrice - minProductPrice) / (maxProductPrice - minProductPrice)) * 100;
      html += '<div class="custom-slider-container" style="width: 100%;"><div class="custom-slider-track"></div><div class="custom-slider-fill" style="left: ' + minPercent + "%; width: " + (maxPercent - minPercent) + '%;"></div><div class="custom-slider-thumb" id="thumb-min" style="left: ' + minPercent + '%;" onpointerdown="startDrag(this, event)"></div><div class="custom-slider-thumb" id="thumb-max" style="left: ' + maxPercent + '%;" onpointerdown="startDrag(this, event)"></div></div>';
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
      return '<label style="display:flex; align-items:center; gap:12px; font-size:15px; padding:10px 0; cursor:pointer;"><input type="radio" name="cat" ' + (draftFilters.category === c ? "checked" : "") + ' onchange="updateDraft(\'category\', \'' + c + '\')" style="width:20px; height:20px;"><span>' + c + '</span></label>';
    }).join("");
  }

  if (activeSidebarTab.indexOf("attr-") === 0) {
    var attrName = activeSidebarTab.replace("attr-", "");
    var currentProducts = globalProducts;
    if (currentSearchQuery) currentProducts = globalProducts.filter(function(p) { return p.name.toLowerCase().indexOf(currentSearchQuery) !== -1 || (p.description || "").toLowerCase().indexOf(currentSearchQuery) !== -1; });
    var terms = [];
    currentProducts.forEach(function(p) {
      if (p.attributes) p.attributes.filter(function(a) { return a.name === attrName; }).forEach(function(a) { a.terms.forEach(function(t) { if (terms.indexOf(t.name) === -1) terms.push(t.name); }); });
    });
    terms = terms.filter(function(t) { return t.toLowerCase().indexOf(searchVal) !== -1; });
    if (terms.length === 0) { content.innerHTML = "<p style='color:#888;'>No options found.</p>"; return; }
    html += '<h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">' + attrName + "</h3>";
    html += '<div style="display:flex; flex-wrap:wrap; gap:10px;">' + terms.map(function(t) {
      var isActive = draftFilters.attributes[attrName] === t;
      return '<div onclick="toggleDraftAttr(\'' + attrName + '\', \'' + t + '\')" style="padding: 10px 16px; border-radius: 20px; border: 1px solid ' + (isActive ? "#111" : "#ddd") + "; background: " + (isActive ? "#111" : "#fff") + "; color: " + (isActive ? "#fff" : "#333") + '; font-size: 14px; cursor: pointer;">' + t + '</div>';
    }).join("") + "</div>";
  }

  content.innerHTML = html;
}

function updateDraft(key, value) {
  draftFilters[key] = value;
  if (key === "minPrice" && value >= draftFilters.maxPrice) draftFilters.minPrice = draftFilters.maxPrice - 1;
  if (key === "maxPrice" && value <= draftFilters.minPrice) draftFilters.maxPrice = draftFilters.minPrice + 1;
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
  var activePillsHtml = "";
  var activeCount = 0;

  if (appliedFilters.category) {
    activePillsHtml += '<div onclick="resetSpecificFilter(\'category\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + appliedFilters.category + ' <i class="fa-solid fa-xmark"></i></div>';
    activeCount++;
  }
  if (appliedFilters.minDiscount > 0) {
    activePillsHtml += '<div onclick="resetSpecificFilter(\'minDiscount\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + appliedFilters.minDiscount + '% Off+ <i class="fa-solid fa-xmark"></i></div>';
    activeCount++;
  }
  if (appliedFilters.sort !== "relevance") {
    activePillsHtml += '<div onclick="resetSpecificFilter(\'sort\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">Sorted <i class="fa-solid fa-xmark"></i></div>';
    activeCount++;
  }
  Object.keys(appliedFilters.attributes).forEach(function(k) {
    var v = appliedFilters.attributes[k];
    activePillsHtml += '<div onclick="resetSpecificFilter(\'attr\',\'' + k + '\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">' + v + ' <i class="fa-solid fa-xmark"></i></div>';
    activeCount++;
  });
  if (appliedFilters.minPrice > minProductPrice || appliedFilters.maxPrice < maxProductPrice) {
    activePillsHtml += '<div onclick="resetSpecificFilter(\'price\')" style="display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0f0f0; border-radius:20px; font-size:13px; white-space:nowrap; cursor:pointer;">$' + appliedFilters.minPrice + "-$" + appliedFilters.maxPrice + ' <i class="fa-solid fa-xmark"></i></div>';
    activeCount++;
  }

  if (pillsContainer) {
    if (activeCount > 0) {
      pillsContainer.style.display = "flex";
      pillsContainer.innerHTML = activePillsHtml + '<span onclick="resetFilters()" style="font-size:13px; color:#FF4B2B; font-weight:600; cursor:pointer; white-space:nowrap;">Clear All</span>';
    } else {
      pillsContainer.style.display = "none";
    }
  }
  var badge = document.getElementById("active-filter-count");
  if (badge) {
    badge.style.display = activeCount > 0 ? "flex" : "none";
    badge.textContent = activeCount;
  }

  if (!products || products.length === 0) {
    grid.innerHTML = '<div style="grid-column: span 2; text-align: center; padding: 40px;"><h3>No products found</h3><p style="color:#666; font-size:14px; margin-top:8px;">Try adjusting your filters.</p></div>';
    var pc = document.getElementById("pagination-controls");
    if (pc) pc.style.display = "none";
    return;
  }

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
      var pi = document.getElementById("page-indicator");
      if (pi) pi.textContent = "Page " + currentPage + " of " + totalPages;
      var pb = document.getElementById("prev-btn");
      if (pb) { pb.disabled = currentPage === 1; pb.style.opacity = currentPage === 1 ? "0.5" : "1"; }
      var nb = document.getElementById("next-btn");
      if (nb) { nb.disabled = currentPage === totalPages; nb.style.opacity = currentPage === totalPages ? "0.5" : "1"; }
    } else {
      pcontrols.style.display = "none";
    }
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
    var thumb = (p.images && p.images[0]) ? p.images[0].thumbnail : "";
    var safeName = p.name.replace(/\x27/g, "\\\x27");
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

function resetSpecificFilter(type, key) {
  if (type === "category") appliedFilters.category = null;
  if (type === "minDiscount") appliedFilters.minDiscount = 0;
  if (type === "sort") appliedFilters.sort = "relevance";
  if (type === "price") { appliedFilters.minPrice = minProductPrice; appliedFilters.maxPrice = maxProductPrice; }
  if (type === "attr") delete appliedFilters.attributes[key];
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
  if (activeThumb.id === "thumb-min") { if (value < draftFilters.maxPrice) updateDraft("minPrice", value); }
  else { if (value > draftFilters.minPrice) updateDraft("maxPrice", value); }
}
function stopDrag() {
  activeThumb = null;
  document.removeEventListener("pointermove", onDrag);
  document.removeEventListener("pointerup", stopDrag);
}

// ==================== CART ====================
function getCart() { return JSON.parse(localStorage.getItem("native_cart") || "[]"); }
function saveCart(cart) {
  localStorage.setItem("native_cart", JSON.stringify(cart));
  updateCartBadge();
  updateFloatingCartBubble();
}
function addToCart(id, name, price, image, qty) {
  if (qty === undefined) qty = 1;
  var cart = getCart();
  var existing = cart.find(function(item) { return item.id === id && item.name === name; });
  if (existing) { existing.qty += qty; } else { cart.push({ id: id, name: name, price: parseFloat(price), image: image, qty: qty }); }
  saveCart(cart);
}
function updateCartBadge() {
  var cart = getCart();
  var totalItems = cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
  var cartTab = document.querySelector('.tab[data-id="cart"]');
  if (cartTab) {
    var badge = cartTab.querySelector(".cart-badge");
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
  var cart = getCart();
  var el = document.getElementById("cart-items");
  var summary = document.getElementById("cart-summary");
  if (!el || !summary) return;
  if (cart.length === 0) {
    el.innerHTML = "<div style='text-align:center; padding:40px 16px;'><i class='fa-solid fa-cart-shopping' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h2>Your cart is empty</h2><p style='color:#666; margin-top:8px;'>Looks like you haven't added anything yet.</p></div>";
    summary.style.display = "none";
    return;
  }
  var total = 0;
  el.innerHTML = cart.map(function(item, index) {
    total += (item.price * item.qty);
    var displayPrice = (item.price / 100).toFixed(2);
    var totalForItem = ((item.price * item.qty) / 100).toFixed(2);
    return '<div style="display:flex; gap:12px; padding:16px; border-bottom:1px solid #eee; align-items:center;"><img src="' + item.image + '" style="width:64px; height:64px; border-radius:8px; object-fit:cover;"><div style="flex:1;"><h3 style="font-size:14px; margin-bottom:4px;">' + item.name + '</h3><div style="color:#666; font-size:13px;">$' + displayPrice + '</div></div><div style="display:flex; align-items:center; gap:12px; background:#f5f5f5; padding:4px 12px; border-radius:20px;"><button onclick="changeQty(' + index + ', -1)" style="border:none; background:none; font-size:16px; cursor:pointer;">-</button><span style="font-size:14px; font-weight:600;">' + item.qty + '</span><button onclick="changeQty(' + index + ', 1)" style="border:none; background:none; font-size:16px; cursor:pointer;">+</button></div><div style="font-weight:700; font-size:14px; width:50px; text-align:right;">$' + totalForItem + '</div></div>';
  }).join("");
  var ct = document.getElementById("cart-total");
  if (ct) ct.textContent = "$" + (total / 100).toFixed(2);
  summary.style.display = "block";
}

function changeQty(index, change) {
  var cart = getCart();
  if (cart[index]) {
    cart[index].qty += change;
    if (cart[index].qty <= 0) cart.splice(index, 1);
    saveCart(cart);
    renderCart();
  }
}

function checkout() { navigate("checkout", null, true); }

// ==================== WISHLIST ====================
function getWishlist() { return JSON.parse(localStorage.getItem("native_wishlist") || "[]"); }
function saveWishlist(w) { localStorage.setItem("native_wishlist", JSON.stringify(w)); }
function toggleWishlist(id, name, price, image) {
  var w = getWishlist();
  var exists = w.find(function(item) { return item.id === id; });
  if (exists) { w = w.filter(function(item) { return item.id !== id; }); showToast("Removed from Wishlist"); }
  else { w.push({ id: id, name: name, price: parseFloat(price), image: image }); showToast("Added to Wishlist"); }
  saveWishlist(w);
  if (window.location.hash === "#search-results") applyFilters();
  if (window.location.hash === "#wishlist") renderWishlistPage();
}
function renderWishlistPage() {
  var w = getWishlist();
  var grid = document.getElementById("wishlist-grid");
  if (!grid) return;
  if (w.length === 0) {
    grid.innerHTML = "<div style='grid-column: span 2; text-align: center; padding: 40px;'><i class='fa-regular fa-heart' style='font-size:48px; color:#ccc; margin-bottom:16px;'></i><h3>Your wishlist is empty</h3></div>";
    return;
  }
  grid.innerHTML = w.map(function(p) {
    return '<div class="card" onclick="navigate(\'product\', ' + p.id + ')"><img src="' + p.image + '" loading="lazy"><div style="padding: 8px 12px;"><h3>' + p.name + '</h3></div></div>';
  }).join("");
}

// ==================== TABBAR ====================
function buildTabbar() {
  var el = document.getElementById("tabbar");
  if (!el || typeof APP_CONFIG === "undefined" || !APP_CONFIG.tabs) return;
  el.innerHTML = "";
  APP_CONFIG.tabs.forEach(function(tab) {
    var btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.id = tab.id;
    btn.innerHTML = "<span>" + tab.icon + "</span><small>" + tab.label + "</small>";
    btn.onclick = function() { navigate(tab.id, null, true); };
    el.appendChild(btn);
  });
}

buildTabbar();
updateCartBadge();
handleRoute();


// ==================== REVIEWS PAGE ====================
async function loadReviewsPage(productId) {
  var p = null;
  try {
    var pres = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/" + productId);
    if (pres.ok) p = await pres.json();
  } catch(e) {}

  var reviews = [];
  try {
    var wcRevRes = await fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/reviews?product_id=" + productId + "&per_page=100&order=desc&orderby=date");
    if (wcRevRes.ok) {
      var wcRevs = await wcRevRes.json();
      if (Array.isArray(wcRevs)) {
        reviews = wcRevs.map(function(r) {
          return {
            id: r.id,
            reviewer: r.reviewer || "Anonymous",
            review: (r.review || "").replace(/<[^>]*>/g, "").trim(),
            rating: parseInt(r.rating) || 5,
            date_created: r.date_created || "",
            verified: r.verified || false,
            avatar: r.reviewer_avatar_urls ? (r.reviewer_avatar_urls["48"] || "") : ""
          };
        });
      }
    }
  } catch(e) { console.log("WC reviews page fetch failed:", e); }

  var total = reviews.length;
  var counts = {1:0,2:0,3:0,4:0,5:0};
  var sum = 0;
  reviews.forEach(function(r) { var st = Math.max(1, Math.min(5, r.rating)); counts[st]++; sum += st; });
  var avg = total > 0 ? (sum / total).toFixed(1) : "0.0";

  var html = '';
  html += '<div style="background:#fff;min-height:100vh;padding-bottom:90px;">';
  html += '<div style="padding:16px;background:#fff;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px;">';
  html += '<i class="fa-solid fa-arrow-left" onclick="history.back()" style="font-size:20px;cursor:pointer;"></i>';
  html += '<h1 style="font-size:18px;font-weight:700;">Reviews</h1>';
  html += '</div>';

  html += '<div style="padding:20px;background:#fff;display:flex;gap:20px;border-bottom:8px solid #f5f5f5;">';
  html += '<div style="text-align:center;">';
  html += '<div style="font-size:42px;font-weight:800;color:#111;line-height:1;">' + avg + '</div>';
  html += '<div style="color:#FFD700;font-size:16px;margin-top:4px;">';
  for (var s=1;s<=5;s++) html += (s <= Math.round(parseFloat(avg)) ? "\u2605" : "\u2606");
  html += '</div>';
  html += '<div style="font-size:12px;color:#888;margin-top:4px;">' + total + ' reviews</div>';
  html += '</div>';
  html += '<div style="flex:1;">';
  for (var star=5;star>=1;star--) {
    var pct = total > 0 ? (counts[star] / total * 100) : 0;
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">';
    html += '<span style="width:20px;color:#888;">' + star + '\u2605</span>';
    html += '<div style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:#FFD700;"></div></div>';
    html += '<span style="width:24px;text-align:right;color:#888;">' + counts[star] + '</span>';
    html += '</div>';
  }
  html += '</div></div>';

  if (reviews.length === 0) {
    html += '<div style="padding:60px 20px;text-align:center;">';
    html += '<i class="fa-regular fa-star" style="font-size:48px;color:#ddd;margin-bottom:16px;"></i>';
    html += '<h3 style="font-size:16px;font-weight:700;">No reviews yet</h3>';
    html += '<p style="color:#888;font-size:14px;margin-top:8px;">Be the first to review this product.</p>';
    html += '</div>';
  } else {
    html += '<div style="padding:8px 16px;">';
    reviews.forEach(function(r) {
      var stars = "";
      for (var i=0;i<5;i++) stars += (i < r.rating ? "\u2605" : "\u2606");
      var dateStr = r.date_created ? new Date(r.date_created).toLocaleDateString() : "";
      var initial = (r.reviewer || "A").substring(0,1).toUpperCase();
      html += '<div style="padding:16px 0;border-bottom:1px solid #f0f0f0;">';
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      if (r.avatar) html += '<img src="' + r.avatar + '" style="width:40px;height:40px;border-radius:50%;">';
      else html += '<div style="width:40px;height:40px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">' + initial + '</div>';
      html += '<div style="flex:1;">';
      html += '<div style="font-size:14px;font-weight:700;">' + r.reviewer + (r.verified ? ' <span style="font-size:10px;color:#008C4A;background:#e6f7ee;padding:2px 6px;border-radius:4px;margin-left:6px;">Verified</span>' : '') + '</div>';
      html += '<div style="color:#FFD700;font-size:13px;">' + stars + ' <span style="color:#aaa;margin-left:6px;">' + dateStr + '</span></div>';
      html += '</div></div>';
      html += '<div style="font-size:14px;color:#555;line-height:1.5;">' + r.review + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (container) container.innerHTML = html;
}


function openReviewInWebView(url) {
  if (!container) return;
  container.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:0;position:absolute;top:0;left:0;bottom:0;"></iframe>';
}


async function loadGroupedProducts(parentProduct) {
  var el = document.getElementById("grouped-products-list");
  if (!el) return;
  if (!parentProduct.grouped_products || parentProduct.grouped_products.length === 0) {
    el.innerHTML = '<p style="color:#888;">No products in this group.</p>';
    return;
  }
  try {
    var results = await Promise.all(parentProduct.grouped_products.map(function(id) {
      return fetch(APP_CONFIG.siteUrl + "/wp-json/wc/store/v1/products/" + id).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    }));
    var valid = results.filter(function(x) { return x && x.id; });
    if (valid.length === 0) { el.innerHTML = '<p style="color:#888;">Could not load products.</p>'; return; }
    el.innerHTML = valid.map(function(sub) {
      var img = (sub.images && sub.images[0]) ? sub.images[0].thumbnail : "";
      var cart = getCart();
      var inCart = cart.find(function(c) { return c.id === sub.id && c.name === sub.name; });
      var qty = inCart ? inCart.qty : 0;
      return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;align-items:center;">' +
        '<img src="' + img + '" onclick="navigate(\'product\', ' + sub.id + ')" style="width:60px;height:60px;border-radius:8px;object-fit:cover;cursor:pointer;">' +
        '<div style="flex:1;">' +
          '<div onclick="navigate(\'product\', ' + sub.id + ')" style="font-size:14px;font-weight:600;cursor:pointer;">' + sub.name + '</div>' +
          '<div style="font-size:13px;color:#666;margin-top:2px;">' + (sub.price_html || "").replace(/<[^>]*>/g, "").trim() + '</div>' +
        '</div>' +
        (qty > 0
          ? '<div style="display:flex;align-items:center;gap:10px;background:#111;color:#fff;padding:6px 12px;border-radius:8px;font-weight:700;">' +
              '<button onclick="groupedQty(' + sub.id + ', -1)" style="border:none;background:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">-</button>' +
              '<span style="min-width:16px;text-align:center;">' + qty + '</span>' +
              '<button onclick="groupedQty(' + sub.id + ', 1)" style="border:none;background:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;">+</button>' +
            '</div>'
          : '<button onclick="groupedAdd(' + sub.id + ', \'' + (sub.name || "").replace(/'/g, "\\'") + '\', ' + (sub.prices ? sub.prices.price : 0) + ', \'' + img + '\')" style="padding:8px 20px;background:#111;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Add</button>') +
      '</div>';
    }).join("");
  } catch(e) { console.log("Grouped load error:", e); el.innerHTML = '<p style="color:#d33;">Error loading products.</p>'; }
}

function groupedAdd(id, name, price, image) {
  addToCart(id, name, price, image, 1);
  if (_currentProduct) loadGroupedProducts(_currentProduct);
}

function groupedQty(id, change) {
  var cart = getCart();
  var idx = -1;
  for (var i = 0; i < cart.length; i++) { if (cart[i].id === id) { idx = i; break; } }
  if (idx > -1) {
    cart[idx].qty += change;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart(cart);
    if (_currentProduct) loadGroupedProducts(_currentProduct);
  }
}
