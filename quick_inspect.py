from playwright.sync_api import sync_playwright
import time
import random

random_num = random.randint(1000, 9999)
test_email = f'test{random_num}@tavok.ai'
test_username = f'test{random_num}'
test_display_name = f'TestUser{random_num}'
test_password = 'Test123!'

print(f"\nCredentials: {test_email} / {test_password}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    print("\n1. Navigating to http://localhost:3000...")
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)
    
    # Go to register page
    print("2. Going to registration...")
    try:
        page.locator('a:has-text("Register")').click()
        time.sleep(1)
    except:
        pass
    
    print("3. Filling registration form...")
    # Get all input fields in order
    inputs = page.locator('input').all()
    
    # Fill each field
    for i, inp in enumerate(inputs):
        input_type = inp.get_attribute('type') or 'text'
        input_name = inp.get_attribute('name') or ''
        print(f"   Field {i}: type={input_type}, name={input_name}")
    
    # Fill by index since we know the order from the screenshot
    # 0: email, 1: displayName, 2: username, 3: password, 4: confirmPassword
    if len(inputs) >= 5:
        inputs[0].fill(test_email)
        print(f"   Filled email: {test_email}")
        
        inputs[1].fill(test_display_name)
        print(f"   Filled display name: {test_display_name}")
        
        inputs[2].fill(test_username)
        print(f"   Filled username: {test_username}")
        
        inputs[3].fill(test_password)
        print("   Filled password")
        
        inputs[4].fill(test_password)
        print("   Filled confirm password")
        
        time.sleep(1)
        page.screenshot(path='C:/Users/njlec/Tavok/reg_filled.png')
        print("   Screenshot: reg_filled.png")
        
        # Click Continue
        print("\n4. Clicking Continue...")
        page.locator('button:has-text("Continue")').click()
        page.wait_for_load_state('networkidle')
        time.sleep(3)
        
        page.screenshot(path='C:/Users/njlec/Tavok/after_reg.png')
        print("   Screenshot: after_reg.png")
        print(f"   URL: {page.url}")
        
        # Now inspect the main UI
        print("\n5. Inspecting sidebar...")
        time.sleep(2)
        
        # Look for tabs
        print("\n   Looking for CHANNELS and SERVERS tabs...")
        try:
            channels = page.locator('text=CHANNELS').first
            if channels.is_visible():
                print("   ✓ Found CHANNELS tab")
            else:
                print("   ✗ CHANNELS tab not visible")
        except:
            print("   ✗ CHANNELS tab not found")
        
        try:
            servers = page.locator('text=SERVERS').first
            if servers.is_visible():
                print("   ✓ Found SERVERS tab - clicking it...")
                servers.click()
                time.sleep(1)
                page.screenshot(path='C:/Users/njlec/Tavok/servers_tab.png')
                print("   Screenshot: servers_tab.png")
                
                # Look for a server to click
                print("\n   Looking for servers...")
                time.sleep(1)
                buttons = page.locator('[role="button"]').all()
                for btn in buttons:
                    if btn.is_visible():
                        text = (btn.text_content() or '').strip()
                        if text and len(text) > 2:
                            print(f"   Found: {text[:40]}")
                            # Click the first real server
                            if 'select' not in text.lower():
                                print(f"   Clicking: {text[:30]}")
                                btn.click()
                                time.sleep(1)
                                break
                
                # Go to CHANNELS tab
                print("\n   Going to CHANNELS tab...")
                channels = page.locator('text=CHANNELS').first
                if channels.is_visible():
                    channels.click()
                    time.sleep(1)
                    page.screenshot(path='C:/Users/njlec/Tavok/channels_with_server.png')
                    print("   Screenshot: channels_with_server.png")
            else:
                print("   ✗ SERVERS tab not visible")
        except Exception as e:
            print(f"   Error: {e}")
        
        # FINAL INSPECTION
        print("\n" + "="*60)
        print("FINAL INSPECTION")
        print("="*60)
        
        time.sleep(1)
        page.screenshot(path='C:/Users/njlec/Tavok/FINAL.png', full_page=True)
        print("\nFull page screenshot: FINAL.png")
        
        # Look for server name and + button
        print("\nSearching for server name header and + button...")
        
        # Get all visible text that might be the server name
        print("\n  Headings:")
        for h in page.locator('h1, h2, h3, h4, h5, h6').all():
            if h.is_visible():
                text = (h.text_content() or '').strip()
                if text:
                    print(f"    - {text}")
        
        # Get all buttons
        print("\n  Buttons with '+' or add/create:")
        for btn in page.locator('button, [role="button"]').all():
            if btn.is_visible():
                text = (btn.text_content() or '').strip()
                aria = btn.get_attribute('aria-label') or ''
                if '+' in text or 'add' in aria.lower() or 'create' in aria.lower():
                    print(f"    - Text: '{text}' | Aria: '{aria}'")
        
        # Try to capture just the sidebar
        print("\n  Capturing sidebar region...")
        try:
            sidebar = page.locator('aside').first
            if sidebar.is_visible():
                sidebar.screenshot(path='C:/Users/njlec/Tavok/SIDEBAR.png')
                print("    Sidebar screenshot: SIDEBAR.png")
                
                # Get sidebar HTML
                with open('C:/Users/njlec/Tavok/sidebar.html', 'w', encoding='utf-8') as f:
                    f.write(sidebar.inner_html())
                print("    Sidebar HTML: sidebar.html")
        except Exception as e:
            print(f"    Could not capture sidebar: {e}")
        
        print("\n" + "="*60)
        print("\nKey files to check:")
        print("  - FINAL.png (full page)")
        print("  - SIDEBAR.png (left sidebar only)")
        print("  - channels_with_server.png (channels view)")
        print("  - sidebar.html (sidebar HTML)")
        print("="*60)
    
    input("\nPress Enter to close...")
    browser.close()
