import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.core.database import SessionLocal
    db = SessionLocal()
    from app.models.nfse import NFSeQueue
    
    q = db.query(NFSeQueue).filter(NFSeQueue.status == 'SUCCESS').order_by(NFSeQueue.id.desc()).first()
    if q and q.xml_retorno:
        with open('sample_nfse.xml', 'w') as f:
            f.write(q.xml_retorno)
        print("Salvo em sample_nfse.xml")
    else:
        print("Nenhuma nfse queue com SUCCESS encontrada")
except Exception as e:
    import traceback
    traceback.print_exc()
