path = "backend/main.py"
with open(path, "r") as f:
    content = f.read()

content = content.replace("from app.api import print_points", "from app.api import print_points\nfrom app.api import bank_slips")
content = content.replace("app.include_router(print_points.router, tags=[\"Print Points\"])", "app.include_router(print_points.router, tags=[\"Print Points\"])\napp.include_router(bank_slips.router, tags=[\"Bank Slips\"])")

with open(path, "w") as f:
    f.write(content)
print("Added router!")
