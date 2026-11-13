import logging
import smtplib
from email.message import EmailMessage

from .config import (
    SMTP_FROM_EMAIL, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USERNAME, SMTP_USE_TLS
)

logger = logging.getLogger(__name__)


def send_notification(recipients: list[str], subject: str, body: str) -> None:
    recipients = sorted({email.strip() for email in recipients if email and email.strip()})
    if not recipients:
        return
    if not SMTP_HOST:
        logger.info("Email notification skipped because SMTP_HOST is not configured")
        return

    message = EmailMessage()
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception("Could not send support ticket notification")
