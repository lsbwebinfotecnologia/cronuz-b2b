import httpx
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

urls = [
    "https://documenter.gw.postman.com/api/collections/9533160/SW7ey5A8?segregateAuth=true&versionTag=latest",
    "https://documenter.gw.postman.com/view/metadata/SW7ey5A8",
    "https://documenter-api.postman.tech/view/9533160/SW7ey5A8",
]

for url in urls:
    try:
        print(f"Trying: {url}")
        r = httpx.get(url, headers=headers, follow_redirects=True, timeout=15.0)
        print("Status:", r.status_code)
        if r.status_code == 200:
            data = r.json()
            print("Successfully fetched JSON!")
            # Save it
            name = url.split("/")[-1].split("?")[0]
            with open(f"scratch/{name}.json", "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"Saved to scratch/{name}.json")
            
            # Search for ConfereItem_Pedido
            # JSON can be serialized as string in some fields, let's dump to string and search
            data_str = json.dumps(data)
            if "ConfereItem_Pedido" in data_str:
                print(">>> Found ConfereItem_Pedido in this JSON! <<<")
                # Let's search inside data to extract the specific item
                # Usually Postman collection has item[] -> item[] -> request/response
                def find_item_by_name(obj, target_name):
                    if isinstance(obj, dict):
                        if obj.get("name") == target_name or (obj.get("request") and target_name in obj.get("request", {}).get("url", {}).get("raw", "")):
                            return obj
                        for k, v in obj.items():
                            res = find_item_by_name(v, target_name)
                            if res: return res
                    elif isinstance(obj, list):
                        for item in obj:
                            res = find_item_by_name(item, target_name)
                            if res: return res
                    return None
                
                target = find_item_by_name(data, "ConfereItem_Pedido")
                if target:
                    print("Found specific item:")
                    print(json.dumps(target, indent=2))
                else:
                    # Let's print occurrences
                    print("Could not find item by exact name, but string contains it. Let's look closer.")
                    
    except Exception as e:
        print("Failed:", str(e))
