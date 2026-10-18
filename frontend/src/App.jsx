import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Copy,
  Download,
  Gift,
  Heart,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import AuthDialog from "./AuthDialog.jsx";
import StaffDashboard from "./StaffDashboard.jsx";
import { beverageGroups, beverageSubcategories, menuCategories } from "./menu-categories.js";
import { displayOrderNumber } from "./order-number.js";
import { downloadReceiptPdf } from "./receipt-pdf.js";

const categories = ["All", ...menuCategories];
const sectionOrder = menuCategories;
const openPositions = [
  {
    title: "Dishwasher",
    description: "Clean and organize dishes and kitchen equipment to keep the dishwashing area tidy, organized, and running efficiently throughout service.",
    schedule: "Full-time or part-time",
    experience: "No experience required",
  },
  {
    title: "Dining Room Manager",
    description: "Oversee dining room operations, lead the team, and ensure smooth, professional service.",
    schedule: "Full-time",
    experience: "At least 5 years in the restaurant industry, including 1 year in management",
  },
  {
    title: "Pizza Cook",
    description: "Prepare, top, and bake pizzas according to the restaurant's recipes and standards.",
    schedule: "Full-time or part-time",
    experience: "Pizza experience is an asset",
  },
  {
    title: "Delivery Driver",
    description: "Deliver orders quickly and courteously throughout the local area.",
    schedule: "Full-time or part-time",
    experience: "No experience required",
    requirements: "Valid driver's licence and good knowledge of the local area",
  },
  {
    title: "Host",
    description: "Welcome guests in person and over the phone, manage reservations, and handle takeout and delivery orders while keeping communication smooth with the team.",
    schedule: "Full-time or part-time",
    experience: "Comfort with customer service and computer systems",
  },
  {
    title: "Dining Room Support",
    description: "Clear and reset tables, keep the dining room clean, and restock service stations so service stays fast and smooth.",
    schedule: "Full-time or part-time",
    experience: "No experience required",
  },
  {
    title: "Bartender",
    description: "Prepare and serve cocktails, wine, and spirits quickly and accurately while offering attentive service and contributing to the atmosphere of the bar.",
    schedule: "Full-time or part-time",
    experience: "At least 2 years behind a bar or in table service",
  },
  {
    title: "Server",
    description: "Welcome and advise guests, take orders, and provide fast, attentive, professional service throughout the meal.",
    schedule: "Full-time or part-time",
    experience: "At least 2 years of table service experience",
  },
  {
    title: "Line Cook",
    description: "Prepare and assemble menu items consistently and efficiently.",
    schedule: "Full-time or part-time",
    experience: "At least 3 years of kitchen experience or a completed professional cooking qualification",
  },
  {
    title: "Greeter",
    description: "Welcome guests on arrival, escort them to their table, distribute menus, and help keep the entrance and dining room clean, organized, and welcoming.",
    schedule: "Full-time or part-time",
    experience: "No experience required",
  },
  {
    title: "Food Runner",
    description: "Connect the kitchen and dining room by promptly delivering dishes to the correct tables.",
    schedule: "Full-time or part-time",
    experience: "No experience required",
  },
];
const sectionTitles = {
  "Local food": "Local food",
  "Foreign food": "Foreign foods",
};
const ghanaCurrency = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  minimumFractionDigits: 2,
});

function money(amount) {
  return ghanaCurrency.format(amount).replace("GHS", "GH₵");
}

function handleMenuImageError(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = "/images/red-red.jpg";
}

