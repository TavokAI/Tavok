#!/usr/bin/env python3
"""Test workspace panel drag behavior and file attachment."""

from playwright.sync_api import sync_playwright
import sys
import time

def test_panel_drag_and_attach():
    """Test panel drag behavior and file attach functionality."""
    results = {
        "drag_smoothness": "FAIL",
        "drag_bounds_clamping": "FAIL", 
        "attach_button_opens_chooser": "FAIL",
        "upload_flow_works": "FAIL",
        "errors": []
    }
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        # Listen for console errors
        def handle_console(msg):
            if msg.type == 'error':
                results["errors"].append(f"Console error: {msg.text}")
        page.on('console', handle_console)
        
        try:
            print("Navigating to application...")
            page.goto('http://localhost:3000', wait_until='networkidle', timeout=30000)
            page.wait_for_timeout(2000)
            
            # Take initial screenshot
            page.screenshot(path='test_initial.png')
            print("Initial page loaded")
            
            # Check if we're on login page and need to login/register
            if '/login' in page.url or page.url == 'http://localhost:3000/':
                print("Need to login/register...")
                
                # Try to register first
                import uuid
                test_id = str(uuid.uuid4())[:8]
                test_email = f"panel-test-{test_id}@example.com"
                test_username = f"paneluser{test_id}"
                test_password = "TestPass123!"
                
                print(f"Attempting to register: {test_email}")
                
                # Check if we need to navigate to register
                try:
                    if page.locator('a:has-text("Sign up")').is_visible(timeout=2000):
                        page.click('a:has-text("Sign up")')
                        page.wait_for_timeout(1000)
                except:
                    pass
                
                # Try to register
                try:
                    if page.locator('input[name="email"]').is_visible(timeout=2000):
                        page.fill('input[name="email"]', test_email)
                        page.fill('input[name="username"]', test_username)
                        page.fill('input[name="displayName"]', f"Panel Test User")
                        page.fill('input[name="password"]', test_password)
                        page.fill('input[name="confirmPassword"]', test_password)
                        page.click('button[type="submit"]')
                        page.wait_for_timeout(3000)
                        print("Registration submitted")
                except Exception as e:
                    print(f"Registration attempt: {e}")
                
                # Now try to login
                try:
                    if '/login' in page.url:
                        page.fill('input[type="email"]', test_email)
                        page.fill('input[type="password"]', test_password)
                        page.click('button[type="submit"]')
                        page.wait_for_timeout(5000)
                        print(f"Login attempted, current URL: {page.url}")
                except Exception as e:
                    print(f"Login attempt: {e}")
                
                # If we're now on home page, good
                page.wait_for_timeout(2000)
                print(f"After auth flow, URL: {page.url}")
            
            # Navigate to a channel
            print("Looking for a channel to navigate to...")
            page.screenshot(path='test_after_login.png')
            
            # Try to find and click a channel
            channel_selectors = [
                '[data-channel-id]',
                'button:has-text("general")',
                'a[href*="/channels/"]',
                'div[role="button"]:has-text("general")'
            ]
            
            channel_found = False
            for selector in channel_selectors:
                try:
                    if page.locator(selector).first.is_visible(timeout=2000):
                        page.locator(selector).first.click()
                        channel_found = True
                        print(f"Clicked channel using selector: {selector}")
                        break
                except:
                    continue
            
            if not channel_found:
                print("Warning: Could not find channel, continuing anyway...")
            
            page.wait_for_timeout(2000)
            page.screenshot(path='test_in_channel.png')
            
            # A) DRAG BEHAVIOR TESTS
            print("\n=== Testing Drag Behavior ===")
            
            # Look for a panel or button to open a panel
            panel_trigger_selectors = [
                'button:has-text("Chat")',
                'button[title*="panel"]',
                '[data-panel-trigger]',
                'button:has-text("Panel")'
            ]
            
            panel_opened = False
            for selector in panel_trigger_selectors:
                try:
                    if page.locator(selector).is_visible(timeout=2000):
                        print(f"Found panel trigger: {selector}")
                        page.locator(selector).click()
                        panel_opened = True
                        page.wait_for_timeout(1000)
                        break
                except:
                    continue
            
            if not panel_opened:
                # Try to find if panel is already open
                panel_selectors = [
                    '[data-panel-id]',
                    '.panel',
                    '[class*="panel"]',
                    'div[style*="position: absolute"]'
                ]
                
                for selector in panel_selectors:
                    try:
                        panels = page.locator(selector).all()
                        if len(panels) > 0:
                            print(f"Found {len(panels)} existing panel(s) using: {selector}")
                            panel_opened = True
                            break
                    except:
                        continue
            
            if not panel_opened:
                results["errors"].append("Could not find or open a panel")
                print("ERROR: Could not find or open a panel")
                page.screenshot(path='test_no_panel.png')
            else:
                page.screenshot(path='test_panel_opened.png')
                
                # Find the panel to drag
                panel = None
                panel_selector = None
                
                for selector in ['[data-panel-id]', '.panel', '[class*="panel"]']:
                    try:
                        if page.locator(selector).first.is_visible(timeout=1000):
                            panel = page.locator(selector).first
                            panel_selector = selector
                            print(f"Found panel to drag: {selector}")
                            break
                    except:
                        continue
                
                if panel:
                    # Get panel bounding box
                    box = panel.bounding_box()
                    if box:
                        print(f"Panel initial position: x={box['x']}, y={box['y']}")
                        
                        # Test 1: Slow drag
                        print("Test 1: Slow drag...")
                        start_x = box['x'] + box['width'] / 2
                        start_y = box['y'] + 20  # Drag from top area
                        
                        page.mouse.move(start_x, start_y)
                        page.mouse.down()
                        
                        # Slow drag right and down
                        steps = 20
                        for i in range(steps):
                            page.mouse.move(start_x + (200 * i / steps), start_y + (100 * i / steps))
                            page.wait_for_timeout(50)
                        
                        page.mouse.up()
                        page.wait_for_timeout(500)
                        page.screenshot(path='test_after_slow_drag.png')
                        
                        # Check new position
                        box_after_slow = panel.bounding_box()
                        if box_after_slow:
                            print(f"Panel after slow drag: x={box_after_slow['x']}, y={box_after_slow['y']}")
                            
                            # Check if movement was smooth (no big jumps)
                            expected_x = start_x + 200
                            expected_y = start_y + 100
                            x_diff = abs(box_after_slow['x'] + box_after_slow['width']/2 - expected_x)
                            y_diff = abs(box_after_slow['y'] + 20 - expected_y)
                            
                            print(f"Position delta: x_diff={x_diff}, y_diff={y_diff}")
                            
                            if x_diff < 100 and y_diff < 100:
                                results["drag_smoothness"] = "PASS"
                                print("✓ Drag smoothness: PASS (reasonable position tracking)")
                            else:
                                results["errors"].append(f"Large position jump: x_diff={x_diff}, y_diff={y_diff}")
                                print(f"✗ Drag smoothness: FAIL (large jump detected)")
                        
                        # Test 2: Fast drag
                        print("Test 2: Fast drag...")
                        current_box = panel.bounding_box()
                        if current_box:
                            start_x = current_box['x'] + current_box['width'] / 2
                            start_y = current_box['y'] + 20
                            
                            page.mouse.move(start_x, start_y)
                            page.mouse.down()
                            page.mouse.move(start_x - 150, start_y + 80, steps=5)
                            page.mouse.up()
                            page.wait_for_timeout(500)
                            page.screenshot(path='test_after_fast_drag.png')
                            
                            box_after_fast = panel.bounding_box()
                            if box_after_fast:
                                print(f"Panel after fast drag: x={box_after_fast['x']}, y={box_after_fast['y']}")
                        
                        # Test 3: Bounds clamping
                        print("Test 3: Testing bounds clamping...")
                        viewport_size = page.viewport_size
                        print(f"Viewport size: {viewport_size}")
                        
                        current_box = panel.bounding_box()
                        if current_box:
                            # Try to drag beyond left edge
                            start_x = current_box['x'] + current_box['width'] / 2
                            start_y = current_box['y'] + 20
                            
                            page.mouse.move(start_x, start_y)
                            page.mouse.down()
                            page.mouse.move(-500, start_y, steps=10)  # Try to go way off-screen left
                            page.mouse.up()
                            page.wait_for_timeout(500)
                            page.screenshot(path='test_bounds_check.png')
                            
                            box_after_bounds = panel.bounding_box()
                            if box_after_bounds:
                                print(f"Panel after bounds test: x={box_after_bounds['x']}, y={box_after_bounds['y']}")
                                
                                # Check if panel stayed within bounds
                                if box_after_bounds['x'] >= 0 and box_after_bounds['x'] < viewport_size['width']:
                                    results["drag_bounds_clamping"] = "PASS"
                                    print("✓ Bounds clamping: PASS (panel stayed within workspace)")
                                else:
                                    results["errors"].append(f"Panel went out of bounds: x={box_after_bounds['x']}")
                                    print(f"✗ Bounds clamping: FAIL (panel at x={box_after_bounds['x']})")
                    else:
                        results["errors"].append("Could not get panel bounding box")
                else:
                    results["errors"].append("Could not locate panel element for dragging")
            
            # B) FILE ATTACH BEHAVIOR TESTS
            print("\n=== Testing File Attach Behavior ===")
            page.screenshot(path='test_before_attach.png')
            
            # Look for file attach button in the panel
            attach_selectors = [
                'button[aria-label*="attach"]',
                'button[title*="attach"]',
                'button:has-text("Attach")',
                'input[type="file"]',
                '[data-attach-button]',
                'button:has([class*="paperclip"])',
                'button:has([class*="attach"])'
            ]
            
            attach_button = None
            for selector in attach_selectors:
                try:
                    if page.locator(selector).first.is_visible(timeout=2000):
                        attach_button = page.locator(selector).first
                        print(f"Found attach button: {selector}")
                        break
                except:
                    continue
            
            if not attach_button:
                results["errors"].append("Could not find file attach button")
                print("ERROR: Could not find file attach button")
                page.screenshot(path='test_no_attach_button.png')
            else:
                # Check if it's an input[type="file"] or a button
                tag_name = attach_button.evaluate('el => el.tagName.toLowerCase()')
                input_type = attach_button.evaluate('el => el.type') if tag_name == 'input' else None
                
                print(f"Attach element: tag={tag_name}, type={input_type}")
                
                if tag_name == 'input' and input_type == 'file':
                    # Direct file input
                    print("Found direct file input, testing file chooser...")
                    try:
                        # Set up file chooser handler
                        with page.expect_file_chooser() as fc_info:
                            attach_button.click()
                        
                        file_chooser = fc_info.value
                        print("✓ File chooser opened successfully")
                        results["attach_button_opens_chooser"] = "PASS"
                        
                        # Create a test file and upload
                        test_file_path = 'C:\\Users\\njlec\\Hive-Chat\\.playwright-mcp\\test-upload.txt'
                        import os
                        if not os.path.exists(test_file_path):
                            with open(test_file_path, 'w') as f:
                                f.write("Test attachment content")
                        
                        file_chooser.set_files(test_file_path)
                        page.wait_for_timeout(1000)
                        page.screenshot(path='test_after_upload.png')
                        
                        # Check if file appears in UI
                        file_indicators = [
                            f'text={os.path.basename(test_file_path)}',
                            '[data-attachment]',
                            '[class*="attachment"]',
                            'text=test-upload.txt'
                        ]
                        
                        for indicator in file_indicators:
                            try:
                                if page.locator(indicator).is_visible(timeout=2000):
                                    print(f"✓ File attachment visible: {indicator}")
                                    results["upload_flow_works"] = "PASS"
                                    break
                            except:
                                continue
                        
                        if results["upload_flow_works"] == "FAIL":
                            print("✗ File upload did not show in UI")
                            results["errors"].append("File upload did not appear in UI")
                        
                    except Exception as e:
                        print(f"✗ Error testing file chooser: {e}")
                        results["errors"].append(f"File chooser error: {str(e)}")
                else:
                    # Button that triggers file input
                    print("Found button that should trigger file input...")
                    try:
                        with page.expect_file_chooser(timeout=5000) as fc_info:
                            attach_button.click()
                        
                        file_chooser = fc_info.value
                        print("✓ File chooser opened successfully")
                        results["attach_button_opens_chooser"] = "PASS"
                        
                        # Try to upload
                        test_file_path = 'C:\\Users\\njlec\\Hive-Chat\\.playwright-mcp\\test-upload.txt'
                        import os
                        if not os.path.exists(test_file_path):
                            with open(test_file_path, 'w') as f:
                                f.write("Test attachment content")
                        
                        file_chooser.set_files(test_file_path)
                        page.wait_for_timeout(1000)
                        page.screenshot(path='test_after_upload.png')
                        
                        # Check if file appears in UI
                        if page.locator('text=test-upload.txt').is_visible(timeout=2000):
                            print("✓ File attachment visible in UI")
                            results["upload_flow_works"] = "PASS"
                        else:
                            print("✗ File upload did not show in UI")
                            results["errors"].append("File upload did not appear in UI")
                            
                    except Exception as e:
                        print(f"✗ File chooser did not open: {e}")
                        results["errors"].append(f"File chooser did not open: {str(e)}")
            
            page.screenshot(path='test_final.png')
            
        except Exception as e:
            print(f"ERROR during test: {e}")
            results["errors"].append(f"Test exception: {str(e)}")
            page.screenshot(path='test_error.png')
        finally:
            browser.close()
    
    return results

if __name__ == "__main__":
    print("Starting workspace panel tests...\n")
    results = test_panel_drag_and_attach()
    
    print("\n" + "="*60)
    print("TEST RESULTS")
    print("="*60)
    print(f"Drag smoothness: {results['drag_smoothness']}")
    print(f"Drag bounds clamping: {results['drag_bounds_clamping']}")
    print(f"Attach button opens chooser: {results['attach_button_opens_chooser']}")
    print(f"Upload flow works: {results['upload_flow_works']}")
    
    if results["errors"]:
        print(f"\nErrors observed ({len(results['errors'])}):")
        for error in results["errors"]:
            print(f"  - {error}")
    else:
        print("\nNo errors observed")
    
    print("="*60)
    
    # Exit with failure code if any test failed
    all_pass = all(v == "PASS" for k, v in results.items() if k != "errors")
    sys.exit(0 if all_pass else 1)
