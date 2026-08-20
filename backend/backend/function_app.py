import azure.functions as func
import json
import os
import uuid
import time
import logging
import requests
from datetime import datetime, timezone, timedelta
from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions
from azure.cosmos import CosmosClient, exceptions
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

app = func.FunctionApp()

REQUIRED_FIELDS = ["device_id", "timestamp", "transcript", "unit_code"]
VALID_STATUSES = {"Processing", "Pending Review", "Open", "In Progress", "Resolved", "Rejected"}
UPDATABLE_FIELDS = {"status", "equipment", "location", "issue_summary", "assigned_to", "resolution_notes", "resolved_at"}

KEY_VAULT_URL = "https://kv-vmis-dev.vault.azure.net/"
FOUNDRY_PROJECT_ENDPOINT = "https://voice-maintenance-intak-resource.services.ai.azure.com/api/projects/voice-maintenance-intake"
FOUNDRY_AGENT_NAME = "voice-intake"
SPEECH_REGION = "centralus"
AUDIO_CONTAINER = "audio"
SAS_HOURS = 24
RATE_LIMIT_MAX = 3
RATE_LIMIT_WINDOW_HOURS = 1

_secret_client = None
_secrets_cache = {}
_credential = None


def _get_secret(name: str) -> str:
    global _secret_client
    if name in _secrets_cache:
        return _secrets_cache[name]
    if _secret_client is None:
        _secret_client = SecretClient(vault_url=KEY_VAULT_URL, credential=DefaultAzureCredential())
    value = _secret_client.get_secret(name).value
    _secrets_cache[name] = value
    return value


def _get_tickets_container():
    cosmos_conn_str = _get_secret("CosmosDbConnectionString")
    cosmos_client = CosmosClient.from_connection_string(cosmos_conn_str)
    database = cosmos_client.get_database_client("vmisdb")
    return database.get_container_client("tickets")


def _get_units_container():
    cosmos_conn_str = _get_secret("CosmosDbConnectionString")
    cosmos_client = CosmosClient.from_connection_string(cosmos_conn_str)
    database = cosmos_client.get_database_client("vmisdb")
    return database.get_container_client("units")


def _get_credential():
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()
    return _credential


def _make_sas_url(blob_name: str) -> str:
    storage_conn_str = _get_secret("StorageConnectionString")
    blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
    sas_token = generate_blob_sas(
        account_name=blob_service.account_name,
        container_name=AUDIO_CONTAINER,
        blob_name=blob_name,
        account_key=blob_service.credential.account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(hours=SAS_HOURS),
    )
    return f"{blob_service.url}{AUDIO_CONTAINER}/{blob_name}?{sas_token}"


def _error(message: str, status_code: int) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status_code,
        mimetype="application/json",
    )


def _blob_name_for(ticket: dict):
    blob_name = ticket.get("audio_blob_name")
    if not blob_name and ticket.get("audio_url"):
        try:
            blob_name = ticket["audio_url"].split("/audio/")[-1].split("?")[0]
        except Exception:
            blob_name = None
    return blob_name


def _refresh_audio_url(ticket: dict) -> dict:
    blob_name = _blob_name_for(ticket)
    if blob_name:
        try:
            ticket["audio_url"] = _make_sas_url(blob_name)
        except Exception as e:
            logging.error(f"Failed to generate SAS URL for {blob_name}: {e}")
    return ticket


def _enrich_with_resident(ticket: dict) -> dict:
    ticket["resident_name"] = None
    ticket["contact_email"] = None
    ticket["contact_phone"] = None

    unit_code = ticket.get("unit_code")
    if not unit_code:
        return ticket

    try:
        container = _get_units_container()
        unit = container.read_item(item=unit_code, partition_key=unit_code)
        ticket["resident_name"] = unit.get("resident_name")
        ticket["contact_email"] = unit.get("contact_email")
        ticket["contact_phone"] = unit.get("contact_phone")
    except exceptions.CosmosResourceNotFoundError:
        pass
    except Exception as e:
        logging.error(f"Resident lookup failed for unit_code {unit_code}: {e}")

    return ticket


