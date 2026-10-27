"""Live notifications across roles, in separate browsers at the same time (local stack + Realtime emulator).
Customer books -> office sees it live; office assigns a driver -> driver and customer are told live;
office confirms -> customer's account updates without a refresh; driver completes -> office and customer are told.
Also checks what each staff role may open."""
import datetime, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"; SHOTS = "/tmp/shots"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
def sql(q):
    return subprocess.run(["su", "postgres", "-c", f'psql -d ijt_e2e -Atc "{q}"'], capture_output=True, text=True).stdout.strip()
travel = (datetime.date.today() + datetime.timedelta(days=4)).isoformat()
WA = lambda r: r.fulfill(status=200, content_type="text/html", body="<title>WhatsApp</title>")
# Count chimes: each chime starts two oscillators.
CHIME_PROBE = "window.__osc = 0; const s = OscillatorNode.prototype.start; OscillatorNode.prototype.start = function (...a) { window.__osc++; return s.apply(this, a); };"
chimes = lambda page: page.evaluate("window.__osc") // 2
def toast(page, text):
    return page.locator("[aria-live=polite] [role=status]").filter(has_text=text)
def staff_login(page, email, password):
    page.goto(f"{BASE}/admin/login", wait_until="networkidle")
    page.get_by_label("Email").fill(email); page.locator("input[autocomplete=current-password]").fill(password)
    page.get_by_role("button", name="Sign in").click()

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    def context(w=1440, h=900):
        c = browser.new_context(viewport={"width": w, "height": h}); c.route("https://wa.me/**", WA); c.add_init_script(CHIME_PROBE); return c
    office_ctx, driver_ctx, cust_ctx, owner_ctx = context(), context(390, 844), context(), context()
    office, driver, cust, owner = office_ctx.new_page(), driver_ctx.new_page(), cust_ctx.new_page(), owner_ctx.new_page()
    errors = []
    for pg in (office, driver, cust, owner): pg.on("pageerror", lambda e: errors.append(str(e)))

    # ---- roles: what each person can open ----
    staff_login(office, "office@test.local", "office-password-123")
    expect(office.get_by_role("heading", name="Bookings & Enquiries").or_(office.get_by_role("heading", name="Dashboard"))).to_be_visible()
    nav = office.get_by_role("navigation").first.inner_text()
    check("roles: office staff see bookings, enquiries and messages", all(x in nav for x in ("Bookings & Enquiries", "Contacts", "Notifications")), nav.replace("\n", " | ")[:120])
    check("roles: office staff do not see website settings or staff links", not any(x in nav for x in ("Website Settings", "SEO", "Theme", "Staff & Drivers")))
    office.goto(f"{BASE}/admin/settings", wait_until="networkidle")
    check("roles: office staff opening settings by URL are stopped", office.get_by_text("Only the owner can change this").is_visible())
    office.goto(f"{BASE}/admin/admins", wait_until="networkidle")
    check("roles: office staff cannot manage staff", office.get_by_text("Only the owner can change this").is_visible())
    r = sql("set role authenticated; set request.jwt.claims = '{\\\"sub\\\":\\\"00000000-0000-0000-0000-0000000000cc\\\",\\\"role\\\":\\\"authenticated\\\"}'; update site_settings set business_name = 'Hacked' returning 1")
    check("roles: database refuses settings changes from office staff", "1" not in r.splitlines() and sql("select business_name from site_settings limit 1") != "Hacked", r)

    staff_login(driver, "driver@test.local", "driver-password-123")
    expect(driver.get_by_role("heading", name="My trips")).to_be_visible()
    check("roles: a driver lands on their own trip screen", driver.url.endswith("/admin/trips"))
    driver.goto(f"{BASE}/admin/bookings", wait_until="networkidle")
    check("roles: a driver cannot open the bookings dashboard", driver.get_by_role("heading", name="Bookings & Enquiries").count() == 0)
    driver.goto(f"{BASE}/admin/trips", wait_until="networkidle")
    expect(driver.get_by_role("heading", name="My trips")).to_be_visible()

    staff_login(owner, "owner@test.local", "correct-horse-battery")
    owner.goto(f"{BASE}/admin/bookings", wait_until="networkidle")
    expect(owner.get_by_role("heading", name="Bookings & Enquiries")).to_be_visible()
    office.goto(f"{BASE}/admin/bookings", wait_until="networkidle")
    expect(office.get_by_role("heading", name="Bookings & Enquiries")).to_be_visible()

    cust.goto(f"{BASE}/login", wait_until="networkidle")
    cust.get_by_label("Email").fill("visitor@test.local"); cust.get_by_label("Password").fill("visitor-password-123"); cust.get_by_role("button", name="Login").click()
    cust.wait_for_url("**/account")
    for pg in (office, driver, cust, owner):
        expect(pg.locator("[role=status][title='Updates arrive instantly.']").first).to_be_attached(timeout=10000)
    check("live: every role shows a live connection", True)
    office.wait_for_timeout(500)
    base_office, base_owner, base_driver, base_cust = chimes(office), chimes(owner), chimes(driver), chimes(cust)

    # ---- 1. customer books -> office and owner see it live ----
    cust.goto(f"{BASE}/book", wait_until="networkidle")
    cust.get_by_label("Pickup", exact=False).first.fill("Thanjavur"); cust.get_by_label("Destination", exact=False).first.fill("Velankanni")
    cust.get_by_label("Travel date").fill(travel); cust.get_by_label("Travel time").fill("06:30"); cust.get_by_label("Number of members").fill("4")
    cust.get_by_role("button", name="Continue to Details").click()
    expect(cust.get_by_role("heading", name="Travel Details")).to_be_visible()
    if cust.get_by_label("Full name").input_value() == "": cust.get_by_label("Full name").fill("Visitor Test")
    if cust.get_by_label("Phone number").input_value() == "": cust.get_by_label("Phone number").fill("9000011111")
    cust.get_by_role("button", name="Find a Vehicle").click()
    expect(cust.get_by_role("heading", name="Vehicle Recommendation")).to_be_visible()
    cust.get_by_role("button", name="Review Request").click()
    with cust_ctx.expect_page() as pop: cust.get_by_role("button", name="Submit Booking Request").click()
    pop.value.close()
    expect(cust.get_by_role("heading", name="Booking Request Received")).to_be_visible()
    REF = cust.locator("text=/^IJT-\\d{4}$/").first.inner_text()

    expect(toast(office, f"New Booking Request · {REF}")).to_be_visible(timeout=8000)
    check("1: office gets a popup the moment the customer books", True)
    check("1: office hears the chime", chimes(office) > base_office, f"{chimes(office)} vs {base_office}")
    expect(office.get_by_role("rowheader", name=REF)).to_be_visible(timeout=8000)
    check("1: the new booking appears in the office table without a refresh", True)
    check("1: office bell shows the unread count", "unread" in (office.get_by_role("button", name="Notifications", exact=False).first.get_attribute("aria-label") or ""))
    expect(toast(owner, f"New Booking Request · {REF}")).to_be_visible(timeout=8000)
    check("1: owner is told too", True)
    office.screenshot(path=f"{SHOTS}/live-office-new-booking.png")
    cust.goto(f"{BASE}/account", wait_until="networkidle")
    check("1: customer gets no popup for their own booking", toast(cust, "Booking Request Received").count() == 0 and chimes(cust) == base_cust)
    check("1: driver is not told about unassigned bookings", toast(driver, REF).count() == 0)

    # ---- 2. office assigns the driver -> driver and customer are told live ----
    cust.evaluate("window.__noReload = true")
    office.get_by_label(f"Driver for {REF}").locator("visible=true").select_option(label="Arul")
    expect(toast(driver, f"New trip assigned · {REF}")).to_be_visible(timeout=8000)
    check("2: driver gets a popup when a trip is assigned", True)
    check("2: driver hears the chime", chimes(driver) > base_driver)
    expect(driver.get_by_text(REF).first).to_be_visible(timeout=8000)
    check("2: the trip appears in the driver's list without a refresh", True)
    driver.screenshot(path=f"{SHOTS}/live-driver-assigned.png")
    expect(toast(cust, "Driver assigned")).to_be_visible(timeout=8000)
    check("2: customer is told a driver was assigned", "Arul" in toast(cust, "Driver assigned").first.inner_text())
    expect(toast(owner, f"Driver assigned · {REF}")).to_be_visible(timeout=8000)
    check("2: owner sees the assignment", True)
    check("2: office gets no popup for its own action", toast(office, f"Driver assigned · {REF}").count() == 0)

    # ---- 3. office confirms -> customer account updates live ----
    office.get_by_label(f"Status for {REF}").locator("visible=true").select_option("Confirmed")
    expect(toast(cust, "Booking Status Updated")).to_be_visible(timeout=8000)
    check("3: customer gets a popup when the status changes", True)
    card = cust.locator("li, article").filter(has_text=REF).last
    expect(card.get_by_text("Confirmed")).to_be_visible(timeout=8000)
    check("3: customer's booking list updates without a refresh", cust.evaluate("window.__noReload === true"))
    expect(toast(driver, f"Trip status updated · {REF}")).to_be_visible(timeout=8000)
    check("3: driver is told the trip was confirmed", True)
    cust.screenshot(path=f"{SHOTS}/live-customer-confirmed.png")

    # ---- 4. driver completes -> office and customer are told ----
    trip = driver.locator("article, li").filter(has_text=REF).last
    expect(trip.get_by_role("button", name="Mark trip completed")).to_be_visible(timeout=8000)
    trip.get_by_role("button", name="Mark trip completed").click()
    driver.get_by_role("dialog").get_by_role("button", name="Mark completed", exact=False).click()
    expect(toast(office, f"Booking Status Updated · {REF}")).to_be_visible(timeout=8000)
    check("4: office is told live when the driver completes the trip", sql(f"select status from bookings where reference='{REF}'") == "Trip Completed")
    expect(office.get_by_label(f"Status for {REF}").locator("visible=true")).to_have_value("Trip Completed", timeout=8000)
    check("4: office table shows Completed without a refresh", True)
    expect(cust.locator("li, article").filter(has_text=REF).last.get_by_text("Completed")).to_be_visible(timeout=8000)
    check("4: customer sees Completed without a refresh", cust.evaluate("window.__noReload === true"))
    check("4: driver gets no popup for their own action", toast(driver, f"Trip status updated · {REF}").filter(has_text="Trip Completed").count() == 0)
    driver.screenshot(path=f"{SHOTS}/live-driver-completed.png")

    # ---- 5. contact message -> office live; customers never see office notifications ----
    pub = cust_ctx.new_page(); pub.goto(f"{BASE}/contact", wait_until="networkidle")
    pub.get_by_placeholder("Enter your name").fill("Live Tester"); pub.get_by_placeholder("Enter email").fill("live@example.com")
    pub.get_by_placeholder("How can we help?").fill("Testing live office alerts.")
    pub.get_by_role("button", name="Send Message").click()
    expect(toast(office, "New Contact Message")).to_be_visible(timeout=8000)
    check("5: office gets a popup for a new contact message", True)
    check("5: customer receives no office notifications", toast(cust, "New Contact Message").count() == 0 and toast(cust, "New Booking Request").count() == 0)
    check("5: driver receives no office notifications", toast(driver, "New Contact Message").count() == 0)

    # ---- 6. reconnect catch-up: changes made while offline are shown when the connection returns ----
    driver_ctx.set_offline(True); driver.wait_for_timeout(800)
    sql(f"update bookings set notes = 'Pick up at the main gate' where reference = '{REF}'")
    other = sql("insert into bookings (reference, request_type, customer_name, phone, pickup, destination, travel_date, members) values ('IJT-9001', 'Vehicle Booking','Offline Trip','9000033333','Thanjavur','Kumbakonam', current_date + 2, 2) returning reference").splitlines()[0]
    sql(f"update bookings set status = 'Confirmed', driver_id = '00000000-0000-0000-0000-0000000000dd' where reference = '{other}'")
    driver_ctx.set_offline(False)
    expect(driver.get_by_text(other).first).to_be_visible(timeout=15000)
    check("6: a trip assigned while the driver was offline appears after reconnecting", True)

    check("no page errors", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
