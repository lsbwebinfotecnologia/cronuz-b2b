import re

path = "frontend/src/app/(dashboard)/settings/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Update initial state of settings
settings_initial_str = "    b2b_show_stock_quantity: true,\n  });"
settings_initial_r = """    b2b_show_stock_quantity: true,
    inter_enabled: false,
    inter_sandbox: true,
    inter_client_id: '',
    inter_client_secret: '',
    inter_account_number: '',
  });"""
if "inter_enabled: false" not in content and settings_initial_str in content:
    content = content.replace(settings_initial_str, settings_initial_r)

# 2. Update fetchSettings response mapping
settings_fetch_str = "        b2b_show_stock_quantity: data.b2b_show_stock_quantity !== undefined ? data.b2b_show_stock_quantity : true,\n      }));"
settings_fetch_r = """        b2b_show_stock_quantity: data.b2b_show_stock_quantity !== undefined ? data.b2b_show_stock_quantity : true,
        inter_enabled: data.inter_enabled || false,
        inter_sandbox: data.inter_sandbox ?? true,
        inter_client_id: data.inter_client_id || '',
        inter_client_secret: data.inter_client_secret || '',
        inter_account_number: data.inter_account_number || '',
      }));"""
if "inter_enabled: data.inter_enabled" not in content and settings_fetch_str in content:
    content = content.replace(settings_fetch_str, settings_fetch_r)

with open(path, "w") as f:
    f.write(content)
print("Frontend Settings state patched.")
