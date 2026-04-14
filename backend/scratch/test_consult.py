from app.db.session import SessionLocal
from app.models.service import ServiceOrder
from app.models.nfse import NFSeQueue
from app.integrators.nfse.factory import NFSeFactory
import asyncio

db = SessionLocal()
order_id = 29
order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id).first()
nfse_queue = db.query(NFSeQueue).filter(
    NFSeQueue.service_order_id == order.id,
    NFSeQueue.status.in_(["SUCCESS", "PROCESSING"])
).order_by(NFSeQueue.id.desc()).first()

client = NFSeFactory.get_provider(order.company)
protocol_dps = nfse_queue.xml_protocol_id

async def main():
    res = await client.consultar_nota_por_chave(protocol_dps)
    print("NFSE CONSULT:", res)

asyncio.run(main())
