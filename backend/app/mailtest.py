"""Check the email settings in backend/.env by sending one test email.

    .venv/bin/python -m app.mailtest you@example.com
"""
import sys

from .config import EMAIL_DEV_MODE, SMTP_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER
from .email_templates import message
from .emailing import _send, _send_message


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m app.mailtest you@example.com")
    if EMAIL_DEV_MODE:
        sys.exit("No SMTP_HOST in backend/.env, so the app is in dev mode and won't send email.")
    print(f"Sending a test email to {sys.argv[1]} via {SMTP_HOST}:{SMTP_PORT} as {SMTP_USER or '(no login)'} from {SMTP_FROM} …")
    try:
        _send(sys.argv[1], "482913")
        subject, text, html = message("Campus Connect test email", "Hi there,",
                                      "If you can read this, Campus Connect can send verification codes and reminders.\n\n"
                                      "This second email shows how reminders from a placement cell look.",
                                      "Campus Connect", ("Open Campus Connect", "http://localhost:5173"))
        _send_message(sys.argv[1], subject, text, html=html)
    except Exception as exc:
        sys.exit(f"Failed: {exc}")
    print("Sent two emails: a sample verification code (482913) and a sample reminder. Check the inbox (and spam).")


if __name__ == "__main__":
    main()
