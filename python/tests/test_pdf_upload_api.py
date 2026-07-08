from pathlib import Path

from fastapi.testclient import TestClient

from app import main as invoice_app


client = TestClient(invoice_app.app)


def setup_function():
    invoice_app.job_storage.clear()


async def _finish_job_immediately(job_id: str) -> None:
    job = invoice_app.job_storage[job_id]
    job["status"] = "done"
    job["result"] = {"invoice_id": "TEST-001", "line_items": []}


def test_valid_pdf_upload_succeeds(monkeypatch):
    monkeypatch.setattr(invoice_app, "process_uploaded_invoice_job", _finish_job_immediately)
    pdf_path = Path(__file__).parents[1] / "test_invoice.pdf"

    with pdf_path.open("rb") as pdf_file:
        response = client.post(
            "/api/invoices/upload",
            files={"file": ("invoice.pdf", pdf_file, "application/pdf")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["job_id"] in invoice_app.job_storage
    assert body["filename"] == "invoice.pdf"


def test_non_pdf_file_is_rejected():
    response = client.post(
        "/api/invoices/upload",
        files={"file": ("invoice.txt", b"not a pdf", "text/plain")},
    )

    assert response.status_code == 400
    assert "PDF" in response.json()["detail"] or "pdf" in response.json()["detail"]


def test_oversized_pdf_is_rejected(monkeypatch):
    monkeypatch.setattr(invoice_app, "get_max_pdf_upload_bytes", lambda: 4)

    response = client.post(
        "/api/invoices/upload",
        files={"file": ("invoice.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
    )

    assert response.status_code == 413
    assert "upload limit" in response.json()["detail"]


def test_empty_pdf_is_rejected_without_crashing():
    response = client.post(
        "/api/invoices/upload",
        files={"file": ("invoice.pdf", b"", "application/pdf")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_corrupt_pdf_is_rejected_without_crashing():
    response = client.post(
        "/api/invoices/upload",
        files={"file": ("invoice.pdf", b"%PDF-1.4\nnot a complete pdf", "application/pdf")},
    )

    assert response.status_code == 400
    assert "corrupt" in response.json()["detail"].lower()
