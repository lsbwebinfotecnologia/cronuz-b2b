import logging
from app.db.session import engine, Base
from app.models.user import User
from app.models.customer import Customer
from app.models.user_session import UserSession

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_patch():
    logger.info("Creating UserSession table...")
    Base.metadata.create_all(bind=engine, tables=[UserSession.__table__])
    logger.info("Done.")

if __name__ == "__main__":
    run_patch()
