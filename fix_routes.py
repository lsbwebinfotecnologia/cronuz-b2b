with open("backend/app/api/customers.py", "r") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "# --- Customer Groups Routes ---" in line:
        start_idx = i
        break

end_idx = len(lines)

group_routes = lines[start_idx:end_idx]
del lines[start_idx:end_idx]

# Find where to insert (before @router.get("/customers/{customer_id}")
insert_idx = -1
for i, line in enumerate(lines):
    if '@router.get("/customers/{customer_id}", response_model=CustomerSchema)' in line:
        insert_idx = i
        break

lines = lines[:insert_idx] + group_routes + ["\n"] + lines[insert_idx:]

with open("backend/app/api/customers.py", "w") as f:
    f.writelines(lines)