function App() {
  const [isMenuPage, setIsMenuPage] = useState(() => window.location.pathname === "/menu");
  const [isApplicationPage, setIsApplicationPage] = useState(() => window.location.pathname === "/apply");
  const [isAboutPage, setIsAboutPage] = useState(() => window.location.pathname === "/about");
  const [menuItems, setMenuItems] = useState([]);
  const [menuError, setMenuError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [menuLoading, setMenuLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [homeMenuCategory, setHomeMenuCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingNotifications, setBookingNotifications] = useState(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderReceipt, setOrderReceipt] = useState(null);
  const [receiptCopyMessage, setReceiptCopyMessage] = useState("");
  const [showFullReceiptOrderNumber, setShowFullReceiptOrderNumber] = useState(false);
  const [paymentCallback, setPaymentCallback] = useState(() =>
    new URLSearchParams(window.location.search).get("payment") === "paystack",
  );
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [customerUser, setCustomerUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("verifyEmail") || params.has("resetPassword");
  });
  const [authMode, setAuthMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has("verifyEmail") ? "verify" : params.has("resetPassword") ? "reset" : "login";
  });
  const [customerReservations, setCustomerReservations] = useState([]);
  const [restaurantOptions, setRestaurantOptions] = useState({ deliveryAreas: [], deals: [], bundles: [], tables: [] });
  const [customerEngagement, setCustomerEngagement] = useState(null);
  const [customerFavorites, setCustomerFavorites] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [pendingFavorite, setPendingFavorite] = useState(null);
  const [checkoutOrderType, setCheckoutOrderType] = useState(() =>
    new URLSearchParams(window.location.search).has("table") ? "dine-in" : "pickup",
  );
  const [qrTableId, setQrTableId] = useState(() => {
    const table = Number(new URLSearchParams(window.location.search).get("table"));
    return Number.isSafeInteger(table) && table > 0 ? table : null;
  });
  const qrTableName = restaurantOptions.tables.find((table) => table.id === qrTableId)?.name || "";
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
  const [dealCode, setDealCode] = useState("");
  const [useRewards, setUseRewards] = useState(false);
  const [bookingSlot, setBookingSlot] = useState({ date: "", time: "", partySize: 2 });
  const [tableAvailability, setTableAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState("");
  const [trackingPhone, setTrackingPhone] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [iosInstallAvailable, setIosInstallAvailable] = useState(false);
  const [installHelp, setInstallHelp] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(() => {
    const position = new URLSearchParams(window.location.search).get("position");
    return openPositions.some((item) => item.title === position) ? position : "";
  });
  const [featuredSlideIndex, setFeaturedSlideIndex] = useState(0);
  const featuredSectionRef = useRef(null);
  const featuredTrackRef = useRef(null);

  useEffect(() => {
    const syncRoute = () => {
      setIsMenuPage(window.location.pathname === "/menu");
      setIsApplicationPage(window.location.pathname === "/apply");
      setIsAboutPage(window.location.pathname === "/about");
      const params = new URLSearchParams(window.location.search);
      const table = Number(params.get("table"));
      setQrTableId(Number.isSafeInteger(table) && table > 0 ? table : null);
      const position = params.get("position");
      setSelectedPosition(openPositions.some((item) => item.title === position) ? position : "");
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    setIosInstallAvailable(isIos && !isStandalone);
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/service-worker.js")
        .catch((error) => console.error("OrderPulse offline support could not be enabled.", error));
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeout = window.setTimeout(() => setCartNotice(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [cartNotice]);

  useEffect(() => {
    fetch("/api/menu")
      .then(async (response) => {
        if (!response.ok) throw new Error("We couldn't load the menu. Please refresh to try again.");
        return response.json();
      })
      .then(setMenuItems)
      .catch((error) => setMenuError(error.message))
      .finally(() => setMenuLoading(false));
    fetch("/api/restaurant-options")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn't load current offers and delivery areas.");
        setRestaurantOptions(result);
      })
      .catch((error) => setOptionsError(error.message));
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) return null;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn't load your account.");
        return result.user;
      })
      .then((user) => {
        if (user?.role === "customer") setCustomerUser(user);
      })
      .catch((error) => setMenuError(error.message));
  }, []);

  useEffect(() => {
    if (!customerUser) {
      setCustomerEngagement(null);
      setCustomerFavorites([]);
      setCustomerOrders([]);
      setUseRewards(false);
      return undefined;
    }
    const controller = new AbortController();
    Promise.all([
      fetch("/api/customer/engagement", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/customer/favorites", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/customer/orders", { credentials: "same-origin", signal: controller.signal }),
    ])
      .then(async ([engagementResponse, favoritesResponse, ordersResponse]) => {
        const results = await Promise.all([engagementResponse, favoritesResponse, ordersResponse].map((response) => response.json()));
        const failed = [engagementResponse, favoritesResponse, ordersResponse].find((response) => !response.ok);
        if (failed) throw new Error(results[[engagementResponse, favoritesResponse, ordersResponse].indexOf(failed)]?.error || "We couldn't load your OrderPulse account.");
        setCustomerEngagement(results[0]);
        setCustomerFavorites(results[1]);
        setCustomerOrders(results[2]);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setBookingMessage(error.message);
      });
    return () => controller.abort();
  }, [customerUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("payment") !== "paystack") return undefined;
    setPaymentCallback(true);
    setCheckoutOpen(true);
    setOrderMessage("Checking your payment with Paystack…");
    if (!reference) {
      setOrderMessage("We could not find the Paystack reference. Check your order status or contact the restaurant.");
      return undefined;
    }

    let active = true;
    fetch("/api/payments/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We could not verify your payment.");
        return result;
      })
      .then((result) => {
        if (!active) return;
        const receipt = {
          ...result.order,
          notifications: {
            email: {
              message: result.notification?.message || "Your receipt is ready.",
            },
          },
        };
        setOrderReceipt(receipt);
        setTrackingOrder(receipt);
        setOrderMessage("");
      })
      .catch((error) => {
        if (active) setOrderMessage(error.message);
      })
      .finally(() => {
        if (active) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("payment");
          cleanUrl.searchParams.delete("reference");
          cleanUrl.searchParams.delete("trxref");
          window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!customerUser || !bookingSlot.date || !bookingSlot.time) {
      setTableAvailability(null);
      setAvailabilityError("");
      setAvailabilityLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      date: bookingSlot.date,
      time: bookingSlot.time,
      partySize: String(bookingSlot.partySize),
    });
    setTableAvailability(null);
    setAvailabilityError("");
    setAvailabilityLoading(true);
    fetch(`/api/reservation-availability?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn't check table availability.");
        return result;
      })
      .then(setTableAvailability)
      .catch((error) => {
        if (error.name !== "AbortError") setAvailabilityError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      });
    return () => controller.abort();
  }, [bookingSlot, customerUser]);

  useEffect(() => {
    if (!trackingOrder || ["completed", "cancelled"].includes(trackingOrder.status)) return undefined;
    let active = true;
    const refreshStatus = async () => {
      try {
        const response = await fetch("/api/order-tracking", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderNumber: trackingOrder.orderNumber, phone: trackingOrder.phone }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn't refresh this order.");
        if (active) {
          setTrackingOrder({ ...result, phone: trackingOrder.phone });
          setTrackingError("");
        }
      } catch (error) {
        if (active) setTrackingError(error.message);
      }
    };
    const interval = window.setInterval(refreshStatus, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [trackingOrder?.orderNumber, trackingOrder?.phone, trackingOrder?.status]);

  const menuSections = useMemo(() => {
    const selectedSections = category === "All" ? sectionOrder : [category];
    return selectedSections.map((section) => {
      const sectionItems = menuItems.filter((item) => item.category === section);
      const availableGroups = [...new Set(sectionItems.map((item) => `${item.beverageGroup || ""}\u0000${item.subcategory || ""}`))];
      const orderedGroups = availableGroups.sort((first, second) => {
        const [firstBeverage, firstSubcategory] = first.split("\u0000");
        const [secondBeverage, secondSubcategory] = second.split("\u0000");
        const firstBeverageIndex = beverageGroups.indexOf(firstBeverage);
        const secondBeverageIndex = beverageGroups.indexOf(secondBeverage);
        const firstSubcategoryIndex = beverageSubcategories.indexOf(firstSubcategory);
        const secondSubcategoryIndex = beverageSubcategories.indexOf(secondSubcategory);
        return (
          (firstBeverageIndex < 0 ? beverageGroups.length : firstBeverageIndex) -
            (secondBeverageIndex < 0 ? beverageGroups.length : secondBeverageIndex) ||
          (firstSubcategoryIndex < 0 ? beverageSubcategories.length : firstSubcategoryIndex) -
            (secondSubcategoryIndex < 0 ? beverageSubcategories.length : secondSubcategoryIndex) ||
          first.localeCompare(second)
        );
      });
      return {
        category: section,
        title: sectionTitles[section] || section,
        groups: orderedGroups.map((groupKey) => {
          const [beverageGroup, subcategory] = groupKey.split("\u0000");
          return {
            title: section === "Drinks" ? `${beverageGroup} · ${subcategory}` : subcategory,
            items: sectionItems.filter((item) => `${item.beverageGroup || ""}\u0000${item.subcategory || ""}` === groupKey),
          };
        }),
      };
    });
  }, [category, menuItems]);
  const featuredItems = useMemo(
    () => {
      const availableItems = menuItems
        .filter((item) => item.available !== false)
        .sort((first, second) =>
          Number(Boolean(second.badge)) - Number(Boolean(first.badge)) ||
          (second.popularity || 0) - (first.popularity || 0),
        );
      const featured = [];
      const internationalItems = availableItems.filter((item) =>
        item.category === "Foreign food" ||
        (item.category === "Main Courses or Entrées" &&
          /international|western|spanish|mediterranean|italian|mexican|american|global/i.test(`${item.subcategory || ""} ${item.name}`)),
      );
      const addFirstAvailable = (items) => {
        const item = items.find((candidate) => !featured.some((chosen) => chosen.id === candidate.id));
        if (item) featured.push(item);
      };

      addFirstAvailable(availableItems.filter((item) => item.category === "Local food"));
      addFirstAvailable(internationalItems);
      addFirstAvailable(availableItems.filter((item) => item.category === "Drinks" && item.beverageGroup === "Non-Alcoholic Beverages"));
      addFirstAvailable(availableItems.filter((item) => item.category === "Drinks" && item.beverageGroup === "Alcoholic Beverages"));
      addFirstAvailable(availableItems.filter((item) => item.category === "Local food"));
      addFirstAvailable(internationalItems);
      while (featured.length < 6) {
        const previousLength = featured.length;
        addFirstAvailable(availableItems);
        if (featured.length === previousLength) break;
      }
      return featured;
    },
    [menuItems],
  );
  const homeMenuCategories = useMemo(
    () => ["All", ...menuCategories.filter((menuCategory) =>
      menuItems.some((item) => item.available !== false && item.category === menuCategory),
    )],
    [menuItems],
  );
  const homeMenuItems = useMemo(() => {
    const availableItems = menuItems.filter((item) => item.available !== false);
    const categoryItems = homeMenuCategory === "All"
      ? availableItems
      : availableItems.filter((item) => item.category === homeMenuCategory);
    const featuredIds = new Set(featuredItems.map((item) => item.id));
    const additionalItems = categoryItems.filter((item) => !featuredIds.has(item.id));
    return (additionalItems.length ? additionalItems : categoryItems)
      .slice()
      .sort((first, second) =>
        (second.popularity || 0) - (first.popularity || 0) ||
        Number(Boolean(second.badge)) - Number(Boolean(first.badge)),
      )
      .slice(0, 4);
  }, [featuredItems, homeMenuCategory, menuItems]);
  const visibleCount = menuSections.reduce(
    (count, section) => count + section.groups.reduce((groupCount, group) => groupCount + group.items.length, 0),
    0,
  );
  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const matchingDeal = restaurantOptions.deals.find((deal) => deal.code.toLowerCase() === dealCode.trim().toLowerCase());
  const dealDiscount = matchingDeal ? Math.min(subtotal, matchingDeal.discount) : 0;
  const rewardsDiscount = useRewards && (customerEngagement?.points || 0) >= 100
    ? Math.min(5, Math.max(0, subtotal - dealDiscount))
    : 0;
  const deliveryFee = checkoutOrderType === "delivery"
    ? restaurantOptions.deliveryAreas.find((area) => area.id === Number(deliveryAreaId))?.fee || 0
    : 0;
  const checkoutTotal = Math.max(0, subtotal + deliveryFee - dealDiscount - rewardsDiscount);

  useEffect(() => {
    if (subtotal - dealDiscount < 5) setUseRewards(false);
  }, [dealDiscount, subtotal]);

  useEffect(() => {
    if (qrTableId) setCheckoutOrderType("dine-in");
  }, [qrTableId]);

  function navigate(event, href) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = new URL(href, window.location.href);
    if (qrTableId && !target.searchParams.has("table")) target.searchParams.set("table", String(qrTableId));
    window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    const table = Number(target.searchParams.get("table"));
    setQrTableId(Number.isSafeInteger(table) && table > 0 ? table : null);
    setIsMenuPage(target.pathname === "/menu");
    setIsApplicationPage(target.pathname === "/apply");
    setIsAboutPage(target.pathname === "/about");
    if (target.pathname === "/apply") {
      const position = target.searchParams.get("position");
      setSelectedPosition(openPositions.some((item) => item.title === position) ? position : "");
    }
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      if (target.hash) document.querySelector(target.hash)?.scrollIntoView({ behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const sectionHref = (id) => isMenuPage || isApplicationPage || isAboutPage ? `/#${id}` : `#${id}`;
  const menuPageContent = (
    <section className="menu-page-content mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
      <div className="menu-page-heading">
        <a href="/" onClick={(event) => navigate(event, "/")} className="menu-back-link"><ArrowRight size={15} /> Back to home</a>
        <span>FROM OUR KITCHEN · AHODWO, KUMASI</span>
        <h1>Our menu<span>.</span></h1>
        <p>Ghanaian favourites and global classics, prepared fresh and served with care.</p>
        {qrTableId && <p className="mt-4 rounded-2xl bg-[#e9eee4] p-4 text-sm font-semibold text-leaf">Ordering for {qrTableName || `Table ${qrTableId}`} · Add dishes to your bag and choose checkout when you're ready.</p>}
        {optionsError && <p role="alert" className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-950">{optionsError}</p>}
      </div>
      <div className="menu-filter-list mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Filter menu by category">
        {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`menu-filter-button whitespace-nowrap rounded-full font-semibold ${category === item ? "is-active" : ""}`}>{item === "Foreign food" ? "Foreign foods" : item}</button>)}
      </div>
      {restaurantOptions.bundles.length > 0 && <section className="mb-10" aria-labelledby="menu-bundles-heading">
        <h2 id="menu-bundles-heading" className="mb-4 font-display text-2xl font-semibold">Meal bundles<span>.</span></h2>
        <div className="grid gap-4 md:grid-cols-2">{restaurantOptions.bundles.map((bundle) => <article key={`menu-bundle-${bundle.id}`} className="flex items-center justify-between gap-4 rounded-3xl bg-[#e9eee4] p-5">
          <div><h3 className="font-display text-lg font-semibold">{bundle.title} · {money(bundle.price)}</h3><p className="mt-1 text-sm text-forest/60">{bundle.description}</p><p className="mt-2 text-xs text-forest/55">{bundle.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p></div>
          <button type="button" className="shrink-0 rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white" onClick={() => addMealBundle(bundle)}>Add to bag</button>
        </article>)}</div>
      </section>}
      {menuError ? <p role="alert" className="rounded-2xl bg-sky-50 p-5 text-sm text-sky-950">{menuError}</p> : menuLoading ? <div className="menu-loading-grid" aria-label="Loading menu" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className="menu-skeleton-card" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : visibleCount === 0 ? <p className="menu-empty-state"><span aria-hidden="true">✳</span><strong>No dishes in this category yet</strong><span>Try another category, or check back soon for something fresh.</span></p> : (
        <div className="space-y-12">
          {menuSections.filter((section) => section.groups.length > 0).map((section) => <section key={section.category} aria-label={section.title}>
            <div className="mb-6 flex items-center gap-3 border-b border-forest/10 pb-3"><span className="h-2 w-2 rounded-full bg-leaf" /><h2 className="font-display text-2xl font-semibold sm:text-3xl">{section.title}</h2><span className="text-xs text-forest/45">{section.groups.reduce((count, group) => count + group.items.length, 0)} dishes</span></div>
            <div className="space-y-8">{section.groups.map((group) => <div key={`${section.category}-${group.title}`}><div className="mb-4 flex items-center gap-2"><h3 className="text-sm font-semibold text-forest/75">{group.title}</h3><span className="text-[10px] text-forest/40">{group.items.length} items</span></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => <article key={item.id} className="group min-w-0 overflow-hidden rounded-[1.4rem] bg-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/5">
                <div className="relative h-48 overflow-hidden sm:h-52"><img src={item.imageUrl} alt={item.name} onError={handleMenuImageError} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />{(item.badge || item.popularity > 0) && <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-leaf backdrop-blur">{item.badge || "Popular"}</span>}<button type="button" onClick={() => toggleFavorite(item)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-rose-700 shadow" aria-label={`${customerFavorites.some((favorite) => favorite.id === item.id) ? "Remove" : "Save"} ${item.name} ${customerFavorites.some((favorite) => favorite.id === item.id) ? "from" : "to"} favorites`} aria-pressed={customerFavorites.some((favorite) => favorite.id === item.id)}><Heart size={18} fill={customerFavorites.some((favorite) => favorite.id === item.id) ? "currentColor" : "none"} /></button><button type="button" onClick={() => updateQuantity(item, 1)} className="menu-add-button absolute bottom-3 right-3 grid place-items-center rounded-full bg-lime text-forest shadow" aria-label={`Add ${item.name} to bag`}><Plus size={17} /></button></div>
                <div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><h4 className="font-display text-lg font-semibold leading-snug sm:text-xl">{item.name}</h4><span className="shrink-0 whitespace-nowrap text-sm font-bold">{money(item.price)}</span></div><p className="mt-2.5 min-h-[42px] text-xs leading-5 text-forest/55">{item.description}</p></div>
              </article>)}
            </div></div>)}</div>
          </section>)}
        </div>
      )}
    </section>
  );
  const aboutPageContent = (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <a href="/" onClick={(event) => navigate(event, "/")} className="about-back-link"><ArrowRight size={15} /> OrderPulse · Ahodwo, Kumasi</a>
          <span className="about-eyebrow">GOOD FOOD. GOOD PEOPLE. GHANAIAN HEART.</span>
          <h1>A taste of Ghana,<br />made to bring us <em>together.</em></h1>
          <p>From local favourites to familiar classics, OrderPulse is a warm place to share a meal, find your next favourite, and feel at home.</p>
          <div className="about-hero-actions">
            <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="about-primary-link">Explore our menu <ArrowRight size={16} /></a>
            <a href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))} className="about-secondary-link">Find your table</a>
          </div>
          <span className="about-hero-location"><MapPin size={15} /> Made with care in Ahodwo, Kumasi</span>
        </div>
        <div className="about-hero-image">
          <img src="/images/orderpulse-careers-chef.jpg" alt="Black chef preparing a dish in the kitchen" />
          <span className="about-image-caption">A little more joy around the table.</span>
        </div>
        <span className="about-hero-decoration" aria-hidden="true">OP</span>
      </section>

      <section className="about-mission">
        <div className="about-mission-copy">
          <span className="about-section-eyebrow">OUR MISSION</span>
          <h2>A diverse menu and a warm atmosphere—with one goal at heart: to give you a great time.</h2>
          <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="about-underlined-link">Get to know the menu <ArrowRight size={15} /></a>
        </div>
        <div className="about-mission-collage" aria-label="OrderPulse menu and restaurant highlights">
          <div className="about-mission-photo about-mission-photo-meal">
            <img src="/images/orderpulse-table-background.jpg" alt="A spread of freshly prepared dishes" loading="lazy" />
          </div>
          <div className="about-mission-photo about-mission-photo-team">
            <img src="/images/orderpulse-careers-chef.jpg" alt="Black chef preparing food for guests" loading="lazy" />
          </div>
          {[
            ["11", "Menu categories", "about-stat-categories"],
            ["2", "Order options", "about-stat-orders"],
            ["11", "Open positions", "about-stat-positions"],
            ["GH₵ / $", "Prices in cedis & USD", "about-stat-currency"],
          ].map(([value, label, className]) => (
            <div className={`about-stat-circle ${className}`} key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
          <span className="about-mission-note">Ghanaian at heart.<br />Made to share.</span>
        </div>
      </section>

      <section className="about-values">
        <div className="about-values-heading">
          <span className="about-section-eyebrow">WHAT MATTERS TO US</span>
          <h2>We honour our values<br />every step of the way.</h2>
          <p>The little things add up to a meal worth remembering.</p>
        </div>
        <div className="about-values-grid">
          {[
            ["01", "Quality", "We choose fresh ingredients and prepare each dish with care, so every plate feels just right."],
            ["02", "Community", "Rooted in Ahodwo, Kumasi, we make room for neighbours, families, friends, and new faces."],
            ["03", "Authenticity", "We celebrate Ghana’s rich food traditions while making space for flavours from around the world."],
            ["04", "Hospitality", "Every guest matters. We work as one team to make you feel welcome from the first hello."],
          ].map(([number, title, description]) => (
            <article className="about-value-card" key={title}>
              <span className="about-value-number">{number}</span>
              <span className="about-value-icon" aria-hidden="true"><Leaf size={18} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-experience">
        <div className="about-experience-photo"><img src="/images/red-red.jpg" alt="Ghanaian red red with ripe fried plantain" loading="lazy" /></div>
        <div className="about-experience-copy">
          <span className="about-section-eyebrow">COME AS YOU ARE</span>
          <h2>One table.<br /><em>So many ways to enjoy it.</em></h2>
          <p>Stay in and settle in, pick up a meal to share, or order your favourites for home. However you join us, there is something delicious waiting.</p>
          <div className="about-experience-links">
            <a href="/menu" onClick={(event) => navigate(event, "/menu")}><span>01</span><strong>Discover the menu</strong><ArrowRight size={17} /></a>
            <a href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))}><span>02</span><strong>Gather around our table</strong><ArrowRight size={17} /></a>
            <a href={sectionHref("careers")} onClick={(event) => navigate(event, sectionHref("careers"))}><span>03</span><strong>Meet the people behind it</strong><ArrowRight size={17} /></a>
          </div>
        </div>
      </section>

      <section className="about-join">
        <div>
          <span className="about-section-eyebrow">YOUR PLACE AT OUR TABLE</span>
          <h2>Come hungry.<br /><em>Leave a little happier.</em></h2>
          <p>We would love to welcome you. Choose something new, order an old favourite, and make yourself at home.</p>
        </div>
        <a href="/menu" onClick={(event) => navigate(event, "/menu")}>Find your next favourite <ArrowRight size={17} /></a>
      </section>
    </div>
  );

  useEffect(() => {
    const section = featuredSectionRef.current;
    const track = featuredTrackRef.current;
    if (!section || !track) return undefined;

    const desktopCarousel = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const colorStops = [
      ["#17384e", "#1b5065", "#102b40"],
      ["#244d50", "#3b7666", "#183c45"],
      ["#59442f", "#8a6039", "#3b3028"],
      ["#4b3c5c", "#76557a", "#332c49"],
      ["#17384e", "#1b5065", "#102b40"],
    ];
    let horizontalDistance = 0;
    let frame = 0;

    const interpolateColor = (first, second, progress) => {
      const from = first.match(/[A-Fa-f0-9]{2}/g).map((part) => Number.parseInt(part, 16));
      const to = second.match(/[A-Fa-f0-9]{2}/g).map((part) => Number.parseInt(part, 16));
      return `#${from.map((channel, index) =>
        Math.round(channel + (to[index] - channel) * progress).toString(16).padStart(2, "0"),
      ).join("")}`;
    };

    const updateSectionColors = (progress) => {
      const scaledProgress = progress * (colorStops.length - 1);
      const colorIndex = Math.min(Math.floor(scaledProgress), colorStops.length - 2);
      const blend = scaledProgress >= colorStops.length - 1 ? 1 : scaledProgress - colorIndex;
      colorStops[0].forEach((_, index) => {
        section.style.setProperty(
          `--featured-color-${index}`,
          interpolateColor(colorStops[colorIndex][index], colorStops[colorIndex + 1][index], blend),
        );
      });
    };

    const updatePosition = () => {
      frame = 0;
      if (!desktopCarousel.matches) return;
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const progress = reducedMotion.matches
        ? Math.min(Math.max(track.scrollLeft, 0), horizontalDistance)
        : Math.min(Math.max(window.scrollY - sectionTop, 0), horizontalDistance);
      const normalizedProgress = horizontalDistance ? progress / horizontalDistance : 0;
      if (reducedMotion.matches) {
        track.style.transform = "";
      } else {
        track.style.transform = `translate3d(${-progress}px, 0, 0)`;
      }
      updateSectionColors(normalizedProgress);
      const plateRotation = reducedMotion.matches || !horizontalDistance
        ? 0
        : normalizedProgress * 720;
      track.querySelectorAll(".featured-menu-plate").forEach((plate, index) => {
        plate.style.setProperty("--plate-rotation", `${plateRotation + index * 12}deg`);
      });
    };

    const schedulePositionUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    };

    const measureTrack = () => {
      if (!desktopCarousel.matches) {
        horizontalDistance = 0;
        section.style.height = "";
        track.style.transform = "";
        section.style.removeProperty("--featured-color-0");
        section.style.removeProperty("--featured-color-1");
        section.style.removeProperty("--featured-color-2");
        track.querySelectorAll(".featured-menu-plate").forEach((plate) => {
          plate.style.removeProperty("--plate-rotation");
        });
        return;
      }
      horizontalDistance = Math.max(0, track.scrollWidth - section.clientWidth);
      if (reducedMotion.matches) {
        section.style.height = "";
        track.style.transform = "";
      } else {
        const pin = section.querySelector(".featured-scroll-pin");
        section.style.height = `${(pin?.getBoundingClientRect().height || window.innerHeight) + horizontalDistance}px`;
      }
      schedulePositionUpdate();
    };

    const resizeObserver = new ResizeObserver(measureTrack);
    resizeObserver.observe(track);
    track.addEventListener("scroll", schedulePositionUpdate, { passive: true });
    window.addEventListener("scroll", schedulePositionUpdate, { passive: true });
    window.addEventListener("resize", measureTrack);
    desktopCarousel.addEventListener("change", measureTrack);
    reducedMotion.addEventListener("change", measureTrack);
    measureTrack();

    return () => {
      resizeObserver.disconnect();
      track.removeEventListener("scroll", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate);
      window.removeEventListener("resize", measureTrack);
      desktopCarousel.removeEventListener("change", measureTrack);
      reducedMotion.removeEventListener("change", measureTrack);
      if (frame) window.cancelAnimationFrame(frame);
      section.style.height = "";
      track.style.transform = "";
      ["--featured-color-0", "--featured-color-1", "--featured-color-2"].forEach((property) => {
        section.style.removeProperty(property);
      });
      track.querySelectorAll(".featured-menu-plate").forEach((plate) => {
        plate.style.removeProperty("--plate-rotation");
      });
    };
  }, [featuredItems.length]);

  function updateQuantity(menuItem, amount) {
    if (amount > 0) setCartNotice(`${menuItem.name} added to your bag`);
    setCart((current) => {
      const existing = current.find((item) => item.id === menuItem.id);
      if (!existing && amount > 0) return [...current, { ...menuItem, quantity: 1 }];
      return current
        .map((item) => item.id === menuItem.id
          ? { ...item, quantity: Math.min(20, Math.max(0, item.quantity + amount)) }
          : item)
        .filter((item) => item.quantity > 0);
    });
  }

  function addMealBundle(bundle) {
    const id = `bundle-${bundle.id}`;
    setCart((current) => {
      const existing = current.find((item) => item.id === id);
      if (existing) {
        return current.map((item) => item.id === id
          ? { ...item, quantity: Math.min(20, item.quantity + 1) }
          : item);
      }
      return [...current, {
        id,
        bundleId: bundle.id,
        isMealBundle: true,
        name: bundle.title,
        description: bundle.description,
        contents: bundle.items.map((item) => `${item.quantity} × ${item.name}`).join(", "),
        price: bundle.price,
        quantity: 1,
        imageUrl: "/images/orderpulse-takeaway-box.png",
      }];
    });
    setCartNotice(`${bundle.title} added to your bag`);
  }

  async function toggleFavorite(menuItem) {
    if (!customerUser) {
      setPendingFavorite(menuItem);
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    await saveFavorite(menuItem);
  }

  async function saveFavorite(menuItem) {
    const isFavorite = customerFavorites.some((item) => item.id === menuItem.id);
    try {
      const response = await fetch(`/api/customer/favorites/${menuItem.id}`, {
        method: isFavorite ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "We couldn't update your saved dishes.");
      }
      setCustomerFavorites((current) => isFavorite
        ? current.filter((item) => item.id !== menuItem.id)
        : current.some((item) => item.id === menuItem.id)
          ? current
          : [{ ...menuItem, favoritedAt: new Date().toISOString() }, ...current]);
    } catch (error) {
      setBookingMessage(error.message);
    }
  }

  function reorder(items) {
    const previousBundles = items
      .filter((ordered) => ordered.bundleId)
      .map((ordered) => restaurantOptions.bundles.find((bundle) => bundle.id === ordered.bundleId))
      .filter(Boolean);
    const available = items
      .filter((ordered) => ordered.menuItemId)
      .map((ordered) => ({
        item: menuItems.find((menuItem) => menuItem.id === ordered.menuItemId && menuItem.available !== false),
        quantity: ordered.quantity,
      }))
      .filter(({ item }) => item);
    if (available.length === 0 && previousBundles.length === 0) {
      setBookingMessage("None of the dishes from that order are currently available.");
      return;
    }
    setCart((current) => {
      const next = [...current];
      for (const { item, quantity } of available) {
        const existing = next.find((cartItem) => cartItem.id === item.id);
        if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
        else next.push({ ...item, quantity: Math.min(20, quantity) });
      }
      return next;
    });
    for (const bundle of previousBundles) {
      for (let quantity = 0; quantity < items.find((ordered) => ordered.bundleId === bundle.id).quantity; quantity += 1) {
        addMealBundle(bundle);
      }
    }
    setCartNotice("Your previous dishes are back in your bag");
    setCartOpen(true);
  }

  function acceptCustomerSignIn(user) {
    setCustomerUser(user);
    setAuthOpen(false);
    setCustomerReservations([]);
    if (pendingFavorite) {
      const menuItem = pendingFavorite;
      setPendingFavorite(null);
      saveFavorite(menuItem);
    }
    fetch("/api/customer/reservations", { credentials: "same-origin" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "We couldn't load your reservations.");
        setCustomerReservations(result);
      })
      .catch((error) => setBookingMessage(error.message));
  }

  async function signOutCustomer() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
      setCustomerUser(null);
      setCustomerReservations([]);
      setCustomerEngagement(null);
      setCustomerFavorites([]);
      setCustomerOrders([]);
    } catch (error) {
      setBookingMessage(error.message);
    }
  }

  function clearAuthTokenFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("verifyEmail");
    url.searchParams.delete("resetPassword");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function closeAuthDialog() {
    clearAuthTokenFromUrl();
    setAuthOpen(false);
    setPendingFavorite(null);
  }

  async function submitBooking(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setBookingMessage("");
    setBookingNotifications(null);
    const form = new FormData(formElement);
    const payload = {
      date: form.get("date"),
      time: form.get("time"),
      partySize: Number(form.get("partySize")),
      notes: form.get("notes"),
    };
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't save your reservation.");
      setBookingMessage(result.message);
      setBookingNotifications(result.notifications);
      setCustomerReservations((current) => [{
        id: result.bookingId,
        date: payload.date,
        time: payload.time,
        partySize: payload.partySize,
        notes: payload.notes,
        status: "requested",
        tableName: null,
      }, ...current]);
      formElement.reset();
      setBookingSlot({ date: "", time: "", partySize: 2 });
    } catch (error) {
      setBookingMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setOrderMessage("");
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: form.get("customerName"),
          customerEmail: form.get("customerEmail"),
          phone: form.get("phone"),
          orderType: checkoutOrderType,
          deliveryAddress: form.get("deliveryAddress"),
          deliveryAreaId: form.get("deliveryAreaId") ? Number(form.get("deliveryAreaId")) : null,
          dealCode: form.get("dealCode"),
          bundles: cart.filter((item) => item.isMealBundle).map((item) => ({
            id: item.bundleId,
            quantity: item.quantity,
          })),
          useRewards,
          tableId: qrTableId,
          items: cart.filter((item) => !item.isMealBundle).map(({ id, quantity }) => ({ id, quantity })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't place your order.");
      if (typeof result.paymentUrl !== "string") {
        throw new Error("The order was saved, but secure payment checkout was not returned. Contact the restaurant with your order number.");
      }
      setUseRewards(false);
      window.location.assign(result.paymentUrl);
    } catch (error) {
      setOrderMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function findOrder(event) {
    event.preventDefault();
    setTrackingBusy(true);
    setTrackingError("");
    try {
      const response = await fetch("/api/order-tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: trackingOrderNumber.trim(), phone: trackingPhone.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't find that order.");
      setTrackingOrder({ ...result, phone: trackingPhone.trim() });
      setFeedbackRating(result.feedback?.rating || 0);
      setFeedbackComment(result.feedback?.comment || "");
      setFeedbackMessage("");
    } catch (error) {
      setTrackingError(error.message);
      setTrackingOrder(null);
    } finally {
      setTrackingBusy(false);
    }
  }

  async function submitOrderFeedback(event) {
    event.preventDefault();
    if (!trackingOrder || !feedbackRating) return;
    setFeedbackBusy(true);
    setTrackingError("");
    try {
      const response = await fetch("/api/order-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: trackingOrder.orderNumber,
          phone: trackingOrder.phone,
          rating: feedbackRating,
          comment: feedbackComment,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't save your feedback.");
      setTrackingOrder((current) => current
        ? { ...current, feedback: result.feedback, feedbackEligible: false }
        : current);
      setFeedbackMessage("Thanks for sharing your feedback with our team.");
    } catch (error) {
      setTrackingError(error.message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function submitJobApplication(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const resume = form.get("resume");
    setApplicationBusy(true);
    setApplicationMessage("");
    setApplicationError("");
    try {
      if (!(resume instanceof File) || resume.size === 0) {
        throw new Error("Choose a PDF, DOC, or DOCX CV to attach.");
      }
      if (resume.size > 5 * 1024 * 1024) {
        throw new Error("Your CV must be no larger than 5 MB.");
      }
      const acceptedTypes = {
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      };
      const extension = `.${resume.name.split(".").pop()?.toLowerCase()}`;
      const expectedExtension = acceptedTypes[resume.type];
      if (!expectedExtension || expectedExtension !== extension) {
        throw new Error("Attach your CV as a PDF, DOC, or DOCX file.");
      }
      const resumeBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(new Error("We couldn't read your CV. Please choose the file again."));
        reader.readAsDataURL(resume);
      });
      const response = await fetch("/api/careers/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          desiredPosition: form.get("desiredPosition"),
          message: form.get("message"),
          resumeName: resume.name,
          resumeType: resume.type,
          resumeBase64,
          consent: form.get("consent") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't submit your application. Please try again.");
      setApplicationMessage(
        `Application ${result.applicationNumber} received. Applicant email: ${result.notifications.applicantEmail.message} Employer email: ${result.notifications.employerEmail.message}`,
      );
      formElement.reset();
    } catch (error) {
      setApplicationError(error.message);
    } finally {
      setApplicationBusy(false);
    }
  }

  function startJobApplication(position) {
    setSelectedPosition(position);
    window.history.pushState({}, "", `/apply?position=${encodeURIComponent(position)}`);
    setIsMenuPage(false);
    setIsApplicationPage(true);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function installApp() {
    setInstallHelp("");
    if (!installPrompt) {
      setInstallHelp("In Safari, tap Share, then choose Add to Home Screen.");
      return;
    }
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === "accepted") setInstallPrompt(null);
    } catch (error) {
      setMenuError(`The install prompt could not be opened: ${error.message}`);
    }
  }

  async function copyFullReceiptOrderNumber() {
    if (!orderReceipt) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(orderReceipt.orderNumber);
      setReceiptCopyMessage("Full order number copied.");
      setShowFullReceiptOrderNumber(false);
    } catch {
      setShowFullReceiptOrderNumber(true);
      setReceiptCopyMessage("Copy the full order number shown below.");
    }
  }

  function closeCheckout() {
    setCheckoutOpen(false);
    setOrderMessage("");
    setOrderReceipt(null);
    setReceiptCopyMessage("");
    setShowFullReceiptOrderNumber(false);
    setPaymentCallback(false);
  }

  const applicationPageContent = (
    <div className="career-apply-page mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
      <a href="/#careers" onClick={(event) => navigate(event, "/#careers")} className="menu-back-link">
        <ArrowRight size={15} /> Back to open positions
      </a>
      <section className="career-application" aria-labelledby="career-application-heading">
        <div className="career-application-heading">
          <span className="careers-eyebrow">WE'RE HIRING · ORDERPULSE RESTAURANT</span>
          <h1 id="career-application-heading">Apply<span>.</span></h1>
          <p>{selectedPosition ? `Apply for the ${selectedPosition} position. ` : ""}Tell us a little about yourself and attach your CV. Our team will review your application.</p>
        </div>
        <form className="career-application-form" onSubmit={submitJobApplication}>
          <h2>Contact information</h2>
          <div className="career-form-grid">
            <label className="field-label">First name<input required name="firstName" autoComplete="given-name" maxLength="80" /></label>
            <label className="field-label">Last name<input required name="lastName" autoComplete="family-name" maxLength="80" /></label>
            <label className="field-label">Email<input required name="email" type="email" autoComplete="email" maxLength="254" /></label>
            <label className="field-label">Phone<input required name="phone" type="tel" autoComplete="tel" minLength="7" maxLength="30" /></label>
          </div>
          <h2>Application</h2>
          <div className="career-form-grid">
            <label className="field-label career-form-wide">Desired position<select required name="desiredPosition" value={selectedPosition} onChange={(event) => setSelectedPosition(event.target.value)}><option value="" disabled>Select a position</option>{openPositions.map((position) => <option key={position.title} value={position.title}>{position.title}</option>)}</select></label>
            <label className="field-label career-form-wide">Message<textarea name="message" rows="5" maxLength="2000" placeholder="Share a little about yourself and your experience." /></label>
            <label className="field-label career-form-wide">Curriculum vitae (PDF, DOC, or DOCX; up to 5 MB)<input required name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
          </div>
          <label className="career-consent"><input required name="consent" type="checkbox" /><span>By checking this box, I agree to the <a href="https://delice.ca/privacy-policy/" target="_blank" rel="noreferrer">Privacy Policy</a> and the <a href="https://delice.ca/terms-and-conditions/" target="_blank" rel="noreferrer">Terms and Conditions</a>.</span></label>
          <p className="career-application-privacy">Your application and CV are stored for recruitment review and are visible only to OrderPulse managers.</p>
          {applicationError && <p className="career-form-error" role="alert">{applicationError}</p>}
          {applicationMessage && <p className="career-form-success" role="status">{applicationMessage}</p>}
          <button className="career-apply-button" disabled={applicationBusy}>{applicationBusy ? "Submitting application…" : "Submit application"}<ArrowRight size={16} /></button>
        </form>
      </section>
    </div>
  );

  if (staffMode) return <StaffDashboard onExit={() => setStaffMode(false)} isOnline={isOnline} />;

  return (
    <div className="orderpulse-app-background min-h-screen text-forest">
      {!isOnline && <div className="app-connectivity-banner" role="status">You’re offline. Previously loaded pages may still be available; ordering and payments need an internet connection.</div>}
      <div className="landing-topline">
        FRESH FROM OUR KITCHEN <span>✳</span> AHODWO, KUMASI
      </div>

      <header className="landing-header relative z-20 flex items-center justify-between px-5 py-4 md:px-10">
        <a href="/" onClick={(event) => navigate(event, "/")} className="landing-brand flex items-center gap-2.5" aria-label="OrderPulse home">
          <span className="landing-mark grid h-10 w-10 place-items-center rounded-full"><Leaf size={21} /></span>
          <span className="font-display text-xl font-bold leading-none">OrderPulse<span className="landing-brand-tag mt-1 block font-sans text-[9px] font-semibold uppercase tracking-[.24em]">Eat well, live well</span></span>
        </a>
        <nav className="landing-nav hidden items-center gap-9 text-sm font-medium md:flex">
          <a className="transition hover:text-leaf" href="/menu" onClick={(event) => navigate(event, "/menu")}>Our menu</a>
          <a className="transition hover:text-leaf" href={sectionHref("track-order")} onClick={(event) => navigate(event, sectionHref("track-order"))}>Track order</a>
          <a className="transition hover:text-leaf" href="/about" onClick={(event) => navigate(event, "/about")}>Our story</a>
          <a className="transition hover:text-leaf" href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))}>Find a table</a>
        </nav>
        <div className="relative flex items-center gap-2">
          {(installPrompt || iosInstallAvailable) && <button className="desktop-install-button landing-action inline-flex min-h-10 items-center gap-2 rounded-full border border-forest/10 px-3 text-xs font-semibold text-forest/70 hover:border-leaf hover:text-leaf" onClick={installApp}><Download size={15} /><span className="hidden sm:inline">{iosInstallAvailable && !installPrompt ? "Add to Home Screen" : "Install app"}</span></button>}
          {installHelp && <div className="desktop-install-help install-help-popover" role="status">{installHelp}<button type="button" onClick={() => setInstallHelp("")} aria-label="Dismiss install instructions"><X size={14} /></button></div>}
          <button aria-label="Staff workspace" className="landing-action inline-flex min-h-10 items-center gap-2 rounded-full px-2 py-2.5 text-sm font-semibold text-forest/65 transition hover:bg-forest/5 hover:text-leaf sm:px-4" onClick={() => setStaffMode(true)}><ChefHat size={16} /><span className="hidden sm:inline">Staff</span></button>
          {customerUser ? <div className="landing-account-actions flex items-center gap-1"><span className="hidden max-w-28 truncate text-xs font-semibold text-leaf sm:inline">{customerUser.name.split(" ")[0]}</span><button aria-label="Sign out of your guest account" className="landing-action inline-flex min-h-10 items-center gap-2 rounded-full border border-forest/10 px-2.5 text-xs font-semibold text-forest/65 hover:border-leaf hover:text-leaf sm:px-3" onClick={signOutCustomer}><CircleUserRound size={16} /><span className="hidden md:inline">Sign out</span></button></div> : <button aria-label="Sign in to your guest account" className="landing-action inline-flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2.5 text-xs font-semibold text-forest/65 transition hover:bg-forest/5 hover:text-leaf sm:px-3" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}><CircleUserRound size={16} /><span className="hidden sm:inline">Sign in</span></button>}
          <button
            className="landing-action relative inline-flex items-center gap-2 rounded-full border border-forest/10 px-4 py-2.5 text-sm font-semibold transition hover:border-leaf hover:text-leaf"
            onClick={() => setCartOpen(true)}
            aria-label={`Open bag with ${cartCount} items`}
          >
            <ShoppingBag size={17} /><span className="hidden sm:inline">Your bag</span>
            {cartCount > 0 && <span className="landing-cart-count grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-[10px]">{cartCount}</span>}
          </button>
          <button className="landing-action landing-menu-toggle rounded-full p-2 md:hidden" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Toggle menu" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
        {mobileMenuOpen && <nav className="absolute left-4 right-4 top-full grid gap-4 rounded-2xl border border-forest/10 bg-white p-5 shadow-xl md:hidden"><a href="/menu" onClick={(event) => navigate(event, "/menu")}>Our menu</a><a href={sectionHref("track-order")} onClick={(event) => navigate(event, sectionHref("track-order"))}>Track order</a><a href="/about" onClick={(event) => navigate(event, "/about")}>Our story</a><a href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))}>Find a table</a></nav>}
      </header>

      <main>
        {isApplicationPage ? applicationPageContent : isMenuPage ? menuPageContent : isAboutPage ? aboutPageContent : <>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow"><Sparkles size={14} /> AHODWO KITCHEN · GHANA ON A PLATE</span>
            <h1 className="landing-headline">FRESH, LOCAL<br />& MADE <span>TO LOVE.</span></h1>
            <p>From smoky banku to a bowl of red red, come hungry for the flavours that bring us together.</p>
            <div className="landing-hero-actions">
              <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="landing-button">Explore the menu <ArrowRight size={16} /></a>
              <a href="#reserve" onClick={(event) => navigate(event, "#reserve")} className="landing-text-link">Book a table <ArrowUpRight size={15} /></a>
            </div>
            <div className="landing-trust"><span><i /> Freshly prepared</span><span><i /> Local favourites</span><span><i /> Open daily · 11 am–10 pm</span></div>
          </div>
          <div className="landing-hero-visual">
            <img src="/images/red-red.jpg" alt="Ghanaian red red with ripe fried plantain served on a banana leaf" />
            <div className="landing-hero-shade" />
            <div className="landing-food-tag"><span>GHANAIAN CLASSIC</span><strong>Red red & plantain</strong></div>
            <span className="landing-hero-sticker">MADE<br />FRESH</span>
          </div>
        </section>

        {qrTableId && <section className="mx-auto mt-5 flex max-w-7xl flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#e9eee4] px-5 py-4 md:px-8" role="status">
          <div><span className="text-xs font-bold uppercase tracking-[.16em] text-leaf">Table ordering</span><p className="mt-1 text-sm font-semibold">{qrTableName || `Table ${qrTableId}`} · Browse and order from your seat.</p></div>
          <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white">Browse menu <ArrowRight size={15} className="ml-1 inline" /></a>
        </section>}

        {featuredItems.length > 0 && <section
          ref={featuredSectionRef}
          className="featured-scroll-section"
          data-featured-slide-theme={featuredSlideIndex % 4}
          aria-label="OrderPulse menu favourites"
        >
          <div className="featured-scroll-pin">
            <div className="featured-scroll-heading">
              <span>GHANAIAN · GLOBAL · SIPS</span>
              <h2>A little taste<br /><em>of what we love.</em></h2>
              <p>From Ghanaian favourites to global plates and refreshing drinks.</p>
            </div>
            <div ref={featuredTrackRef} className="featured-scroll-track">
              {featuredItems.map((item, index) => <article
                key={item.id}
                className="featured-menu-panel"
                data-featured-active={index === featuredSlideIndex % featuredItems.length}
              >
                <div className="featured-menu-plate" aria-hidden="true">
                  <div className="featured-plate-wood">
                    <img src={item.imageUrl} alt="" onError={handleMenuImageError} loading="lazy" />
                  </div>
                </div>
                <div className="featured-carousel-controls" role="group" aria-label="Choose featured dish">
                  <button
                    type="button"
                    aria-label="Previous featured dish"
                    onClick={() => setFeaturedSlideIndex((current) =>
                      (current - 1 + featuredItems.length) % featuredItems.length,
                    )}
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next featured dish"
                    onClick={() => setFeaturedSlideIndex((current) => (current + 1) % featuredItems.length)}
                  >
                    <ChevronRight size={22} />
                  </button>
                </div>
                <div className="featured-menu-copy">
                  <span className="featured-menu-index">0{index + 1} / 0{featuredItems.length}</span>
                  <span className="featured-menu-category">{item.category === "Main Courses or Entrées" ? "Foreign food" : item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="featured-menu-actions">
                    <strong>{money(item.price)}</strong>
                    <button type="button" onClick={() => updateQuantity(item, 1)} aria-label={`Add ${item.name} to bag`}>
                      Add to bag <Plus size={16} />
                    </button>
                  </div>
                  <span className="featured-menu-badge">{item.badge || "Made fresh to order"}</span>
                </div>
              </article>)}
            </div>
            <div className="featured-scroll-cue"><span>KEEP SCROLLING</span><ArrowRight size={15} /></div>
          </div>
        </section>}

        <section className="landing-feature-cards" aria-label="Restaurant highlights">
          <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="landing-feature-photo"><img src="/images/red-red.jpg" alt="" /><span>Fresh from our kitchen</span><strong>Good food, made with heart.</strong></a>
          <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="landing-feature-banner"><span>OUR TABLE, YOUR WAY</span><strong>Ghanaian favourites.<br />A seat for everyone.</strong><span className="landing-feature-cta">See what's cooking <ArrowRight size={15} /></span><span className="landing-sunburst" aria-hidden="true">✳</span></a>
        </section>

        {optionsError && <p role="alert" className="mx-auto max-w-7xl px-5 py-3 text-sm text-sky-950 md:px-10">{optionsError}</p>}

        {(restaurantOptions.deals.length > 0 || restaurantOptions.bundles.length > 0) && <section className="mx-auto max-w-7xl px-5 py-10 md:px-10" aria-labelledby="specials-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-[.2em] text-leaf">Fresh offers</span><h2 id="specials-heading" className="mt-2 font-display text-3xl font-semibold">Today's specials<span>.</span></h2></div><span className="text-xs text-forest/55">Add bundles to your bag or enter a code at checkout.</span></div>
          {restaurantOptions.bundles.length > 0 && <div className="mb-5 grid gap-4 md:grid-cols-2">{restaurantOptions.bundles.map((bundle) => <article className="flex items-center justify-between gap-4 rounded-3xl bg-[#e9eee4] p-5 sm:p-6" key={`bundle-${bundle.id}`}>
            <div><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-leaf"><Gift size={15} /> Meal bundle</span><h3 className="mt-2 font-display text-xl font-semibold">{bundle.title}</h3><p className="mt-1 max-w-lg text-sm leading-6 text-forest/65">{bundle.description}</p><p className="mt-2 text-xs text-forest/60">{bundle.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p><strong className="mt-2 inline-block">{money(bundle.price)}</strong></div>
            <button type="button" className="shrink-0 rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-leaf" onClick={() => addMealBundle(bundle)}>Add bundle</button>
          </article>)}</div>}
          <div className="grid gap-4 md:grid-cols-2">{restaurantOptions.deals.map((deal) => <article className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#e9eee4] p-5 sm:p-6" key={deal.id}>
            <div><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-leaf"><Gift size={15} /> Meal deal</span><h3 className="mt-2 font-display text-xl font-semibold">{deal.title}</h3><p className="mt-1 max-w-lg text-sm leading-6 text-forest/65">{deal.description}</p><span className="mt-3 inline-block rounded-full bg-white px-3 py-1.5 font-mono text-xs font-bold tracking-wider">{deal.code}</span></div>
            <button type="button" className="rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-leaf" onClick={() => {
              setDealCode(deal.code);
              if (cart.length) setCheckoutOpen(true);
              else {
                const menuUrl = qrTableId ? `/menu?table=${encodeURIComponent(qrTableId)}` : "/menu";
                window.history.pushState({}, "", menuUrl);
                setIsMenuPage(true);
                setIsApplicationPage(false);
                setIsAboutPage(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}>{cart.length ? `Use offer · save ${money(deal.discount)}` : `Shop the offer · save ${money(deal.discount)}`}</button>
          </article>)}</div>
        </section>}

        <section id="my-orderpulse" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-10 md:px-10" aria-labelledby="my-orderpulse-heading">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[.2em] text-leaf">Your table, your favourites</span><h2 id="my-orderpulse-heading" className="mt-2 font-display text-3xl font-semibold">Your OrderPulse<span>.</span></h2></div>
            {!customerUser && <button type="button" className="staff-primary" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Sign in for rewards and saved dishes</button>}
          </div>
          {customerUser ? <div className="mt-6 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <article className="rounded-3xl bg-forest p-6 text-white"><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-lime"><Gift size={16} /> OrderPulse rewards</span><p className="mt-4 font-display text-4xl font-semibold">{customerEngagement?.points ?? "—"} <span className="text-base font-medium text-white/65">points</span></p><p className="mt-2 text-sm text-white/75">Earn 1 point for each GH₵1 spent on completed orders. Redeem 100 points for GH₵5 off.</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-lime transition-all" style={{ width: `${Math.min(100, ((customerEngagement?.points || 0) % 100))}%` }} /></div><p className="mt-2 text-xs text-white/70">{customerEngagement ? `${customerEngagement.pointsToNextReward} points until your next GH₵5 reward` : "Loading your rewards…"}</p>
            </article>
            <div className="grid gap-5">
              <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-display text-xl font-semibold">Saved dishes <span className="text-sm text-forest/50">({customerFavorites.length})</span></h3><Heart size={18} className="text-rose-700" /></div>
                {customerFavorites.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{customerFavorites.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-cream p-3"><img src={item.imageUrl} alt="" onError={handleMenuImageError} className="h-14 w-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className="text-xs text-forest/55">{money(item.price)}</span></div><button type="button" disabled={item.available === false} onClick={() => updateQuantity(item, 1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime/60" aria-label={`Add ${item.name} to bag`}><Plus size={16} /></button></div>)}</div> : <p className="mt-3 text-sm text-forest/55">Tap the heart on any dish to save it here.</p>}
              </section>
              <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-display text-xl font-semibold">Order again</h3><RotateCcw size={18} className="text-leaf" /></div>
                {customerOrders.length ? <div className="mt-3 divide-y divide-forest/10">{customerOrders.slice(0, 3).map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong className="text-sm">{displayOrderNumber(order.orderNumber)}</strong><p className="mt-1 text-xs text-forest/55">{order.items.map((item) => `${item.quantity}× ${item.name}${item.contents ? ` (${item.contents})` : ""}`).join(", ")} · {money(order.total)}</p></div><button type="button" className="rounded-full border border-forest/15 px-3 py-2 text-xs font-semibold hover:border-leaf" onClick={() => reorder(order.items)}>Reorder</button></div>)}</div> : <p className="mt-3 text-sm text-forest/55">Your past orders will show up here.</p>}
              </section>
            </div>
          </div> : <p className="mt-3 max-w-2xl text-sm leading-6 text-forest/60">Create an account to keep your favourite dishes, quickly reorder, and collect points on completed orders.</p>}
        </section>

        <section className="home-menu-section" aria-labelledby="home-menu-heading">
          <div className="home-menu-heading">
            <div>
              <span className="home-menu-eyebrow">FRESH FROM OUR KITCHEN</span>
              <h2 id="home-menu-heading">A few favourites<span>.</span></h2>
              <p>Find something delicious, made with care and ready to order.</p>
            </div>
            <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="home-menu-all-link">View full menu <ArrowRight size={16} /></a>
          </div>
          <div className="home-menu-filters" role="group" aria-label="Filter featured dishes">
            {homeMenuCategories.map((item) => <button
              key={item}
              type="button"
              aria-pressed={homeMenuCategory === item}
              className={`home-menu-filter${homeMenuCategory === item ? " is-active" : ""}`}
              onClick={() => setHomeMenuCategory(item)}
            >{item === "All" ? "All dishes" : item === "Foreign food" ? "Foreign favourites" : item}</button>)}
          </div>
          {menuLoading ? <div className="home-menu-grid" aria-label="Loading featured dishes" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div className="home-menu-skeleton" key={index} />)}</div>
            : menuError ? <p role="alert" className="home-menu-message">{menuError}</p>
              : homeMenuItems.length === 0 ? <p className="home-menu-message">No dishes are available in this category right now. Please check the full menu for more.</p>
                : <div className="home-menu-grid">{homeMenuItems.map((item) => <article className="home-menu-card" key={item.id}>
                  <div className="home-menu-photo">
                    <img src={item.imageUrl} alt={item.name} onError={handleMenuImageError} loading="lazy" />
                    <span>{item.badge || (item.popularity > 0 ? "Popular this week" : item.category === "Local food" ? "Ghanaian favourite" : "Made fresh")}</span>
                    <button type="button" onClick={() => toggleFavorite(item)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-rose-700 shadow" aria-label={`${customerFavorites.some((favorite) => favorite.id === item.id) ? "Remove" : "Save"} ${item.name} ${customerFavorites.some((favorite) => favorite.id === item.id) ? "from" : "to"} favorites`} aria-pressed={customerFavorites.some((favorite) => favorite.id === item.id)}><Heart size={18} fill={customerFavorites.some((favorite) => favorite.id === item.id) ? "currentColor" : "none"} /></button>
                  </div>
                  <div className="home-menu-card-copy">
                    <span className="home-menu-category">{item.category === "Foreign food" ? "Foreign favourites" : item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}</span>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="home-menu-card-bottom">
                      <strong>{money(item.price)}</strong>
                      <button type="button" onClick={() => updateQuantity(item, 1)} aria-label={`Add ${item.name} to bag`}>Add to bag <Plus size={15} /></button>
                    </div>
                  </div>
                </article>)}</div>}
        </section>

        <section id="careers" className="careers-section">
          <div className="careers-intro">
            <div className="careers-copy">
              <span className="careers-eyebrow">GROW WITH ORDERPULSE</span>
              <h2>Build Your Career<br />with Us<span>.</span></h2>
              <p className="careers-subtitle">Have fun. Cultivate your passion. Shape your future.</p>
              <p>Working with us means thriving in a welcoming environment where your well-being matters as much as the joy of doing great work. Join a team that moves forward together—for you and with you.</p>
            </div>
          </div>
          <div className="careers-openings-layout">
            <img
              className="careers-image"
              src="/images/orderpulse-careers-chef.jpg"
              alt="Black male chef preparing dishes in a restaurant kitchen"
              loading="lazy"
            />
            <div className="careers-positions">
            <div className="careers-positions-heading">
              <span className="careers-eyebrow">COME BE PART OF OUR TEAM</span>
              <h3>Open positions<span>.</span></h3>
              <p>Find a role that feels right for you. Pay is discussed during the interview.</p>
            </div>
            <div className="careers-list">
              {openPositions.map((position, index) => (
                <details className="career-accordion" key={position.title}>
                  <summary>
                    <span className="career-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="career-title">{position.title}</span>
                    <ChevronDown className="career-chevron" size={18} aria-hidden="true" />
                  </summary>
                  <div className="career-details">
                    <p className="career-description">{position.description}</p>
                    <dl>
                      <div><dt>Schedule</dt><dd>{position.schedule}</dd></div>
                      <div><dt>Experience</dt><dd>{position.experience}</dd></div>
                      {position.requirements && <div><dt>Requirements</dt><dd>{position.requirements}</dd></div>}
                    </dl>
                    <span className="career-pay">Pay discussed during interview</span>
                    <button type="button" className="career-apply-button career-apply-position" onClick={() => startJobApplication(position.title)}>Apply now<ArrowRight size={16} /></button>
                  </div>
                </details>
              ))}
            </div>
            </div>
          </div>
        </section>

        <section className="landing-values border-y border-forest/5 bg-white/60">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-5 py-5 md:grid-cols-4 md:px-10 md:py-6">
            {[["01", "Fresh every day"], ["02", "Ghana-grown goodness"], ["03", "Made to order"], ["04", "Always a warm welcome"]].map(([number, label]) => <div key={number} className="flex items-center gap-3"><span className="font-display text-sm italic text-leaf/60">{number}</span><span className="text-xs font-semibold text-forest/65 sm:text-sm">{label}</span></div>)}
          </div>
        </section>

        <section id="track-order" className="scroll-mt-8 bg-white/65">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-[.8fr_1.2fr] md:items-center md:px-10 md:py-20">
            <div>
              <span className="text-xs font-bold uppercase tracking-[.22em] text-leaf">Stay in the loop</span>
              <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Track your<br /><span className="italic text-leaf">order.</span></h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-forest/55">Enter the order number from your confirmation and the phone number used at checkout to see its latest kitchen status.</p>
            </div>
            <div className="rounded-[1.5rem] bg-cream p-6 shadow-sm sm:p-8">
              <form onSubmit={findOrder} className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">Order number<input required name="orderNumber" maxLength="35" pattern="GH-[A-Fa-f0-9]{8,32}" value={trackingOrderNumber} onChange={(event) => setTrackingOrderNumber(event.target.value.toUpperCase())} placeholder="GH-1A2B3C4D" /></label>
                <label className="field-label">Phone number<input required name="phone" type="tel" minLength="7" maxLength="30" value={trackingPhone} onChange={(event) => setTrackingPhone(event.target.value)} placeholder="Phone used at checkout" /></label>
                <button disabled={trackingBusy} className="staff-primary sm:col-span-2">{trackingBusy ? "Checking order…" : "Check order status"}</button>
              </form>
              {trackingError && <p role="alert" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-950">{trackingError}</p>}
              {trackingOrder && <div className="mt-5 rounded-2xl bg-white p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-forest/50" title={`Full order number: ${trackingOrder.orderNumber}`}>Order {displayOrderNumber(trackingOrder.orderNumber)}</p><p className="mt-1 text-sm font-semibold">Current status</p></div><span className={`status-pill status-${trackingOrder.status}`}>{trackingOrder.status === "awaiting_payment" ? "Awaiting payment" : trackingOrder.status}</span></div>
                <p className="mt-2 text-xs text-forest/55">Payment: {trackingOrder.paymentStatus === "paid" ? "confirmed" : "pending"}</p>
                <p className="mt-2 text-xs text-forest/55">{trackingOrder.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>
                {!["completed", "cancelled"].includes(trackingOrder.status) && <p className="mt-2 text-[11px] text-leaf">This status refreshes automatically every 15 seconds.</p>}
                {trackingOrder.feedbackEligible && <form className="order-feedback-form" onSubmit={submitOrderFeedback}>
                  <div><h3>How was your meal?</h3><p>Your feedback helps our team make every visit better.</p></div>
                  <div className="feedback-rating-picker" role="group" aria-label="Rate your meal from 1 to 5 stars">
                    {Array.from({ length: 5 }, (_, index) => {
                      const rating = index + 1;
                      return <button key={rating} type="button" aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`} aria-pressed={feedbackRating === rating} onClick={() => setFeedbackRating(rating)}><Star size={25} fill={feedbackRating >= rating ? "currentColor" : "none"} /></button>;
                    })}
                  </div>
                  <p className="text-xs font-semibold text-forest/70" aria-live="polite">{feedbackRating ? `${feedbackRating}/5 · ${["", "Poor", "Fair", "Good", "Very good", "Excellent"][feedbackRating]}` : "Choose a rating from 1 to 5 stars"}</p>
                  <label className="field-label">Anything you’d like us to know? <span className="text-forest/45">(optional)</span><textarea value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={1000} rows={3} placeholder="Tell us what went well or what we could improve." /></label>
                  <button type="submit" disabled={!feedbackRating || feedbackBusy} className="staff-primary">{feedbackBusy ? "Sending feedback…" : "Send feedback"}</button>
                </form>}
                {trackingOrder.feedback && <div className="order-feedback-thanks" role="status"><strong>{feedbackMessage || "Thank you for rating your meal."}</strong>                <span><span className="feedback-stars" aria-label={`${trackingOrder.feedback.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < trackingOrder.feedback.rating ? "currentColor" : "none"} />)}</span> {trackingOrder.feedback.rating}/5 stars{trackingOrder.feedback.comment ? ` · “${trackingOrder.feedback.comment}”` : ""}</span></div>}
              </div>}
            </div>
          </div>
        </section>

        <section id="story" className="bg-[#e9eee4]">
          <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 md:grid-cols-2 md:items-center md:px-10 md:py-20">
            <div className="relative min-h-[300px] overflow-hidden rounded-[1.75rem] md:min-h-[400px]"><img src="https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=85" alt="A welcoming restaurant dining room" className="absolute inset-0 h-full w-full object-cover" /></div>
            <div className="max-w-lg md:pl-8"><span className="text-xs font-bold uppercase tracking-[.22em] text-leaf">A seat at our table</span><h2 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Food tastes better when it's <span className="italic text-leaf">shared.</span></h2><p className="mt-5 text-sm leading-7 text-forest/65">We bring Ghana's much-loved flavours together with a fresh, modern touch. Every plate is made to order, every ingredient is chosen with care, and there's always room for one more.</p><div className="mt-7 flex flex-wrap gap-6 text-sm"><div><span className="block font-display text-2xl font-bold">100%</span><span className="mt-1 block text-xs text-forest/55">made fresh daily</span></div><div className="h-10 w-px bg-forest/15" /><div><span className="block font-display text-2xl font-bold">Local</span><span className="mt-1 block text-xs text-forest/55">ingredients first</span></div></div></div>
          </div>
        </section>

        <section id="reserve" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-20 md:px-10 md:py-28">
          <div className="grid gap-12 md:grid-cols-[.85fr_1.15fr] md:items-start">
            <div><span className="text-xs font-bold uppercase tracking-[.22em] text-leaf">Make it a date</span><h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Your table's<br /><span className="italic text-leaf">waiting.</span></h2><p className="mt-5 max-w-sm text-sm leading-7 text-forest/55">Gather your favourite people. Sign in to request a table and keep track of your reservation.</p></div>
            {customerUser ? <form onSubmit={submitBooking} className="rounded-[1.5rem] bg-white p-6 shadow-sm sm:p-8">
              <h3 className="font-display text-2xl font-semibold">Reserve a table</h3><p className="mt-1 text-xs text-forest/50">Check live availability for a 90-minute visit. Our team will confirm your request.</p>
              <div className="mt-5 rounded-xl bg-[#e9eee4] p-3.5"><p className="text-xs font-semibold text-forest">{customerUser.name}</p><p className="mt-1 text-[11px] text-forest/55">{customerUser.email} · {customerUser.phone}</p><p className="mt-2 text-[10px] text-leaf">Signed in · reservation will be saved to your account</p></div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="field-label">Date<input required name="date" type="date" min={new Date().toISOString().slice(0, 10)} value={bookingSlot.date} onChange={(event) => setBookingSlot((current) => ({ ...current, date: event.target.value }))} /></label>
                <label className="field-label">Time<select required name="time" value={bookingSlot.time} onChange={(event) => setBookingSlot((current) => ({ ...current, time: event.target.value }))}><option value="" disabled>Choose a time</option>{["11:00", "12:00", "13:00", "14:00", "17:00", "18:00", "19:00", "20:00", "20:30"].map((time) => <option key={time} value={time}>{new Date(`2000-01-01T${time}`).toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" })}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute bottom-4 right-4 text-forest/40" /></label>
                <label className="field-label">Guests<select required name="partySize" value={bookingSlot.partySize} onChange={(event) => setBookingSlot((current) => ({ ...current, partySize: Number(event.target.value) }))}>{Array.from({ length: 20 }, (_, index) => index + 1).map((size) => <option key={size} value={size}>{size} {size === 1 ? "guest" : "guests"}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute bottom-4 right-4 text-forest/40" /></label>
                <label className="field-label">Anything we should know?<textarea name="notes" rows="2" maxLength="500" placeholder="A special occasion, dietary needs..." /></label>
              </div>
              {availabilityLoading && <p className="mt-4 text-sm text-forest/55" role="status">Checking tables for that time…</p>}
              {availabilityError && <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-950" role="alert">{availabilityError}</p>}
              {tableAvailability && <div className="mt-4 rounded-xl bg-[#e9eee4] p-3.5" aria-live="polite">
                <p className="text-xs font-semibold text-forest">{tableAvailability.tables.length ? `${tableAvailability.tables.length} tables available` : "No tables available for this time"} · {tableAvailability.durationMinutes}-minute visit</p>
                {tableAvailability.tables.length
                  ? <p className="mt-1 text-[11px] text-forest/60">{tableAvailability.tables.map((table) => `${table.name} (${table.seats} seats)`).join(" · ")}. Our team assigns your table when confirming.</p>
                  : <p className="mt-1 text-[11px] text-forest/60">Choose another time or date to see available tables.</p>}
              </div>}
              <button disabled={busy || availabilityLoading || !tableAvailability?.tables.length} className="mt-5 w-full rounded-full bg-forest px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-leaf disabled:opacity-60">{busy ? "Sending request…" : "Request a table"}</button>
              {bookingMessage && <p role="status" className="mt-4 rounded-xl bg-leaf/10 p-3 text-sm text-leaf">{bookingMessage}</p>}
              {bookingNotifications && <div className="mt-2 rounded-xl bg-[#e9eee4] p-3 text-xs text-forest/70" role="status">
                <p>Email: {bookingNotifications.email.message}</p>
              </div>}
              {customerReservations.length > 0 && <div className="mt-6 border-t border-forest/10 pt-5"><h4 className="font-display text-lg font-semibold">Your reservations</h4><div className="mt-3 grid gap-2">{customerReservations.map((reservation) => <div key={reservation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream p-3"><div><p className="text-xs font-semibold">{reservation.date} · {reservation.time}</p><p className="mt-1 text-[10px] text-forest/50">{reservation.partySize} guests{reservation.tableName ? ` · ${reservation.tableName}` : ""}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold capitalize text-amber-800">{reservation.status}</span></div>)}</div></div>}
            </form>
            : <div className="rounded-[1.5rem] bg-white p-7 shadow-sm sm:p-9"><span className="grid h-12 w-12 place-items-center rounded-full bg-lime/40 text-leaf"><CircleUserRound size={22} /></span><h3 className="mt-4 font-display text-2xl font-semibold">Sign in to reserve</h3><p className="mt-2 max-w-sm text-sm leading-6 text-forest/55">Create a guest account or sign in first. Your reservation will be linked to your account so you can find it again.</p><button onClick={() => { setAuthMode("login"); setAuthOpen(true); }} className="mt-5 min-h-11 w-full rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-leaf">Sign in to continue</button><p className="mt-3 text-center text-xs text-forest/50">New here? <button onClick={() => { setAuthMode("register"); setAuthOpen(true); }} className="font-semibold text-leaf underline underline-offset-4">Create an account</button></p></div>}
          </div>
        </section>

        <section className="takeaway-promo" aria-labelledby="takeaway-promo-heading">
          <div className="takeaway-promo-card">
            <div className="takeaway-promo-copy">
              <span>GOOD FOOD, ON YOUR TERMS</span>
              <h2 id="takeaway-promo-heading">Takeaway or Delivery</h2>
              <p>Bring your OrderPulse favourites home. Browse the menu and choose how you’d like to enjoy your meal.</p>
              <a href="/menu" onClick={(event) => navigate(event, "/menu")}>Explore the menu <ArrowRight size={16} /></a>
            </div>
            <div className="takeaway-promo-image">
              <img src="/images/orderpulse-takeaway-box.png" alt="OrderPulse takeaway meal boxes ready to go" loading="lazy" />
            </div>
            <span className="takeaway-promo-stamp" aria-hidden="true"><Leaf size={19} /> MADE<br />WITH CARE</span>
          </div>
        </section>
        </>}
      </main>

      <footer className="restaurant-footer">
        <div className="restaurant-footer-inner">
          <section className="restaurant-hours-card" aria-labelledby="restaurant-hours-heading">
            <div className="restaurant-hours-card-heading">
              <span className="restaurant-hours-icon"><Clock3 size={16} /></span>
              <div><span>COME BY ANYTIME</span><h2 id="restaurant-hours-heading">Opening hours</h2></div>
            </div>
            <dl className="restaurant-hours-list">
              <div><dt>Monday – Sunday</dt><dd>11:00 am – 10:00 pm</dd></div>
            </dl>
            <p className="restaurant-hours-note">Fresh food and a warm welcome, every day.</p>
          </section>

          <div className="restaurant-footer-content">
            <div className="restaurant-footer-top">
              <section className="restaurant-footer-address" aria-labelledby="restaurant-address-heading">
                <span className="restaurant-footer-label" id="restaurant-address-heading">FIND US</span>
                <a href="https://maps.google.com/?q=Ahodwo%2C+Kumasi%2C+Ghana" target="_blank" rel="noreferrer">
                  <MapPin size={17} />
                  <span>Ahodwo, Kumasi<br />Ghana</span>
                  <ArrowUpRight size={14} />
                </a>
              </section>
              <section className="restaurant-footer-contact" aria-labelledby="restaurant-contact-heading">
                <span className="restaurant-footer-label" id="restaurant-contact-heading">MAKE IT A DATE</span>
                <a href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))}>Reserve a table <ArrowRight size={15} /></a>
                <a href="/menu" onClick={(event) => navigate(event, "/menu")}>Order something lovely <ArrowRight size={15} /></a>
              </section>
            </div>

            <div className="restaurant-footer-bottom">
              <div className="restaurant-footer-brand">
                <a href="/" onClick={(event) => navigate(event, "/")} className="restaurant-footer-mark" aria-label="OrderPulse home"><Leaf size={22} /></a>
                <div><a href="/" onClick={(event) => navigate(event, "/")} className="restaurant-footer-wordmark">OrderPulse</a><p>Grown with care. Cooked with love. Served in Ahodwo, Kumasi.</p></div>
              </div>
              <nav className="restaurant-footer-links" aria-label="Footer navigation">
                <a href="/menu" onClick={(event) => navigate(event, "/menu")}>Our menu</a>
                <a href="/about" onClick={(event) => navigate(event, "/about")}>Our story</a>
                <a href={sectionHref("careers")} onClick={(event) => navigate(event, sectionHref("careers"))}>Careers</a>
              </nav>
              <a className="restaurant-footer-privacy" href="/apply" onClick={(event) => navigate(event, "/apply")}>Career applications</a>
            </div>
            <p className="restaurant-footer-copyright">© 2026 OrderPulse · Ahodwo, Kumasi, Ghana</p>
          </div>
          <div className="restaurant-footer-seal" aria-hidden="true"><Leaf size={34} /><span>MADE<br />WITH CARE</span></div>
        </div>
      </footer>

      {cartOpen && <div className="fixed inset-0 z-40 bg-forest/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className="ml-auto flex h-full w-full max-w-md flex-col bg-cream p-5 shadow-2xl sm:p-7">
          <div className="flex items-center justify-between border-b border-forest/10 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-leaf">Made fresh for you</p><h2 className="mt-1 font-display text-2xl font-semibold">Your bag <span className="text-forest/35">({cartCount})</span></h2></div><button onClick={() => setCartOpen(false)} className="rounded-full p-2 hover:bg-forest/5" aria-label="Close bag"><X size={20} /></button></div>
          {cart.length === 0 ? <div className="grid flex-1 place-items-center text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime/40 text-leaf"><ShoppingBag size={23} /></span><p className="mt-4 font-display text-xl font-semibold">It's a little empty in here</p><p className="mt-2 text-sm text-forest/50">Add something delicious from our menu.</p><a href="/menu" onClick={(event) => { setCartOpen(false); navigate(event, "/menu"); }} className="mt-5 inline-block text-sm font-semibold text-leaf underline underline-offset-4">Explore the menu</a></div></div> : <>
            <div className="flex-1 space-y-4 overflow-y-auto py-5">{cart.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl bg-white p-3"><img src={item.imageUrl} alt="" onError={handleMenuImageError} className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><h3 className="truncate font-display font-semibold">{item.name}</h3><p className="mt-1 text-xs font-semibold">{money(item.price)}</p>{item.contents && <p className="mt-1 text-[11px] text-forest/55">{item.contents}</p>}<div className="mt-2 flex items-center gap-3"><button onClick={() => updateQuantity(item, -1)} aria-label={`Remove one ${item.name}`} className="grid h-7 w-7 place-items-center rounded-full bg-cream"><Minus size={13} /></button><span className="text-xs font-semibold">{item.quantity}</span><button onClick={() => updateQuantity(item, 1)} aria-label={`Add one ${item.name}`} className="grid h-7 w-7 place-items-center rounded-full bg-lime/50"><Plus size={13} /></button></div></div><span className="self-start text-xs font-bold">{money(item.price * item.quantity)}</span></div>)}</div>
            <div className="border-t border-forest/10 pt-5"><div className="flex justify-between text-sm"><span className="text-forest/55">Subtotal</span><span className="font-bold">{money(subtotal)}</span></div><p className="mt-2 text-[11px] text-forest/45">Taxes and any extras confirmed at the restaurant.</p><button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} className="mt-5 w-full rounded-full bg-forest py-3.5 text-sm font-semibold text-white transition hover:bg-leaf">Continue to checkout <ArrowRight size={15} className="ml-1 inline" /></button></div>
          </>}
        </aside>
      </div>}

      {checkoutOpen && <div className="checkout-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-forest/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
        {orderReceipt ? <section className="receipt-card my-auto w-full max-w-2xl rounded-[1.5rem] bg-white shadow-2xl" aria-labelledby="receipt-heading">
          <div className="receipt-printable">
            <header className="receipt-header">
              <div className="receipt-brand"><span className="receipt-brand-mark" aria-hidden="true">O</span><div><p>OrderPulse</p><span>Restaurant ordering in Kumasi</span></div></div>
              <div className="receipt-heading"><h2 id="receipt-heading">Receipt</h2><span title={`Full order number: ${orderReceipt.orderNumber}`}>{displayOrderNumber(orderReceipt.orderNumber)}</span></div>
            </header>
            <div className="receipt-body">
              <div className="receipt-summary">
                <div className="receipt-metadata">
                  <div><span>Order number</span><div className="receipt-order-id-row"><strong title={`Full order number: ${orderReceipt.orderNumber}`}>{displayOrderNumber(orderReceipt.orderNumber)}</strong><button type="button" className="receipt-copy-order-id" onClick={copyFullReceiptOrderNumber}><Copy size={13} /> Copy full ID</button>{showFullReceiptOrderNumber && <code>{orderReceipt.orderNumber}</code>}{receiptCopyMessage && <small role="status">{receiptCopyMessage}</small>}</div></div>
                  <div><span>Ordered</span><strong>{new Date(orderReceipt.createdAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</strong></div>
                </div>
                <span className={`receipt-payment-status ${orderReceipt.paymentStatus === "paid" ? "is-paid" : ""}`}>{orderReceipt.paymentStatus === "paid" ? "Paid" : "Payment pending"}</span>
              </div>
              <div className="receipt-parties">
                <section className="receipt-party" aria-label="Customer">
                  <h3>Billed to</h3><strong>{orderReceipt.customerName}</strong><span>{orderReceipt.phone}</span><span>{orderReceipt.orderType === "delivery" ? `Delivery · ${orderReceipt.deliveryArea || ""}` : orderReceipt.orderType === "dine-in" ? `Dine in${orderReceipt.tableName ? ` · ${orderReceipt.tableName}` : ""}` : "Pickup"}</span>{orderReceipt.deliveryAddress && <span>{orderReceipt.deliveryAddress}</span>}
                </section>
                <section className="receipt-party" aria-label="Restaurant">
                  <h3>From</h3><strong>OrderPulse</strong><span>Ahodwo, Kumasi, Ghana</span><span>Ghana</span>
                </section>
              </div>
              <div className="receipt-table-wrap">
                <table className="receipt-items">
                  <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead>
                  <tbody>{orderReceipt.items.map((item) => <tr key={`${item.name}-${item.quantity}`}><td>{item.name}{item.contents && <small className="block text-xs text-forest/55">Includes: {item.contents}</small>}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.unitPrice * item.quantity)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="receipt-totals">
                <div><span>Subtotal</span><span>{money(orderReceipt.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}</span></div>
                {orderReceipt.deliveryFee > 0 && <div><span>Delivery · {orderReceipt.deliveryArea}</span><span>{money(orderReceipt.deliveryFee)}</span></div>}
                {orderReceipt.dealDiscount > 0 && <div><span>Offer · {orderReceipt.dealCode}</span><span>−{money(orderReceipt.dealDiscount)}</span></div>}
                {orderReceipt.rewardsDiscount > 0 && <div><span>Rewards redeemed · {orderReceipt.rewardsPointsUsed} points</span><span>−{money(orderReceipt.rewardsDiscount)}</span></div>}
                <div className="receipt-total-line"><strong>{orderReceipt.paymentStatus === "paid" ? "Total paid" : "Order total"}</strong><strong>{money(orderReceipt.total)}</strong></div>
              </div>
              <div className="receipt-payment-reference">
                <strong>{orderReceipt.paymentStatus === "paid" ? "Paid with Paystack" : "Payment via Paystack"}</strong>
                <span>Reference: {orderReceipt.reference || orderReceipt.paymentReference || orderReceipt.orderNumber}</span>
              </div>
              <footer className="receipt-footer"><strong>Thank you for ordering with OrderPulse!</strong><span>Ahodwo, Kumasi, Ghana</span></footer>
            </div>
          </div>
          <div className="receipt-delivery mx-6 mt-5 rounded-xl bg-cream p-3 text-xs sm:mx-8" role="status">
            <p>Email: {orderReceipt.notifications.email.message}</p>
          </div>
          <div className="mx-6 mt-4 rounded-xl bg-cream p-3 text-sm sm:mx-8" aria-live="polite">
            <div className="flex items-center justify-between gap-3"><span className="text-forest/55">Order status</span>{(() => {
              const status = trackingOrder?.orderNumber === orderReceipt.orderNumber ? trackingOrder.status : orderReceipt.status;
              return <span className={`status-pill status-${status}`}>{status === "awaiting_payment" ? "Awaiting payment" : status}</span>;
            })()}</div>
            <p className="mt-2 text-[11px] text-forest/50">Use your order number and checkout phone in Track order to check progress later.</p>
          </div>
          <div className="receipt-actions mx-6 my-5 grid grid-cols-3 gap-2 sm:mx-8"><button type="button" onClick={() => downloadReceiptPdf(orderReceipt)} className="inline-flex items-center justify-center gap-2 rounded-full border border-forest/15 px-3 py-3 text-xs font-semibold"><Download size={15} /> PDF</button><button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-full border border-forest/15 px-3 py-3 text-xs font-semibold"><Printer size={15} /> Print</button><button type="button" onClick={closeCheckout} className="rounded-full bg-forest px-3 py-3 text-xs font-semibold text-white">Done</button></div>
        </section> : paymentCallback ? <section className="receipt-card my-auto w-full max-w-md rounded-[1.5rem] bg-cream p-6 shadow-2xl sm:p-8" aria-labelledby="payment-result-heading">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-leaf">OrderPulse · Ahodwo, Kumasi</p>
          <h2 id="payment-result-heading" className="mt-2 font-display text-2xl font-semibold">Payment status</h2>
          <p className="mt-4 rounded-xl bg-white p-4 text-sm" role={orderMessage.startsWith("Checking") ? "status" : "alert"}>
            {orderMessage || "We’re confirming your payment. Keep this page open for a moment."}
          </p>
          <p className="mt-3 text-xs text-forest/60">Only successful Paystack verification releases an order to the kitchen. If you completed payment, allow a moment and check the order status again.</p>
          <button type="button" onClick={closeCheckout} className="mt-5 w-full rounded-full bg-forest px-4 py-3 text-sm font-semibold text-white">Done</button>
        </section> : <form onSubmit={submitOrder} className="checkout-panel my-auto w-full max-w-lg rounded-[1.5rem] bg-cream shadow-2xl">
          <div className="checkout-titlebar"><div><p>THE GREEN PLATE · AHODWO, KUMASI</p><h2>Checkout</h2></div><button type="button" onClick={closeCheckout} aria-label="Close checkout"><X size={20} /></button></div>
          <div className="checkout-body">
            <section className="checkout-section">
              <h3>Order summary <span>{cartCount} {cartCount === 1 ? "item" : "items"}</span></h3>
              <div className="checkout-items">{cart.map((item) => <div key={item.id} className="checkout-item"><img src={item.imageUrl} alt="" onError={handleMenuImageError} /><div><strong>{item.name}</strong><span>Qty: {item.quantity} · {money(item.price)} each</span>{item.contents && <small className="block text-xs text-forest/55">{item.contents}</small>}</div><b>{money(item.price * item.quantity)}</b></div>)}</div>
              <div className="checkout-total-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              {deliveryFee > 0 && <div className="checkout-total-row"><span>Delivery</span><strong>{money(deliveryFee)}</strong></div>}
              {dealDiscount > 0 && <div className="checkout-total-row"><span>Deal · {matchingDeal.code}</span><strong>−{money(dealDiscount)}</strong></div>}
              {rewardsDiscount > 0 && <div className="checkout-total-row"><span>Rewards</span><strong>−{money(rewardsDiscount)}</strong></div>}
              <div className="checkout-total-row checkout-total"><span>Total</span><strong>{money(checkoutTotal)}</strong></div>
              <p className="checkout-note">Any extras or applicable taxes will be confirmed at the restaurant.</p>
            </section>
            <section className="checkout-section">
              <h3>How are you enjoying your meal?</h3>
              <label className="field-label checkout-method">Order method<select name="orderType" value={checkoutOrderType} onChange={(event) => setCheckoutOrderType(event.target.value)} disabled={qrTableId !== null}><option value="pickup">Pickup · I'll collect my order</option><option value="dine-in">Dine in · I'll eat at the restaurant</option><option value="delivery">Delivery · bring it to me</option></select><ChevronDown size={14} className="pointer-events-none absolute bottom-4 right-4 text-forest/40" /></label>
              {qrTableId && <p className="rounded-xl bg-[#e9eee4] p-3 text-xs text-forest/70">Table ordering selected · Table {qrTableId}. Your order will be sent to the kitchen for this table.</p>}
              {checkoutOrderType === "delivery" && <div className="grid gap-3">
                <label className="field-label">Delivery area<select required name="deliveryAreaId" value={deliveryAreaId} onChange={(event) => setDeliveryAreaId(event.target.value)}><option value="">Select your area</option>{restaurantOptions.deliveryAreas.map((area) => <option key={area.id} value={area.id}>{area.name} · {money(area.fee)}</option>)}</select></label>
                {restaurantOptions.deliveryAreas.length === 0 && <p className="text-xs text-amber-800">Delivery areas are not configured yet. Please choose pickup or dine-in, or contact the restaurant.</p>}
                <label className="field-label">Delivery address<input required name="deliveryAddress" minLength="8" maxLength="500" autoComplete="street-address" placeholder="Street, house number, and nearby landmark" /></label>
              </div>}
              <label className="field-label">Offer code (optional)<input name="dealCode" value={dealCode} onChange={(event) => setDealCode(event.target.value.toUpperCase())} maxLength="40" list="active-deal-codes" placeholder="Enter a meal-deal code" /></label>
              <datalist id="active-deal-codes">{restaurantOptions.deals.map((deal) => <option key={deal.id} value={deal.code}>{deal.title} · save {money(deal.discount)}</option>)}</datalist>
              {dealCode.trim() && !matchingDeal && <p className="text-xs text-amber-800">That code is not currently active. Check the specials above or correct the code.</p>}
              {matchingDeal && <p className="text-xs text-leaf">{matchingDeal.title} · {matchingDeal.description}</p>}
              {customerUser && (customerEngagement?.points || 0) >= 100 && subtotal - dealDiscount >= 5 && <label className="flex items-start gap-3 rounded-xl bg-[#e9eee4] p-3 text-sm"><input type="checkbox" checked={useRewards} onChange={(event) => setUseRewards(event.target.checked)} /><span>Use 100 points for up to GH₵5 off <small className="block text-xs text-forest/60">Available points: {customerEngagement.points}</small></span></label>}
              {customerUser && (customerEngagement?.points || 0) >= 100 && subtotal - dealDiscount < 5 && <p className="text-xs text-forest/60">Add at least GH₵5 of menu items after offers to redeem your 100-point reward.</p>}
              {customerUser
                ? <p className="rounded-xl bg-[#e9eee4] p-3 text-xs text-forest/70">You’re signed in. Earn 1 point per GH₵1 spent on food when this paid order is completed. Delivery fees do not earn points.</p>
                : <div className="rounded-xl bg-[#e9eee4] p-3 text-xs text-forest/70"><p>Want rewards? Sign in or create an account to earn 1 point per GH₵1 spent on food after your paid order is completed. Delivery fees do not earn points. Guest orders can be claimed later using the same verified email.</p><div className="mt-2 flex gap-3"><button type="button" className="font-semibold text-leaf underline" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Sign in</button><button type="button" className="font-semibold text-leaf underline" onClick={() => { setAuthMode("register"); setAuthOpen(true); }}>Create an account</button></div></div>}
            </section>
            <section className="checkout-section checkout-payment"><span className="checkout-payment-icon"><ShoppingBag size={18} /></span><div><h3>Secure payment by Paystack</h3><p>After placing your order, you’ll be redirected to Paystack to pay securely. The kitchen will only receive your order after Paystack confirms payment.</p></div></section>
            <section className="checkout-section checkout-contact">
              <h3>Your contact details</h3>
              <label className="field-label">Your name<input required name="customerName" minLength="2" maxLength="80" autoComplete="name" defaultValue={customerUser?.name || ""} placeholder="e.g. Ama Mensah" /></label>
              <label className="field-label">Email for your receipt<input required name="customerEmail" type="email" maxLength="254" autoComplete="email" defaultValue={customerUser?.email || ""} placeholder="you@example.com" /></label>
              <label className="field-label">Phone number<input required name="phone" minLength="7" maxLength="30" type="tel" autoComplete="tel" defaultValue={customerUser?.phone || ""} placeholder="+233 24 000 0000" /></label>
            </section>
            <button disabled={busy || cart.length === 0 || checkoutTotal <= 0 || (checkoutOrderType === "delivery" && !deliveryAreaId)} className="checkout-submit">{busy ? "Placing your order…" : `Place order · ${money(checkoutTotal)}`}</button>
            {orderMessage && <p role="alert" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-950">{orderMessage}</p>}
            <p className="checkout-footnote">You’ll continue to Paystack to complete payment. After payment is verified, you can download or print your PDF receipt. Track your order with the order number and checkout phone.</p>
          </div>
        </form>}
      </div>}

      {authOpen && <AuthDialog
        mode={authMode}
        prompt={pendingFavorite ? `Sign in or create an account to save ${pendingFavorite.name} to your favorites. It will be saved when you sign in.` : ""}
        token={new URLSearchParams(window.location.search).get(authMode === "verify" ? "verifyEmail" : "resetPassword") || ""}
        onClose={closeAuthDialog}
        onSuccess={acceptCustomerSignIn}
        onModeChange={setAuthMode}
        onClearAuthToken={clearAuthTokenFromUrl}
      />}

      {cartNotice && <div className="cart-toast" role="status" aria-live="polite"><span aria-hidden="true"><ShoppingBag size={17} /></span><div><strong>Added to your bag</strong><small>{cartNotice.replace(" added to your bag", "")}</small></div><button type="button" onClick={() => { setCartNotice(""); setCartOpen(true); }}>View bag <ArrowRight size={14} /></button></div>}

      <button onClick={() => setCartOpen(true)} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-forest px-4 py-3 text-sm font-semibold text-white shadow-xl md:hidden"><ShoppingBag size={17} /> Bag {cartCount > 0 && `· ${cartCount}`} <span className="text-lime">{money(subtotal)}</span></button>
    </div>
  );
}

export default App;
