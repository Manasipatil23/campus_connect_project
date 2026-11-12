"""HTML emails that look right in Gmail, Outlook and Apple Mail.

Email clients strip <style> blocks, SVG and scripts, so everything is inline styles and
tables. The logo is drawn with HTML (no image), so it shows even when images are blocked.
Every email also has a plain-text version.
"""
from html import escape
from urllib.parse import quote

from .config import APP_URL

PURPLE, PURPLE_DARK, INK, MUTED, LINE, BG = "#5b21b6", "#2e1065", "#111114", "#6b6b76", "#ece8f7", "#f6f4fd"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


LOGO_CID = "cc-logo"  # the PNG in app/assets is attached to each email under this id


def _logo() -> str:
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:40px;height:40px;vertical-align:middle;">
          <img src="cid:{LOGO_CID}" width="40" height="40" alt="Campus Connect" style="display:block;border:0;border-radius:11px;"></td>
        <td style="padding-left:12px;vertical-align:middle;font-family:{FONT};font-size:18px;font-weight:600;color:{INK};letter-spacing:-0.3px;">
          Campus Connect</td>
      </tr></table>"""


def _shell(preheader: str, inner: str, footer: str) -> str:
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Campus Connect</title></head>
<body style="margin:0;padding:0;background:{BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{BG};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding:0 4px 20px;">{_logo()}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid {LINE};border-radius:16px;padding:32px 28px;font-family:{FONT};color:{INK};">
          {inner}
        </td></tr>
        <tr><td style="padding:20px 8px 0;font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};text-align:center;">
          {footer}<br>Campus Connect &middot; one shared placement platform for students, colleges and companies
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _button(label: str, url: str) -> str:
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
        <td style="border-radius:999px;background:{INK};">
          <a href="{escape(url)}" style="display:inline-block;padding:12px 26px;font-family:{FONT};font-size:14px;font-weight:600;
             color:#ffffff;text-decoration:none;border-radius:999px;">{escape(label)} &rarr;</a></td>
      </tr></table>"""


def verification_code(code: str, minutes: int = 10, email: str = ""):
    """(subject, text, html). The code leads the subject so phones offer "Copy code" from the notification."""
    spaced = " ".join(code)
    verify_url = f"{APP_URL}/verify#{quote(email.strip().lower())}%7C{code}" if email else f"{APP_URL}/copy#{code}"
    subject = f"{code} is your Campus Connect code"
    text = (f"Your Campus Connect verification code:\n\n{code}\n\nVerify in one click: {verify_url}\n\n"
            f"Enter it on the sign-up page. It expires in {minutes} minutes.\n"
            "If you didn't ask for this, you can ignore this email.")
    inner = f"""
      <h1 style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.3px;">Your verification code</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:22px;color:{MUTED};">Press the button, or enter this code on the sign-up page.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" style="background:{BG};border:1px dashed #c4b2fd;border-radius:12px;padding:20px 12px;">
          <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;line-height:40px;font-weight:700;
                      letter-spacing:10px;color:{PURPLE_DARK};-webkit-user-select:all;user-select:all;">{code}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;"><tr>
            <td style="border-radius:999px;background:{PURPLE};">
              <a href="{verify_url}" style="display:inline-block;padding:12px 26px;font-family:{FONT};font-size:15px;font-weight:600;
                 color:#ffffff;text-decoration:none;border-radius:999px;">Verify my email &rarr;</a></td>
          </tr></table>
          <div style="margin-top:10px;font-size:12px;line-height:18px;color:{MUTED};">Fills the code in on your sign-up page for you.<br>Or tap the code above to select and copy it.</div>
        </td>
      </tr></table>
      <p style="margin:24px 0 0;font-size:14px;line-height:21px;color:{MUTED};">
        It expires in <b style="color:{INK};">{minutes} minutes</b>. If you didn't ask for this, you can ignore this email.</p>"""
    return subject, text, _shell(f"{spaced} is your code. It expires in {minutes} minutes.", inner,
                                 "You're receiving this because someone entered this address on Campus Connect.")


def message(subject: str, greeting: str, body: str, sign_off: str = "", button=None, preheader: str = ""):
    """A short personal message (reminders, notices). `body` is plain text; blank lines start paragraphs."""
    paras = [p.strip() for p in body.split("\n\n") if p.strip()]
    text = "\n\n".join([greeting, *paras] + ([f"{button[0]}: {button[1]}"] if button else []) + ([sign_off] if sign_off else []))
    inner = f'<p style="margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600;">{escape(greeting)}</p>'
    inner += "".join(f'<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#33333b;">{escape(p).replace(chr(10), "<br>")}</p>' for p in paras)
    if button:
        inner += _button(*button)
    if sign_off:
        inner += (f'<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid {LINE};font-size:14px;line-height:21px;color:{MUTED};">'
                  f'{escape(sign_off).replace(chr(10), "<br>")}</p>')
    return subject, text, _shell(preheader or paras[0][:120] if paras else subject, inner,
                                 "Reply to this email to reach the sender directly.")
