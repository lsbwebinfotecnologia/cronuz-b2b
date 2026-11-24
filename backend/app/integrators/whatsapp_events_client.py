import base64
import io
import logging
import os
import random
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import qrcode
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger("cronuz.event_whatsapp")

BRT_TZ = timezone(timedelta(hours=-3))

# Tabela oficial de DDDs válidos no Brasil (Anatel)
VALID_BR_DDDS = {
    "11", "12", "13", "14", "15", "16", "17", "18", "19",
    "21", "22", "24", "27", "28",
    "31", "32", "33", "34", "35", "37", "38",
    "41", "42", "43", "44", "45", "46", "47", "48", "49",
    "51", "53", "54", "55",
    "61", "62", "63", "64", "65", "66", "67", "68", "69",
    "71", "73", "74", "75", "77", "79",
    "81", "82", "83", "84", "85", "86", "87", "88", "89",
    "91", "92", "93", "94", "95", "96", "97", "98", "99",
}


def normalize_br_phone(raw_phone: str) -> Dict[str, str]:
    """
    Valida e normaliza rigorosamente um telefone brasileiro exigindo DDD válido (Anatel).
    Retorna:
      - phone_canonical: ex '5511998887766' (chave única no Seller)
      - phone_base_8: ex '1198887766' (DDD + 8 dígitos finais p/ bloquear duplicidade com/sem 9º dígito)
      - phone_ddd: ex '11'
      - phone_display: ex '(11) 99888-7766'
    Levanta ValueError com mensagem explícita em caso de número inválido ou sem DDD.
    """
    if not raw_phone or not str(raw_phone).strip():
        raise ValueError("Telefone obrigatório: informe o DDD + número com 10 ou 11 dígitos.")

    digits = re.sub(r"\D", "", str(raw_phone))

    # Remove prefixo de operadora/zero inicial (ex: 011998887766 -> 11998887766)
    if digits.startswith("0") and len(digits) in (11, 12):
        digits = digits[1:]

    # Remove DDI 55 caso venha com 12 ou 13 dígitos (ex: 5511998887766 ou 551188887766)
    if digits.startswith("55") and len(digits) in (12, 13):
        digits = digits[2:]

    if len(digits) < 10:
        raise ValueError(
            f"Telefone incompleto ('{raw_phone}'): é obrigatório informar o DDD (2 dígitos) + número (ex: 11 99888-7766)."
        )
    if len(digits) > 11:
        raise ValueError(
            f"Telefone excede o tamanho padrão brasileiro ('{raw_phone}'). Use apenas DDD + número (ex: 11 99888-7766)."
        )

    ddd = digits[:2]
    if ddd not in VALID_BR_DDDS:
        raise ValueError(
            f"DDD '{ddd}' inválido no telefone '{raw_phone}'. Informe um DDD brasileiro válido (ex: 11, 21, 31, 41, 51, 61, 71, 81)."
        )

    local_num = digits[2:]
    if len(set(local_num)) == 1:
        raise ValueError(f"Número de telefone inválido com dígitos repetidos ('{raw_phone}').")

    # Tratamento inteligente de celular (9 dígitos) vs celular antigo sem 9º dígito (iniciando em 6..9) vs fixo (2..5)
    if len(local_num) == 8:
        first_digit = local_num[0]
        if first_digit in ("6", "7", "8", "9"):
            # Celular brasileiro informado sem o 9º dígito -> padroniza canônico com 9 p/ evitar duplicidade
            base8 = local_num
            local_9 = f"9{base8}"
            canonical = f"55{ddd}{local_9}"
            display = f"({ddd}) {local_9[:5]}-{local_9[5:]}"
        else:
            # Telefone fixo comercial / WhatsApp Business em fixo
            base8 = local_num
            canonical = f"55{ddd}{base8}"
            display = f"({ddd}) {base8[:4]}-{base8[4:]}"
    else:
        # 9 dígitos locais
        if local_num[0] != "9":
            raise ValueError(
                f"Celular de 9 dígitos deve iniciar com '9' após o DDD ('{raw_phone}')."
            )
        base8 = local_num[1:]
        canonical = f"55{ddd}{local_num}"
        display = f"({ddd}) {local_num[:5]}-{local_num[5:]}"

    return {
        "phone_canonical": canonical,
        "phone_base_8": f"{ddd}{base8}",
        "phone_ddd": ddd,
        "phone_display": display,
    }


