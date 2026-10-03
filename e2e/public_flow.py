"""End-to-end checks of the public site against the local stack (real Postgres + PostgREST + RLS)."""
import datetime, re, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"
SHOTS = "/tmp/shots"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
def sql(q):
    return subprocess.run(["su", "postgres", "-c", f'psql -d ijt_e2e -Atc "{q}"'], capture_output=True, text=True).stdout.strip()

travel = (datetime.date.today() + datetime.timedelta(days=5)).isoformat()
back = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.route("https://wa.me/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>WhatsApp</title>"))
    page = ctx.new_page()
    errors = []
    page.on("response", lambda r: print("HTTP", r.status, r.url[:90]) if r.status >= 400 and "rpc/create_booking" not in r.url else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "WebSocket" not in m.text and "realtime" not in m.text.lower() else None)

    # 1. Home renders live data from the database
    page.goto(BASE, wait_until="networkidle")
    expect(page.get_by_role("heading", level=1)).to_contain_text("Reliable Travel")
    check("home: company phone comes from site_settings", page.get_by_text("+91 98424 87017").count() > 0)
    check("home: vehicles from DB are listed", page.get_by_role("heading", name="Test Sedan").count() == 1)
    wa = page.locator('a[href^="https://wa.me/"]').first.get_attribute("href")
    check("home: WhatsApp link uses central number with country code", wa.startswith("https://wa.me/919842487017?text="), wa)
    page.screenshot(path=f"{SHOTS}/home-1440.png", full_page=True)

    # 2. Theme toggle persists as a UI preference only
    page.get_by_role("button", name="Switch to dark theme").click()
    check("theme: toggles to dark", page.evaluate("document.documentElement.classList.contains('dark')"))
    page.screenshot(path=f"{SHOTS}/home-dark-1440.png")
    keys = page.evaluate("Object.keys(localStorage)")
    check("storage: localStorage holds only the theme preference", [k for k in keys if "auth" not in k] == ["ijt-theme-pref"], str(keys))
    page.get_by_role("button", name="Switch to light theme").click()

    # 3. Booking flow: validation -> details -> vehicle -> review -> confirmed
    page.goto(f"{BASE}/book", wait_until="networkidle")
    page.get_by_role("button", name="Continue to Details").click()
    check("booking: empty step 1 shows validation errors", page.get_by_text("Please enter your pickup location.").is_visible())
    page.screenshot(path=f"{SHOTS}/book-1-errors.png", full_page=True)
    page.get_by_label("Pickup", exact=False).first.fill("Than")
    page.get_by_role("option", name="Thanjavur", exact=True).click()
    page.get_by_label("Destination", exact=False).first.fill("Chennai")
    page.get_by_label("Travel date").fill(travel)
    page.get_by_label("Travel time").fill("09:30")
    page.get_by_label("Number of members").fill("6")
    page.get_by_role("switch", name="Round trip").click()
    page.get_by_label("Return date").fill(back)
    page.get_by_label("Return time").fill("18:00")
    page.get_by_role("button", name="Continue to Details").click()
    expect(page.get_by_role("heading", name="Travel Details")).to_be_visible()
    page.get_by_role("button", name="Find a Vehicle").click()
    check("booking: step 2 requires name and phone", page.get_by_text("Please enter your full name.").is_visible())
    page.get_by_label("Full name").fill("  E2E   Customer ")
    page.get_by_label("Phone number").fill("12345")
    page.get_by_role("button", name="Find a Vehicle").click()
    check("booking: invalid phone rejected client-side", page.get_by_text("valid phone number").is_visible())
    page.get_by_label("Phone number").fill("+91 98765 43210")
    page.get_by_label("Email").fill("E2E.Customer@Example.com")
    page.get_by_label("Password", exact=False).first.fill("first-booking-pass"); page.get_by_label("Confirm password").fill("first-booking-pass")
    page.get_by_label("Notes").fill("Two large bags <script>alert(1)</script>")
    page.get_by_role("button", name="Find a Vehicle").click()
    expect(page.get_by_role("heading", name="Vehicle Recommendation")).to_be_visible()
    names = page.locator("article h3").all_inner_texts()
    check("booking: recommends smallest vehicles that seat 6", names[:1] == ["Test SUV"] and "Test Sedan" not in names, str(names))
    page.screenshot(path=f"{SHOTS}/book-3-vehicles.png", full_page=True)
    page.get_by_role("button", name="Select").first.click()
    page.get_by_role("button", name="Review Request").click()
    expect(page.get_by_role("heading", name="Review Your Request")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/book-4-review.png", full_page=True)
    before = int(sql("select count(*) from bookings"))
    with ctx.expect_page() as popup:
        page.get_by_role("button", name="Submit Booking Request").dblclick()   # double click must not create two bookings
    expect(page.get_by_role("heading", name="Booking Request Received")).to_be_visible()
    popup.value.wait_for_url("https://wa.me/**")
    check("whatsapp: opens automatically on the admin-configured number with the saved reference", popup.value.url.startswith("https://wa.me/919842487017?text=") and "Booking%20Reference%3A%20IJT-" in popup.value.url, popup.value.url[:70])
    check("whatsapp: page says the message still has to be sent", page.get_by_text("Press Send there").is_visible())
    check("booking: one account created for the first booking, booking linked to it", sql("select count(*) from bookings b join profiles p on p.id=b.customer_id where p.email='e2e.customer@example.com'") == "1")
    popup.value.close()
    ref = page.locator("text=/^IJT-\\d{4}$/").first.inner_text()
    after = int(sql("select count(*) from bookings"))
    check("booking: exactly one row created despite double click", after == before + 1, f"{before}->{after}")
    row = sql(f"select customer_name||'|'||status||'|'||vehicle_name||'|'||members||'|'||round_trip from bookings where reference='{ref}'")
    check("booking: server stored trimmed name, Pending status, vehicle snapshot", row == "E2E Customer|Pending|Test SUV|6|true", row)
    check("booking: notification created for admins", sql(f"select count(*) from notifications n join bookings b on b.id=n.booking_id where b.reference='{ref}'") == "1")
    wa = page.get_by_role("link", name="Send via WhatsApp").get_attribute("href")
    check("booking: WhatsApp message carries the server reference, encoded", f"Booking%20Reference%3A%20{ref}" in wa and "%3Cscript%3E" in wa)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download Booking Reference").click()
    check("booking: reference image downloads", dl.value.suggested_filename == f"{ref}-booking-reference.png", dl.value.suggested_filename)
    dl.value.save_as(f"{SHOTS}/reference.png")
    page.screenshot(path=f"{SHOTS}/book-5-confirmed.png", full_page=True)
    page.reload(wait_until="networkidle")
    check("booking: confirmation survives a refresh", page.get_by_text(ref).first.is_visible())

    # 4. A failed request never shows success
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_timeout(500)
    page.goto(f"{BASE}/instant-ride", wait_until="networkidle")
    page.route("**/rest/v1/rpc/create_booking", lambda r: r.abort())
    page.get_by_label("Name").fill("Offline User"); page.get_by_label("Phone").fill("9876511111")
    page.get_by_role("button", name="Request Instant Ride").click()
    expect(page.get_by_role("alert").filter(has_text="could not reach the server")).to_be_visible()
    check("errors: network failure shows an error and stays on the form", "/instant-ride" in page.url)
    page.unroute("**/rest/v1/rpc/create_booking")
    page.get_by_role("button", name="Request Instant Ride").click()
    expect(page.get_by_role("heading", name="Request Received")).to_be_visible()
    check("instant ride: retry succeeds with a reference", re.search(r"IJT-\d{4}", page.content()) is not None)

    # 5. Server-side validation message reaches the customer (past date forced past the client check)
    r = page.request.post("http://localhost:54321/rest/v1/rpc/create_booking", data={"payload": {"name": "Bob", "phone": "9876522222", "pickup": "A1", "destination": "B1", "travel_date": "2020-01-01", "travel_time": "10:00", "members": "2"}})
    check("server: rejects past date even if the client is bypassed", r.status == 400 and "past" in r.json()["message"], r.text())

    # 6. Contact form
    page.goto(f"{BASE}/contact", wait_until="networkidle")
    page.get_by_role("button", name="Send Message").click()
    check("contact: validation errors shown", page.get_by_text("Please enter your message.").is_visible())
    page.get_by_label("Name").fill("Meena"); page.get_by_label("Email").fill("meena@example.com"); page.get_by_label("Message").fill("Do you have a 12 seater?")
    page.get_by_role("button", name="Send Message").click()
    expect(page.get_by_role("status").filter(has_text="Message sent").first).to_be_visible()
    check("contact: message stored", sql("select count(*) from contact_messages where email='meena@example.com'") == "1")
    page.screenshot(path=f"{SHOTS}/contact.png", full_page=True)

    # 7. Offer enquiry
    page.goto(f"{BASE}/offers", wait_until="networkidle")
    page.get_by_role("button", name="Enquire on WhatsApp").click()
    page.get_by_label("Full name").fill("Ravi"); page.get_by_label("Phone number").fill("9876533333")
    page.get_by_role("button", name="Send Enquiry").click()
    expect(page.get_by_role("heading", name="Enquiry received")).to_be_visible()
    check("offer enquiry: title resolved server-side", sql("select subject_title from bookings where customer_name='Ravi'") == "Test Offer")
    page.screenshot(path=f"{SHOTS}/offer-enquiry.png")
    page.keyboard.press("Escape")

    # 8. Other pages render
    for path, heading in [("/vehicles", "Our Vehicles"), ("/packages", "Packages"), ("/destinations", "Destinations"), ("/gallery", "Moments From Our Journeys"), ("/about", "About"), ("/nope", "We couldn't find that page")]:
        page.goto(BASE + path, wait_until="networkidle")
        check(f"page {path} renders", page.get_by_role("heading", name=heading, exact=True).first.is_visible())
    page.goto(f"{BASE}/vehicles", wait_until="networkidle"); page.screenshot(path=f"{SHOTS}/vehicles-1440.png", full_page=True)

    # 9. No horizontal overflow and tap targets at every required width
    for w in [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]:
        page.set_viewport_size({"width": w, "height": 800})
        for path in ["/", "/book", "/vehicles", "/contact", "/instant-ride", "/offers"]:
            page.goto(BASE + path, wait_until="networkidle")
            over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            if over > 0: check(f"layout {path} @ {w}px has no horizontal scroll", False, f"overflow {over}px")
        small = page.evaluate("""() => [...document.querySelectorAll('main a.btn, main button, header button, header nav a')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 40 || r.width < 40); }).map(e => (e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))""")
        check(f"layout @ {w}px: no overflow, touch targets ≥ 40px", not small, str(small[:5]))
    for w in [320, 390, 768]:
        page.set_viewport_size({"width": w, "height": 800})
        page.goto(BASE, wait_until="networkidle"); page.screenshot(path=f"{SHOTS}/home-{w}.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 800})
    page.get_by_role("button", name="Menu").click()
    check("mobile nav opens", page.get_by_role("navigation", name="Mobile").is_visible())
    page.screenshot(path=f"{SHOTS}/mobile-menu-390.png")

    real = [e for e in errors if "Unable to send your request" not in e and "ERR_FAILED" not in e and "403" not in e and "400 (Bad Request)" not in e]  # 400 = the expected "no such login yet" probe before sign-up
    check("no uncaught page errors", not real, str(real[:3]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
