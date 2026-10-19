"""Customer accounts, automatic WhatsApp, notifications and the new public chrome — against the local stack."""
import datetime, subprocess, sys, urllib.parse
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:4173"; SHOTS = "/tmp/shots"
MSG = "Hi, I saw Infant Jesus Tours & Travels Website and would like to know more about your services."
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))
def sql(q):
    return subprocess.run(["su", "postgres", "-c", f'psql -d ijt_e2e -Atc "{q}"'], capture_output=True, text=True).stdout.strip()
travel = (datetime.date.today() + datetime.timedelta(days=6)).isoformat()
WA = lambda r: r.fulfill(status=200, content_type="text/html", body="<title>WhatsApp</title>")

def journey(page, dest):
    page.goto(f"{BASE}/book", wait_until="networkidle")
    page.get_by_label("Pickup", exact=False).first.fill("Thanjavur"); page.get_by_label("Destination", exact=False).first.fill(dest)
    page.get_by_label("Travel date").fill(travel); page.get_by_label("Travel time").fill("07:00"); page.get_by_label("Number of members").fill("3")
    page.get_by_role("button", name="Continue to Details").click()
    expect(page.get_by_role("heading", name="Travel Details")).to_be_visible()
def finish(page):
    expect(page.get_by_role("heading", name="Vehicle Recommendation")).to_be_visible()
    page.get_by_role("button", name="Review Request").click()
    page.get_by_role("button", name="Submit Booking Request").click()
    expect(page.get_by_role("heading", name="Booking Request Received")).to_be_visible()
    return page.locator("text=/^IJT-\\d{4}$/").first.inner_text()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}); ctx.route("https://wa.me/**", WA)
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---- TEST A: public chrome ----
    page.goto(BASE, wait_until="networkidle")
    logo = page.locator("header img").first
    check("A: header shows the official logo, undistorted", logo.get_attribute("src") == "/ijt-logo.png" and logo.evaluate("e => e.naturalWidth > 0 && getComputedStyle(e).objectFit === 'contain'"))
    check("A: footer shows the logo", page.locator("footer img").first.get_attribute("src") == "/ijt-logo.png")
    check("A: favicon + apple-touch-icon use the logo", page.locator('link[rel=icon]').get_attribute("href") == "/ijt-logo.png" and page.locator('link[rel=apple-touch-icon]').get_attribute("href") == "/ijt-logo.png")
    check("A: no Admin link anywhere on the public page", page.locator('a[href^="/admin"]').count() == 0 and page.get_by_role("link", name="Admin").count() == 0)
    check("A: Local · Outstation · Pilgrimage badge is gone", page.get_by_text("Local · Outstation · Pilgrimage").count() == 0)
    dev = page.get_by_role("region", name="Website developed by")
    check("A: developer box shows the exact name and company", dev.get_by_text("Medwin Levay E Freelancer", exact=True).is_visible() and dev.get_by_text("Medwin Montage | Freelancing Creative & Digital Services", exact=True).is_visible() and dev.get_by_text("Thanjavur, Tamilnadu · Providing Service Across Tamilnadu").is_visible())
    hrefs = dev.locator("a").evaluate_all("els => els.map(e => e.getAttribute('href'))")
    q = urllib.parse.quote(MSG, safe="!'()*~-_.")
    check("B: developer phone link", hrefs[0] == "tel:+919487897160", hrefs[0])
    check("C: developer WhatsApp link — number and exact message", hrefs[1] == f"https://wa.me/919487897160?text={q}", hrefs[1])
    check("D: developer SMS link — sms: URI with the same message", hrefs[2] == f"sms:+919487897160?&body={q}", hrefs[2])
    biz = page.locator('header a[href*="wa.me"], main a[href*="wa.me"]').evaluate_all("els => [...new Set(els.map(e => e.href.split('?')[0]))]")
    check("19: business WhatsApp links never use the developer number", biz == ["https://wa.me/919842487017"], str(biz))
    check("14: logged-out navigation offers Login and Register", page.get_by_role("link", name="Login").first.is_visible() and page.get_by_role("link", name="Register").first.is_visible())
    check("10: no notification bell for anonymous visitors", page.get_by_role("button", name="Notifications").count() == 0)
    page.locator("footer").scroll_into_view_if_needed(); page.screenshot(path=f"{SHOTS}/c-footer.png")
    check("/admin still works by direct URL", page.goto(f"{BASE}/admin", wait_until="networkidle") and page.get_by_role("heading", name="Admin login").is_visible())

    # ---- TEST E/F: register, persist, logout, login ----
    page.goto(f"{BASE}/register", wait_until="networkidle")
    page.get_by_role("button", name="Register").click()
    check("E: register form validates", page.get_by_text("Please enter your full name.").is_visible())
    page.get_by_label("Full name").fill("Asha Devi"); page.get_by_label("Email").fill("Asha@Example.com"); page.get_by_label("Phone number").fill("+91 98765 11111")
    page.get_by_label("Password", exact=False).first.fill("asha-password-1"); page.get_by_label("Confirm password").fill("asha-password-1")
    page.get_by_role("button", name="Register").click()
    page.wait_for_url("**/account")
    check("E: profile created from the registration details", sql("select full_name||'|'||phone from profiles where email='asha@example.com'") == "Asha Devi|+91 98765 11111")
    page.reload(wait_until="networkidle")
    check("E: session persists after refresh", page.get_by_role("heading", name="My account").is_visible() and page.get_by_label("Full name").input_value() == "Asha Devi")
    check("21: no password is stored in the browser", "asha-password-1" not in page.evaluate("JSON.stringify(localStorage) + JSON.stringify(sessionStorage)"))
    page.get_by_role("button", name="Logout").first.click()
    page.wait_for_url("**/login")
    page.get_by_label("Email").fill("asha@example.com"); page.get_by_label("Password").fill("wrong-password"); page.get_by_role("button", name="Login").click()
    expect(page.get_by_role("alert")).to_contain_text("Incorrect email or password")
    page.get_by_label("Password").fill("asha-password-1"); page.get_by_role("button", name="Login").click()
    page.wait_for_url("**/account")
    expect(page.get_by_role("heading", name="My account")).to_be_visible()
    check("F: logout then login restores the account", True)
    page.screenshot(path=f"{SHOTS}/c-account-empty.png", full_page=True)

    # ---- TEST G: booking while logged in ----
    journey(page, "Madurai")
    check("G: name, phone and email are prefilled from the account", page.get_by_label("Full name").input_value() == "Asha Devi" and page.get_by_label("Phone number").input_value() == "+91 98765 11111" and page.get_by_label("Email").input_value() == "asha@example.com" and page.get_by_label("Password", exact=False).count() == 0)
    page.get_by_role("button", name="Find a Vehicle").click()
    with ctx.expect_page() as pop: ref1 = finish(page)
    pop.value.wait_for_url("https://wa.me/**")
    text = urllib.parse.unquote(pop.value.url.split("text=")[1])
    check("G: WhatsApp opens automatically with the booking details", pop.value.url.startswith("https://wa.me/919842487017?") and f"Booking Reference: {ref1}" in text and "Email: asha@example.com" in text and "Destination: Madurai" in text, text[:80])
    pop.value.close()
    check("G: booking is linked to the customer", sql(f"select p.email from bookings b join profiles p on p.id=b.customer_id where b.reference='{ref1}'") == "asha@example.com")
    page.goto(f"{BASE}/", wait_until="networkidle")
    bell = page.get_by_role("button", name="Notifications, 1 unread")
    check("10: home page shows the customer's bell with an unread count", bell.is_visible())
    bell.click(); page.screenshot(path=f"{SHOTS}/c-bell.png")
    check("9: 'Booking Request Received' notification with the reference", page.get_by_role("dialog", name="Notifications").get_by_text(f"We received your vehicle booking {ref1}").is_visible())
    page.get_by_role("button", name="Mark all read").click(); page.wait_for_timeout(600)
    check("10: mark as read is saved", sql("select count(*) from customer_notifications n join profiles p on p.id=n.customer_id where p.email='asha@example.com' and not n.is_read") == "0")

    # ---- TEST L/M: admin changes status ----
    actx = browser.new_context(viewport={"width": 1440, "height": 900}); admin = actx.new_page()
    admin.goto(f"{BASE}/admin/login", wait_until="networkidle")
    admin.get_by_label("Email").fill("owner@test.local"); admin.locator("input[autocomplete=current-password]").fill("correct-horse-battery"); admin.get_by_role("button", name="Sign in").click()
    admin.wait_for_url("**/admin")
    check("26: admin and customer sessions are independent", admin.goto(f"{BASE}/account", wait_until="networkidle") and admin.url.endswith("/login"))
    admin.goto(f"{BASE}/admin/bookings", wait_until="networkidle")
    for status in ["Office Calling", "Confirmed"]:
        admin.get_by_label(f"Status for {ref1}").locator("visible=true").select_option(status); admin.wait_for_timeout(900)
    check("11: status changes create admin notifications", sql(f"select count(*) from notifications where kind='status' and title like '%{ref1}'") == "2")
    page.goto(f"{BASE}/account", wait_until="networkidle")
    body = page.locator("#notifications").inner_text()
    check("L: customer notified — Office Calling", f"Our office is calling regarding booking {ref1}." in body)
    check("M: customer notified — Confirmed", f"Your booking {ref1} has been confirmed." in body)
    card = page.locator("li", has_text=ref1).last
    check("24: booking history shows the new status and details", card.get_by_text("Confirmed").is_visible() and card.get_by_text("Madurai").is_visible())
    page.screenshot(path=f"{SHOTS}/c-account.png", full_page=True)

    # ---- TEST J: existing email, wrong password ----
    page.get_by_role("button", name="Logout").first.click(); page.wait_for_url("**/login")
    users, books = sql("select count(*) from auth.users"), sql("select count(*) from bookings")
    journey(page, "Trichy")
    page.get_by_label("Full name").fill("Someone Else"); page.get_by_label("Phone number").fill("9000012345"); page.get_by_label("Email").fill("asha@example.com")
    page.get_by_label("Password", exact=False).first.fill("guessing-123"); page.get_by_label("Confirm password").fill("guessing-123")
    page.get_by_role("button", name="Find a Vehicle").click()
    expect(page.get_by_role("alert").filter(has_text="already exists")).to_be_visible()
    check("J: wrong password — no duplicate account, nothing overwritten, reset path offered", sql("select count(*) from auth.users") == users and sql("select count(*) from bookings") == books and sql("select full_name from profiles where email='asha@example.com'") == "Asha Devi" and page.get_by_role("link", name="reset your password").is_visible())
    page.screenshot(path=f"{SHOTS}/c-wrong-password.png", full_page=True)

    # ---- TEST I: existing customer, correct password, during booking ----
    page.get_by_label("Password", exact=False).first.fill("asha-password-1"); page.get_by_label("Confirm password").fill("asha-password-1")
    page.get_by_role("button", name="Find a Vehicle").click()
    with ctx.expect_page() as pop: ref2 = finish(page)
    pop.value.close()
    check("I: existing account reused — no duplicate, profile preserved, booking attached", sql("select count(*) from auth.users") == users and sql(f"select p.full_name||'|'||p.phone from bookings b join profiles p on p.id=b.customer_id where b.reference='{ref2}'") == "Asha Devi|+91 98765 11111")

    # ---- TEST H: first booking creates the account (fresh browser) ----
    c2 = browser.new_context(viewport={"width": 390, "height": 844}); c2.route("https://wa.me/**", WA)
    c2.add_init_script("window.open = () => null")          # simulate a popup blocker
    p2 = c2.new_page()
    journey(p2, "Kumbakonam")
    p2.get_by_label("Full name").fill("Ravi Kumar"); p2.get_by_label("Phone number").fill("98765 22222"); p2.get_by_label("Email").fill("ravi@example.com")
    p2.get_by_label("Password", exact=False).first.fill("ravi-password-1"); p2.get_by_label("Confirm password").fill("ravi-password-1")
    p2.screenshot(path=f"{SHOTS}/c-book-details-390.png", full_page=True)
    p2.get_by_role("button", name="Find a Vehicle").click()
    ref3 = finish(p2)
    check("H: first booking created one new account and attached the booking", sql("select count(*) from auth.users") == str(int(users) + 1) and sql(f"select p.email from bookings b join profiles p on p.id=b.customer_id where b.reference='{ref3}'") == "ravi@example.com")
    check("1/16: popup blocked — booking still succeeds and a manual Open WhatsApp button appears", p2.get_by_text("could not be opened automatically").is_visible() and p2.get_by_role("link", name="Open WhatsApp").get_attribute("href").startswith("https://wa.me/919842487017?text="))
    check("18: confirmation keeps Send via WhatsApp, download and Back to Home", p2.get_by_role("link", name="Send via WhatsApp").is_visible() and p2.get_by_role("button", name="Download Booking Reference").is_visible() and p2.get_by_role("link", name="Back to Home").is_visible())
    p2.screenshot(path=f"{SHOTS}/c-confirm-blocked-390.png", full_page=True)

    # ---- TEST N/O: isolation ----
    p2.goto(f"{BASE}/account", wait_until="networkidle")
    text = p2.locator("main").inner_text()
    check("N/O: second customer sees only their own booking and notifications", ref3 in text and ref1 not in text and ref2 not in text)
    token = p2.evaluate("JSON.parse(localStorage.getItem('ijt-customer-auth')).access_token")
    r = p2.request.get("http://localhost:54321/rest/v1/bookings?select=reference", headers={"Authorization": f"Bearer {token}"}).json()
    n = p2.request.get("http://localhost:54321/rest/v1/customer_notifications?select=body", headers={"Authorization": f"Bearer {token}"}).json()
    check("O: direct API calls with the second customer's token return only their rows", [x["reference"] for x in r] == [ref3] and all(ref3 in x["body"] for x in n) and len(n) == 1, str(r))
    r = p2.request.patch(f"http://localhost:54321/rest/v1/bookings?reference=eq.{ref3}", headers={"Authorization": f"Bearer {token}", "Prefer": "return=representation"}, data={"status": "Confirmed"})
    check("23: a customer cannot change their own booking's status through the API", r.json() == [] and sql(f"select status from bookings where reference='{ref3}'") == "Pending", r.text())
    over = [w for w in [(390, "/account"), (390, "/login"), (390, "/register"), (320, "/"), (320, "/account")] if (p2.set_viewport_size({"width": w[0], "height": 800}), p2.goto(BASE + w[1], wait_until="networkidle"), p2.evaluate("document.documentElement.scrollWidth - window.innerWidth"))[2] > 0]
    check("20: account, login, register and footer fit small screens", not over, str(over))
    p2.goto(BASE, wait_until="networkidle"); p2.locator("footer").scroll_into_view_if_needed(); p2.screenshot(path=f"{SHOTS}/c-footer-320.png")

    # ---- instant ride + enquiry also open WhatsApp; and no number configured ----
    page.goto(f"{BASE}/instant-ride", wait_until="networkidle")
    check("25: instant ride is prefilled for a signed-in customer", page.get_by_label("Name").input_value() == "Asha Devi")
    with ctx.expect_page() as pop:
        page.get_by_role("button", name="Request Instant Ride").click()
    pop.value.wait_for_url("https://wa.me/**"); check("1: instant ride opens WhatsApp automatically", "Instant%20Ride" in pop.value.url); pop.value.close()
    page.goto(f"{BASE}/offers", wait_until="networkidle"); page.get_by_role("button", name="Enquire on WhatsApp").click()
    with ctx.expect_page() as pop:
        page.get_by_role("button", name="Send Enquiry").click()
    pop.value.wait_for_url("https://wa.me/**"); check("1: offer enquiry opens WhatsApp automatically, with email", "Offer%20Enquiry%20About%3A%20Test%20Offer" in pop.value.url and "asha%40example.com" in pop.value.url); pop.value.close()
    sql("update social_links set value='' where platform='whatsapp'")
    journey(page, "Salem"); page.get_by_role("button", name="Find a Vehicle").click()
    pages_before = len(ctx.pages); ref4 = finish(page)
    check("16: no WhatsApp number configured — booking completes, no broken link, clear message", len(ctx.pages) == pages_before and page.get_by_text("WhatsApp is not available right now").is_visible() and page.locator('main a[href*="wa.me"], header a[href*="wa.me"]').count() == 0 and sql(f"select count(*) from bookings where reference='{ref4}'") == "1")
    sql("update social_links set value='9842487017' where platform='whatsapp'")

    check("no uncaught page errors", not errors, str(errors[:3]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed"); sys.exit(1 if failed else 0)
