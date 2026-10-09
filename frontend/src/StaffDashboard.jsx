import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Activity,
  ChefHat,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Utensils,
  UsersRound,
  X,
} from "lucide-react";
import { beverageGroups, beverageSubcategories, menuCategories } from "./menu-categories.js";

const tabs = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tables", label: "Tables", icon: Utensils },
  { id: "reservations", label: "Reservations", icon: UsersRound },
  { id: "menu", label: "Menu", icon: ClipboardList },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "kitchen", label: "Kitchen", icon: ChefHat },
  { id: "activity", label: "Team activity", icon: Activity, managerOnly: true },
  { id: "applications", label: "Job applications", icon: FileText, managerOnly: true },
  { id: "team", label: "Staff accounts", icon: ShieldCheck, managerOnly: true },
];
const orderStatuses = ["received", "preparing", "ready", "completed", "cancelled"];
const reservationStatuses = ["requested", "confirmed", "seated", "completed", "cancelled"];
const tableStatuses = ["available", "occupied", "reserved"];
const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const money = (amount) => currency.format(amount).replace("GHS", "GH₵");

async function request(path, _unused, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    credentials: "same-origin",
  });
  if (response.status === 204) return null;
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response. Please try again."
        : `The server returned an unreadable error (HTTP ${response.status}). Please try again.`,
    );
  }
  if (!response.ok) {
    const error = new Error(result.error || "The staff request could not be completed.");
    error.code = result.code || "";
    throw error;
  }
  return result;
}

function StatusPill({ children }) {
  return <span className={`status-pill status-${children}`}>{children}</span>;
}

