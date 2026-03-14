from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # Step 1: Navigate to localhost:3000
    print("Step 1: Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # Take initial screenshot
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_1_initial.png', full_page=True)
    print("Screenshot 1 taken: screenshot_1_initial.png (login page)")
    
    # Check if we're on the login page
    if page.locator('text=Welcome back').is_visible() or page.locator('text=Log In').is_visible():
        print("\nLogging in with demo credentials...")
        
        # Fill in email
        email_input = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first
        email_input.fill('demo@tavok.ai')
        print("  Email filled")
        
        # Fill in password
        password_input = page.locator('input[type="password"], input[name="password"]').first
        password_input.fill('demo123')
        print("  Password filled")
        
        # Click login button
        login_button = page.locator('button:has-text("Log In")').first
        login_button.click()
        print("  Login button clicked")
        
        # Wait for navigation after login
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        
        page.screenshot(path='C:/Users/njlec/Tavok/screenshot_2_after_login.png', full_page=True)
        print("Screenshot 2 taken: screenshot_2_after_login.png")
    else:
        print("Already logged in")
    
    # Step 2: Check if CHANNELS tab is selected
    print("\nStep 2: Checking CHANNELS tab...")
    try:
        # Look for CHANNELS tab
        channels_tab = page.locator('text=CHANNELS').first
        if channels_tab.is_visible():
            print("CHANNELS tab found")
            
            # Try to get parent element's attributes
            try:
                # Check if it looks selected (various ways to check)
                parent = channels_tab.locator('xpath=..')
                class_name = parent.get_attribute('class') or ''
                aria_selected = parent.get_attribute('aria-selected') or ''
                data_state = parent.get_attribute('data-state') or ''
                
                print(f"  Class: {class_name}")
                print(f"  Aria-selected: {aria_selected}")
                print(f"  Data-state: {data_state}")
                
                # Click on CHANNELS tab if not already selected
                is_selected = (
                    'selected' in class_name.lower() or 
                    'active' in class_name.lower() or
                    aria_selected == 'true' or
                    data_state == 'active'
                )
                
                if not is_selected:
                    print("  CHANNELS tab not selected, clicking it...")
                    channels_tab.click()
                    time.sleep(1)
                    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_3_channels_clicked.png', full_page=True)
                    print("Screenshot 3 taken: screenshot_3_channels_clicked.png")
                else:
                    print("  CHANNELS tab already selected")
            except Exception as e:
                print(f"  Could not check selection state: {e}")
                print("  Clicking CHANNELS tab anyway...")
                channels_tab.click()
                time.sleep(1)
        else:
            print("CHANNELS tab not found")
    except Exception as e:
        print(f"Error with CHANNELS tab: {e}")
    
    # Step 3: Check if server is selected
    print("\nStep 3: Checking if server is selected...")
    try:
        # Look for "Select a server from the SERVERS tab" message
        select_server_msg = page.locator('text=Select a server from the SERVERS tab')
        if select_server_msg.is_visible():
            print("No server selected - need to select one")
            
            # Click SERVERS tab
            servers_tab = page.locator('text=SERVERS').first
            if servers_tab.is_visible():
                print("  Clicking SERVERS tab...")
                servers_tab.click()
                time.sleep(1)
                page.screenshot(path='C:/Users/njlec/Tavok/screenshot_4_servers_tab.png', full_page=True)
                print("Screenshot 4 taken: screenshot_4_servers_tab.png")
                
                # Click on the first visible server
                print("  Looking for a server to click...")
                
                # Try multiple selectors for server items
                server_found = False
                
                # Try 1: Look for server names/items in a list
                server_items = page.locator('[role="button"]').all()
                for i, item in enumerate(server_items):
                    if item.is_visible():
                        text = item.text_content() or ''
                        print(f"    Found clickable item {i}: {text[:50]}")
                        if text and len(text) > 0 and 'select' not in text.lower():
                            print(f"  Clicking server item: {text[:30]}")
                            item.click()
                            server_found = True
                            time.sleep(1)
                            break
                
                # Try 2: Look for any visible list items if above didn't work
                if not server_found:
                    list_items = page.locator('li, [role="listitem"]').all()
                    for i, item in enumerate(list_items):
                        if item.is_visible():
                            text = item.text_content() or ''
                            if text and 'server' in text.lower():
                                print(f"  Clicking list item: {text[:30]}")
                                item.click()
                                server_found = True
                                time.sleep(1)
                                break
                
                if server_found:
                    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_5_server_selected.png', full_page=True)
                    print("Screenshot 5 taken: screenshot_5_server_selected.png")
                    
                    # Go back to CHANNELS tab
                    channels_tab = page.locator('text=CHANNELS').first
                    if channels_tab.is_visible():
                        print("  Clicking back to CHANNELS tab...")
                        channels_tab.click()
                        time.sleep(1)
                        page.screenshot(path='C:/Users/njlec/Tavok/screenshot_6_back_to_channels.png', full_page=True)
                        print("Screenshot 6 taken: screenshot_6_back_to_channels.png")
                else:
                    print("  Could not find a server to click")
        else:
            print("Server already selected or message not found")
    except Exception as e:
        print(f"Error checking server selection: {e}")
    
    # Step 4: Take final screenshot and inspect channel list header
    print("\nStep 4: Inspecting channel list header area...")
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_final.png', full_page=True)
    print("Screenshot (final) taken: screenshot_final.png")
    
    # Get the entire page HTML for inspection
    try:
        page_html = page.content()
        with open('C:/Users/njlec/Tavok/page_full_html.txt', 'w', encoding='utf-8') as f:
            f.write(page_html)
        print("Full page HTML saved to page_full_html.txt")
    except Exception as e:
        print(f"Error saving page HTML: {e}")
    
    # Look for server name header and + button
    print("\nLooking for server name header and + button...")
    try:
        # Find all visible text elements that might be the server name
        print("\nSearching for server name in the left sidebar...")
        
        # Get all headings
        headings = page.locator('h1, h2, h3, h4, h5, h6, [role="heading"]').all()
        print(f"\nFound {len(headings)} headings:")
        for h in headings:
            if h.is_visible():
                text = h.text_content() or ''
                if text:
                    print(f"  - {text}")
        
        # Get all buttons
        all_buttons = page.locator('button, [role="button"]').all()
        print(f"\nFound {len(all_buttons)} total buttons")
        
        # Find buttons with + symbol or aria-label containing "add" or "create"
        plus_buttons = []
        for btn in all_buttons:
            if btn.is_visible():
                text = btn.text_content() or ''
                aria_label = btn.get_attribute('aria-label') or ''
                title = btn.get_attribute('title') or ''
                
                if ('+' in text or 
                    'add' in aria_label.lower() or 
                    'create' in aria_label.lower() or
                    'add' in title.lower() or
                    'create' in title.lower()):
                    plus_buttons.append({
                        'text': text.strip(),
                        'aria_label': aria_label,
                        'title': title
                    })
        
        print(f"\nFound {len(plus_buttons)} buttons with '+' or 'add/create' in labels:")
        for btn_info in plus_buttons:
            print(f"  - Text: '{btn_info['text']}' | Aria-label: '{btn_info['aria_label']}' | Title: '{btn_info['title']}'")
        
        # Look specifically in the left sidebar area
        print("\nSearching specifically in left sidebar region...")
        
        # Try to find the sidebar by common selectors
        sidebar_selectors = [
            'aside',
            '[role="complementary"]',
            '.sidebar',
            '[class*="sidebar"]',
            'nav',
            '[class*="channel"]',
        ]
        
        for selector in sidebar_selectors:
            try:
                sidebar = page.locator(selector).first
                if sidebar.is_visible():
                    print(f"\nFound sidebar with selector: {selector}")
                    
                    # Get buttons within the sidebar
                    sidebar_buttons = sidebar.locator('button, [role="button"]').all()
                    print(f"Buttons in sidebar: {len(sidebar_buttons)}")
                    
                    for btn in sidebar_buttons[:10]:  # First 10 buttons
                        if btn.is_visible():
                            text = btn.text_content() or ''
                            aria_label = btn.get_attribute('aria-label') or ''
                            print(f"  - Text: '{text.strip()}' | Aria-label: '{aria_label}'")
                    
                    break
            except Exception as e:
                continue
                
    except Exception as e:
        print(f"Error inspecting elements: {e}")
    
    print("\n" + "="*50)
    print("FINAL REPORT")
    print("="*50)
    print("\nPlease check the following files:")
    print("  - screenshot_final.png - Final state of the page")
    print("  - page_full_html.txt - Complete HTML for detailed inspection")
    print("\nThe script has completed its inspection.")
    print("="*50)
    
    # Keep browser open for manual inspection
    input("\nPress Enter to close the browser...")
    browser.close()
