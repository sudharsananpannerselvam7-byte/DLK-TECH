"""
SmartFlow Backend Tests — Auth & API
"""
import pytest
import json
from app import create_app
from app.extensions import db


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        # Seed roles
        from app.services import seed_roles
        seed_roles()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers(client):
    """Register and login to get auth headers."""
    # Register
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "TestPass123!",
        "full_name": "Test User",
    })
    # Login
    resp = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "TestPass123!",
    })
    data = resp.get_json()
    token = data["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestHealth:
    def test_health_endpoint(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert "checks" in data["data"]
        assert data["data"]["checks"]["flask"] == "ok"
        assert data["data"]["checks"]["database"] == "ok"

    def test_readiness(self, client):
        resp = client.get("/api/v1/health/ready")
        assert resp.status_code == 200

    def test_liveness(self, client):
        resp = client.get("/api/v1/health/live")
        assert resp.status_code == 200


class TestAuth:
    def test_register_success(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "Password123!",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["data"]["username"] == "newuser"

    def test_register_duplicate_email(self, client):
        client.post("/api/v1/auth/register", json={
            "email": "dup@example.com",
            "username": "user1",
            "password": "Password123!",
        })
        resp = client.post("/api/v1/auth/register", json={
            "email": "dup@example.com",
            "username": "user2",
            "password": "Password123!",
        })
        assert resp.status_code == 409
        assert resp.get_json()["error_code"] == "EMAIL_EXISTS"

    def test_register_weak_password(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "weak@example.com",
            "username": "weakuser",
            "password": "123",
        })
        assert resp.status_code == 400
        assert "password" in resp.get_json()["message"].lower()

    def test_login_success(self, client):
        client.post("/api/v1/auth/register", json={
            "email": "login@example.com",
            "username": "loginuser",
            "password": "Password123!",
        })
        resp = client.post("/api/v1/auth/login", json={
            "email": "login@example.com",
            "password": "Password123!",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["access_token"] is not None
        assert data["data"]["refresh_token"] is not None

    def test_login_wrong_password(self, client):
        client.post("/api/v1/auth/register", json={
            "email": "wrong@example.com",
            "username": "wronguser",
            "password": "Password123!",
        })
        resp = client.post("/api/v1/auth/login", json={
            "email": "wrong@example.com",
            "password": "WrongPass!",
        })
        assert resp.status_code == 401
        assert resp.get_json()["error_code"] == "INVALID_CREDENTIALS"

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "Password123!",
        })
        assert resp.status_code == 401

    def test_me_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["username"] == "testuser"
        assert data["data"]["email"] == "test@example.com"

    def test_me_unauthenticated(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_logout(self, client, auth_headers):
        resp = client.post("/api/v1/auth/logout", headers=auth_headers)
        assert resp.status_code == 200


class TestContent:
    def test_list_content_public(self, client):
        resp = client.get("/api/v1/content")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert isinstance(data["data"], list)

    def test_get_nonexistent_content(self, client):
        resp = client.get("/api/v1/content/nonexistent-id")
        assert resp.status_code == 404

    def test_upload_requires_auth(self, client):
        resp = client.post("/api/v1/content/upload")
        assert resp.status_code == 401


class TestSearch:
    def test_search_requires_query(self, client):
        resp = client.get("/api/v1/search?q=a")
        assert resp.status_code == 400  # min 2 chars

    def test_search_results(self, client):
        resp = client.get("/api/v1/search?q=smartflow")
        assert resp.status_code in (200, 400)

    def test_search_with_valid_query(self, client):
        resp = client.get("/api/v1/search?q=demo")
        assert resp.status_code == 200


class TestFeed:
    def test_feed_public(self, client):
        resp = client.get("/api/v1/feed")
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data["data"], list)
        assert "has_next" in data["meta"]

    def test_feed_with_cursor(self, client):
        import base64
        cursor = base64.b64encode(b"2024-01-01T00:00:00").decode()
        resp = client.get(f"/api/v1/feed?cursor={cursor}")
        assert resp.status_code == 200


class TestSources:
    def test_list_sources_requires_auth(self, client):
        resp = client.get("/api/v1/sources")
        assert resp.status_code == 401

    def test_create_source_local(self, client, auth_headers):
        resp = client.post("/api/v1/sources", json={
            "name": "Test Local Source",
            "adapter_type": "local",
            "config": {"base_path": "uploads/test"},
        }, headers=auth_headers)
        assert resp.status_code == 201
        assert resp.get_json()["data"]["name"] == "Test Local Source"

    def test_create_source_invalid_type(self, client, auth_headers):
        resp = client.post("/api/v1/sources", json={
            "name": "Bad Source",
            "adapter_type": "invalid_type",
            "config": {},
        }, headers=auth_headers)
        assert resp.status_code == 400

    def test_path_traversal_protection(self, client, auth_headers):
        resp = client.post("/api/v1/sources", json={
            "name": "Evil Source",
            "adapter_type": "local",
            "config": {"base_path": "../etc/passwd"},
        }, headers=auth_headers)
        assert resp.status_code == 400
        assert resp.get_json()["error_code"] == "INVALID_PATH"


class TestCacheAPI:
    def test_cache_status_requires_auth(self, client):
        resp = client.get("/api/v1/cache/status")
        assert resp.status_code == 401

    def test_cache_status_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/cache/status", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "metrics" in data["data"]
        assert "health" in data["data"]


class TestAnalytics:
    def test_latency_stats_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/analytics/latency", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "total_requests" in data
        assert "p50_latency_ms" in data
        assert "p95_latency_ms" in data
        assert "p99_latency_ms" in data
        assert "cache_hit_rate" in data

    def test_overview_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/analytics/overview", headers=auth_headers)
        assert resp.status_code == 200


class TestStorage:
    def test_storage_stats_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/storage/stats", headers=auth_headers)
        assert resp.status_code == 200

    def test_serve_invalid_path(self, client):
        resp = client.get("/api/v1/storage/file/../../../etc/passwd")
        assert resp.status_code in (400, 403, 404)


class TestJobs:
    def test_list_jobs_requires_auth(self, client):
        resp = client.get("/api/v1/jobs")
        assert resp.status_code == 401

    def test_list_jobs_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/jobs", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.get_json()["data"], list)


class TestNetwork:
    def test_report_network_authenticated(self, client, auth_headers):
        resp = client.post("/api/v1/network/report", json={
            "rtt_ms": 45.2,
            "bandwidth_mbps": 50.0,
            "quality": "fast",
            "is_online": True,
        }, headers=auth_headers)
        assert resp.status_code == 200

    def test_network_stats_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/network/stats", headers=auth_headers)
        assert resp.status_code == 200


class TestPrefetch:
    def test_request_prefetch_authenticated(self, client, auth_headers):
        resp = client.post("/api/v1/prefetch", json={
            "content_ids": ["nonexistent-id"],
            "network_quality": "fast",
        }, headers=auth_headers)
        assert resp.status_code == 200

    def test_prefetch_status_authenticated(self, client, auth_headers):
        resp = client.get("/api/v1/prefetch/status?ids=fake-id", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "fake-id" in data
        assert data["fake-id"] == "not_requested"


class TestSecurity:
    """Security-focused tests."""

    def test_no_stack_trace_on_error(self, client):
        resp = client.get("/api/v1/content/definitely-not-valid-@@@@")
        data = resp.get_json()
        assert "traceback" not in str(data).lower()
        assert "exception" not in str(data).lower()

    def test_request_id_in_response(self, client):
        resp = client.get("/api/v1/health")
        data = resp.get_json()
        assert "request_id" in data
        assert len(data["request_id"]) > 10

    def test_security_headers_present(self, client):
        resp = client.get("/api/v1/health")
        assert "X-Content-Type-Options" in resp.headers
        assert "X-Frame-Options" in resp.headers

    def test_sql_injection_search(self, client):
        # Should not crash, should return 200/400 with no DB error
        resp = client.get("/api/v1/search?q=' OR 1=1 --")
        assert resp.status_code in (200, 400)

    def test_admin_endpoint_unauthorized(self, client, auth_headers):
        resp = client.get("/api/v1/admin/dashboard", headers=auth_headers)
        # Regular user should get 403
        assert resp.status_code == 403


class TestResponseFormat:
    """Verify consistent API response format."""

    def test_success_format(self, client):
        resp = client.get("/api/v1/health")
        data = resp.get_json()
        assert "success" in data
        assert "data" in data
        assert "request_id" in data

    def test_error_format(self, client):
        resp = client.get("/api/v1/content/notfound")
        data = resp.get_json()
        assert data["success"] is False
        assert "message" in data
        assert "error_code" in data
        assert "request_id" in data


class TestDevices:
    """Device registration and management tests."""

    def test_list_devices_requires_auth(self, client):
        resp = client.get("/api/v1/devices")
        assert resp.status_code == 401

    def test_register_device(self, client, auth_headers):
        payload = {
            "device_name": "Test Laptop",
            "device_type": "laptop",
            "device_fingerprint": "fingerprint-xyz-12345",
            "client_version": "1.0.0",
        }
        resp = client.post("/api/v1/devices/register", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["device_name"] == "Test Laptop"
        assert data["device_fingerprint"] == "fingerprint-xyz-12345"

        # List devices
        list_resp = client.get("/api/v1/devices", headers=auth_headers)
        assert list_resp.status_code == 200
        assert len(list_resp.get_json()["data"]) >= 1


class TestPredictions:
    """Sequential transition and prediction engine tests."""

    def test_predictions_requires_auth(self, client):
        resp = client.get("/api/v1/predictions")
        assert resp.status_code == 401

    def test_predict_and_transition(self, client, auth_headers):
        # Record transitions: resource-A -> resource-B (twice)
        trans_payload = {
            "from_resource_id": "resource-A",
            "to_resource_id": "resource-B",
        }
        resp1 = client.post("/api/v1/predictions/transition", json=trans_payload, headers=auth_headers)
        assert resp1.status_code == 200
        resp2 = client.post("/api/v1/predictions/transition", json=trans_payload, headers=auth_headers)
        assert resp2.status_code == 200
        assert resp2.get_json()["data"]["transition_count"] == 2

        # Query prediction for resource-A
        pred_resp = client.post(
            "/api/v1/predictions/predict",
            json={"current_resource_id": "resource-A"},
            headers=auth_headers,
        )
        assert pred_resp.status_code == 200
        pred_data = pred_resp.get_json()["data"]
        assert pred_data["predicted_resource_id"] == "resource-B"
        assert pred_data["prediction_score"] >= 0.70
        assert "Frequently accessed" in pred_data["reason"]


class TestGitHubAdapter:
    """Verify GitHub connector adapter."""

    def test_github_adapter_init(self):
        from app.integrations.adapters.github_adapter import GitHubAdapter
        adapter = GitHubAdapter("sudharsananpannerselvam7-byte/DLK-TECH")
        assert adapter.get_name() == "github"
        assert adapter.repo == "sudharsananpannerselvam7-byte/DLK-TECH"

