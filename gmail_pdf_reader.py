"""Parcourt la boîte de réception Gmail, lit le contenu des PDF en pièce jointe en mémoire
et enregistre le PDF fusionné dans Supabase (table factures_gmail, colonne PDF)."""

import base64
import io
import os
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Iterator, Optional
from urllib.parse import parse_qs, urlparse

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow, InstalledAppFlow
from googleapiclient.discovery import build
from pypdf import PdfReader, PdfWriter

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


@dataclass
class EmailPDFBundle:
    message_id: str
    subject: str
    sender: str
    date: str
    filenames: list = field(default_factory=list)
    pdf_bytes: bytes = b""  # PDF fusionné (toutes les pièces jointes, une à la suite de l'autre)
    text: str = ""  # texte concaténé de tous les PDF de l'email


class GmailPDFReader:
    def __init__(
        self,
        credentials_path: str = "credentials.json",
        token_path: str = "token.json",
        manual_auth: bool = False,
    ):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.manual_auth = manual_auth
        self.service = self._authenticate()

    def _authenticate(self):
        creds: Optional[Credentials] = None
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            elif self.manual_auth:
                creds = self._manual_auth_flow()
            else:
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, SCOPES)
                creds = flow.run_local_server(port=0)
            with open(self.token_path, "w") as f:
                f.write(creds.to_json())
        return build("gmail", "v1", credentials=creds)

    def _manual_auth_flow(self) -> Credentials:
        """Flow OAuth sans navigateur local : l'utilisateur ouvre l'URL lui-même et renvoie le code."""
        flow = Flow.from_client_secrets_file(
            self.credentials_path, scopes=SCOPES, redirect_uri="http://localhost"
        )
        auth_url, _ = flow.authorization_url(prompt="consent")
        print(f"Ouvrez cette URL dans votre navigateur et autorisez l'accès :\n{auth_url}\n")
        print(
            "Vous serez redirigé vers une page qui ne charge pas (http://localhost/...) "
            "— copiez l'URL complète depuis la barre d'adresse (ou juste la valeur du "
            "paramètre 'code')."
        )
        response = input("Collez ici l'URL ou le code : ").strip()
        if response.startswith("http"):
            code = parse_qs(urlparse(response).query)["code"][0]
        else:
            code = response
        flow.fetch_token(code=code)
        return flow.credentials

    def iter_email_pdfs(
        self, query: str = "has:attachment filename:pdf", max_results: Optional[int] = None
    ) -> Iterator[EmailPDFBundle]:
        """Génère un EmailPDFBundle par email, un email à la fois (rien n'est stocké sur disque).

        Si l'email a plusieurs PDF en pièce jointe, ils sont fusionnés en un seul PDF
        (toutes les pages à la suite) dans `pdf_bytes`.
        """
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

                attachments = []
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
                    attachments.append((filename, pdf_bytes))

                if not attachments:
                    continue

                merged_bytes = self._merge_pdfs([b for _, b in attachments])
                text = "\n\n".join(self._extract_text(b) for _, b in attachments)

                yield EmailPDFBundle(
                    message_id=msg_ref["id"],
                    subject=headers.get("Subject", "(sans sujet)"),
                    sender=headers.get("From", ""),
                    date=headers.get("Date", ""),
                    filenames=[name for name, _ in attachments],
                    pdf_bytes=merged_bytes,
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

    @staticmethod
    def _merge_pdfs(pdf_bytes_list: list) -> bytes:
        if len(pdf_bytes_list) == 1:
            return pdf_bytes_list[0]
        writer = PdfWriter()
        for pdf_bytes in pdf_bytes_list:
            for page in PdfReader(io.BytesIO(pdf_bytes)).pages:
                writer.add_page(page)
        buffer = io.BytesIO()
        writer.write(buffer)
        return buffer.getvalue()


def push_to_supabase(supabase_client, bundle: EmailPDFBundle) -> None:
    """Upsert le bundle dans factures_gmail, en clé sur id_gmail (champ PDF = binaire fusionné)."""
    try:
        annee = str(parsedate_to_datetime(bundle.date).year)
    except (TypeError, ValueError):
        annee = ""

    supabase_client.table("factures_gmail").upsert(
        {
            "id_gmail": bundle.message_id,
            "nom_expediteur": bundle.sender,
            "email_expediteur": bundle.sender,
            "sujet_email": bundle.subject,
            "date_email": bundle.date,
            "annee": annee,
            "nb_pdf": len(bundle.filenames),
            "noms_pdfs": ", ".join(bundle.filenames),
            "PDF": "\\x" + bundle.pdf_bytes.hex(),
        },
        on_conflict="id_gmail",
    ).execute()


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manual-auth",
        action="store_true",
        help="Flow OAuth sans navigateur local (URL à ouvrir soi-même + code à coller).",
    )
    parser.add_argument(
        "--no-supabase",
        action="store_true",
        help="Ne pas envoyer les PDF vers Supabase (affichage seulement).",
    )
    args = parser.parse_args()

    supabase_client = None
    if not args.no_supabase:
        from supabase import create_client

        supabase_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    reader = GmailPDFReader(manual_auth=args.manual_auth)
    for bundle in reader.iter_email_pdfs(max_results=20):
        print(f"--- {bundle.subject} ({', '.join(bundle.filenames)}) ---")
        print(f"De: {bundle.sender} | Date: {bundle.date}")
        print(bundle.text[:500])

        if supabase_client is not None:
            push_to_supabase(supabase_client, bundle)
            print(f"→ Enregistré dans Supabase (id_gmail={bundle.message_id})")
        print()


if __name__ == "__main__":
    main()
