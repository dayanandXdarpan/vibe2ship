"""Pydantic models for API request/response validation."""
from pydantic import BaseModel
from typing import Optional, Any


class HITLApproveRequest(BaseModel):
    issue_id: str
    reviewer_id: str
    notes: Optional[str] = ""


class HITLRejectRequest(BaseModel):
    issue_id: str
    reviewer_id: str
    reason: str
    escalate: bool = False  # True = ESCALATED, False = REJECTED


class ReportIssueRequest(BaseModel):
    issue_id: str
    image_url: str
    lat: float
    lng: float
    user_id: str
    user_description: Optional[str] = None


class ReportIssueResponse(BaseModel):
    issue_id: str
    job_status: str
    message: str


class IssueStatusResponse(BaseModel):
    issue_id: str
    status: str
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class InsightItem(BaseModel):
    title: str
    description: str
    priority: str
    category: str
    recommended_action: str


class InsightResponse(BaseModel):
    ward_id: str
    insights: list[dict]
    generated_at: str
    total_issues_analyzed: Optional[int] = 0


class ResolveIssueRequest(BaseModel):
    issue_id: str
    authority_id: str
    resolution_note: str
    resolution_photo_url: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
