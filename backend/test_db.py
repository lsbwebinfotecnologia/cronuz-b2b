import sys
import traceback
from app.db.session import SessionLocal
from app.models.company import Company
from app.schemas.company import Company as CompanySchema

def test():
    try:
        db = SessionLocal()
        companies = db.query(Company).all()
        print("DB QUERY SUCCESS, count:", len(companies))
        for c in companies:
            print(c.id, c.name, getattr(c, 'zip_code', 'NO_ZIP'))
            # Test schema validation
            mapped = CompanySchema.model_validate(c)
            print("SCHEMA MAPPING SUCCESS:", mapped.id)
    except Exception as e:
        print("EXCEPTION OCCURRED:", e)
        traceback.print_exc()

if __name__ == "__main__":
    test()
