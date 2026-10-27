#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste automatizado do Protocolo Gertec Busca Preço G2 (TC406 / BPG2S / BPG2E)
e validação de formatação de visor 4x20 + handshake TCP.
"""
import asyncio
import queue
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "tools" / "gertec-busca-preco-g2"))

from cronuz_gertec_app import (
    format_gertec_product_name,
    build_gertec_price_response,
    build_gertec_mesg,
    GertecTcpServerThread,
)


def test_gertec_formatting():
    # 1. Verifica que o nome sempre tem exatamente 80 bytes (4 linhas x 20 colunas)
    name_80 = format_gertec_product_name("O Senhor dos Anéis: A Sociedade do Anel", "HarperCollins")
    assert len(name_80) == 80, f"Tamanho esperado 80, obtido {len(name_80)}"
    assert "|" not in name_80

    # 2. Verifica pacote completo #<80 bytes>|R$ XX,XX
    pkt = build_gertec_price_response(
        nome="Dom Casmurro - Edição Especial de Luxo",
        preco=59.90,
        extra_info="Machado de Assis",
        saldo=12,
        show_stock=True,
    )
    decoded = pkt.decode("ascii")
    assert decoded.startswith("#")
    parts = decoded[1:].split("|")
    assert len(parts) == 2
    assert len(parts[0]) == 80
    assert parts[1] == "R$ 59,90 (12 UN)"

    # 3. Verifica comando #mesg de boas-vindas
    mesg = build_gertec_mesg("LIVRARIA CRONUZ", "CONSULTE AQUI!", 5)
    assert mesg.startswith(b"#mesg")
    print("[OK] Formatação de protocolo Gertec G2 (80 bytes + preço + #mesg) validada com sucesso!")


async def simulate_gertec_g2_hardware_client(port: int):
    """Simula um aparelho físico Gertec Busca Preço G2 conectando na porta TCP."""
    reader, writer = await asyncio.open_connection("127.0.0.1", port)

    # 1. Deve receber b"#ok" imediatamente do servidor
    handshake = await asyncio.wait_for(reader.read(64), timeout=3.0)
    assert handshake == b"#ok", f"Handshake inesperado: {handshake}"

    # 2. Envia versão do firmware igual ao Gertec G2S
    writer.write(b"#bpg2s|4.3.2 S")
    await writer.drain()

    # 3. Recebe #alwayslive e responde #alwayslive_ok (como o hardware Gertec G2 faz)
    data = await asyncio.wait_for(reader.read(255), timeout=4.0)
    assert b"#alwayslive" in data, f"Esperado #alwayslive, recebido: {data}"
    writer.write(b"#alwayslive_ok")
    await writer.drain()

    # 4. Recebe #mesg de boas-vindas
    if b"#mesg" not in data:
        data2 = await asyncio.wait_for(reader.read(255), timeout=4.0)
        assert b"#mesg" in data2, f"Esperado #mesg, recebido: {data2}"

    # 5. Simula leitura de código de barras no scanner do Gertec G2
    writer.write(b"#9788535914849")
    await writer.drain()

    resp = await asyncio.wait_for(reader.read(255), timeout=5.0)
    assert resp.startswith(b"#"), f"Resposta inválida para leitura de código: {resp}"
    print(f"[OK] Resposta recebida pelo terminal Gertec G2 simulado: {resp.decode('ascii')}")

    writer.close()
    await writer.wait_closed()


def test_tcp_server_handshake():
    q = queue.Queue()
    test_port = 16500

    def dummy_cfg():
        return {
            "api_base_url": "http://127.0.0.1:8000",
            "access_token": "test",
            "tcp_port": test_port,
            "welcome_line1": "LIVRARIA TESTE",
            "welcome_line2": "PASSE O CODIGO",
            "display_time_sec": 5,
            "cache_ttl_sec": 120,
            "show_stock_in_price_line": True,
        }

    srv = GertecTcpServerThread(dummy_cfg, q)
    # Pre-popula um item no cache para testar o ciclo TCP completo sem depender de token real
    import time
    srv.cache["9788535914849"] = {
        "data": {
            "found": True,
            "barcode": "9788535914849",
            "nome": "1984 - GEORGE ORWELL",
            "preco": 49.90,
            "saldo": 8,
            "extra": "COMPANHIA DAS LETRAS",
            "error": None,
        },
        "ts": time.time(),
    }
    srv.start()

    # Aguarda servidor iniciar
    import time as _t
    for _ in range(20):
        if srv.running:
            break
        _t.sleep(0.1)

    try:
        asyncio.run(simulate_gertec_g2_hardware_client(test_port))
    finally:
        srv.stop()


if __name__ == "__main__":
    test_gertec_formatting()
    test_tcp_server_handshake()
    print("TODOS OS TESTES DO GERTEC G2 PASSARAM COM SUCESSO!")
