content = open('backend/app/api/horus.py').read()

# We need to take the get_horus_customer route block and move it below get_consignment_details
import re

start_idx = content.find('@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}")')
end_idx = content.find('@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}/consignment/summary")')

# Wait, there are models defined before get_consignment_summary:
# class ConsignmentSubmitItem, ConsignmentSubmitRequest
# Let's just find the exact block of get_horus_customer

block_start = content.find('@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}")')

# Function ends when the next @router or class starts or something else.
# But we already know exactly what's between them.
# A regex to match the entire function get_horus_customer:
pattern = re.compile(r'(@router\.get\("/companies/\{company_id\}/horus/customers/\{cnpj_cliente:path\}"\)\nasync def get_horus_customer.*?(?=\nfrom pydantic import BaseModel|\nclass ConsignmentSubmitItem|\n@router|\Z))', re.DOTALL)
match = pattern.search(content)
if match:
    block = match.group(0)
    # Remove it from its current position
    content = content.replace(block, "")
    
    # Append it to the very bottom of the file
    content = content.strip() + "\n\n" + block + "\n"
    open('backend/app/api/horus.py', 'w').write(content)
    print("Fixed routes")
else:
    print("Could not find get_horus_customer")

