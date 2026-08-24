"""Parcourt la boîte de réception Gmail et lit le contenu des PDF en pièce jointe en mémoire."""

import base64
import io
import os
from dataclasses import dataclass
from typing import Iterator, Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from pypdf import PdfReader

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


@dataclass
class EmailPDFAttachment:
    message_id: str
    subject: str
    sender: str
    date: str
    filename: str
    pdf_bytes: bytes
    text: str


class GmailPDFReader:
    def __init__(self, credentials_path: str = "credentials.json", token_path: str = "token.json"):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.service = self._authenticate()

    def _authenticate(self):
        creds: Optional[Credentials] = None
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, SCOPES)
                creds = flow.run_local_server(port=0)
            with open(self.token_path, "w") as f:
                f.write(creds.to_json())
        return build("gmail", "v1", credentials=creds)

    def iter_pdf_attachments(
        self, query: str = "has:attachment filename:pdf", max_results: Optional[int] = None
    ) -> Iterator[EmailPDFAttachment]:
        """Génère un EmailPDFAttachment par PDF trouvé, un email à la fois (rien n'est stocké sur disque)."""
        user_id = "me"
        page_token = None
        count = 0
        while True:
            resp = (
                self.service.users()
                .messages()
                .list(userId=user_id, q=query, pageToken=page_token)
                .execute()
            )
            for msg_ref in resp.get("messages", []):
                message = (
                    self.service.users()
                    .messages()
                    .get(userId=user_id, id=msg_ref["id"], format="full")
                    .execute()
                )
                headers = {h["name"]: h["value"] for h in message["payload"].get("headers", [])}

                for part in self._walk_parts(message["payload"]):
                    filename = part.get("filename", "")
                    if not filename.lower().endswith(".pdf"):
                        continue
                    attachment_id = part["body"].get("attachmentId")
                    if not attachment_id:
                        continue

                    attachment = (
                        self.service.users()
                        .messages()
                        .attachments()
                        .get(userId=user_id, messageId=msg_ref["id"], id=attachment_id)
                        .execute()
                    )
                    pdf_bytes = base64.urlsafe_b64decode(attachment["data"])
                    text = self._extract_text(pdf_bytes)

                    yield EmailPDFAttachment(
                        message_id=msg_ref["id"],
                        subject=headers.get("Subject", "(sans sujet)"),
                        sender=headers.get("From", ""),
                        date=headers.get("Date", ""),
                        filename=filename,
                        pdf_bytes=pdf_bytes,
                        text=text,
                    )

                    count += 1
                    if max_results and count >= max_results:
                        return

            page_token = resp.get("nextPageToken")
            if not page_token:
                break

    def _walk_parts(self, payload: dict) -> Iterator[dict]:
        parts = payload.get("parts")
        if not parts:
            if payload.get("filename"):
                yield payload
            return
        for part in parts:
            if part.get("parts"):
                yield from self._walk_parts(part)
            elif part.get("filename"):
                yield part

    @staticmethod
    def _extract_text(pdf_bytes: bytes) -> str:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)


def main():
    reader = GmailPDFReader()
    for item in reader.iter_pdf_attachments(max_results=20):
        print(f"--- {item.subject} ({item.filename}) ---")
        print(f"De: {item.sender} | Date: {item.date}")
        print(item.text[:500])
        print()


if __name__ == "__main__":
    main()
