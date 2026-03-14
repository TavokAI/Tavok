from playwright.sync_api import sync_playwright
import time
import random

# Generate unique credentials
random_num = random.randint(1000, 9999)
test_email = f'test{random_num}@tavok.ai'
test_username = f'test{random_num}'
test_display_name = f'Test User {random_num}'
test_password = 'Test123!'

print(f"Credentials:")
print(f"  Email: {test_email}")
print(f"  Username: {test_username}")
print(f"  Display Name: {test_display_name}")
print(f"  Password: {test_password}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # Navigate to localhost:3000
    print("\nNavigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    page.screenshot(path='C:/Users/njlec/Tavok/step1_initial.png', full_page=True)
    print("Screenshot: step1_initial.png")
    
    # Click Register link
    print("\nGoing to registration page...")
    try:
        register_link = page.locator('a:has-text("Register"), a:has-text("Sign up"), a:has-text("Create")').first
        register_link.click()
        page.wait_for_load_state('networkidle')
        time.sleep(1)
    except:
        print("Already on registration page or link not found")
    
    page.screenshot(path='C:/Users/njlec/Tavok/step2_register_page.png', full_page=True)
    print("Screenshot: step2_register_page.png")
    
    # Fill registration form
    print("\nFilling registration form...")
    
    # Fill EMAIL
    print("  Filling email...")
    email_field = page.locator('input[name="email"], input[type="email"]').first
    email_field.clear()
    email_field.fill(test_email)
    time.sleep(0.5)
    
    # Fill DISPLAY NAME
    print("  Filling display name...")
    display_name_field = page.locator('input[name="displayName"], input[placeholder*="display" i], input[placeholder*="name" i]').first
    display_name_field.clear()
    display_name_field.fill(test_display_name)
    time.sleep(0.5)
    
    # Fill USERNAME
    print("  Filling username...")
    username_field = page.locator('input[name="username"], input[placeholder*="username" i]').first
    username_field.clear()
    username_field.fill(test_username)
    time.sleep(0.5)
    
    # Fill PASSWORD
    print("  Filling password...")
    password_fields = page.locator('input[type="password"]').all()
    if len(password_fields) >= 1:
        password_fields[0].clear()
        password_fields[0].fill(test_password)
        time.sleep(0.5)
    
    # Fill CONFIRM PASSWORD
    print("  Filling confirm password...")
    if len(password_fields) >= 2:
        password_fields[1].clear()
        password_fields[1].fill(test_password)
        time.sleep(0.5)
    
    page.screenshot(path='C:/Users/njlec/Tavok/step3_form_filled.png', full_page=True)
    print("Screenshot: step3_form_filled.png")
    
    # Click Continue button
    print("\nClicking Continue button...")
    continue_button = page.locator('button:has-text("Continue")').first
    continue_button.click()
    
    # Wait for navigation
    print("Waiting for registration to complete...")
    page.wait_for_load_state('networkidle')
    time.sleep(3)
    
    page.screenshot(path='C:/Users/njlec/Tavok/step4_after_register.png', full_page=True)
    print("Screenshot: step4_after_register.png")
    
    current_url = page.url
    print(f"Current URL: {current_url}")
    
    # Now we should be logged in - look for the main UI
    print("\n" + "="*60)
    print("LOOKING FOR SIDEBAR ELEMENTS")
    print("="*60)
    
    time.sleep(2)
    
    # Step 1: Look for CHANNELS and SERVERS tabs
    print("\n1. Looking for CHANNELS tab...")
    channels_tab = page.locator('text=CHANNELS').first
    if channels_tab.is_visible():
        print("   ✓ CHANNELS tab found")
        channels_tab.click()
        time.sleep(1)
        page.screenshot(path='C:/Users/njlec/Tavok/step5_channels_tab.png', full_page=True)
        print("   Screenshot: step5_channels_tab.png")
    else:
        print("   ✗ CHANNELS tab not found")
    
    print("\n2. Looking for SERVERS tab...")
    servers_tab = page.locator('text=SERVERS').first
    if servers_tab.is_visible():
        print("   ✓ SERVERS tab found")
        servers_tab.click()
        time.sleep(1)
        page.screenshot(path='C:/Users/njlec/Tavok/step6_servers_tab.png', full_page=True)
        print("   Screenshot: step6_servers_tab.png")
        
        # Look for servers in the list
        print("\n3. Looking for servers to select...")
        time.sleep(1)
        
        # Get all server items
        server_buttons = page.locator('[role="button"]').all()
        server_found = False
        
        for btn in server_buttons:
            if btn.is_visible():
                text = btn.text_content() or ''
                if text.strip() and len(text.strip()) > 1:
                    print(f"   Found: {text[:40]}")
                    if not server_found and 'select' not in text.lower():
                        print(f"   Clicking: {text[:30]}")
                        btn.click()
                        server_found = True
                        time.sleep(1)
                        page.screenshot(path='C:/Users/njlec/Tavok/step7_server_selected.png', full_page=True)
                        print("   Screenshot: step7_server_selected.png")
                        break
        
        if server_found:
            # Go back to CHANNELS tab
            print("\n4. Going back to CHANNELS tab...")
            channels_tab = page.locator('text=CHANNELS').first
            if channels_tab.is_visible():
                channels_tab.click()
                time.sleep(1)
                page.screenshot(path='C:/Users/njlec/Tavok/step8_back_to_channels.png', full_page=True)
                print("   Screenshot: step8_back_to_channels.png")
    else:
        print("   ✗ SERVERS tab not found")
    
    # Final inspection
    print("\n" + "="*60)
    print("FINAL DETAILED INSPECTION")
    print("="*60)
    
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/FINAL.png', full_page=True)
    print("\nScreenshot: FINAL.png")
    
    # Get page HTML
    with open('C:/Users/njlec/Tavok/FINAL.html', 'w', encoding='utf-8') as f:
        f.write(page.content())
    print("HTML saved: FINAL.html")
    
    # Find server name header
    print("\nLooking for server name in header...")
    headings = page.locator('h1, h2, h3, h4, h5, h6, [class*="server"], [class*="channel"]').all()
    for h in headings:
        if h.is_visible():
            text = h.text_content()
            if text and text.strip():
                print(f"  Heading: {text}")
    
    # Find + button
    print("\nLooking for '+' button...")
    all_buttons = page.locator('button, [role="button"]').all()
    for btn in all_buttons:
        if btn.is_visible():
            text = btn.text_content() or ''
            aria = btn.get_attribute('aria-label') or ''
            title = btn.get_attribute('title') or ''
            
            if '+' in text or 'add' in aria.lower() or 'create' in aria.lower():
                print(f"  Button: Text='{text.strip()}' Aria='{aria}' Title='{title}'")
    
    # Get bounding box of left sidebar
    print("\nTaking screenshot of left sidebar region...")
    try:
        # Try to find sidebar
        sidebar = page.locator('aside, nav, [class*="sidebar"]').first
        if sidebar.is_visible():
            box = sidebar.bounding_box()
            if box:
                print(f"  Sidebar found at: x={box['x']}, y={box['y']}, width={box['width']}, height={box['height']}")
                sidebar.screenshot(path='C:/Users/njlec/Tavok/SIDEBAR_ONLY.png')
                print("  Screenshot: SIDEBAR_ONLY.png")
    except Exception as e:
        print(f"  Could not capture sidebar: {e}")
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("\nKey screenshots to review:")
    print("  1. FINAL.png - Full page final state")
    print("  2. SIDEBAR_ONLY.png - Just the left sidebar")
    print("  3. step8_back_to_channels.png - After selecting server")
    print("\nFiles:")
    print("  - FINAL.html - Full page HTML for inspection")
    print("="*60)
    
    input("\nPress Enter to close browser...")
    browser.close()