def _send_confirmation_email(ticket_id: str, unit_code: str, resident_name: str, contact_email: str) -> None:
    try:
        import hmac as hmac_lib
        import hashlib
        import base64
        from email.utils import formatdate

        acs_conn = _get_secret("AcsConnectionString")
        sender = _get_secret("AcsSenderEmail")

        parts = {}
        for part in acs_conn.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                parts[k.lower()] = v
        endpoint = parts.get("endpoint", "").rstrip("/")
        access_key = parts.get("accesskey", "")
        host = endpoint.replace("https://", "")

        display_name = resident_name if resident_name else "Resident"
        payload = {
            "senderAddress": sender,
            "recipients": {
                "to": [{"address": contact_email, "displayName": display_name}]
            },
            "content": {
                "subject": "Your maintenance report has been received",
                "plainText": (
                    f"Hi {display_name},\n\n"
                    f"We received your maintenance report for unit {unit_code}.\n"
                    f"Your reference number is: {ticket_id}\n\n"
                    f"Our team will review it shortly.\n\n"
                    f"- SpeakFix Maintenance Team"
                ),
                "html": (
                    f"<p>Hi {display_name},</p>"
                    f"<p>We received your maintenance report for unit <strong>{unit_code}</strong>.</p>"
                    f"<p>Your reference number is: <strong>{ticket_id}</strong></p>"
                    f"<p>Our team will review it shortly.</p>"
                    f"<p>- SpeakFix Maintenance Team</p>"
                ),
            },
        }

        api_version = "2025-09-01"
        path_and_query = f"/emails:send?api-version={api_version}"
        body = json.dumps(payload)
        date = formatdate(usegmt=True)
        content_hash = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        string_to_sign = f"POST\n{path_and_query}\n{date};{host};{content_hash}"
        decoded_key = base64.b64decode(access_key)
        signature = base64.b64encode(
            hmac_lib.new(decoded_key, string_to_sign.encode("utf-8"), hashlib.sha256).digest()
        ).decode()

        headers = {
            "x-ms-date": date,
            "x-ms-content-sha256": content_hash,
            "Authorization": f"HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature={signature}",
            "Content-Type": "application/json",
            "host": host,
        }

        resp = requests.post(
            f"{endpoint}{path_and_query}",
            headers=headers,
            data=body.encode("utf-8"),
            timeout=30,
        )
        resp.raise_for_status()
        logging.info(f"Confirmation email sent to {contact_email} for ticket {ticket_id}, status: {resp.status_code}")

    except Exception as e:
        logging.error(f"Failed to send confirmation email for ticket {ticket_id}: {e}")