function StaffDashboard({ onExit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginMode, setLoginMode] = useState("login");
  const [loginErrorCode, setLoginErrorCode] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [user, setUser] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activities, setActivities] = useState([]);
  const [applications, setApplications] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async (role = "staff") => {
    const [nextSummary, nextTables, nextReservations, nextMenu, nextOrders] = await Promise.all([
      request("/api/staff/summary"),
      request("/api/staff/tables"),
      request("/api/staff/reservations"),
      request("/api/staff/menu"),
      request("/api/staff/orders"),
    ]);
    setSummary(nextSummary);
    setTables(nextTables);
    setReservations(nextReservations);
    setMenuItems(nextMenu);
    setOrders(nextOrders);
    if (role === "manager") {
      const [nextActivities, nextStaff, nextApplications] = await Promise.all([
        request("/api/manager/activities"),
        request("/api/manager/staff"),
        request("/api/manager/applications"),
      ]);
      setActivities(nextActivities);
      setStaffUsers(nextStaff);
      setApplications(nextApplications);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return undefined;
    const interval = window.setInterval(() => {
      loadData(user.role).catch((loadError) => setError(loadError.message));
    }, 15000);
    return () => window.clearInterval(interval);
  }, [authorized, loadData, user]);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLoginErrorCode("");
    setLoginNotice("");
    try {
      const result = await request("/api/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!["staff", "manager"].includes(result.user.role)) {
        await request("/api/auth/logout", null, { method: "POST" });
        throw new Error("Use a guest sign-in on the restaurant page.");
      }
      setUser(result.user);
      await loadData(result.user.role);
      setAuthorized(true);
    } catch (loginError) {
      setError(loginError.message);
      setLoginErrorCode(loginError.code || "");
    } finally {
      setBusy(false);
    }
  }

  async function sendAccountEmail(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLoginNotice("");
    try {
      const result = await request(`/api/auth/${loginMode === "forgot" ? "forgot-password" : "resend-verification"}`, null, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setLoginNotice(result.message);
    } catch (emailError) {
      setError(emailError.message);
    } finally {
      setBusy(false);
    }
  }

  function changeLoginMode(mode) {
    setLoginMode(mode);
    setError("");
    setLoginErrorCode("");
    setLoginNotice("");
  }

  async function runAction(action, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await loadData(user.role);
      setNotice(successMessage);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    request("/api/auth/logout", null, { method: "POST" }).catch((logoutError) => setError(logoutError.message));
    setAuthorized(false);
    setEmail("");
    setPassword("");
    setUser(null);
    setSummary(null);
    setActivities([]);
    setApplications([]);
    setStaffUsers([]);
    onExit();
  }

  if (!authorized) {
    return (
      <main className="staff-login">
        <button className="staff-back" onClick={onExit}><ArrowLeft size={16} /> Back to restaurant</button>
        <form className="staff-login-card" onSubmit={loginMode === "login" ? signIn : sendAccountEmail}>
          <span className="staff-icon"><ChefHat size={23} /></span>
          <p className="staff-eyebrow">THE GREEN PLATE · TEAM</p>
          <h1>{loginMode === "forgot" ? "Reset your password" : loginMode === "resend" ? "Verify your email" : "Staff sign in"}</h1>
          <p className="staff-subtitle">{loginMode === "login" ? "Sign in with your individual staff account to open restaurant operations." : loginMode === "forgot" ? "Enter your work email and we'll send a reset link if it matches an active account." : "Enter your work email to request a fresh verification link."}</p>
          <label className="field-label">Work email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@restaurant.com" /></label>
          {loginMode === "login" && <label className="field-label staff-login-password">Password<span className="password-input-wrap"><input required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
          {error && <p role="alert" className="staff-alert">{error}</p>}
          {loginNotice && <p role="status" className="staff-notice">{loginNotice}</p>}
          <button disabled={busy} className="staff-primary">{busy ? "Checking…" : loginMode === "login" ? "Open dashboard" : loginMode === "forgot" ? "Send reset link" : "Send verification link"}</button>
          {loginMode === "login" && <div className="staff-hint">
            <button type="button" onClick={() => changeLoginMode("forgot")}>Forgot password?</button>
            {loginErrorCode === "EMAIL_NOT_VERIFIED" && <button type="button" onClick={() => changeLoginMode("resend")}>Resend verification email</button>}
            <p>Your manager creates individual staff accounts. Contact your manager if you need access.</p>
          </div>}
          {loginMode !== "login" && <p className="staff-hint"><button type="button" onClick={() => changeLoginMode("login")}>Back to staff sign in</button></p>}
        </form>
      </main>
    );
  }

  const activeOrders = orders.filter((order) => ["received", "preparing", "ready"].includes(order.status));
  const visibleTabs = tabs.filter((tab) => !tab.managerOnly || user.role === "manager");

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <div className="staff-brand"><span className="staff-icon"><ChefHat size={20} /></span><span>OrderPulse<small>Restaurant operations</small></span></div>
        <nav className="staff-nav" aria-label="Staff workspace">
          {visibleTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={activeTab === id ? "active" : ""}><Icon size={17} />{label}{id === "kitchen" && activeOrders.length > 0 && <span className="staff-nav-count">{activeOrders.length}</span>}</button>)}
        </nav>
        <button className="staff-exit" onClick={signOut}><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="staff-main">
        <header className="staff-topbar">
          <div><p className="staff-eyebrow">THE GREEN PLATE · {user.role.toUpperCase()} · {user.name}</p><h1>{visibleTabs.find((tab) => tab.id === activeTab)?.label}</h1></div>
          <div className="staff-top-actions"><span className="staff-live"><i /> Live · refreshes every 15 sec</span><button className="staff-icon-button" onClick={() => runAction(() => loadData(user.role), "Dashboard refreshed.")} aria-label="Refresh dashboard"><RefreshCw size={16} /></button><button className="staff-exit-mobile" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button></div>
        </header>
        {error && <div role="alert" className="staff-alert staff-alert-wide"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
        {notice && <div role="status" className="staff-notice">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button></div>}
        {activeTab === "overview" && <Overview summary={summary} orders={orders} reservations={reservations} onTab={setActiveTab} manager={user.role === "manager"} activities={activities} />}
        {activeTab === "tables" && <Tables tables={tables} busy={busy} onAction={runAction} pin={null} />}
        {activeTab === "reservations" && <Reservations reservations={reservations} tables={tables} busy={busy} onAction={runAction} pin={null} />}
        {activeTab === "menu" && <MenuManagement menuItems={menuItems} busy={busy} onAction={runAction} pin={null} manager={user.role === "manager"} />}
        {activeTab === "orders" && <Orders orders={orders} busy={busy} onAction={runAction} pin={null} />}
        {activeTab === "kitchen" && <Kitchen orders={activeOrders} busy={busy} onAction={runAction} pin={null} />}
        {activeTab === "activity" && user.role === "manager" && <ManagerActivity activities={activities} />}
        {activeTab === "applications" && user.role === "manager" && <JobApplications applications={applications} />}
        {activeTab === "team" && user.role === "manager" && <TeamManagement users={staffUsers} busy={busy} onAction={runAction} />}
      </main>
    </div>
  );
}

