from __future__ import annotations

import asyncio

import httpx
import pytest
from httpx import ASGITransport


@pytest.mark.asyncio
async def test_notify_creates_job(app):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/notify",
            json={
                "to": "user@example.com",
                "subject": "Welcome",
                "template_name": "welcome",
                "context": {"name": "User"},
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["job_id"]


@pytest.mark.asyncio
async def test_get_job_returns_status(app):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_response = await client.post(
            "/notify",
            json={
                "to": "user@example.com",
                "subject": "Welcome",
                "template_name": "welcome",
                "context": {"name": "User"},
            },
        )
        job_id = create_response.json()["job_id"]
        response = await client.get(f"/jobs/{job_id}")
        await asyncio.sleep(0.1)

    assert response.status_code == 200
    assert response.json()["status"] in {"pending", "sent"}


@pytest.mark.asyncio
async def test_list_jobs(app):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/notify",
            json={
                "to": "user@example.com",
                "subject": "Welcome",
                "template_name": "welcome",
                "context": {"name": "User"},
            },
        )
        response = await client.get("/jobs")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_delete_job(app):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        create_response = await client.post(
            "/notify",
            json={
                "to": "user@example.com",
                "subject": "Welcome",
                "template_name": "welcome",
                "context": {"name": "User"},
            },
        )
        job_id = create_response.json()["job_id"]
        response = await client.delete(f"/jobs/{job_id}")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unknown_template_fails(app):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/notify",
            json={
                "to": "user@example.com",
                "subject": "Welcome",
                "template_name": "missing-template",
                "context": {"name": "User"},
            },
        )

    assert 400 <= response.status_code < 500