@app.route(route="intake", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def intake(req: func.HttpRequest) -> func.HttpResponse:
    device_key = req.headers.get("X-Device-Key")
    try:
        expected_key = _get_secret("DeviceSharedSecret")
    except Exception as e:
        logging.error(f"Failed to fetch DeviceSharedSecret from Key Vault: {e}")
        return _error("Server misconfiguration.", 500)

    if not device_key or device_key != expected_key:
        return _error("Invalid or missing device key.", 401)

    try:
        audio_file = req.files.get("audio")
        form = req.form
        device_id = form.get("device_id")
        timestamp = form.get("timestamp")
        transcript = form.get("transcript")
        unit_code = form.get("unit_code")
    except ValueError:
        return _error("Request must be multipart/form-data.", 400)

    missing = [f for f in REQUIRED_FIELDS if not form.get(f)]
    if audio_file is None:
        missing.insert(0, "audio")
    if missing:
        return _error(f"Missing required field(s): {', '.join(missing)}", 400)

    audio_bytes = audio_file.read()
    if not audio_bytes:
        return _error("Audio file is empty.", 400)

    try:
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=RATE_LIMIT_WINDOW_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rate_container = _get_tickets_container()
        rate_query = "SELECT VALUE COUNT(1) FROM tickets t WHERE t.unit_code = @unit_code AND t.created_at >= @since"
        rate_params = [
            {"name": "@unit_code", "value": unit_code},
            {"name": "@since", "value": one_hour_ago},
        ]
        rate_result = list(rate_container.query_items(query=rate_query, parameters=rate_params, enable_cross_partition_query=True))
        ticket_count = rate_result[0] if rate_result else 0
        if ticket_count >= RATE_LIMIT_MAX:
            logging.warning(f"Rate limit hit for unit_code {unit_code}: {ticket_count} tickets in last hour")
            return _error("Rate limit exceeded. Try again later.", 429)
    except Exception as e:
        logging.error(f"Rate limit check failed for unit_code {unit_code}: {e}")

    ticket_id = str(uuid.uuid4())
    blob_name = f"{device_id}_{ticket_id}.wav"

    try:
        storage_conn_str = _get_secret("StorageConnectionString")
        blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
        blob_client = blob_service.get_blob_client(container=AUDIO_CONTAINER, blob=blob_name)
        blob_client.upload_blob(audio_bytes, overwrite=True)
        audio_url = _make_sas_url(blob_name)
    except Exception as e:
        logging.error(f"Blob upload failed: {e}")
        return _error("Failed to store audio file.", 500)

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ticket = {
        "id": ticket_id,
        "ticket_id": ticket_id,
        "device_id": device_id,
        "device_timestamp": timestamp,
        "created_at": created_at,
        "audio_url": audio_url,
        "audio_blob_name": blob_name,
        "transcript": transcript,
        "transcript_cloud": None,
        "unit_code": unit_code,
        "equipment": None,
        "location": None,
        "issue_summary": None,
        "confidence": None,
        "missing_information": None,
        "requires_human_review": None,
        "status": "Processing",
        "assigned_to": None,
        "resolution_notes": None,
        "resolved_at": None,
    }

    try:
        container = _get_tickets_container()
        container.create_item(body=ticket)
    except Exception as e:
        logging.error(f"Cosmos DB write failed: {e}")
        return _error("Failed to create ticket record.", 500)

    try:
        units_container = _get_units_container()
        unit = units_container.read_item(item=unit_code, partition_key=unit_code)
        contact_email = unit.get("contact_email")
        resident_name = unit.get("resident_name")
        if contact_email:
            _send_confirmation_email(ticket_id, unit_code, resident_name, contact_email)
        else:
            logging.info(f"No contact_email for unit_code {unit_code}, skipping confirmation email")
    except exceptions.CosmosResourceNotFoundError:
        logging.info(f"No unit record for unit_code {unit_code}, skipping confirmation email")
    except Exception as e:
        logging.error(f"Unit lookup for email failed for unit_code {unit_code}: {e}")

    return func.HttpResponse(
        json.dumps({"ticket_id": ticket_id, "status": "Processing"}),
        status_code=201,
        mimetype="application/json",
    )


@app.route(route="tickets", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def list_tickets(req: func.HttpRequest) -> func.HttpResponse:
    status = req.params.get("status")
    date_from = req.params.get("from")
    date_to = req.params.get("to")

    query = "SELECT * FROM tickets t WHERE 1=1"
    params = []
    if status:
        query += " AND t.status = @status"
        params.append({"name": "@status", "value": status})
    if date_from:
        query += " AND t.created_at >= @from"
        params.append({"name": "@from", "value": date_from})
    if date_to:
        query += " AND t.created_at <= @to"
        params.append({"name": "@to", "value": date_to})

    try:
        container = _get_tickets_container()
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        items = [_enrich_with_resident(_refresh_audio_url(t)) for t in items]
        return func.HttpResponse(json.dumps(items), status_code=200, mimetype="application/json")
    except Exception as e:
        logging.error(f"List tickets failed: {e}")
        return _error("Failed to list tickets.", 500)


@app.route(route="tickets/{ticket_id}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def get_ticket(req: func.HttpRequest) -> func.HttpResponse:
    ticket_id = req.route_params.get("ticket_id")
    try:
        container = _get_tickets_container()
        item = container.read_item(item=ticket_id, partition_key=ticket_id)
        item = _refresh_audio_url(item)
        item = _enrich_with_resident(item)
        return func.HttpResponse(json.dumps(item), status_code=200, mimetype="application/json")
    except exceptions.CosmosResourceNotFoundError:
        return _error("Ticket not found.", 404)
    except Exception as e:
        logging.error(f"Get ticket failed: {e}")
        return _error("Failed to retrieve ticket.", 500)


@app.route(route="tickets/{ticket_id}", methods=["PATCH"], auth_level=func.AuthLevel.ANONYMOUS)
def update_ticket(req: func.HttpRequest) -> func.HttpResponse:
    ticket_id = req.route_params.get("ticket_id")

    try:
        body = req.get_json()
    except ValueError:
        return _error("Request body must be valid JSON.", 400)

    updates = {k: v for k, v in body.items() if k in UPDATABLE_FIELDS}
    if not updates:
        return _error(f"No valid fields to update. Allowed: {', '.join(UPDATABLE_FIELDS)}", 400)

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        return _error(f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}", 400)

    try:
        container = _get_tickets_container()
        item = container.read_item(item=ticket_id, partition_key=ticket_id)
        item.update(updates)
        updated_item = container.replace_item(item=ticket_id, body=item)
        updated_item = _refresh_audio_url(updated_item)
        updated_item = _enrich_with_resident(updated_item)
        return func.HttpResponse(json.dumps(updated_item), status_code=200, mimetype="application/json")
    except exceptions.CosmosResourceNotFoundError:
        return _error("Ticket not found.", 404)
    except Exception as e:
        logging.error(f"Update ticket failed: {e}")
        return _error("Failed to update ticket.", 500)


@app.route(route="tickets/{ticket_id}", methods=["DELETE"], auth_level=func.AuthLevel.ANONYMOUS)
def delete_ticket(req: func.HttpRequest) -> func.HttpResponse:
    ticket_id = req.route_params.get("ticket_id")

    try:
        container = _get_tickets_container()
        item = container.read_item(item=ticket_id, partition_key=ticket_id)
    except exceptions.CosmosResourceNotFoundError:
        return _error("Ticket not found.", 404)
    except Exception as e:
        logging.error(f"Delete lookup failed for {ticket_id}: {e}")
        return _error("Failed to retrieve ticket.", 500)

    blob_name = _blob_name_for(item)
    audio_deleted = False

    if blob_name:
        try:
            storage_conn_str = _get_secret("StorageConnectionString")
            blob_service = BlobServiceClient.from_connection_string(storage_conn_str)
            blob_client = blob_service.get_blob_client(container=AUDIO_CONTAINER, blob=blob_name)
            blob_client.delete_blob()
            audio_deleted = True
        except Exception as e:
            logging.error(f"Blob delete failed for {blob_name} (ticket {ticket_id}): {e}")

    try:
        container.delete_item(item=ticket_id, partition_key=ticket_id)
    except Exception as e:
        logging.error(f"Cosmos delete failed for {ticket_id}: {e}")
        return _error("Failed to delete ticket record.", 500)

    return func.HttpResponse(
        json.dumps({"ticket_id": ticket_id, "deleted": True, "audio_deleted": audio_deleted}),
        status_code=200,
        mimetype="application/json",
    )


def _invoke_agent(transcript: str) -> dict:
    token = _get_credential().get_token("https://ai.azure.com/.default").token
    url = f"{FOUNDRY_PROJECT_ENDPOINT}/openai/v1/responses"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = {
        "input": transcript,
        "agent_reference": {
            "name": FOUNDRY_AGENT_NAME,
            "type": "agent_reference",
        },
    }

    resp = requests.post(url, headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    output_text = data.get("output_text")
    if not output_text:
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") in ("output_text", "text") and content.get("text"):
                    output_text = content["text"]
                    break
            if output_text:
                break

    if not output_text:
        raise RuntimeError(f"No output text in agent response: {json.dumps(data)[:500]}")

    cleaned = output_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    return json.loads(cleaned)


@app.cosmos_db_trigger(
    arg_name="documents",
    database_name="vmisdb",
    container_name="tickets",
    connection="CosmosDbTriggerConnection",
    lease_container_name="leases",
    create_lease_container_if_not_exists=True,
)
def process_ticket(documents: func.DocumentList) -> None:
    if not documents:
        return

    for doc in documents:
        ticket = dict(doc)

        if ticket.get("status") != "Processing":
            continue

        ticket_id = ticket.get("ticket_id")
        transcript = ticket.get("transcript", "")

        try:
            agent_output = _invoke_agent(transcript)

            confidence = agent_output.get("confidence", 0.0)
            missing_information = agent_output.get("missing_information", True)
            requires_human_review = agent_output.get("requires_human_review", True)

            if confidence >= 0.7 and missing_information is False and requires_human_review is False:
                new_status = "Open"
            else:
                new_status = "Pending Review"

            ticket.update({
                "equipment": agent_output.get("equipment"),
                "location": agent_output.get("location"),
                "issue_summary": agent_output.get("issue_summary"),
                "confidence": confidence,
                "missing_information": missing_information,
                "requires_human_review": requires_human_review,
                "status": new_status,
            })

        except Exception as e:
            logging.error(f"Agent processing failed for ticket {ticket_id}: {e}")
            ticket["status"] = "Pending Review"
            ticket["requires_human_review"] = True

        try:
            container = _get_tickets_container()
            container.replace_item(item=ticket_id, body=ticket)
        except Exception as e:
            logging.error(f"Failed to save processed ticket {ticket_id}: {e}")


def _transcribe_with_speech(audio_bytes: bytes) -> str:
    speech_key = _get_secret("SpeechServiceKey")
    url = f"https://{SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
    params = {"language": "en-US", "format": "simple"}
    headers = {
        "Ocp-Apim-Subscription-Key": speech_key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
    }
    resp = requests.post(url, params=params, headers=headers, data=audio_bytes, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("DisplayText", "")


@app.blob_trigger(
    arg_name="myblob",
    path="audio/{name}",
    connection="BlobTriggerConnection",
    source="EventGrid",
)
def transcribe_audio(myblob: func.InputStream) -> None:
    blob_name = myblob.name.split("/")[-1]

    if "_" not in blob_name:
        logging.error(f"Unexpected blob name format, skipping: {blob_name}")
        return

    ticket_id = blob_name.rsplit("_", 1)[-1].replace(".wav", "")
    audio_bytes = myblob.read()

    try:
        transcript_cloud = _transcribe_with_speech(audio_bytes)
    except Exception as e:
        logging.error(f"Speech transcription failed for {blob_name}: {e}")
        return

    container = _get_tickets_container()
    for attempt in range(5):
        try:
            item = container.read_item(item=ticket_id, partition_key=ticket_id)
            item["transcript_cloud"] = transcript_cloud
            container.replace_item(item=ticket_id, body=item)
            return
        except exceptions.CosmosResourceNotFoundError:
            time.sleep(2)

    logging.error(f"Ticket {ticket_id} not found after retries; transcript_cloud not saved.")