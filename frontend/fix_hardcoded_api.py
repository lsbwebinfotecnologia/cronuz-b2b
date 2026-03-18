import os
import re

def fix_api_urls(root_dir):
    pattern_string = r"(['`\"])http://localhost:8000(/?.*?)\1"
    
    # We want to replace 'http://localhost:8000/foo' with `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/foo`
    def replacer(match):
        # We construct the template literal string.
        # Ensure that any original dynamic parts inside backticks are preserved if the original was a backtick string
        path = match.group(2)
        # If the original string was a backtick string, it might contain ${vars}.
        # By wrapping it in backticks again, it remains a template literal.
        return f"`${{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}}{path}`"

    count = 0
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if filename.endswith(('.ts', '.tsx', '.js', '.jsx')):
                filepath = os.path.join(dirpath, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Check if it has the string
                if 'http://localhost:8000' in content:
                    # Note: don't replace if it's already part of the fallback like `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`!
                    # The regex looks for it enclosed exactly in quotes as start of URL.
                    # Wait, the fallback is exactly `'http://localhost:8000'`!
                    # So the regex `(['"`])http://localhost:8000(/?.*?)\1` would MATCH `'http://localhost:8000'` as well, where `path` is empty.
                    # If it's already inside the fallback, `process.env... || 'http://localhost:8000'` will be replaced with:
                    # `process.env... || `${process.env... || 'http://localhost:8000'}` `
                    # To prevent this, we first do a negative lookbehind or just handle it.

                    # Let's write a safer replace. We only replace if the preceding string is NOT "|| " or "||"
                    
                    pass

    # Better approach:
    # Just parse lines. If line contains "http://localhost:8000" and DOES NOT contain "NEXT_PUBLIC_API_URL"
    pass

def process_file_safely(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = []
    changed = False
    
    for line in content.split('\n'):
        if 'http://localhost:8000' in line and 'NEXT_PUBLIC_API_URL' not in line:
            # Replace 'http://localhost:8000/something' with `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/something`
            # Pattern matches single, double, or backtick strings starting with http://localhost:8000
            new_line = re.sub(
                r"(['\"\`])http://localhost:8000(/?.*?)\1",
                lambda m: f"`${{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}}{m.group(2)}`",
                line
            )
            if new_line != line:
                changed = True
                line = new_line
        new_content.append(line)
        
    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_content))
        print(f"Fixed: {filepath}")

for dirpath, _, filenames in os.walk('src'):
    for filename in filenames:
        if filename.endswith(('.ts', '.tsx', '.js', '.jsx')):
            process_file_safely(os.path.join(dirpath, filename))

