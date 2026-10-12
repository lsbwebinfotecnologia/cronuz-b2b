import re
import os
import httpx
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("cronuz.book_lookup")


class ExternalBookLookupService:
    @classmethod
    async def lookup(cls, term: str) -> Optional[Dict[str, Any]]:
        """
        Ponto de entrada único para consulta de livro na internet.
        Detecta se o termo é um ISBN (10 ou 13 dígitos) ou título/autor em texto livre.
        """
        if not term or not term.strip():
            return None

        clean_term = term.strip()
        digits_only = re.sub(r'\D', '', clean_term)

        # Se for majoritariamente numérico com 10 ou 13 dígitos, busca prioritária por ISBN
        if digits_only and len(digits_only) in (10, 13) and len(digits_only) >= len(clean_term) - 4:
            res_isbn = await cls.lookup_by_isbn(digits_only)
            if res_isbn:
                return res_isbn

        # Caso não seja ISBN ou não tenha sido encontrado por ISBN, busca por título/termo livre
        return await cls.lookup_by_title(clean_term)

    @staticmethod
    async def lookup_by_isbn(isbn: str) -> Optional[Dict[str, Any]]:
        clean_isbn = re.sub(r'\D', '', str(isbn))
        if not clean_isbn or len(clean_isbn) not in [10, 13]:
            return None

        api_key = os.getenv("GOOGLE_BOOKS_API_KEY", "").strip()

        # 1. Tentar Google Books API por ISBN
        try:
            params = {"q": f"isbn:{clean_isbn}"}
            if api_key:
                params["key"] = api_key
            async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "CronuzB2B/1.0"}) as client:
                res = await client.get("https://www.googleapis.com/books/v1/volumes", params=params)
                if res.status_code == 200:
                    data = res.json()
                    total_items = data.get("totalItems", 0)
                    if total_items > 0 and "items" in data:
                        vol = data["items"][0].get("volumeInfo", {})
                        title = vol.get("title")
                        if title:
                            authors = vol.get("authors", [])
                            publisher = vol.get("publisher", "")
                            description = vol.get("description", "")
                            page_count = vol.get("pageCount")
                            image_links = vol.get("imageLinks", {})
                            cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail")
                            if cover_url and cover_url.startswith("http://"):
                                cover_url = cover_url.replace("http://", "https://")

                            author_str = ", ".join(authors) if isinstance(authors, list) else str(authors)
                            return {
                                "found": True,
                                "source": "GOOGLE_BOOKS",
                                "source_api": "Google Books",
                                "isbn": clean_isbn,
                                "title": title,
                                "author": author_str,
                                "authors": author_str,
                                "publisher": publisher,
                                "description": description,
                                "synopsis": description,
                                "page_count": page_count,
                                "cover_url": cover_url,
                                "price_estimated": 0.0,
                                "estimated_price": 0.0,
                            }
        except Exception as e:
            logger.warning(f"[ExternalBookLookup] Erro Google Books ISBN ({clean_isbn}): {e}")

        # 2. Tentar BrasilAPI ISBN (extremamente precisa para livros nacionais com ISBN)
        try:
            async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "CronuzB2B/1.0"}) as client:
                res = await client.get(f"https://brasilapi.com.br/api/isbn/v1/{clean_isbn}")
                if res.status_code == 200:
                    data = res.json()
                    title = data.get("title")
                    if title:
                        authors = data.get("authors", [])
                        publisher = data.get("publisher", "")
                        synopsis = data.get("synopsis", "")
                        cover_url = data.get("cover_url")
                        price = data.get("retail_price") or 0.0
                        author_str = ", ".join(authors) if isinstance(authors, list) else str(authors)

                        return {
                            "found": True,
                            "source": "BRASIL_API",
                            "source_api": "BrasilAPI",
                            "isbn": clean_isbn,
                            "title": title,
                            "author": author_str,
                            "authors": author_str,
                            "publisher": publisher,
                            "description": synopsis,
                            "synopsis": synopsis,
                            "cover_url": cover_url,
                            "price_estimated": float(price) if price else 0.0,
                            "estimated_price": float(price) if price else 0.0,
                        }
        except Exception as e:
            logger.warning(f"[ExternalBookLookup] Erro BrasilAPI ({clean_isbn}): {e}")

        # 3. Tentar OpenLibrary por ISBN
        try:
            async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "CronuzB2B/1.0 (contato@cronuz.com.br)"}) as client:
                res = await client.get(f"https://openlibrary.org/api/books?bibkeys=ISBN:{clean_isbn}&format=json&jscmd=data")
                if res.status_code == 200:
                    data = res.json()
                    key = f"ISBN:{clean_isbn}"
                    if key in data:
                        book_info = data[key]
                        title = book_info.get("title")
                        if title:
                            authors_list = [a.get("name") for a in book_info.get("authors", []) if "name" in a]
                            publishers_list = [p.get("name") for p in book_info.get("publishers", []) if "name" in p]
                            cover = book_info.get("cover", {}).get("large") or book_info.get("cover", {}).get("medium")
                            author_str = ", ".join(authors_list)
                            pub_str = ", ".join(publishers_list)

                            return {
                                "found": True,
                                "source": "OPEN_LIBRARY",
                                "source_api": "OpenLibrary",
                                "isbn": clean_isbn,
                                "title": title,
                                "author": author_str,
                                "authors": author_str,
                                "publisher": pub_str,
                                "description": "",
                                "synopsis": "",
                                "cover_url": cover,
                                "price_estimated": 0.0,
                                "estimated_price": 0.0,
                            }
        except Exception as e:
            logger.warning(f"[ExternalBookLookup] Erro OpenLibrary ISBN ({clean_isbn}): {e}")

        return None

    @classmethod
    async def lookup_by_title(cls, query: str) -> Optional[Dict[str, Any]]:
        """
        Pesquisa na internet quando o usuário busca por título ou texto livre (ex: 'pinoquio').
        1. Tenta Google Books por título/busca textual
        2. Tenta OpenLibrary Search API
        3. Se encontrar ISBN em uma das fontes, enriquece metadados
        """
        clean_query = query.strip()
        if not clean_query:
            return None

        api_key = os.getenv("GOOGLE_BOOKS_API_KEY", "").strip()

        # 1. Tentar Google Books API por query textual
        try:
            params = {"q": clean_query, "maxResults": 1, "langRestrict": "pt"}
            if api_key:
                params["key"] = api_key
            async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "CronuzB2B/1.0"}) as client:
                res = await client.get("https://www.googleapis.com/books/v1/volumes", params=params)
                if res.status_code == 200:
                    data = res.json()
                    total_items = data.get("totalItems", 0)
                    if total_items > 0 and "items" in data:
                        vol = data["items"][0].get("volumeInfo", {})
                        title = vol.get("title")
                        if title:
                            authors = vol.get("authors", [])
                            publisher = vol.get("publisher", "")
                            description = vol.get("description", "")
                            page_count = vol.get("pageCount")
                            image_links = vol.get("imageLinks", {})
                            cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail")
                            if cover_url and cover_url.startswith("http://"):
                                cover_url = cover_url.replace("http://", "https://")

                            isbn_found = ""
                            for ident in vol.get("industryIdentifiers", []):
                                if ident.get("type") in ("ISBN_13", "ISBN_10"):
                                    isbn_found = ident.get("identifier", "")
                                    break

                            author_str = ", ".join(authors) if isinstance(authors, list) else str(authors)
                            return {
                                "found": True,
                                "source": "GOOGLE_BOOKS",
                                "source_api": "Google Books",
                                "isbn": isbn_found,
                                "title": title,
                                "author": author_str,
                                "authors": author_str,
                                "publisher": publisher,
                                "description": description,
                                "synopsis": description,
                                "page_count": page_count,
                                "cover_url": cover_url,
                                "price_estimated": 0.0,
                                "estimated_price": 0.0,
                            }
        except Exception as e:
            logger.warning(f"[ExternalBookLookup] Erro Google Books Title ({clean_query}): {e}")

        # 2. Tentar OpenLibrary Search API (excelente catálogo internacional e nacional)
        try:
            async with httpx.AsyncClient(timeout=9.0, headers={"User-Agent": "CronuzB2B/1.0 (contato@cronuz.com.br)"}) as client:
                res = await client.get(
                    "https://openlibrary.org/search.json",
                    params={"q": clean_query, "limit": 6},
                )
                if res.status_code == 200:
                    docs = res.json().get("docs", [])
                    if docs:
                        best_doc = None
                        for d in docs:
                            if d.get("cover_i") or d.get("isbn"):
                                best_doc = d
                                break
                        if not best_doc:
                            best_doc = docs[0]

                        title = best_doc.get("title")
                        if title:
                            authors_list = best_doc.get("author_name", [])
                            publishers_list = best_doc.get("publisher", [])
                            cover_id = best_doc.get("cover_i")
                            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
                            isbns = best_doc.get("isbn", [])
                            isbn_found = isbns[0] if isbns else ""
                            author_str = ", ".join(authors_list[:3]) if authors_list else ""
                            pub_str = publishers_list[0] if publishers_list else ""

                            # Se localizou um ISBN válido, tenta complementar com a BrasilAPI
                            synopsis = ""
                            price_est = 0.0
                            if isbn_found and len(re.sub(r'\D', '', isbn_found)) in (10, 13):
                                try:
                                    clean_num = re.sub(r'\D', '', isbn_found)
                                    b_res = await client.get(f"https://brasilapi.com.br/api/isbn/v1/{clean_num}")
                                    if b_res.status_code == 200:
                                        b_data = b_res.json()
                                        if b_data.get("synopsis"):
                                            synopsis = b_data.get("synopsis")
                                        if b_data.get("cover_url") and not cover_url:
                                            cover_url = b_data.get("cover_url")
                                        if b_data.get("retail_price"):
                                            price_est = float(b_data.get("retail_price"))
                                        if not pub_str and b_data.get("publisher"):
                                            pub_str = b_data.get("publisher")
                                except Exception:
                                    pass

                            return {
                                "found": True,
                                "source": "OPEN_LIBRARY",
                                "source_api": "OpenLibrary",
                                "isbn": isbn_found,
                                "title": title,
                                "author": author_str,
                                "authors": author_str,
                                "publisher": pub_str,
                                "description": synopsis,
                                "synopsis": synopsis,
                                "cover_url": cover_url,
                                "price_estimated": price_est,
                                "estimated_price": price_est,
                            }
        except Exception as e:
            logger.warning(f"[ExternalBookLookup] Erro OpenLibrary Search ({clean_query}): {e}")

        return None

