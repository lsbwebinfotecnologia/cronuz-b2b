def safe_price(val):
    if not val:
        return 0.0
    if isinstance(val, float):
        # Was parsed correctly by something else
        return val
    s = str(val).strip()
    if "," in s:
        # e.g., "53,94"
        s = s.replace(",", ".")
    try:
        return float(s)
    except:
        return 0.0

print(safe_price("53,94"))
print(safe_price(53.94))
print(safe_price(5394))