function Overview({ summary, orders, reservations, onTab, manager, activities }) {
  const metrics = [
    ["Today's orders", summary?.ordersToday ?? "—", ClipboardList],
    ["Sales today", summary ? money(summary.salesToday) : "—", LayoutDashboard],
    ["Kitchen tickets", summary?.activeTickets ?? "—", ChefHat],
    ["Tables occupied", summary?.occupiedTables ?? "—", Utensils],
  ];
  if (manager) {
    metrics.push(
      ["Active staff", summary?.activeStaff ?? "—", UsersRound],
      ["Staff activities", summary?.activityCount ?? "—", Activity],
    );
  }
  return (
    <section className="staff-content">
      <div className="staff-metrics">{metrics.map(([label, value, Icon]) => <article className="staff-metric" key={label}><span><Icon size={17} /></span><p>{label}</p><strong>{value}</strong></article>)}</div>
      <div className="staff-overview-grid">
        <section className="staff-panel"><div className="staff-panel-head"><div><h2>Kitchen queue</h2><p>Orders that still need attention</p></div><button onClick={() => onTab("kitchen")}>Open kitchen <ArrowLeft size={14} className="rotate-180" /></button></div>
          {orders.filter((order) => ["received", "preparing", "ready"].includes(order.status)).slice(0, 4).map((order) => <OrderRow key={order.id} order={order} />)}
          {orders.filter((order) => ["received", "preparing", "ready"].includes(order.status)).length === 0 && <EmptyState>Nothing in the kitchen queue right now.</EmptyState>}
        </section>
        <section className="staff-panel"><div className="staff-panel-head"><div><h2>Reservations</h2><p>Latest guest requests</p></div><button onClick={() => onTab("reservations")}>View all <ArrowLeft size={14} className="rotate-180" /></button></div>
          {reservations.filter((booking) => ["requested", "confirmed"].includes(booking.status)).slice(0, 4).map((booking) => <div className="staff-list-row" key={booking.id}><div className="staff-row-avatar"><UsersRound size={16} /></div><div className="staff-row-main"><strong>{booking.customerName}</strong><small>{booking.date} · {booking.time} · {booking.partySize} guests</small></div><StatusPill>{booking.status}</StatusPill></div>)}
          {reservations.filter((booking) => ["requested", "confirmed"].includes(booking.status)).length === 0 && <EmptyState>No upcoming reservations to show.</EmptyState>}
        </section>
        {manager && <section className="staff-panel staff-panel-wide"><div className="staff-panel-head"><div><h2>Team activity</h2><p>Recent, named changes made in the restaurant workspace</p></div><button onClick={() => onTab("activity")}>Full activity log <ArrowLeft size={14} className="rotate-180" /></button></div>
          {activities.slice(0, 5).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
          {activities.length === 0 && <EmptyState>Staff activity will appear here after a team member updates an order, booking, table, or menu item.</EmptyState>}
        </section>}
      </div>
    </section>
  );
}

function ActivityRow({ activity }) {
  return <div className="staff-list-row activity-row"><div className="staff-row-avatar"><Activity size={16} /></div><div className="staff-row-main"><strong>{activity.action}</strong><small>{activity.actorName} · {activity.actorEmail} · {activity.entity}{activity.entityId ? ` #${activity.entityId}` : ""}{activity.details ? ` · ${activity.details}` : ""}</small></div><time dateTime={activity.createdAt}>{new Date(`${activity.createdAt.replace(" ", "T")}Z`).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</time></div>;
}

function JobApplications({ applications }) {
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Job applications</h2><p>Applicant details and CVs are visible only to managers.</p></div><span className="staff-count">{applications.length} applications</span></div>
    {applications.length === 0 ? <EmptyState>New applications will appear here.</EmptyState> : <div className="staff-card-list">{applications.map((application) => <article className="job-application-card" key={application.id}>
      <div className="job-application-heading"><div><h3>{application.firstName} {application.lastName}</h3><p>{application.desiredPosition}</p></div><time dateTime={application.createdAt}>{new Date(`${application.createdAt.replace(" ", "T")}Z`).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</time></div>
      <div className="job-application-contact"><a href={`mailto:${application.email}`}>{application.email}</a><a href={`tel:${application.phone}`}>{application.phone}</a></div>
      {application.message && <p className="job-application-message">{application.message}</p>}
      <a className="staff-secondary job-application-resume" href={`/api/manager/applications/${application.id}/resume`}><FileText size={15} /> Download {application.resumeName}</a>
    </article>)}</div>}
  </section>;
}

function ManagerActivity({ activities }) {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? activities : activities.filter((activity) => activity.entity === filter);
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Staff activity log</h2><p>Successful staff and manager changes, with account and timestamp.</p></div><span className="staff-count">{activities.length} latest events</span></div>
    <label className="activity-filter">Show activity for<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All activity</option><option value="orders">Orders & kitchen</option><option value="reservations">Reservations</option><option value="tables">Tables</option><option value="menu">Menu</option><option value="team">Staff accounts</option></select></label>
    {visible.length === 0 ? <EmptyState>No matching staff activity yet.</EmptyState> : <div className="activity-list">{visible.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>}
  </section>;
}

function TeamManagement({ users, busy, onAction }) {
  const [showPassword, setShowPassword] = useState(false);

  function createStaff(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
    onAction(async () => {
      await request("/api/manager/staff", null, { method: "POST", body: JSON.stringify(payload) });
      formElement.reset();
    }, "Staff account created. The team member must verify their work email before signing in.");
  }
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Staff accounts</h2><p>Create individual logins and turn off access when it is no longer needed.</p></div><span className="staff-count">{users.filter((user) => user.role === "staff" && user.active).length} active staff</span></div>
    <form className="staff-create-user" onSubmit={createStaff}>
      <label className="field-label">Staff name<input required name="name" minLength="2" maxLength="80" autoComplete="name" /></label>
      <label className="field-label">Work email<input required name="email" type="email" maxLength="254" autoComplete="email" /></label>
      <label className="field-label">Temporary password<span className="password-input-wrap"><input required name="password" type={showPassword ? "text" : "password"} minLength="12" maxLength="128" autoComplete="new-password" /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <p>Share the temporary password privately. The team member must verify their work email before signing in. Deactivate the account here when access is no longer needed.</p>
      <button disabled={busy} className="staff-primary"><Plus size={15} /> Create staff account</button>
    </form>
    <div className="staff-panel staff-team-list"><div className="staff-panel-head"><div><h2>Team roster</h2><p>Managers and staff with access to restaurant operations</p></div></div>
      {users.map((member) => <div className="staff-list-row" key={member.id}><div className="staff-row-avatar"><UsersRound size={16} /></div><div className="staff-row-main"><strong>{member.name}{member.id === users.find((user) => user.role === "manager" && user.active)?.id ? " · manager" : ""}</strong><small>{member.email} · joined {member.createdAt.slice(0, 10)}</small></div><StatusPill>{member.active ? "available" : "cancelled"}</StatusPill>{member.role === "staff" && <button disabled={busy} className="staff-secondary" onClick={() => onAction(() => request(`/api/manager/staff/${member.id}`, null, { method: "PATCH", body: JSON.stringify({ active: !member.active }) }), `${member.name}'s account ${member.active ? "deactivated" : "activated"}.`)}>{member.active ? "Deactivate" : "Reactivate"}</button>}</div>)}
      {users.length === 0 && <EmptyState>No staff accounts have been created.</EmptyState>}
    </div>
  </section>;
}

function OrderRow({ order }) {
  return <div className="staff-list-row"><div className="staff-row-avatar"><ChefHat size={16} /></div><div className="staff-row-main"><strong>{order.orderNumber}</strong><small>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</small></div><StatusPill>{order.status}</StatusPill></div>;
}

function EmptyState({ children }) {
  return <div className="staff-empty">{children}</div>;
}

function Tables({ tables, busy, onAction, pin }) {
  function addTable(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { name: form.get("name"), seats: Number(form.get("seats")) };
    onAction(async () => {
      await request("/api/staff/tables", pin, { method: "POST", body: JSON.stringify(payload) });
      formElement.reset();
    }, "Table added.");
  }
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Dining room</h2><p>Track table capacity and live service status.</p></div><span className="staff-count">{tables.length} tables</span></div>
    <form className="staff-inline-form" onSubmit={addTable}><input name="name" required minLength="2" maxLength="40" placeholder="New table name" /><input name="seats" required type="number" min="1" max="20" defaultValue="2" aria-label="Number of seats" /><button disabled={busy} className="staff-primary staff-small"><Plus size={15} /> Add table</button></form>
    <div className="table-grid">{tables.map((table) => <article className={`table-card table-${table.status}`} key={table.id}><div className="table-card-top"><span className="table-icon"><Utensils size={17} /></span><StatusPill>{table.status}</StatusPill></div><h3>{table.name}</h3><p>{table.seats} seats</p><label className="staff-select-label">Set status<select value={table.status} disabled={busy} onChange={(event) => onAction(() => request(`/api/staff/tables/${table.id}`, pin, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }), `${table.name} updated.`)}>{tableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></article>)}</div>
  </section>;
}

function Reservations({ reservations, tables, busy, onAction, pin }) {
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Guest bookings</h2><p>Confirm requests and assign a table with enough seats.</p></div><span className="staff-count">{reservations.filter((booking) => booking.status === "requested").length} awaiting confirmation</span></div>
    {reservations.length === 0 ? <EmptyState>New table requests will show here.</EmptyState> : <div className="staff-card-list">{reservations.map((booking) => <article className="reservation-card" key={booking.id}>
      <div className="reservation-card-head"><div><h3>{booking.customerName}</h3><p>{booking.date} at {booking.time} · {booking.partySize} guests · {booking.phone}</p></div><StatusPill>{booking.status}</StatusPill></div>
      {booking.notes && <p className="reservation-note">“{booking.notes}”</p>}
      <div className="reservation-actions"><label className="staff-select-label">Table<select aria-label={`Table for ${booking.customerName}`} defaultValue={booking.tableId ?? ""} id={`reservation-table-${booking.id}`}><option value="">Unassigned</option>{tables.filter((table) => table.seats >= booking.partySize).map((table) => <option key={table.id} value={table.id}>{table.name} · {table.seats} seats</option>)}</select></label><label className="staff-select-label">Status<select aria-label={`Status for ${booking.customerName}`} defaultValue={booking.status} id={`reservation-status-${booking.id}`}>{reservationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button disabled={busy} className="staff-primary staff-small" onClick={() => {
        const tableValue = document.getElementById(`reservation-table-${booking.id}`).value;
        const status = document.getElementById(`reservation-status-${booking.id}`).value;
        onAction(() => request(`/api/staff/reservations/${booking.id}`, pin, { method: "PATCH", body: JSON.stringify({ status, tableId: tableValue ? Number(tableValue) : null }) }), "Reservation updated.");
      }}>Save</button></div>
    </article>)}</div>}
  </section>;
}

function MenuManagement({ menuItems, busy, onAction, pin, manager }) {
  const [editingId, setEditingId] = useState(null);

  function addMenuItem(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: form.get("name"),
      description: form.get("description"),
      category: form.get("category"),
      subcategory: form.get("subcategory"),
      beverageGroup: form.get("beverageGroup") || null,
      price: Number(form.get("price")),
      imageUrl: form.get("imageUrl"),
      badge: form.get("badge"),
      stockQuantity: form.get("stockQuantity") === "" ? null : Number(form.get("stockQuantity")),
      lowStockThreshold: Number(form.get("lowStockThreshold")),
    };
    onAction(async () => {
      await request("/api/staff/menu", pin, { method: "POST", body: JSON.stringify(payload) });
      formElement.reset();
    }, "Dish added to the menu.");
  }

  function updateMenuItem(event, item) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"),
      description: form.get("description"),
      category: form.get("category"),
      subcategory: form.get("subcategory"),
      beverageGroup: form.get("beverageGroup") || null,
      price: Number(form.get("price")),
      imageUrl: form.get("imageUrl"),
      badge: form.get("badge"),
    };
    onAction(async () => {
      await request(`/api/staff/menu/${item.id}`, pin, { method: "PUT", body: JSON.stringify(payload) });
      setEditingId(null);
    }, `${item.name} updated.`);
  }

  function updateStock(event, item) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = form.get("stockQuantity");
    const payload = {
      stockQuantity: quantity === "" ? null : Number(quantity),
      lowStockThreshold: Number(form.get("lowStockThreshold")),
    };
    onAction(
      () => request(`/api/staff/menu/${item.id}/stock`, pin, { method: "PATCH", body: JSON.stringify(payload) }),
      `${item.name} stock updated.`,
    );
  }

  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Menu management</h2><p>{manager ? "Add, edit, categorize, price, and manage stock for menu items." : "Browse the menu and mark dishes unavailable when needed. Managers can add and edit items."}</p></div><span className="staff-count">{menuItems.filter((item) => item.available).length} available</span></div>
    {manager && <details className="staff-add-menu"><summary><Plus size={16} /> Add a menu item</summary><form className="staff-menu-form" onSubmit={addMenuItem}>
      <label className="field-label">Dish or product name<input required name="name" minLength="2" maxLength="80" /></label>
      <label className="field-label">Menu category<select name="category" defaultValue="Local food">{menuCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label className="field-label">Subcategory<input required name="subcategory" list="menu-subcategory-options" minLength="2" maxLength="40" placeholder="Choose or type a subsection" /></label>
      <label className="field-label">Drink category<select name="beverageGroup" defaultValue=""><option value="">Not a drink (choose for Drinks)</option>{beverageGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
      <label className="field-label">Price in GH₵<input required name="price" type="number" min="0" max="100000" step="0.01" /></label>
      <label className="field-label">Stock quantity (blank = untracked)<input name="stockQuantity" type="number" min="0" max="100000" step="1" placeholder="Not tracked" /></label>
      <label className="field-label">Low-stock alert at<input required name="lowStockThreshold" type="number" min="0" max="100000" step="1" defaultValue="5" /></label>
      <label className="field-label">Badge (optional)<input name="badge" maxLength="40" placeholder="Guest favourite" /></label>
      <label className="field-label staff-menu-wide">Description<textarea required name="description" minLength="5" maxLength="300" rows="2" /></label>
      <label className="field-label staff-menu-wide">Photo URL or local path<input required name="imageUrl" type="text" placeholder="https://… or /images/…" /></label>
      <datalist id="menu-subcategory-options">{[...new Set([...beverageSubcategories, "Kenkey", "Abomu with plantains", "Fufuo line", "Banku line", "Red red", "International favourites", "Ghanaian favourites"])].map((subcategory) => <option key={subcategory} value={subcategory} />)}</datalist>
      <button disabled={busy} className="staff-primary staff-menu-wide"><Plus size={15} /> Save menu item</button>
    </form></details>}
    <div className="staff-menu-list">{menuItems.map((item) => <div key={item.id}>
      <article className={`staff-menu-row ${item.available ? "" : "is-unavailable"}`}><img src={item.imageUrl} alt="" /><div className="staff-menu-info"><strong>{item.name}</strong><small>{item.category}{item.beverageGroup ? ` · ${item.beverageGroup}` : ""} · {item.subcategory} · {money(item.price)}</small></div><span className={`staff-availability ${!item.listedAvailable || item.stockQuantity === 0 ? "" : item.stockQuantity !== null && item.stockQuantity <= item.lowStockThreshold ? "low-stock" : "available"}`}>{!item.listedAvailable ? "Unavailable" : item.stockQuantity === null ? "Available · untracked" : item.stockQuantity === 0 ? "Out of stock" : item.stockQuantity <= item.lowStockThreshold ? `Low stock · ${item.stockQuantity}` : `${item.stockQuantity} in stock`}</span>{manager && <button disabled={busy} className="staff-secondary" onClick={() => setEditingId(editingId === item.id ? null : item.id)}>{editingId === item.id ? "Close" : "Edit"}</button>}<button disabled={busy} className="staff-secondary" onClick={() => onAction(() => request(`/api/staff/menu/${item.id}`, pin, { method: "PATCH", body: JSON.stringify({ available: !item.listedAvailable }) }), `${item.name} marked ${item.listedAvailable ? "unavailable" : "available"}.`)}>{item.listedAvailable ? "Mark unavailable" : "Make available"}</button></article>
      {manager && <form className="staff-stock-form" onSubmit={(event) => updateStock(event, item)}>
        <label className="field-label">Quantity<input aria-label={`${item.name} stock quantity`} name="stockQuantity" type="number" min="0" max="100000" step="1" defaultValue={item.stockQuantity ?? ""} placeholder="Untracked" /></label>
        <label className="field-label">Low-stock alert<input aria-label={`${item.name} low-stock threshold`} required name="lowStockThreshold" type="number" min="0" max="100000" step="1" defaultValue={item.lowStockThreshold} /></label>
        <button disabled={busy} className="staff-secondary">Update stock</button>
      </form>}
      {manager && editingId === item.id && <form className="staff-menu-form staff-edit-menu" onSubmit={(event) => updateMenuItem(event, item)}>
        <label className="field-label">Dish or product name<input required name="name" minLength="2" maxLength="80" defaultValue={item.name} /></label>
        <label className="field-label">Menu category<select name="category" defaultValue={item.category}>{menuCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="field-label">Subcategory<input required name="subcategory" list="menu-subcategory-options" minLength="2" maxLength="40" defaultValue={item.subcategory} /></label>
        <label className="field-label">Drink category<select name="beverageGroup" defaultValue={item.beverageGroup || ""}><option value="">Not a drink (choose for Drinks)</option>{beverageGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        <label className="field-label">Price in GH₵<input required name="price" type="number" min="0" max="100000" step="0.01" defaultValue={item.price} /></label><label className="field-label">Badge<input name="badge" maxLength="40" defaultValue={item.badge || ""} /></label>
        <label className="field-label staff-menu-wide">Description<textarea required name="description" minLength="5" maxLength="300" rows="2" defaultValue={item.description} /></label><label className="field-label staff-menu-wide">Photo URL or local path<input required name="imageUrl" type="text" defaultValue={item.imageUrl} /></label>
        <button disabled={busy} className="staff-primary staff-menu-wide">Save changes</button>
      </form>}
    </div>)}</div>
  </section>;
}

function Orders({ orders, busy, onAction, pin }) {
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>All orders</h2><p>Review guest details and update order progress.</p></div><span className="staff-count">{orders.length} total</span></div>
    {orders.length === 0 ? <EmptyState>Guest orders will appear here.</EmptyState> : <div className="staff-card-list">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-card-top"><div><h3>{order.orderNumber}</h3><p>{order.customerName} · {order.phone} · {order.orderType}</p></div><strong>{money(order.total)}</strong></div><div className="order-card-items">{order.items.map((item, index) => <span key={`${order.id}-${index}`}>{item.quantity} × {item.name}</span>)}</div><div className="order-card-bottom"><StatusPill>{order.status}</StatusPill><label className="staff-select-label">Update status<select value={order.status} disabled={busy} onChange={(event) => onAction(() => request(`/api/staff/orders/${order.id}`, pin, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) }), `${order.orderNumber} marked ${event.target.value}.`)}>{orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></article>)}</div>}
  </section>;
}

function Kitchen({ orders, busy, onAction, pin }) {
  const columns = [
    { status: "received", title: "New", next: "preparing", button: "Start preparing" },
    { status: "preparing", title: "Preparing", next: "ready", button: "Mark ready" },
    { status: "ready", title: "Ready to serve", next: "completed", button: "Complete order" },
  ];
  return <section className="staff-content">
    <div className="staff-section-intro"><div><h2>Kitchen display</h2><p>Move each ticket forward as the kitchen works.</p></div><span className="staff-live"><i /> Updates every 15 seconds</span></div>
    <div className="kitchen-board">{columns.map((column) => {
      const tickets = orders.filter((order) => order.status === column.status);
      return <section className="kitchen-column" key={column.status}><header><h3>{column.title}</h3><span>{tickets.length}</span></header>
        {tickets.map((order) => <article className="kitchen-ticket" key={order.id}><div className="kitchen-ticket-head"><strong>{order.orderNumber}</strong><span>{order.orderType}</span></div><p className="kitchen-customer">{order.customerName} · {order.phone}</p><ul>{order.items.map((item, index) => <li key={`${order.id}-${index}`}><b>{item.quantity}×</b> {item.name}</li>)}</ul><div className="kitchen-ticket-footer"><span>{money(order.total)}</span><button disabled={busy} className="staff-primary staff-small" onClick={() => onAction(() => request(`/api/staff/orders/${order.id}`, pin, { method: "PATCH", body: JSON.stringify({ status: column.next }) }), `${order.orderNumber} moved to ${column.next}.`)}>{column.button}</button></div></article>)}
        {tickets.length === 0 && <EmptyState>Nothing here right now.</EmptyState>}
      </section>;
    })}</div>
  </section>;
}

export default StaffDashboard;
