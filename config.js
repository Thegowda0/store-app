const APP_CONFIG = {
  siteUrl: "https://hckimg.site",
  nativePages: {
    home: "home.html",
    shop: "shop.html",
    cart: "cart.html"
  },
  webviewRoutes: {
    checkout: "/checkout",
    account: "/my-account"
  },
  tabs: [
    { id: "home", label: "Home", icon: "🏠", page: "home" },
    { id: "shop", label: "Shop", icon: "🛍️", page: "shop" },
    { id: "cart", label: "Cart", icon: "🛒", page: "cart" }
  ]
};
