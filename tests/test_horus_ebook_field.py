from main import app
import asyncio
from app.db.session import SessionLocal
from app.models.company_settings import CompanySettings
from app.integrators.horus_product_search import HorusProductSearch

async def main():
    db = SessionLocal()
    try:
        # BASE FMZ TESTE (company_id=4)
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == 4).first()
        if not settings:
            print("Nenhuma config com horus_enabled encontrada")
            return
        
        client = HorusProductSearch(db=db, company_id=4)
        
        # 1. Livro físico do print: 9786560920132 (Mulheres, casas e cidades)
        print("--- Consultando Livro Físico (9786560920132) ---")
        res_fisico = await client.busca_acervo(term="9786560920132", search_option="BARRAS_ISBN", limit=2)
        if res_fisico and isinstance(res_fisico, list):
            item = res_fisico[0]
            print("Campos do item físico:")
            for k, v in item.items():
                if any(x in k.lower() for x in ['ebook', 'tipo', 'formato', 'midia', 'livro', 'cat', 'prod', 'genero', 'sub']):
                    print(f"  {k}: {v}")
            print(f"  NOM_ITEM: {item.get('NOM_ITEM')}")
            print(f"  Chaves completas: {list(item.keys())}")
        else:
            print("Retorno físico:", res_fisico)
            
        # 2. E-book do print: 9786588280546 (Breve história das artistas mulheres)
        print("\n--- Consultando E-book (9786588280546) ---")
        res_ebook = await client.busca_acervo(term="9786588280546", search_option="BARRAS_ISBN", limit=2)
        if res_ebook and isinstance(res_ebook, list):
            item = res_ebook[0]
            print("Campos do item ebook:")
            for k, v in item.items():
                if any(x in k.lower() for x in ['ebook', 'tipo', 'formato', 'midia', 'livro', 'cat', 'prod', 'genero', 'sub']):
                    print(f"  {k}: {v}")
            print(f"  NOM_ITEM: {item.get('NOM_ITEM')}")
            print(f"  Chaves completas: {list(item.keys())}")
        else:
            print("Retorno ebook:", res_ebook)
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
