import json

with open("scratch/SW7ey5A8.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("Type of data:", type(data))
if isinstance(data, dict):
    print("Keys of dictionary:", list(data.keys()))
    if "collection" in data:
        print("Keys of data['collection']:", list(data["collection"].keys()))
        # Maybe it has item list
        items = data["collection"].get("item", [])
        print("Number of items in collection:", len(items))
        for it in items:
            print("-", it.get("name"))
