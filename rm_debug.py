import re

def remove_debug(filename, is_customer=False):
    content = open(filename).read()
    
    if is_customer:
        start_sig = '@router.get("/consignment/debug")'
        # The next route is usually @router.get("/consignment/summary")
        end_sig = '@router.get("/consignment/summary")'
    else:
        start_sig = '@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}/consignment/debug")'
        end_sig = '@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}/consignment/summary")'
        
    start_idx = content.find(start_sig)
    end_idx = content.find(end_sig)
    
    if start_idx != -1 and end_idx != -1:
        # We need to remove everything from start_sig to just before end_sig
        block_to_remove = content[start_idx:end_idx]
        content = content.replace(block_to_remove, "")
        open(filename, "w").write(content)
        print(f"Removed debug route from {filename}")
    else:
        print(f"Could not find debug route in {filename}")

remove_debug("backend/app/api/customer_portal.py", True)
remove_debug("backend/app/api/horus.py", False)
