from playwright.sync_api import sync_playwright
import time
import random

# Generate unique email
random_num = random.randint(1000, 9999)
test_email = f'test{random_num}@tavok.ai'
test_password = 'Test123!'

print(f"Test credentials: {test_email} / {test_password}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # Step 1: Navigate to localhost:3000
    print("\nStep 1: Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # Take initial screenshot
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_1_initial.png', full_page=True)
    print("Screenshot 1 taken: screenshot_1_initial.png (login page)")
    
    # Register a new user
    print("\nRegistering a new user...")
    try:
        register_link = page.locator('text=Register').first
        if register_link.is_visible():
            register_link.click()
            page.wait_for_load_state('networkidle')
            time.sleep(1)
            
            page.screenshot(path='C:/Users/njlec/Tavok/screenshot_register.png', full_page=True)
            print("Screenshot taken: screenshot_register.png")
            
            # Fill registration form
            print("Filling registration form...")
            
            # Try to find name field
            try:
                name_input = page.locator('input[name="name"], input[placeholder*="name" i]').first
                if name_input.is_visible():
                    name_input.fill('Test User')
                    print("  Name filled")
            except:
                pass
            
            # Fill email
            email_input = page.locator('input[type="email"], input[name="email"]').first
            email_input.fill(test_email)
            print("  Email filled")
            
            # Fill password
            password_inputs = page.locator('input[type="password"]').all()
            if len(password_inputs) >= 1:
                password_inputs[0].fill(test_password)
                print("  Password filled")
            if len(password_inputs) >= 2:
                password_inputs[1].fill(test_password)
                print("  Password confirmation filled")
            
            # Click register button
            register_button = page.locator('button:has-text("Register"), button:has-text("Sign up"), button:has-text("Create")').first
            register_button.click()
            print("  Register button clicked")
            
            # Wait for navigation
            page.wait_for_load_state('networkidle')
            time.sleep(2)
            
            page.screenshot(path='C:/Users/njlec/Tavok/screenshot_after_register.png', full_page=True)
            print("Screenshot taken: screenshot_after_register.png")
    except Exception as e:
        print(f"Registration error: {e}")
        print("Trying to log in with existing credentials...")
        
        # Go back to login page if not already there
        try:
            login_link = page.locator('text=Log In, text=Sign in').first
            if login_link.is_visible():
                login_link.click()
                page.wait_for_load_state('networkidle')
                time.sleep(1)
        except:
            pass
    
    # Now log in (if we're on login page)
    print("\nLogging in...")
    try:
        if page.locator('text=Welcome back').is_visible() or page.locator('button:has-text("Log In")').is_visible():
            # Fill in email
            email_input = page.locator('input[type="email"], input[name="email"]').first
            email_input.fill(test_email)
            print("  Email filled")
            
            # Fill in password
            password_input = page.locator('input[type="password"]').first
            password_input.fill(test_password)
            print("  Password filled")
            
            # Click login button
            login_button = page.locator('button:has-text("Log In")').first
            login_button.click()
            print("  Login button clicked")
            
            # Wait for navigation after login
            page.wait_for_load_state('networkidle')
            time.sleep(3)
            
            page.screenshot(path='C:/Users/njlec/Tavok/screenshot_2_after_login.png', full_page=True)
            print("Screenshot 2 taken: screenshot_2_after_login.png")
    except Exception as e:
        print(f"Login error: {e}")
    
    # Check if we're logged in by looking for the main UI
    current_url = page.url
    print(f"\nCurrent URL: {current_url}")
    
    # Step 2: Look for CHANNELS tab
    print("\nStep 2: Looking for CHANNELS tab...")
    try:
        channels_tab = page.locator('text=CHANNELS').first
        if channels_tab.is_visible():
            print("CHANNELS tab found - clicking it...")
            channels_tab.click()
            time.sleep(1)
            page.screenshot(path='C:/Users/njlec/Tavok/screenshot_3_channels_clicked.png', full_page=True)
            print("Screenshot 3 taken")
        else:
            print("CHANNELS tab not found")
            # Try to find any tabs
            print("Looking for any tabs...")
            tabs = page.locator('[role="tab"]').all()
            print(f"Found {len(tabs)} tabs")
            for tab in tabs:
                if tab.is_visible():
                    print(f"  Tab: {tab.text_content()}")
    except Exception as e:
        print(f"Error with CHANNELS tab: {e}")
    
    # Step 3: Look for SERVERS tab and select a server
    print("\nStep 3: Looking for SERVERS tab...")
    try:
        servers_tab = page.locator('text=SERVERS').first
        if servers_tab.is_visible():
            print("SERVERS tab found - clicking it...")
            servers_tab.click()
            time.sleep(1)
            page.screenshot(path='C:/Users/njlec/Tavok/screenshot_4_servers_tab.png', full_page=True)
            print("Screenshot 4 taken")
            
            # Look for any server to click
            print("Looking for servers to click...")
            time.sleep(1)
            
            # Try different selectors
            server_items = page.locator('[role="button"]').all()
            for i, item in enumerate(server_items[:5]):
                if item.is_visible():
                    text = item.text_content() or ''
                    if text and len(text.strip()) > 0:
                        print(f"  Found server item: {text[:50]}")
                        item.click()
                        time.sleep(1)
                        page.screenshot(path='C:/Users/njlec/Tavok/screenshot_5_server_selected.png', full_page=True)
                        print("Screenshot 5 taken - server selected")
                        break
            
            # Go back to CHANNELS tab
            channels_tab = page.locator('text=CHANNELS').first
            if channels_tab.is_visible():
                print("Going back to CHANNELS tab...")
                channels_tab.click()
                time.sleep(1)
        else:
            print("SERVERS tab not found")
    except Exception as e:
        print(f"Error with SERVERS tab: {e}")
    
    # Step 4: Final inspection
    print("\nStep 4: Final inspection of the page...")
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_final.png', full_page=True)
    print("Screenshot (final) taken")
    
    # Save page HTML
    page_html = page.content()
    with open('C:/Users/njlec/Tavok/page_final_html.txt', 'w', encoding='utf-8') as f:
        f.write(page_html)
    print("Page HTML saved")
    
    # Look for all visible elements
    print("\nInspecting visible UI elements...")
    
    # Find all headings
    headings = page.locator('h1, h2, h3, h4, h5, h6').all()
    visible_headings = [h.text_content() for h in headings if h.is_visible() and h.text_content()]
    print(f"\nVisible headings ({len(visible_headings)}):")
    for h in visible_headings:
        print(f"  - {h}")
    
    # Find all buttons
    buttons = page.locator('button, [role="button"]').all()
    visible_buttons = []
    for btn in buttons:
        if btn.is_visible():
            text = btn.text_content() or ''
            aria = btn.get_attribute('aria-label') or ''
            if text.strip() or aria:
                visible_buttons.append(f"Text: '{text.strip()}' | Aria: '{aria}'")
    
    print(f"\nVisible buttons ({len(visible_buttons)}):")
    for btn_info in visible_buttons[:20]:  # First 20
        print(f"  - {btn_info}")
    
    # Look for + buttons specifically
    plus_buttons = page.locator('button:has-text("+"), [aria-label*="add" i], [aria-label*="create" i]').all()
    print(f"\nButtons with '+' or add/create ({len([b for b in plus_buttons if b.is_visible()])}):")
    for btn in plus_buttons:
        if btn.is_visible():
            text = btn.text_content() or ''
            aria = btn.get_attribute('aria-label') or ''
            print(f"  - Text: '{text.strip()}' | Aria: '{aria}'")
    
    print("\n" + "="*60)
    print("INSPECTION COMPLETE")
    print("="*60)
    print(f"\nCredentials used: {test_email} / {test_password}")
    print("\nCheck screenshots:")
    print("  - screenshot_final.png - Final state")
    print("  - page_final_html.txt - Full HTML")
    print("="*60)
    
    # Keep browser open
    input("\nPress Enter to close browser...")
    browser.close()
