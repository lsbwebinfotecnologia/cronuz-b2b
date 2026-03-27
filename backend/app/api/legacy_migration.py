from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import pymysql

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.order import Order

router = APIRouter(prefix="/settings/migration", tags=["migration"])

class LegacyMigrationRequest(BaseModel):
    db_host: str
    db_user: str
    db_pass: str
    db_name: str
    db_port: int = 3306
    legacy_company_id: int
    target_company_id: int
    mode: str = "both"  # "customers", "orders", or "both"

@router.post("/mysql")
def migrate_legacy_data(
    payload: LegacyMigrationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER:
        raise HTTPException(status_code=403, detail="Apenas o MASTER pode executar migrações de dados legados.")
        
    try:
        conn = pymysql.connect(
            host=payload.db_host,
            user=payload.db_user,
            password=payload.db_pass,
            database=payload.db_name,
            port=payload.db_port,
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao conectar no banco MySQL: {str(e)}")
        
    customers_updated = 0
    orders_updated = 0
    errors = []
        
    with conn.cursor() as cursor:
        # Migrate Customers (empresas_b2b) -> crm_customer (id_guid)
        if payload.mode in ["both", "customers"]:
            try:
                # Schema based on the provided screenshot for usr_users
                cursor.execute("""
                    SELECT document, idGuid 
                    FROM usr_users 
                    WHERE idCompany = %s AND idGuid IS NOT NULL AND idGuid != ''
                """, (payload.legacy_company_id,))
                legacy_customers = cursor.fetchall()
                
                for l_cust in legacy_customers:
                    # Clean document mapping
                    raw_doc = str(l_cust.get('document', ''))
                    if not raw_doc or raw_doc.lower() == 'none':
                        continue
                    cnpj_clean = "".join(filter(str.isdigit, raw_doc))
                    
                    if not cnpj_clean:
                        continue

                    db_cust = db.query(Customer).filter(
                        Customer.company_id == payload.target_company_id,
                        Customer.document == cnpj_clean
                    ).first()
                    
                    if db_cust and not db_cust.id_guid:
                        db_cust.id_guid = l_cust['idGuid']
                        customers_updated += 1
                db.commit()
                
            except Exception as e:
                errors.append(f"Erro em Clientes: {str(e)}")
            
        # Migrate Orders (ord_orders) -> ord_order (horus_pedido_venda)
        if payload.mode in ["both", "orders"]:
            try:
                # Schema based on screenshot for ord_orders
                cursor.execute("""
                    SELECT idOrderPartner, idErp 
                    FROM ord_orders 
                    WHERE idCompany = %s AND idErp IS NOT NULL AND idErp != '' AND idOrderPartner IS NOT NULL AND idOrderPartner != ''
                """, (payload.legacy_company_id,))
                legacy_orders = cursor.fetchall()
                
                for l_ord in legacy_orders:
                    tracking = str(l_ord['idOrderPartner']).strip()
                    nro_erp = str(l_ord['idErp']).strip()
                    
                    db_ord = db.query(Order).filter(
                        Order.company_id == payload.target_company_id,
                        Order.tracking_code == tracking,
                        Order.origin == "bookinfo"
                    ).first()
                    
                    if db_ord and not db_ord.horus_pedido_venda:
                        db_ord.horus_pedido_venda = nro_erp
                        orders_updated += 1
                db.commit()
                
            except Exception as e:
                errors.append(f"Erro em Pedidos: {str(e)}")
            
    conn.close()
    
    return {
        "message": "Migração legada concluída.",
        "stats": {
            "customers_updated": customers_updated,
            "orders_updated": orders_updated,
            "errors": errors
        }
    }

