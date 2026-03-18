import sys
import os
sys.path.append('/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend')
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.company_settings import CompanySettings

db = SessionLocal()

# Set custom domain for company 1
company = db.query(Company).filter(Company.id == 1).first()
if company:
    company.custom_domain = "le.b2bhorus.com.br"
    
# Set branding settings for company 1
settings = db.query(CompanySettings).filter(CompanySettings.company_id == 1).first()
if not settings:
    settings = CompanySettings(company_id=1)
    db.add(settings)

settings.brand_logo_url = "https://horusb2b.com.br/wp-content/uploads/2021/08/logo-horus-b2b-branca.png"
settings.brand_background_url = "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80"
settings.brand_primary_color = "#e11d48"

db.commit()
print("Database updated successfully.")
