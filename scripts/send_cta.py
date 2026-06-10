"""
Скрипт отправки CTA-заявки на email менеджера.

Запускается из GitHub Actions воркфлоу cta-email.yml.
Все параметры читаются из переменных окружения — никаких аргументов CLI.

Переменные окружения (устанавливаются в воркфлоу из GitHub Secrets):
    SMTP_HOST            — SMTP-сервер (например: smtp.yandex.ru)
    SMTP_PORT            — SMTP-порт (например: 587 для STARTTLS)
    SMTP_USER            — Email отправителя / SMTP-логин
    SMTP_PASSWORD        — SMTP-пароль или app password
    CTA_RECIPIENT_EMAIL  — Email получателя (менеджер Fidenta)

    FORM_NAME            — Имя клиента из формы
    FORM_PHONE           — Телефон клиента из формы
    FORM_MESSAGE         — Сообщение / комментарий (может быть пустым)
    FORM_CLIENT_EMAIL    — Email клиента (может быть пустым)
"""

import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def get_env(name: str, required: bool = True) -> str:
    """Читает переменную окружения. Завершает скрипт с ошибкой, если required=True и переменная не задана."""
    value = os.environ.get(name, "").strip()
    if required and not value:
        print(f"[ERROR] Переменная окружения {name!r} не задана или пустая.", file=sys.stderr)
        sys.exit(1)
    return value


def build_email_body(name: str, phone: str, message: str, client_email: str) -> str:
    """Формирует текст письма с данными заявки."""
    timestamp = datetime.now().strftime("%d.%m.%Y в %H:%M")
    lines = [
        f"Новая заявка с сайта Fidenta — {timestamp}",
        "",
        f"Имя:     {name}",
        f"Телефон: {phone}",
    ]
    if client_email:
        lines.append(f"Email:   {client_email}")
    if message:
        lines.append("")
        lines.append("Сообщение:")
        lines.append(message)
    lines += [
        "",
        "---",
        "Это письмо отправлено автоматически с сайта fidenta-landing.",
    ]
    return "\n".join(lines)


def send_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    recipient: str,
    subject: str,
    body: str,
) -> None:
    """Отправляет письмо через SMTP с STARTTLS."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = recipient
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, recipient, msg.as_string())


def main() -> None:
    # Читаем конфигурацию SMTP
    smtp_host = get_env("SMTP_HOST")
    smtp_port = int(get_env("SMTP_PORT"))
    smtp_user = get_env("SMTP_USER")
    smtp_password = get_env("SMTP_PASSWORD")
    recipient = get_env("CTA_RECIPIENT_EMAIL")

    # Читаем данные формы
    name = get_env("FORM_NAME")
    phone = get_env("FORM_PHONE")
    message = get_env("FORM_MESSAGE", required=False)
    client_email = get_env("FORM_CLIENT_EMAIL", required=False)

    subject = f"Заявка с сайта — {name}"
    body = build_email_body(name, phone, message, client_email)

    print(f"[INFO] Отправка заявки от {name!r} на {recipient!r}...")
    send_email(smtp_host, smtp_port, smtp_user, smtp_password, recipient, subject, body)
    print("[INFO] Письмо успешно отправлено.")


if __name__ == "__main__":
    main()
