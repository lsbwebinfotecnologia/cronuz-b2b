import smtplib
from email.message import EmailMessage

def send_smtp_email(smtp_host: str, smtp_port: int, smtp_username: str, smtp_password: str, smtp_from: str, to_email: str, subject: str, html_content: str, use_ssl: bool = False):
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = smtp_from
    msg['To'] = to_email
    msg.set_content("Por favor, ative a visualização em HTML do seu leitor de e-mails.")
    msg.add_alternative(html_content, subtype='html')

    timeout = 10 # 10 seconds timeout to prevent hanging

    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=timeout) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=timeout) as server:
            try:
                server.starttls()
            except Exception:
                pass
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
