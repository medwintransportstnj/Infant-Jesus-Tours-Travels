"""End-to-end checks of the admin dashboard against the local stack (real Postgres + PostgREST + RLS)."""
import struct, subprocess, sys, zlib
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"
SHOTS = "/tmp/shots"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
def sql(q):
    return subprocess.run(["su", "postgres", "-c", f'psql -d ijt_e2e -Atc "{q}"'], capture_output=True, text=True).stdout.strip()
def png(path, w=640, h=400):
    raw = b"".join(b"\x00" + bytes([150, 70, 70]) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
png("/tmp/test-image.png"); open("/tmp/not-an-image.png", "w").write("<script>alert(1)</script>")

def login(page, email, password):
    page.get_by_label("Email").fill(email); page.locator("input[autocomplete=current-password]").fill(password)
    page.get_by_role("button", name="Sign in").click()

REF = sql("select reference from bookings where customer_name='E2E Customer'")
DEL = sql("select reference from bookings where customer_name='Offline User'")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.route("https://wa.me/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>WhatsApp</title>"))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- auth ---
    page.goto(f"{BASE}/admin/bookings", wait_until="networkidle")
    check("auth: protected route redirects to login", page.url.endswith("/admin/login"))
    page.screenshot(path=f"{SHOTS}/admin-login.png")
    login(page, "owner@test.local", "wrong-password")
    expect(page.get_by_role("alert")).to_contain_text("Incorrect email or password")
    check("auth: wrong password rejected", True)
    login(page, "visitor@test.local", "visitor-password-123")
    expect(page.get_by_role("alert")).to_contain_text("does not have staff access")
    check("auth: valid login without admin role is refused", "/admin/login" in page.url)
    login(page, "owner@test.local", "correct-horse-battery")
    expect(page.get_by_role("heading", name="Bookings & Enquiries")).to_be_visible()
    check("auth: owner signs in and returns to the requested page", page.url.endswith("/admin/bookings"))

    # --- bookings ---
    expect(page.get_by_role("rowheader", name=f"{REF}")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/admin-bookings.png", full_page=True)
    page.get_by_label(f"Status for {REF}").locator("visible=true").select_option("Confirmed")
    expect(page.get_by_text("Status updated")).to_be_visible()
    check("bookings: status change saved", sql(f"select status from bookings where reference='{REF}'") == "Confirmed")
    page.get_by_label("Search").fill("E2E"); page.wait_for_timeout(900)
    check("bookings: search filters server-side", page.get_by_role("rowheader").count() == 1)
    page.get_by_label("Search").fill("x,status.eq.Pending)"); page.wait_for_timeout(900)
    check("bookings: filter-syntax characters in search are neutralised", page.get_by_role("alert").count() == 0 and page.get_by_text("No requests match").is_visible())
    page.get_by_label("Search").fill(""); page.wait_for_timeout(900)
    page.get_by_role("button", name=f"View {REF}").locator("visible=true").click()
    check("bookings: details show customer text as plain text", page.get_by_text("<script>alert(1)</script>").is_visible())
    page.get_by_role("button", name="Edit", exact=True).click()
    page.get_by_label("Vehicle", exact=True).fill("Agreed Vehicle")
    page.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Request updated")).to_be_visible()
    check("bookings: edit saved, reference untouched", sql(f"select vehicle_name||'|'||reference from bookings where reference='{REF}'") == f"Agreed Vehicle|{REF}")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export").click()
    dl.value.save_as("/tmp/export.xlsx")
    check("bookings: Excel export downloads", dl.value.suggested_filename.endswith(".xlsx") and open("/tmp/export.xlsx", "rb").read(2) == b"PK", dl.value.suggested_filename)
    n = int(sql("select count(*) from bookings"))
    page.get_by_role("button", name=f"Delete {DEL}").locator("visible=true").click()
    page.get_by_role("button", name="Cancel").click()
    check("bookings: cancelling the confirm dialog deletes nothing", int(sql("select count(*) from bookings")) == n)
    page.get_by_role("button", name=f"Delete {DEL}").locator("visible=true").click()
    page.get_by_role("dialog").get_by_role("button", name="Delete").click()
    expect(page.get_by_text("Request deleted")).to_be_visible()
    check("bookings: delete after confirmation", int(sql("select count(*) from bookings")) == n - 1)

    # --- dashboard ---
    page.goto(f"{BASE}/admin", wait_until="networkidle")
    total = page.locator("li", has_text="Total Bookings").locator("p.text-3xl").inner_text()
    check("dashboard: totals match the database", total == sql("select count(*) from bookings"), total)
    page.screenshot(path=f"{SHOTS}/admin-dashboard.png", full_page=True)

    # --- vehicles + storage ---
    page.goto(f"{BASE}/admin/vehicles", wait_until="networkidle")
    page.get_by_role("button", name="Add Vehicle").click()
    page.get_by_role("button", name="Save").click()
    check("vehicles: required name enforced", page.get_by_text("Vehicle name is required.").is_visible())
    page.locator('input[type=file]').set_input_files("/tmp/not-an-image.png")
    expect(page.get_by_text("could not be read as an image")).to_be_visible()
    check("upload: a non-image disguised as .png is rejected", True)
    page.locator('input[type=file]').set_input_files("/tmp/test-image.png")
    expect(page.get_by_text("Ready to upload")).to_be_visible()
    page.get_by_label("Vehicle name").fill("E2E Innova"); page.get_by_label("Capacity (seats)").fill("7")
    page.screenshot(path=f"{SHOTS}/admin-vehicle-modal.png")
    page.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Saved successfully")).to_be_visible()
    path = sql("select image_path from vehicles where name='E2E Innova'")
    check("vehicles: created with a storage path, not base64", path.startswith("vehicles/") and path.endswith((".webp", ".jpg")), path)
    page.get_by_role("button", name="Edit E2E Innova").click()
    page.get_by_label("Capacity (seats)").fill("8"); page.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Saved successfully").last).to_be_visible(); page.wait_for_timeout(400)
    check("vehicles: edit saved", sql("select capacity from vehicles where name='E2E Innova'") == "8")
    page.goto(f"{BASE}/vehicles", wait_until="networkidle")
    img = page.locator('img[alt="E2E Innova"]')
    check("vehicles: new vehicle and its image appear on the public site", img.count() == 1 and img.evaluate("e => e.naturalWidth > 0"))
    page.goto(f"{BASE}/admin/vehicles", wait_until="networkidle")
    page.get_by_role("button", name="Delete E2E Innova").click()
    page.get_by_role("dialog").get_by_role("button", name="Delete").click()
    expect(page.get_by_text("Vehicle deleted")).to_be_visible()
    check("vehicles: deleted", sql("select count(*) from vehicles where name='E2E Innova'") == "0")
    page.locator("#vcat-input").fill("Luxury"); page.get_by_role("button", name="Add", exact=True).click()
    expect(page.get_by_text("Category added")).to_be_visible()
    check("vehicle categories: added", sql("select count(*) from vehicle_categories where name='Luxury'") == "1")

    # --- generic CRUD modules ---
    def crud(path, add, fills, table, where):
        page.goto(f"{BASE}/admin/{path}", wait_until="networkidle")
        page.get_by_role("button", name=add).first.click()
        for label, value in fills: page.get_by_role("dialog").get_by_label(label).first.fill(value)
        page.get_by_role("dialog").locator('button[type=submit]').click()
        expect(page.get_by_text("Saved successfully")).to_be_visible()
        check(f"{path}: create", sql(f"select count(*) from {table} where {where}") == "1")
        page.get_by_role("button", name="Delete " + fills[0][1]).click()
        page.get_by_role("dialog").get_by_role("button", name="Delete").click()
        page.wait_for_timeout(700)
        check(f"{path}: delete", sql(f"select count(*) from {table} where {where}") == "0")
    crud("packages", "Add Package", [("Title", "E2E Package")], "packages", "title='E2E Package'")
    crud("destinations", "Add Destination", [("Name", "E2E Place"), ("Distance / details", "50 km")], "destinations", "name='E2E Place'")
    crud("offers", "Add Offer", [("Title", "E2E Offer"), ("Expiry date", "2030-01-01")], "offers", "title='E2E Offer'")
    crud("testimonials", "Add Testimonial", [("Customer name", "E2E Reviewer"), ("Review", "Good trip")], "testimonials", "customer_name='E2E Reviewer'")

    # --- offers enable/disable reaches the public site ---
    page.goto(f"{BASE}/admin/offers", wait_until="networkidle")
    page.get_by_role("button", name="Hide Test Offer on website").click()
    expect(page.get_by_text("Offer disabled")).to_be_visible()
    page.goto(f"{BASE}/offers", wait_until="networkidle")
    check("offers: disabled offer disappears from the public site", page.get_by_text("No offers available").is_visible())

    # --- gallery ---
    page.goto(f"{BASE}/admin/gallery", wait_until="networkidle")
    page.get_by_role("button", name="Add Image").first.click()
    page.get_by_role("button", name="Publish").click()
    check("gallery: image is required", page.get_by_text("Please upload an image.").is_visible())
    page.locator('input[type=file]').set_input_files("/tmp/test-image.png")
    expect(page.get_by_text("Ready to upload")).to_be_visible()
    page.get_by_label("Caption").fill("E2E Moment"); page.get_by_role("button", name="Publish").click()
    expect(page.get_by_text("Saved successfully")).to_be_visible()
    page.goto(f"{BASE}/gallery", wait_until="networkidle")
    check("gallery: published image shows on the public gallery", page.locator('img[alt="E2E Moment"]').count() == 1)
    page.goto(f"{BASE}/admin/gallery", wait_until="networkidle")
    page.get_by_role("button", name="Hide E2E Moment on website").click(); page.wait_for_timeout(700)
    page.goto(f"{BASE}/gallery", wait_until="networkidle")
    check("gallery: hidden image is removed from the public gallery", page.locator('img[alt="E2E Moment"]').count() == 0)

    # --- contacts / notifications ---
    page.goto(f"{BASE}/admin/contacts", wait_until="networkidle")
    check("contacts: message listed", page.get_by_text("Do you have a 12 seater?").is_visible())
    page.goto(f"{BASE}/admin/notifications", wait_until="networkidle")
    page.screenshot(path=f"{SHOTS}/admin-notifications.png")
    page.get_by_role("button", name="Mark all read").click(); page.wait_for_timeout(800)
    check("notifications: mark all read", sql("select count(*) from notifications where not is_read") == "0")

    # --- settings ---
    page.goto(f"{BASE}/admin/social", wait_until="networkidle")
    page.get_by_label("WhatsApp number or link").fill("+91 90000 11111")
    page.get_by_label("Facebook").fill("javascript:alert(1)")
    page.get_by_role("button", name="Save links").click()
    check("social: non-https link refused", page.get_by_text("must be a full link starting with https://").is_visible())
    page.get_by_label("Facebook").fill("https://facebook.com/example")
    page.get_by_role("button", name="Save links").click()
    expect(page.get_by_text("WhatsApp & social links saved")).to_be_visible()
    page.goto(BASE, wait_until="networkidle")
    hrefs = page.locator('header a[href*="wa.me"], main a[href*="wa.me"]').evaluate_all("els => [...new Set(els.map(e => e.href.split('?')[0]))]")
    check("whatsapp: every button on the site follows the one central number", hrefs == ["https://wa.me/919000011111"], str(hrefs))

    page.goto(f"{BASE}/admin/settings", wait_until="networkidle")
    page.get_by_label("Phone").fill("+91 90000 22222")
    page.get_by_label("Google Maps embed").fill("https://evil.example/frame")
    page.get_by_role("button", name="Save settings").click()
    check("settings: non-Google map embed refused", page.get_by_text("must be a Google Maps embed link").is_visible())
    page.get_by_label("Google Maps embed").fill('<iframe src="https://www.google.com/maps/embed?pb=test" width="600"></iframe>')
    page.get_by_role("button", name="Save settings").click()
    expect(page.get_by_text("Website settings saved")).to_be_visible()
    check("settings: phone + map saved (iframe snippet reduced to its URL)", sql("select phone||'|'||map_embed_url from site_settings") == "+91 90000 22222|https://www.google.com/maps/embed?pb=test")

    page.goto(f"{BASE}/admin/seo", wait_until="networkidle")
    page.get_by_label("Site title").fill("E2E Title"); page.get_by_role("button", name="Save SEO settings").click()
    expect(page.get_by_text("SEO settings saved")).to_be_visible()
    page.goto(BASE, wait_until="networkidle")
    check("seo: public <title> follows SEO settings", page.title() == "E2E Title", page.title())

    page.goto(f"{BASE}/admin/pages", wait_until="networkidle")
    page.get_by_role("button", name="Edit").nth(2).click()
    page.get_by_label("Heading").fill("E2E Heading"); page.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Page content saved")).to_be_visible()
    check("pages: content saved", sql("select count(*) from page_content where heading='E2E Heading'") == "1")

    page.goto(f"{BASE}/admin/theme", wait_until="networkidle")
    page.get_by_role("radio", name="Eye-comfort dark").click(); page.wait_for_timeout(800)
    check("theme: site default saved", sql("select default_theme from site_settings") == "dark")
    fresh = browser.new_context().new_page(); fresh.goto(BASE, wait_until="networkidle")
    check("theme: a new visitor gets the site default", fresh.evaluate("document.documentElement.classList.contains('dark')"))

    page.goto(f"{BASE}/admin/admins", wait_until="networkidle")
    page.get_by_label("Email").fill("visitor@test.local"); page.get_by_role("button", name="Add Office staff").click()
    expect(page.get_by_text("Office staff added")).to_be_visible()
    check("admins: owner grants access", sql("select count(*) from admins") == "4")
    page.screenshot(path=f"{SHOTS}/admin-admins.png", full_page=True)

    # --- mobile layout + logout ---
    page.set_viewport_size({"width": 390, "height": 844})
    for path in ["", "/bookings", "/vehicles", "/gallery", "/settings", "/notifications"]:
        page.goto(f"{BASE}/admin{path}", wait_until="networkidle")
        over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        if over > 0: check(f"admin{path} @390 no horizontal scroll", False, f"{over}px")
    page.goto(f"{BASE}/admin/bookings", wait_until="networkidle"); page.screenshot(path=f"{SHOTS}/admin-bookings-390.png", full_page=True)
    page.get_by_role("button", name="Open menu").click(); page.screenshot(path=f"{SHOTS}/admin-menu-390.png")
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url("**/admin/login")
    page.goto(f"{BASE}/admin", wait_until="networkidle")
    check("auth: after sign-out the dashboard is locked again", page.url.endswith("/admin/login"))
    check("no uncaught page errors", not errors, str(errors[:3]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
