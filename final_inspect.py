from playwright.sync_api import sync_playwright
import time
import random

random_num = random.randint(1000, 9999)
test_email = f'test{random_num}@tavok.ai'
test_username = f'test{random_num}'
test_display_name = f'TestUser{random_num}'
test_password = 'Test123!'

print(f"\nTest Credentials:")
print(f"  Email: {test_email}")
print(f"  Username: {test_username}")
print(f"  Display Name: {test_display_name}")
print(f"  Password: {test_password}\n")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    print("STEP 1: Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/s1_login.png')
    
    print("STEP 2: Going to registration page...")
    page.locator('a:has-text("Register")').click()
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/s2_register.png')
    
    print("STEP 3: Filling registration form...")
    inputs = page.locator('input').all()
    inputs[0].fill(test_email)
    inputs[1].fill(test_display_name)
    inputs[2].fill(test_username)
    inputs[3].fill(test_password)
    inputs[4].fill(test_password)
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/s3_filled.png')
    print("  Form filled")
    
    print("STEP 4: Submitting registration...")
    page.locator('button:has-text("Continue")').click()
    print("  Waiting for registration to complete (up to 15 seconds)...")
    try:
        page.wait_for_url('http://localhost:3000/', timeout=15000)
        print("  Registration successful! Redirected to home page")
    except:
        print(f"  Still on: {page.url}")
        print("  Waiting additional 5 seconds...")
        time.sleep(5)
    
    page.screenshot(path='C:/Users/njlec/Tavok/s4_after_register.png')
    print(f"  Current URL: {page.url}")
    
    print("\nSTEP 5: Looking for CHANNELS and SERVERS tabs...")
    time.sleep(2)
    
    channels_found = False
    servers_found = False
    
    try:
        channels_tab = page.locator('text=CHANNELS').first
        if channels_tab.is_visible():
            print("  [OK] CHANNELS tab found")
            channels_found = True
        else:
            print("  [MISS] CHANNELS tab not visible")
    except:
        print("  [MISS] CHANNELS tab not found")
    
    try:
        servers_tab = page.locator('text=SERVERS').first
        if servers_tab.is_visible():
            print("  [OK] SERVERS tab found")
            servers_found = True
        else:
            print("  [MISS] SERVERS tab not visible")
    except:
        print("  [MISS] SERVERS tab not found")
    
    if servers_found:
        print("\nSTEP 6: Clicking SERVERS tab...")
        servers_tab.click()
        time.sleep(1)
        page.screenshot(path='C:/Users/njlec/Tavok/s6_servers_tab.png')
        
        print("STEP 7: Looking for a server to select...")
        time.sleep(1)
        buttons = page.locator('[role="button"]').all()
        server_clicked = False
        
        for btn in buttons:
            if btn.is_visible():
                text = (btn.text_content() or '').strip()
                if text and len(text) > 2 and 'select' not in text.lower():
                    print(f"  Found server: {text[:40]}")
                    print(f"  Clicking it...")
                    btn.click()
                    server_clicked = True
                    time.sleep(1)
                    break
        
        if server_clicked:
            print("\nSTEP 8: Going back to CHANNELS tab...")
            page.locator('text=CHANNELS').first.click()
            time.sleep(1)
            page.screenshot(path='C:/Users/njlec/Tavok/s8_channels_with_server.png')
        else:
            print("  No server found to click")
    
    print("\n" + "="*70)
    print("FINAL INSPECTION - STEP 9")
    print("="*70)
    
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/FINAL_FULL_PAGE.png', full_page=True)
    print("\nScreenshot saved: FINAL_FULL_PAGE.png")
    
    print("\nLooking for server name header...")
    headings = page.locator('h1, h2, h3, h4, h5, h6').all()
    heading_texts = []
    for h in headings:
        if h.is_visible():
            text = (h.text_content() or '').strip()
            if text:
                heading_texts.append(text)
                print(f"  Heading: {text}")
    
    print("\nLooking for '+' button or add/create buttons...")
    all_buttons = page.locator('button, [role="button"]').all()
    plus_buttons = []
    for btn in all_buttons:
        if btn.is_visible():
            text = (btn.text_content() or '').strip()
            aria = btn.get_attribute('aria-label') or ''
            if '+' in text or 'add' in aria.lower() or 'create' in aria.lower():
                plus_buttons.append(f"Text: '{text}' | Aria: '{aria}'")
                print(f"  Button: Text: '{text}' | Aria-label: '{aria}'")
    
    print("\nCaptring left sidebar...")
    try:
        sidebar = page.locator('aside').first
        if sidebar.is_visible():
            sidebar.screenshot(path='C:/Users/njlec/Tavok/SIDEBAR_ONLY.png')
            print("  Sidebar screenshot saved: SIDEBAR_ONLY.png")
            
            # Save sidebar HTML
            with open('C:/Users/njlec/Tavok/sidebar.html', 'w', encoding='utf-8') as f:
                f.write(sidebar.inner_html())
            print("  Sidebar HTML saved: sidebar.html")
            
            # Also save full page HTML
            with open('C:/Users/njlec/Tavok/full_page.html', 'w', encoding='utf-8') as f:
                f.write(page.content())
            print("  Full page HTML saved: full_page.html")
    except Exception as e:
        print(f"  Error capturing sidebar: {e}")
    
    print("\n" + "="*70)
    print("REPORT SUMMARY")
    print("="*70)
    print(f"\nFinal URL: {page.url}")
    print(f"CHANNELS tab found: {channels_found}")
    print(f"SERVERS tab found: {servers_found}")
    print(f"Number of headings found: {len(heading_texts)}")
    print(f"Number of '+'/add/create buttons found: {len(plus_buttons)}")
    
    print("\n" + "="*70)
    print("FILES TO REVIEW:")
    print("="*70)
    print("  1. FINAL_FULL_PAGE.png - Complete page screenshot")
    print("  2. SIDEBAR_ONLY.png - Just the left sidebar")
    print("  3. s8_channels_with_server.png - Channels view after selecting server")
    print("  4. sidebar.html - Sidebar HTML for detailed inspection")
    print("  5. full_page.html - Complete page HTML")
    print("="*70)
    
    input("\nPress Enter to close browser...")
    browser.close()
    
    print("\nDone!")