def parse_vcard_block(vcard_text: str) -> List[Dict[str, Any]]:
    """
    Extrai contatos de uma string vCard (.vcf ou payload vcard do WhatsApp).
    Suporta múltiplos blocos BEGIN:VCARD ... END:VCARD e atributo waid= do WhatsApp.
    """
    if not vcard_text:
        return []

    results: List[Dict[str, Any]] = []
    blocks = re.findall(r"BEGIN:VCARD(.*?)END:VCARD", vcard_text, flags=re.DOTALL | re.IGNORECASE)
    if not blocks:
        blocks = [vcard_text]

    for block in blocks:
        full_name = ""
        phones: List[str] = []
        email = ""
        org = ""
        title = ""

        for raw_line in block.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            upper_line = line.upper()

            if upper_line.startswith("FN:") or upper_line.startswith("FN;"):
                val = line.split(":", 1)[-1].strip()
                if val:
                    full_name = val
            elif not full_name and (upper_line.startswith("N:") or upper_line.startswith("N;")):
                parts = [p.strip() for p in line.split(":", 1)[-1].split(";") if p.strip()]
                if len(parts) >= 2:
                    full_name = f"{parts[1]} {parts[0]}".strip()
                elif parts:
                    full_name = parts[0]
            elif upper_line.startswith("TEL"):
                waid_match = re.search(r"waid=(\d+)", line, flags=re.IGNORECASE)
                if waid_match:
                    phones.append(waid_match.group(1))
                tel_val = line.split(":", 1)[-1].strip()
                if tel_val:
                    phones.append(tel_val)
            elif upper_line.startswith("EMAIL"):
                email_val = line.split(":", 1)[-1].strip()
                if "@" in email_val:
                    email = email_val
            elif upper_line.startswith("ORG"):
                org = line.split(":", 1)[-1].replace(";", " ").strip()
            elif upper_line.startswith("TITLE"):
                title = line.split(":", 1)[-1].strip()

        normalized_info = None
        last_err = None
        for ph in phones:
            try:
                normalized_info = normalize_br_phone(ph)
                break
            except ValueError as exc:
                last_err = str(exc)

        if normalized_info:
            clean_name = re.sub(r"\s+", " ", full_name).strip() or f"Contato {normalized_info['phone_display']}"
            results.append({
                "full_name": clean_name,
                "email": email or None,
                "company_org": org or None,
                "job_title": title or None,
                **normalized_info,
                "valid": True,
                "error": None,
            })
        elif full_name or phones:
            results.append({
                "full_name": full_name or "Sem Nome",
                "raw_phone": phones[0] if phones else "",
                "valid": False,
                "error": last_err or "Nenhum telefone com DDD válido encontrado no cartão de contato.",
            })

    return results


