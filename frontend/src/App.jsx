import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChefHat,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Leaf,
  MapPin,
  Menu as MenuIcon,
  Minus,
  Plus,
  Printer,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import AuthDialog from "./AuthDialog.jsx";
import StaffDashboard from "./StaffDashboard.jsx";
import { beverageGroups, beverageSubcategories, menuCategories } from "./menu-categories.js";

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
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [customerUser, setCustomerUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [customerReservations, setCustomerReservations] = useState([]);
  const [bookingSlot, setBookingSlot] = useState({ date: "", time: "", partySize: 2 });
  const [tableAvailability, setTableAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState("");
  const [trackingPhone, setTrackingPhone] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [applicationError, setApplicationError] = useState("");
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(() => {
    const position = new URLSearchParams(window.location.search).get("position");
    return openPositions.some((item) => item.title === position) ? position : "";
  });
  const featuredSectionRef = useRef(null);
  const featuredTrackRef = useRef(null);

  useEffect(() => {
    const syncRoute = () => {
      setIsMenuPage(window.location.pathname === "/menu");
      setIsApplicationPage(window.location.pathname === "/apply");
      setIsAboutPage(window.location.pathname === "/about");
      const position = new URLSearchParams(window.location.search).get("position");
      setSelectedPosition(openPositions.some((item) => item.title === position) ? position : "");
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
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
        .sort((first, second) => Number(Boolean(second.badge)) - Number(Boolean(first.badge)));
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
      .sort((first, second) => Number(Boolean(second.badge)) - Number(Boolean(first.badge)))
      .slice(0, 4);
  }, [featuredItems, homeMenuCategory, menuItems]);
  const visibleCount = menuSections.reduce(
    (count, section) => count + section.groups.reduce((groupCount, group) => groupCount + group.items.length, 0),
    0,
  );
  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);

  function navigate(event, href) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = new URL(href, window.location.href);
    window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
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
        <span>FROM OUR KITCHEN · ACCRA, GHANA</span>
        <h1>Our menu<span>.</span></h1>
        <p>Ghanaian favourites and global classics, prepared fresh and served with care.</p>
      </div>
      <div className="menu-filter-list mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Filter menu by category">
        {categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`menu-filter-button whitespace-nowrap rounded-full font-semibold ${category === item ? "is-active" : ""}`}>{item === "Foreign food" ? "Foreign foods" : item}</button>)}
      </div>
      {menuError ? <p role="alert" className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">{menuError}</p> : menuLoading ? <div className="menu-loading-grid" aria-label="Loading menu" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className="menu-skeleton-card" key={index}><span /><div><i /><i /><i /></div></div>)}</div> : visibleCount === 0 ? <p className="menu-empty-state"><span aria-hidden="true">✳</span><strong>No dishes in this category yet</strong><span>Try another category, or check back soon for something fresh.</span></p> : (
        <div className="space-y-12">
          {menuSections.filter((section) => section.groups.length > 0).map((section) => <section key={section.category} aria-label={section.title}>
            <div className="mb-6 flex items-center gap-3 border-b border-forest/10 pb-3"><span className="h-2 w-2 rounded-full bg-leaf" /><h2 className="font-display text-2xl font-semibold sm:text-3xl">{section.title}</h2><span className="text-xs text-forest/45">{section.groups.reduce((count, group) => count + group.items.length, 0)} dishes</span></div>
            <div className="space-y-8">{section.groups.map((group) => <div key={`${section.category}-${group.title}`}><div className="mb-4 flex items-center gap-2"><h3 className="text-sm font-semibold text-forest/75">{group.title}</h3><span className="text-[10px] text-forest/40">{group.items.length} items</span></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => <article key={item.id} className="group min-w-0 overflow-hidden rounded-[1.4rem] bg-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/5">
                <div className="relative h-48 overflow-hidden sm:h-52"><img src={item.imageUrl} alt={item.name} onError={handleMenuImageError} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />{item.badge && <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-leaf backdrop-blur">{item.badge}</span>}<button type="button" onClick={() => updateQuantity(item, 1)} className="menu-add-button absolute bottom-3 right-3 grid place-items-center rounded-full bg-lime text-forest shadow" aria-label={`Add ${item.name} to bag`}><Plus size={17} /></button></div>
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
          <a href="/" onClick={(event) => navigate(event, "/")} className="about-back-link"><ArrowRight size={15} /> OrderPulse · Accra, Ghana</a>
          <span className="about-eyebrow">GOOD FOOD. GOOD PEOPLE. GHANAIAN HEART.</span>
          <h1>A taste of Ghana,<br />made to bring us <em>together.</em></h1>
          <p>From local favourites to familiar classics, OrderPulse is a warm place to share a meal, find your next favourite, and feel at home.</p>
          <div className="about-hero-actions">
            <a href="/menu" onClick={(event) => navigate(event, "/menu")} className="about-primary-link">Explore our menu <ArrowRight size={16} /></a>
            <a href={sectionHref("reserve")} onClick={(event) => navigate(event, sectionHref("reserve"))} className="about-secondary-link">Find your table</a>
          </div>
          <span className="about-hero-location"><MapPin size={15} /> Made with care in Accra</span>
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
            ["02", "Community", "Rooted in Accra, we make room for neighbours, families, friends, and new faces."],
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

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let horizontalDistance = 0;
    let frame = 0;

    const updatePosition = () => {
      frame = 0;
      if (reducedMotion.matches) {
        track.style.transform = "";
        return;
      }
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const progress = Math.min(Math.max(window.scrollY - sectionTop, 0), horizontalDistance);
      track.style.transform = `translate3d(${-progress}px, 0, 0)`;
      const plateRotation = horizontalDistance ? (progress / horizontalDistance) * 720 : 0;
      track.querySelectorAll(".featured-menu-plate").forEach((plate, index) => {
        plate.style.setProperty("--plate-rotation", `${plateRotation + index * 12}deg`);
      });
    };

    const schedulePositionUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    };

    const measureTrack = () => {
      if (reducedMotion.matches) {
        section.style.height = "";
        track.style.transform = "";
        track.querySelectorAll(".featured-menu-plate").forEach((plate) => {
          plate.style.removeProperty("--plate-rotation");
        });
        return;
      }
      horizontalDistance = Math.max(0, track.scrollWidth - window.innerWidth);
      section.style.height = `${window.innerHeight + horizontalDistance}px`;
      schedulePositionUpdate();
    };

    const resizeObserver = new ResizeObserver(measureTrack);
    resizeObserver.observe(track);
    window.addEventListener("scroll", schedulePositionUpdate, { passive: true });
    window.addEventListener("resize", measureTrack);
    reducedMotion.addEventListener("change", measureTrack);
    measureTrack();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", schedulePositionUpdate);
      window.removeEventListener("resize", measureTrack);
      reducedMotion.removeEventListener("change", measureTrack);
      if (frame) window.cancelAnimationFrame(frame);
      section.style.height = "";
      track.style.transform = "";
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
        .map((item) => item.id === menuItem.id ? { ...item, quantity: item.quantity + amount } : item)
        .filter((item) => item.quantity > 0);
    });
  }

  function acceptCustomerSignIn(user) {
    setCustomerUser(user);
    setAuthOpen(false);
    setCustomerReservations([]);
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
    } catch (error) {
      setBookingMessage(error.message);
    }
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
          orderType: form.get("orderType"),
          items: cart.map(({ id, quantity }) => ({ id, quantity })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't place your order.");
      setOrderReceipt(result);
      setTrackingOrder({ ...result, phone: form.get("phone") });
      setCart([]);
      formElement.reset();
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
    } catch (error) {
      setTrackingError(error.message);
      setTrackingOrder(null);
    } finally {
      setTrackingBusy(false);
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

  function closeCheckout() {
    setCheckoutOpen(false);
    setOrderMessage("");
    setOrderReceipt(null);
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

  if (staffMode) return <StaffDashboard onExit={() => setStaffMode(false)} />;

  return (
    <div className="orderpulse-app-background min-h-screen text-forest">
      <div className="landing-topline">
        FRESH FROM OUR KITCHEN <span>✳</span> ACCRA, GHANA
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
        <div className="flex items-center gap-2">
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
            <span className="landing-eyebrow"><Sparkles size={14} /> ACCRA KITCHEN · GHANA ON A PLATE</span>
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

        {featuredItems.length > 0 && <section ref={featuredSectionRef} className="featured-scroll-section" aria-label="OrderPulse menu favourites">
          <div className="featured-scroll-pin">
            <div className="featured-scroll-heading">
              <span>GHANAIAN · GLOBAL · SIPS</span>
              <h2>A little taste<br /><em>of what we love.</em></h2>
              <p>From Ghanaian favourites to global plates and refreshing drinks.</p>
            </div>
            <div ref={featuredTrackRef} className="featured-scroll-track">
              {featuredItems.map((item, index) => <article key={item.id} className="featured-menu-panel">
                <div className="featured-menu-plate" aria-hidden="true">
                  <div className="featured-plate-wood">
                    <img src={item.imageUrl} alt="" onError={handleMenuImageError} loading="lazy" />
                  </div>
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
                    <span>{item.badge || (item.category === "Local food" ? "Ghanaian favourite" : "Made fresh")}</span>
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
              {trackingError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{trackingError}</p>}
              {trackingOrder && <div className="mt-5 rounded-2xl bg-white p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-forest/50">Order {trackingOrder.orderNumber}</p><p className="mt-1 text-sm font-semibold">Current status</p></div><span className={`status-pill status-${trackingOrder.status}`}>{trackingOrder.status}</span></div>
                <p className="mt-2 text-xs text-forest/55">{trackingOrder.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>
                {!["completed", "cancelled"].includes(trackingOrder.status) && <p className="mt-2 text-[11px] text-leaf">This status refreshes automatically every 15 seconds.</p>}
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
              {availabilityError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{availabilityError}</p>}
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
                <p className="mt-1">SMS: {bookingNotifications.sms.message}</p>
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
                <a href="https://maps.google.com/?q=Osu%2C+Accra%2C+Ghana" target="_blank" rel="noreferrer">
                  <MapPin size={17} />
                  <span>Osu, Accra<br />Ghana</span>
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
                <div><a href="/" onClick={(event) => navigate(event, "/")} className="restaurant-footer-wordmark">OrderPulse</a><p>Grown with care. Cooked with love. Served in Accra.</p></div>
              </div>
              <nav className="restaurant-footer-links" aria-label="Footer navigation">
                <a href="/menu" onClick={(event) => navigate(event, "/menu")}>Our menu</a>
                <a href="/about" onClick={(event) => navigate(event, "/about")}>Our story</a>
                <a href={sectionHref("careers")} onClick={(event) => navigate(event, sectionHref("careers"))}>Careers</a>
              </nav>
              <a className="restaurant-footer-privacy" href="/apply" onClick={(event) => navigate(event, "/apply")}>Career applications</a>
            </div>
            <p className="restaurant-footer-copyright">© 2026 OrderPulse · Accra, Ghana</p>
          </div>
          <div className="restaurant-footer-seal" aria-hidden="true"><Leaf size={34} /><span>MADE<br />WITH CARE</span></div>
        </div>
      </footer>

      {cartOpen && <div className="fixed inset-0 z-40 bg-forest/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className="ml-auto flex h-full w-full max-w-md flex-col bg-cream p-5 shadow-2xl sm:p-7">
          <div className="flex items-center justify-between border-b border-forest/10 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-leaf">Made fresh for you</p><h2 className="mt-1 font-display text-2xl font-semibold">Your bag <span className="text-forest/35">({cartCount})</span></h2></div><button onClick={() => setCartOpen(false)} className="rounded-full p-2 hover:bg-forest/5" aria-label="Close bag"><X size={20} /></button></div>
          {cart.length === 0 ? <div className="grid flex-1 place-items-center text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-lime/40 text-leaf"><ShoppingBag size={23} /></span><p className="mt-4 font-display text-xl font-semibold">It's a little empty in here</p><p className="mt-2 text-sm text-forest/50">Add something delicious from our menu.</p><a href="/menu" onClick={(event) => { setCartOpen(false); navigate(event, "/menu"); }} className="mt-5 inline-block text-sm font-semibold text-leaf underline underline-offset-4">Explore the menu</a></div></div> : <>
            <div className="flex-1 space-y-4 overflow-y-auto py-5">{cart.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl bg-white p-3"><img src={item.imageUrl} alt="" onError={handleMenuImageError} className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><h3 className="truncate font-display font-semibold">{item.name}</h3><p className="mt-1 text-xs font-semibold">{money(item.price)}</p><div className="mt-2 flex items-center gap-3"><button onClick={() => updateQuantity(item, -1)} aria-label={`Remove one ${item.name}`} className="grid h-7 w-7 place-items-center rounded-full bg-cream"><Minus size={13} /></button><span className="text-xs font-semibold">{item.quantity}</span><button onClick={() => updateQuantity(item, 1)} aria-label={`Add one ${item.name}`} className="grid h-7 w-7 place-items-center rounded-full bg-lime/50"><Plus size={13} /></button></div></div><span className="self-start text-xs font-bold">{money(item.price * item.quantity)}</span></div>)}</div>
            <div className="border-t border-forest/10 pt-5"><div className="flex justify-between text-sm"><span className="text-forest/55">Subtotal</span><span className="font-bold">{money(subtotal)}</span></div><p className="mt-2 text-[11px] text-forest/45">Taxes and any extras confirmed at the restaurant.</p><button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} className="mt-5 w-full rounded-full bg-forest py-3.5 text-sm font-semibold text-white transition hover:bg-leaf">Continue to checkout <ArrowRight size={15} className="ml-1 inline" /></button></div>
          </>}
        </aside>
      </div>}

      {checkoutOpen && <div className="checkout-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-forest/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
        {orderReceipt ? <section className="receipt-card my-auto w-full max-w-md rounded-[1.5rem] bg-cream p-6 shadow-2xl sm:p-8" aria-labelledby="receipt-heading">
          <div className="receipt-printable">
            <div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-leaf">OrderPulse · Accra</p><h2 id="receipt-heading" className="mt-1 font-display text-2xl font-semibold">Order confirmation</h2></div><span className="receipt-print-icon"><Printer size={22} /></span></div>
            <p className="mt-4 text-sm">Thank you, {orderReceipt.customerName}. Your order has been received.</p>
            <div className="my-5 rounded-2xl bg-white p-4">
              <p className="text-xs text-forest/55">Order number</p><p className="font-semibold">{orderReceipt.orderNumber}</p>
              <div className="mt-3 space-y-2 border-t border-forest/10 pt-3">{orderReceipt.items.map((item) => <div key={`${item.name}-${item.quantity}`} className="flex justify-between gap-3 text-xs"><span>{item.quantity} × {item.name}</span><span className="font-semibold">{money(item.unitPrice * item.quantity)}</span></div>)}</div>
              <div className="mt-3 flex justify-between border-t border-forest/10 pt-3 text-sm font-bold"><span>Order total</span><span>{money(orderReceipt.total)}</span></div>
            </div>
            <p className="text-xs text-forest/60">{orderReceipt.orderType === "dine-in" ? "Dine in" : "Pickup"} · {new Date(orderReceipt.createdAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          <div className="receipt-delivery mt-5 rounded-xl bg-white p-3 text-xs" role="status">
            <p>Email: {orderReceipt.notifications.email.message}</p><p className="mt-1">SMS: {orderReceipt.notifications.sms.message}</p>
          </div>
          <div className="mt-4 rounded-xl bg-white p-3 text-sm" aria-live="polite">
            <div className="flex items-center justify-between gap-3"><span className="text-forest/55">Order status</span><span className={`status-pill status-${trackingOrder?.orderNumber === orderReceipt.orderNumber ? trackingOrder.status : orderReceipt.status}`}>{trackingOrder?.orderNumber === orderReceipt.orderNumber ? trackingOrder.status : orderReceipt.status}</span></div>
            <p className="mt-2 text-[11px] text-forest/50">Use your order number and checkout phone in Track order to check progress later.</p>
          </div>
          <div className="receipt-actions mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-full border border-forest/15 px-4 py-3 text-sm font-semibold"><Printer size={16} /> Print receipt</button><button type="button" onClick={closeCheckout} className="rounded-full bg-forest px-4 py-3 text-sm font-semibold text-white">Done</button></div>
        </section> : <form onSubmit={submitOrder} className="checkout-panel my-auto w-full max-w-lg rounded-[1.5rem] bg-cream shadow-2xl">
          <div className="checkout-titlebar"><div><p>THE GREEN PLATE · ACCRA</p><h2>Checkout</h2></div><button type="button" onClick={closeCheckout} aria-label="Close checkout"><X size={20} /></button></div>
          <div className="checkout-body">
            <section className="checkout-section">
              <h3>Order summary <span>{cartCount} {cartCount === 1 ? "item" : "items"}</span></h3>
              <div className="checkout-items">{cart.map((item) => <div key={item.id} className="checkout-item"><img src={item.imageUrl} alt="" onError={handleMenuImageError} /><div><strong>{item.name}</strong><span>Qty: {item.quantity} · {money(item.price)} each</span></div><b>{money(item.price * item.quantity)}</b></div>)}</div>
              <div className="checkout-total-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="checkout-total-row checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div>
              <p className="checkout-note">Any extras or applicable taxes will be confirmed at the restaurant.</p>
            </section>
            <section className="checkout-section">
              <h3>How are you enjoying your meal?</h3>
              <label className="field-label checkout-method">Order method<select name="orderType" defaultValue="pickup"><option value="pickup">Pickup · I'll collect my order</option><option value="dine-in">Dine in · I'll eat at the restaurant</option></select><ChevronDown size={14} className="pointer-events-none absolute bottom-4 right-4 text-forest/40" /></label>
            </section>
            <section className="checkout-section checkout-payment"><span className="checkout-payment-icon"><ShoppingBag size={18} /></span><div><h3>Payment</h3><p>Payment is handled at the restaurant. No online charge is taken.</p></div></section>
            <section className="checkout-section checkout-contact">
              <h3>Your contact details</h3>
              <label className="field-label">Your name<input required name="customerName" minLength="2" maxLength="80" autoComplete="name" placeholder="e.g. Ama Mensah" /></label>
              <label className="field-label">Email for your receipt<input required name="customerEmail" type="email" maxLength="254" autoComplete="email" placeholder="you@example.com" /></label>
              <label className="field-label">Phone number for SMS<input required name="phone" minLength="7" maxLength="30" type="tel" autoComplete="tel" placeholder="+233 24 000 0000" /></label>
            </section>
            <button disabled={busy || cart.length === 0} className="checkout-submit">{busy ? "Placing your order…" : `Place order · ${money(subtotal)}`}</button>
            {orderMessage && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{orderMessage}</p>}
            <p className="checkout-footnote">We'll send your order confirmation to both contact details.</p>
          </div>
        </form>}
      </div>}

      {authOpen && <AuthDialog mode={authMode} onClose={() => setAuthOpen(false)} onSuccess={acceptCustomerSignIn} onModeChange={setAuthMode} />}

      {cartNotice && <div className="cart-toast" role="status" aria-live="polite"><span aria-hidden="true"><ShoppingBag size={17} /></span><div><strong>Added to your bag</strong><small>{cartNotice.replace(" added to your bag", "")}</small></div><button type="button" onClick={() => { setCartNotice(""); setCartOpen(true); }}>View bag <ArrowRight size={14} /></button></div>}

      <button onClick={() => setCartOpen(true)} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-forest px-4 py-3 text-sm font-semibold text-white shadow-xl md:hidden"><ShoppingBag size={17} /> Bag {cartCount > 0 && `· ${cartCount}`} <span className="text-lime">{money(subtotal)}</span></button>
    </div>
  );
}

export default App;
