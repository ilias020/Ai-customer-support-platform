from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyRead

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.post("/companies", response_model=CompanyRead, status_code=201)
def create_company(company_data: CompanyCreate, db: Annotated[Session, Depends(get_db)]):
    company = Company(**company_data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/companies", response_model=list[CompanyRead])
def list_companies(db: Annotated[Session, Depends(get_db)]):
    return db.query(Company).order_by(Company.id).all()