def extract_contacts_from_free_text(raw_text: str) -> List[Dict[str, Any]]:
    """
    Extrai contatos de texto livre colado do WhatsApp / listas informais.
    Exemplos aceitos por linha:
      - João Silva (11) 99888-7766
      - 21 98765-4321 - Maria Souza @mariasouza
      - Pedro Santos; 31999887766; pedro@email.com
    """
    if not raw_text or not raw_text.strip():
        return []

    # Caso o usuário tenha colado um vCard inteiro
    if "BEGIN:VCARD" in raw_text.upper():
        return parse_vcard_block(raw_text)

    parsed_rows: List[Dict[str, Any]] = []
    phone_pattern = re.compile(r"(?:\+?55[\s\-\.]*)?\(?0?\d{2}\)?[\s\-\.]*9?\d{4}[\s\-\.]*\d{4}|\b\d{8,13}\b")

    for idx, raw_line in enumerate(raw_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        # Remove marcadores de lista ("1.", "-", "•", "[21:30]")
        line = re.sub(r"^\[?\d{1,2}:\d{2}\]?\s*[-:]?\s*", "", line)
        line = re.sub(r"^[\-\*\•\d]+[\.\)\-]\s*", "", line).strip()
        if not line:
            continue

        email_match = re.search(r"[\w\.\+\-]+@[\w\-]+\.[\w\.\-]+", line)
        email = email_match.group(0) if email_match else None
        if email:
            line = line.replace(email, " ")

        insta_match = re.search(r"@([a-zA-Z0-9._]{2,30})", line)
        instagram = f"@{insta_match.group(1)}" if insta_match else None
        if insta_match:
            line = line.replace(insta_match.group(0), " ")

        phone_match = phone_pattern.search(line)
        if not phone_match:
            parsed_rows.append({
                "line": idx,
                "full_name": line[:120],
                "raw_phone": "",
                "valid": False,
                "error": "Nenhum número de telefone identificado nesta linha.",
            })
            continue

        raw_phone = phone_match.group(0)
        name_part = (line[:phone_match.start()] + " " + line[phone_match.end():]).strip()
        name_part = re.sub(r"[\-\|;,:/]+", " ", name_part)
        name_part = re.sub(r"\s+", " ", name_part).strip()

        try:
            norm = normalize_br_phone(raw_phone)
            parsed_rows.append({
                "line": idx,
                "full_name": name_part or f"Convidado {norm['phone_display']}",
                "email": email,
                "instagram": instagram,
                **norm,
                "valid": True,
                "error": None,
            })
        except ValueError as exc:
            parsed_rows.append({
                "line": idx,
                "full_name": name_part or "Sem Nome",
                "raw_phone": raw_phone,
                "email": email,
                "instagram": instagram,
                "valid": False,
                "error": str(exc),
            })

    return parsed_rows


def render_invite_message(
    message_body: str,
    spintax_greetings: Optional[List[str]],
    variables: Dict[str, str],
) -> str:
    """Renderiza variáveis dinâmicas e aplica saudação variada (Spintax) anti-bloqueio."""
    prefix = ""
    if spintax_greetings and isinstance(spintax_greetings, list):
        valid_greetings = [str(g).strip() for g in spintax_greetings if str(g).strip()]
        if valid_greetings:
            chosen = random.choice(valid_greetings)
            for k, v in variables.items():
                chosen = chosen.replace(f"{{{{{k}}}}}", str(v or ""))
            prefix = chosen + "\n\n"

    rendered = message_body or ""
    for k, v in variables.items():
        rendered = rendered.replace(f"{{{{{k}}}}}", str(v or ""))

    # Suporte a Spintax inline {Oi|Olá|Fala}
    def _spin_replace(match: re.Match) -> str:
        opts = [o.strip() for o in match.group(1).split("|") if o.strip()]
        return random.choice(opts) if opts else ""

    rendered = re.sub(r"\{([^{}]*\|[^{}]*)\}", _spin_replace, rendered)
    return (prefix + rendered).strip()


def generate_native_qr_vip_card(
    output_abs_path: Path,
    event_title: str,
    event_date_str: str,
    venue_label: str,
    guest_name: str,
    sector_label: str,
    qr_payload: str,
    banner_abs_path: Optional[Path] = None,
) -> Path:
    """
    Gera um Card VIP Digital elegante (PNG 900x1280) com a Arte do Evento + QR Code único
    para eventos/setores de Cortesia Nativa (check-in via celular na portaria).
    """
    output_abs_path.parent.mkdir(parents=True, exist_ok=True)
    width, height = 900, 1280
    card = Image.new("RGB", (width, height), (15, 23, 42))  # slate-900
    draw = ImageDraw.Draw(card)

    # Topo com banner do evento (ou gradiente elegante)
    header_h = 380
    if banner_abs_path and banner_abs_path.exists():
        try:
            banner = Image.open(banner_abs_path).convert("RGB")
            banner_ratio = max(width / banner.width, header_h / banner.height)
            new_size = (int(banner.width * banner_ratio), int(banner.height * banner_ratio))
            banner_resized = banner.resize(new_size, Image.Resampling.LANCZOS)
            left = max(0, (banner_resized.width - width) // 2)
            top = max(0, (banner_resized.height - header_h) // 2)
            banner_crop = banner_resized.crop((left, top, left + width, top + header_h))
            card.paste(banner_crop, (0, 0))
        except Exception as exc:
            logger.warning("Não foi possível embutir banner no Card QR: %s", exc)
            draw.rectangle([(0, 0), (width, header_h)], fill=(49, 46, 129))
    else:
        draw.rectangle([(0, 0), (width, header_h)], fill=(49, 46, 129))

    # Moldura interna clara para contraste máximo do QR Code na portaria
    draw.rounded_rectangle([(48, 330), (width - 48, height - 56)], radius=32, fill=(255, 255, 255))
    draw.rounded_rectangle([(48, 330), (width - 48, 410)], radius=24, fill=(79, 70, 229))

    try:
        font_badge = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
        font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 38)
        font_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 25)
        font_guest = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
    except Exception:
        try:
            font_badge = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
            font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
            font_sub = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
            font_guest = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        except Exception:
            font_badge = ImageFont.load_default()
            font_title = ImageFont.load_default()
            font_sub = ImageFont.load_default()
            font_guest = ImageFont.load_default()

    draw.text((84, 355), f"CREDENCIAL / CORTESIA • {sector_label.upper()[:26]}", fill=(255, 255, 255), font=font_badge)
    draw.text((84, 445), (event_title or "Evento")[:36], fill=(15, 23, 42), font=font_title)
    draw.text((84, 505), f"Data: {event_date_str}", fill=(71, 85, 105), font=font_sub)
    draw.text((84, 545), f"Local: {(venue_label or 'Confirmado')[:46]}", fill=(71, 85, 105), font=font_sub)

    draw.line([(84, 600), (width - 84, 600)], fill=(226, 232, 240), width=2)
    draw.text((84, 625), "CONVIDADO(A) TITULAR", fill=(100, 116, 139), font=font_sub)
    draw.text((84, 662), (guest_name or "Convidado VIP").upper()[:34], fill=(15, 23, 42), font=font_guest)

    # Gera QR Code nítido
    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=11, border=2)
    qr.add_data(qr_payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_size = 390
    qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    qr_x = (width - qr_size) // 2
    card.paste(qr_img, (qr_x, 735))

    draw.text((195, 1150), "Apresente este QR Code na recepção do evento", fill=(100, 116, 139), font=font_sub)
    card.save(output_abs_path, format="PNG", optimize=True)
    return output_abs_path


class WhatsAppEventsGateway:
    """
    Adaptador unificado de WhatsApp para Evolution API v2, Z-API e WAHA.
    Suporta verificação de conexão/QR Code, checagem de número ativo, presença 'digitando...',
    envio de texto, imagem com legenda e documento PDF com nome amigável.
    """

    def __init__(self, config: Any):
        self.provider = (getattr(config, "provider", "EVOLUTION") or "EVOLUTION").upper()
        self.base_url = (getattr(config, "api_base_url", "") or "").rstrip("/")
        self.instance = (getattr(config, "instance_name", "") or "").strip()
        self.api_key = (getattr(config, "api_key_token", "") or "").strip()
        self.client_token = (getattr(config, "client_token", "") or "").strip()

    def _validate_configured(self) -> None:
        if not self.base_url:
            raise RuntimeError(
                "URL da API do WhatsApp não configurada. Acesse a aba 'Disparo & WhatsApp' e informe a URL do servidor (Evolution API, Z-API ou WAHA)."
            )
        if self.provider in ("EVOLUTION", "WAHA") and not self.instance:
            raise RuntimeError(
                f"Nome da instância do {self.provider} não preenchido nas configurações do módulo."
            )

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.provider == "EVOLUTION" and self.api_key:
            headers["apikey"] = self.api_key
        elif self.provider == "ZAPI" and self.client_token:
            headers["Client-Token"] = self.client_token
        elif self.provider == "WAHA" and self.api_key:
            headers["X-Api-Key"] = self.api_key
        return headers

    async def get_status_and_qrcode(self) -> Dict[str, Any]:
        self._validate_configured()
        async with httpx.AsyncClient(timeout=20.0) as client:
            if self.provider == "EVOLUTION":
                state_url = f"{self.base_url}/instance/connectionState/{self.instance}"
                resp = await client.get(state_url, headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json()
                    state = (data.get("instance", {}) or {}).get("state") or data.get("state") or "unknown"
                    if str(state).lower() == "open":
                        return {"connected": True, "status": "CONNECTED", "qrcode_base64": None}
                qr_url = f"{self.base_url}/instance/connect/{self.instance}"
                qr_resp = await client.get(qr_url, headers=self._headers())
                if qr_resp.status_code >= 400:
                    raise RuntimeError(
                        f"Evolution API ({self.base_url}) retornou HTTP {qr_resp.status_code}: {qr_resp.text[:250]}"
                    )
                qr_data = qr_resp.json()
                b64 = qr_data.get("base64") or (qr_data.get("qrcode") or {}).get("base64")
                return {"connected": False, "status": "QRCODE_READY" if b64 else "CONNECTING", "qrcode_base64": b64}

            elif self.provider == "ZAPI":
                # Z-API base_url já inclui /instances/{id}/token/{token} ou monta a partir de instance + api_key
                z_base = (
                    f"{self.base_url}/instances/{self.instance}/token/{self.api_key}"
                    if self.instance and self.api_key and "/instances/" not in self.base_url
                    else self.base_url
                )
                st_resp = await client.get(f"{z_base}/status", headers=self._headers())
                if st_resp.status_code == 200 and st_resp.json().get("connected") is True:
                    return {"connected": True, "status": "CONNECTED", "qrcode_base64": None}
                qr_resp = await client.get(f"{z_base}/qr-code/image", headers=self._headers())
                if qr_resp.status_code >= 400:
                    raise RuntimeError(f"Z-API retornou HTTP {qr_resp.status_code}: {qr_resp.text[:250]}")
                qr_json = qr_resp.json()
                return {
                    "connected": False,
                    "status": "QRCODE_READY",
                    "qrcode_base64": qr_json.get("value"),
                }

            else:  # WAHA
                st_resp = await client.get(f"{self.base_url}/api/sessions/{self.instance}", headers=self._headers())
                if st_resp.status_code == 200:
                    st_data = st_resp.json()
                    if str(st_data.get("status", "")).upper() == "WORKING":
                        return {"connected": True, "status": "CONNECTED", "qrcode_base64": None}
                qr_resp = await client.get(
                    f"{self.base_url}/api/{self.instance}/auth/qr",
                    headers={**self._headers(), "Accept": "application/json"},
                )
                if qr_resp.status_code >= 400:
                    raise RuntimeError(f"WAHA retornou HTTP {qr_resp.status_code}: {qr_resp.text[:250]}")
                qr_data = qr_resp.json()
                b64 = qr_data.get("data")
                if b64 and not str(b64).startswith("data:image"):
                    b64 = f"data:image/png;base64,{b64}"
                return {"connected": False, "status": "QRCODE_READY", "qrcode_base64": b64}

    def _zapi_base(self) -> str:
        if self.instance and self.api_key and "/instances/" not in self.base_url:
            return f"{self.base_url}/instances/{self.instance}/token/{self.api_key}"
        return self.base_url

    async def check_whatsapp_number(self, phone_canonical: str) -> Tuple[bool, str]:
        """Consulta se o telefone possui conta WhatsApp ativa e retorna (exists, resolved_jid_or_number)."""
        self._validate_configured()
        async with httpx.AsyncClient(timeout=15.0) as client:
            if self.provider == "EVOLUTION":
                resp = await client.post(
                    f"{self.base_url}/chat/whatsappNumbers/{self.instance}",
                    headers=self._headers(),
                    json={"numbers": [phone_canonical]},
                )
                if resp.status_code == 200:
                    arr = resp.json()
                    if isinstance(arr, list) and arr:
                        item = arr[0]
                        exists = bool(item.get("exists", True))
                        jid = str(item.get("jid") or phone_canonical).split("@")[0]
                        return exists, jid or phone_canonical
            elif self.provider == "ZAPI":
                resp = await client.get(
                    f"{self._zapi_base()}/phone-exists/{phone_canonical}",
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return bool(data.get("exists", True)), phone_canonical
            elif self.provider == "WAHA":
                resp = await client.get(
                    f"{self.base_url}/api/contacts/check-exists",
                    params={"phone": phone_canonical, "session": self.instance},
                    headers=self._headers(),
                )
                if resp.status_code == 200:
                    data = resp.json()
                    chat_id = str(data.get("chatId") or phone_canonical).split("@")[0]
                    return bool(data.get("numberExists", True)), chat_id or phone_canonical
        return True, phone_canonical

    async def send_typing(self, phone_canonical: str, duration_ms: int = 3000) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if self.provider == "EVOLUTION":
                    await client.post(
                        f"{self.base_url}/chat/sendPresence/{self.instance}",
                        headers=self._headers(),
                        json={"number": phone_canonical, "delay": duration_ms, "presence": "composing"},
                    )
                elif self.provider == "WAHA":
                    await client.post(
                        f"{self.base_url}/api/startTyping",
                        headers=self._headers(),
                        json={"session": self.instance, "chatId": f"{phone_canonical}@c.us"},
                    )
        except Exception:
            pass

    async def send_text(self, phone_canonical: str, text: str) -> str:
        self._validate_configured()
        async with httpx.AsyncClient(timeout=25.0) as client:
            if self.provider == "EVOLUTION":
                resp = await client.post(
                    f"{self.base_url}/message/sendText/{self.instance}",
                    headers=self._headers(),
                    json={"number": phone_canonical, "text": text},
                )
            elif self.provider == "ZAPI":
                resp = await client.post(
                    f"{self._zapi_base()}/send-text",
                    headers=self._headers(),
                    json={"phone": phone_canonical, "message": text},
                )
            else:
                resp = await client.post(
                    f"{self.base_url}/api/sendText",
                    headers=self._headers(),
                    json={"session": self.instance, "chatId": f"{phone_canonical}@c.us", "text": text},
                )

            if resp.status_code >= 400:
                raise RuntimeError(
                    f"Falha ao enviar texto via {self.provider} (HTTP {resp.status_code}): {resp.text[:300]}"
                )
            data = resp.json() if resp.content else {}
            return str(
                (data.get("key") or {}).get("id")
                or data.get("zaapId")
                or data.get("messageId")
                or data.get("id")
                or "ok"
            )

    async def send_image(self, phone_canonical: str, image_abs_path: Path, caption: str = "") -> str:
        self._validate_configured()
        raw_bytes = image_abs_path.read_bytes()
        b64_raw = base64.b64encode(raw_bytes).decode("ascii")
        ext = image_abs_path.suffix.lower()
        mime = "image/png" if ext == ".png" else ("image/webp" if ext == ".webp" else "image/jpeg")
        data_uri = f"data:{mime};base64,{b64_raw}"

        async with httpx.AsyncClient(timeout=35.0) as client:
            if self.provider == "EVOLUTION":
                resp = await client.post(
                    f"{self.base_url}/message/sendMedia/{self.instance}",
                    headers=self._headers(),
                    json={
                        "number": phone_canonical,
                        "mediatype": "image",
                        "mimetype": mime,
                        "caption": caption,
                        "media": b64_raw,
                        "fileName": image_abs_path.name,
                    },
                )
            elif self.provider == "ZAPI":
                resp = await client.post(
                    f"{self._zapi_base()}/send-image",
                    headers=self._headers(),
                    json={"phone": phone_canonical, "image": data_uri, "caption": caption},
                )
            else:
                resp = await client.post(
                    f"{self.base_url}/api/sendImage",
                    headers=self._headers(),
                    json={
                        "session": self.instance,
                        "chatId": f"{phone_canonical}@c.us",
                        "file": {"mimetype": mime, "filename": image_abs_path.name, "data": b64_raw},
                        "caption": caption,
                    },
                )

            if resp.status_code >= 400:
                raise RuntimeError(
                    f"Falha ao enviar imagem do convite via {self.provider} (HTTP {resp.status_code}): {resp.text[:300]}"
                )
            data = resp.json() if resp.content else {}
            return str(
                (data.get("key") or {}).get("id")
                or data.get("zaapId")
                or data.get("messageId")
                or data.get("id")
                or "ok"
            )

    async def send_pdf(
        self,
        phone_canonical: str,
        pdf_abs_path: Path,
        delivery_filename: str,
        caption: str = "",
    ) -> str:
        self._validate_configured()
        if not pdf_abs_path.exists():
            raise RuntimeError(f"Arquivo PDF do ingresso não encontrado no cofre: {pdf_abs_path.name}")

        raw_bytes = pdf_abs_path.read_bytes()
        b64_raw = base64.b64encode(raw_bytes).decode("ascii")
        clean_name = delivery_filename if delivery_filename.lower().endswith(".pdf") else f"{delivery_filename}.pdf"

        async with httpx.AsyncClient(timeout=45.0) as client:
            if self.provider == "EVOLUTION":
                resp = await client.post(
                    f"{self.base_url}/message/sendMedia/{self.instance}",
                    headers=self._headers(),
                    json={
                        "number": phone_canonical,
                        "mediatype": "document",
                        "mimetype": "application/pdf",
                        "caption": caption,
                        "media": b64_raw,
                        "fileName": clean_name,
                    },
                )
            elif self.provider == "ZAPI":
                resp = await client.post(
                    f"{self._zapi_base()}/send-document/pdf",
                    headers=self._headers(),
                    json={
                        "phone": phone_canonical,
                        "document": f"data:application/pdf;base64,{b64_raw}",
                        "fileName": clean_name,
                        "caption": caption,
                    },
                )
            else:
                resp = await client.post(
                    f"{self.base_url}/api/sendFile",
                    headers=self._headers(),
                    json={
                        "session": self.instance,
                        "chatId": f"{phone_canonical}@c.us",
                        "file": {"mimetype": "application/pdf", "filename": clean_name, "data": b64_raw},
                        "caption": caption,
                    },
                )

            if resp.status_code >= 400:
                raise RuntimeError(
                    f"Falha ao entregar PDF do ingresso via {self.provider} (HTTP {resp.status_code}): {resp.text[:300]}"
                )
            data = resp.json() if resp.content else {}
            return str(
                (data.get("key") or {}).get("id")
                or data.get("zaapId")
                or data.get("messageId")
                or data.get("id")
                or "ok"
            )
