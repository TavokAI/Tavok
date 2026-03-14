from playwright.sync_api import sync_playwright
import time

print("\nThis script will:")
print("  1. Create a server")
print("  2. Go to CHANNELS tab")
print("  3. Inspect the channel list header for server name and + button\n")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    print("1. Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # Check if we're on login page
    if page.locator('text=Welcome back').is_visible():
        print("2. Need to log in - using test8216@tavok.ai credentials...")
        page.locator('input[type="email"]').fill('test8216@tavok.ai')
        page.locator('input[type="password"]').fill('Test123!')
        page.locator('button:has-text("Log In")').click()
        page.wait_for_load_state('networkidle')
        time.sleep(2)
    
    print("3. Creating a server...")
    # Fill server name
    server_name_input = page.locator('input[name="name"], input').first
    server_name_input.fill('My Test Server')
    time.sleep(0.5)
    
    # Click Create Server button
    page.locator('button:has-text("Create Server")').click()
    print("   Waiting for server creation...")
    time.sleep(3)
    
    page.screenshot(path='C:/Users/njlec/Tavok/after_create_server.png')
    print("   Screenshot: after_create_server.png")
    
    print("\n4. Going to CHANNELS tab...")
    try:
        channels_tab = page.locator('text=CHANNELS').first
        if channels_tab.is_visible():
            channels_tab.click()
            time.sleep(1)
            page.screenshot(path='C:/Users/njlec/Tavok/channels_view.png')
            print("   Screenshot: channels_view.png")
        else:
            print("   CHANNELS tab not found")
    except Exception as e:
        print(f"   Error: {e}")
    
    print("\n" + "="*70)
    print("5. DETAILED INSPECTION OF CHANNELS VIEW")
    print("="*70)
    
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/INSPECT_CHANNELS.png', full_page=True)
    print("\nFull screenshot: INSPECT_CHANNELS.png")
    
    # Save page HTML
    with open('C:/Users/njlec/Tavok/channels_page.html', 'w', encoding='utf-8') as f:
        f.write(page.content())
    print("HTML saved: channels_page.html")
    
    print("\n--- HEADINGS ---")
    headings = page.locator('h1, h2, h3, h4, h5, h6, [role="heading"]').all()
    for h in headings:
        if h.is_visible():
            text = (h.text_content() or '').strip()
            if text:
                class_name = h.get_attribute('class') or ''
                print(f"  Text: '{text}'")
                print(f"    Class: {class_name}")
    
    print("\n--- ALL VISIBLE BUTTONS ---")
    buttons = page.locator('button, [role="button"]').all()
    button_count = 0
    for btn in buttons:
        if btn.is_visible():
            button_count += 1
            text = (btn.text_content() or '').strip()
            aria = btn.get_attribute('aria-label') or ''
            class_name = btn.get_attribute('class') or ''
            print(f"  Button {button_count}:")
            print(f"    Text: '{text}'")
            print(f"    Aria-label: '{aria}'")
            print(f"    Class: {class_name[:60]}")
    
    print("\n--- BUTTONS WITH + OR ADD/CREATE ---")
    plus_found = False
    for btn in buttons:
        if btn.is_visible():
            text = (btn.text_content() or '').strip()
            aria = btn.get_attribute('aria-label') or ''
            if '+' in text or 'add' in aria.lower() or 'create' in aria.lower() or 'add' in text.lower():
                plus_found = True
                print(f"  [FOUND] Text: '{text}' | Aria: '{aria}'")
    
    if not plus_found:
        print("  [NONE FOUND]")
    
    print("\n--- LOOKING IN LEFT SIDEBAR SPECIFICALLY ---")
    # Try to find elements in the left portion of the screen
    try:
        # Get all elements in left sidebar area (first 250px width)
        all_elements = page.locator('[class*="server"], [class*="channel"], [class*="sidebar"]').all()
        print(f"  Found {len(all_elements)} elements with server/channel/sidebar in class")
        
        for elem in all_elements[:10]:
            if elem.is_visible():
                text = (elem.text_content() or '').strip()[:50]
                tag = elem.evaluate('el => el.tagName')
                class_name = elem.get_attribute('class') or ''
                if text:
                    print(f"    <{tag}> text='{text}' class={class_name[:40]}")
    except Exception as e:
        print(f"  Error inspecting sidebar elements: {e}")
    
    print("\n" + "="*70)
    print("REPORT")
    print("="*70)
    print("\nPlease review:")
    print("  1. INSPECT_CHANNELS.png - Full page in CHANNELS view")
    print("  2. channels_view.png - When first switched to CHANNELS")
    print("  3. channels_page.html - Full HTML for inspection")
    print("\nLook at the left sidebar in INSPECT_CHANNELS.png:")
    print("  - What is the server name shown at the top?")
    print("  - Is there a + button next to the server name?")
    print("  - What channels are listed below?")
    print("="*70)
    
    input("\nPress Enter to close...")
    browser.close()
    
    print("\nInspection complete!")
