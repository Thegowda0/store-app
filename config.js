const APP_CONFIG = {
  siteUrl: "https://hckimg.site", 
  nativePages: {
    home: "home.html",
    shop: "shop.html",
    cart: "cart.html",
    product: "product.html",
    search: "search.html",
    "search-results": "search-results.html",
    wishlist: "wishlist.html"
  },
  webviewRoutes: {
    checkout: "/checkout",
    account: "/my-account"
  },
  tabs: [
    { id: "home", label: "Home", icon: '<i class="fa-solid fa-house"></i>', page: "home" },
    { id: "shop", label: "Shop", icon: '<i class="fa-solid fa-bag-shopping"></i>', page: "shop" },
    { id: "cart", label: "Cart", icon: '<i class="fa-solid fa-cart-shopping"></i>', page: "cart" }
  ]
};
