import html
import re
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr
from typing import Dict, List, Optional


def _html_to_plain_text(html_content: str) -> str:
    """
    Converte o corpo HTML em texto plano fiel ao conteúdo original.
    Evita a penalização MPART_ALT_DIFF do SpamAssassin / SPFBL (que bloqueia
    e-mails de faturamento/boleto quando o text/plain difere do text/html).
    """
    if not html_content:
        return ""
    text = html_content
    # Remove blocos <style> e <script>
    text = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", text, flags=re.IGNORECASE | re.DOTALL)
    # Preserva links relevantes <a href="url">label</a> -> label ( url )
    def _replace_link(match: re.Match) -> str:
        href = (match.group(1) or "").strip()
        label = re.sub(r"<[^>]+>", "", match.group(2) or "").strip()
        if not href or href.startswith("mailto:") or href == label:
            return label or href
        return f"{label} ({href})" if label else href

    text = re.sub(
        r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        _replace_link,
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Converte quebras estruturais em novas linhas
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|tr|li|h[1-6]|blockquote)>", "\n", text, flags=re.IGNORECASE)
    # Remove demais tags HTML
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    # Limpa múltiplas linhas em branco consecutivas
    lines = [line.strip() for line in text.splitlines()]
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned or "Mensagem enviada pelo sistema."


def send_smtp_email(
    smtp_host: str,
    smtp_port: int,
    smtp_username: str,
    smtp_password: str,
    smtp_from: str,
    to_email: str,
    subject: str,
    html_content: str,
    use_ssl: bool = False,
    bcc_email: Optional[str] = None,
    attachments: Optional[List[Dict]] = None,
    sender_name: Optional[str] = None,
    reply_to: Optional[str] = None,
    plain_text: Optional[str] = None,
    custom_headers: Optional[Dict[str, str]] = None,
) -> str:
    msg = EmailMessage()
    msg["Subject"] = (subject or "").replace("\r", " ").replace("\n", " ").strip()

    parsed_name, parsed_addr = parseaddr(smtp_from or smtp_username or "")
    pure_from_addr = (parsed_addr or smtp_from or smtp_username or "").strip()
    display_name = (sender_name or parsed_name or "").strip()

    if display_name and pure_from_addr:
        msg["From"] = formataddr((display_name, pure_from_addr))
    else:
        msg["From"] = pure_from_addr

    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)
    msg["Reply-To"] = (reply_to or pure_from_addr).strip()

    # Assina o Message-ID com o domínio do próprio remetente para evitar score de phishing no SPFBL
    sender_domain = pure_from_addr.split("@")[1].strip() if "@" in pure_from_addr else "cronuzb2b.com.br"
    message_id = make_msgid(domain=sender_domain)
    msg["Message-ID"] = message_id
    msg["X-Auto-Response-Suppress"] = "OOF, AutoReply"

    if custom_headers:
        for h_key, h_val in custom_headers.items():
            if h_key and h_val is not None:
                msg[h_key] = str(h_val)

    if bcc_email:
        msg["Bcc"] = bcc_email

    effective_plain = (plain_text or "").strip() or _html_to_plain_text(html_content)
    msg.set_content(effective_plain)
    msg.add_alternative(html_content, subtype="html")

    if attachments:
        for att in attachments:
            msg.add_attachment(
                att["content"],
                maintype=att.get("maintype", "application"),
                subtype=att.get("subtype", "pdf"),
                filename=att["filename"],
            )

    timeout = 15

    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, int(smtp_port or 465), timeout=timeout) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, int(smtp_port or 587), timeout=timeout) as server:
            try:
                server.ehlo()
                server.starttls()
                server.ehlo()
            except Exception:
                pass
            server.login(smtp_username, smtp_password)
            server.send_message(msg)

    return message_id
