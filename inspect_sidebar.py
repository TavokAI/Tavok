from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # Step 1: Navigate to localhost:3000
    print("Step 1: Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    
    # Take initial screenshot
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_1_initial.png', full_page=True)
    print("Screenshot 1 taken: screenshot_1_initial.png")
    
    # Step 2: Check if CHANNELS tab is selected
    print("\nStep 2: Checking CHANNELS tab...")
    try:
        # Look for CHANNELS tab
        channels_tab = page.locator('text=CHANNELS').first
        if channels_tab.is_visible():
            print("CHANNELS tab found")
            # Check if it's selected (has specific styling or aria-selected)
            channels_tab_parent = channels_tab.locator('xpath=..')
            class_name = channels_tab_parent.get_attribute('class') or ''
            aria_selected = channels_tab_parent.get_attribute('aria-selected') or ''
            print(f"  Class: {class_name}")
            print(f"  Aria-selected: {aria_selected}")
            
            # Click on CHANNELS tab if not selected
            if 'selected' not in class_name.lower() and aria_selected != 'true':
                print("  Clicking CHANNELS tab...")
                channels_tab.click()
                time.sleep(1)
                page.screenshot(path='C:/Users/njlec/Tavok/screenshot_2_channels_clicked.png', full_page=True)
                print("Screenshot 2 taken: screenshot_2_channels_clicked.png")
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
                page.screenshot(path='C:/Users/njlec/Tavok/screenshot_3_servers_tab.png', full_page=True)
                print("Screenshot 3 taken: screenshot_3_servers_tab.png")
                
                # Click on the first server in the list
                print("  Looking for a server to click...")
                # Try to find server items in the list
                server_items = page.locator('[role="button"]').all()
                for item in server_items[:5]:  # Check first 5 items
                    text = item.text_content()
                    print(f"    Found item: {text}")
                    if text and 'server' in text.lower() and 'select' not in text.lower():
                        print(f"  Clicking server: {text}")
                        item.click()
                        time.sleep(1)
                        break
                
                # Go back to CHANNELS tab
                channels_tab = page.locator('text=CHANNELS').first
                if channels_tab.is_visible():
                    print("  Clicking back to CHANNELS tab...")
                    channels_tab.click()
                    time.sleep(1)
                    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_4_back_to_channels.png', full_page=True)
                    print("Screenshot 4 taken: screenshot_4_back_to_channels.png")
        else:
            print("Server already selected")
    except Exception as e:
        print(f"Error checking server selection: {e}")
    
    # Step 4: Take final screenshot and inspect channel list header
    print("\nStep 4: Inspecting channel list header area...")
    time.sleep(1)
    page.screenshot(path='C:/Users/njlec/Tavok/screenshot_5_final.png', full_page=True)
    print("Screenshot 5 taken: screenshot_5_final.png")
    
    # Get the HTML of the left sidebar
    try:
        sidebar = page.locator('.sidebar, [class*="sidebar"], aside').first
        if sidebar.is_visible():
            sidebar_html = sidebar.inner_html()
            with open('C:/Users/njlec/Tavok/sidebar_html.txt', 'w', encoding='utf-8') as f:
                f.write(sidebar_html)
            print("Sidebar HTML saved to sidebar_html.txt")
    except Exception as e:
        print(f"Error getting sidebar HTML: {e}")
    
    # Look for server name header and + button
    print("\nLooking for server name and + button...")
    try:
        # Find all headings and buttons in the visible area
        headings = page.locator('h1, h2, h3, h4, h5, h6').all()
        print(f"Found {len(headings)} headings:")
        for h in headings:
            if h.is_visible():
                text = h.text_content()
                print(f"  - {text}")
        
        # Find all buttons with + symbol
        plus_buttons = page.locator('button:has-text("+"), [role="button"]:has-text("+")').all()
        print(f"\nFound {len(plus_buttons)} buttons with '+' symbol:")
        for btn in plus_buttons:
            if btn.is_visible():
                text = btn.text_content()
                aria_label = btn.get_attribute('aria-label') or ''
                print(f"  - Text: '{text}' | Aria-label: '{aria_label}'")
    except Exception as e:
        print(f"Error inspecting elements: {e}")
    
    print("\n=== FINAL REPORT ===")
    print("Check the screenshots and sidebar_html.txt for detailed inspection")
    
    # Keep browser open for manual inspection
    input("\nPress Enter to close the browser...")
    browser.close()
