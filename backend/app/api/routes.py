from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyRead

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.post("/companies", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
def create_company(company_data: CompanyCreate, db: Annotated[Session, Depends(get_db)]):
    existing_company = (
        db.query(Company)
        .filter(Company.slug == company_data.slug)
        .first()
    )

    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A company with this slug already exists.",
        )

    company = Company(**company_data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/companies", response_model=list[CompanyRead])
def list_companies(db: Annotated[Session, Depends(get_db)]):
    return db.query(Company).order_by(Company.id).all()

@router.get("/companies/{company_id}", response_model=CompanyRead)
def get_company(company_id: int, db: Annotated[Session, Depends(get_db)]):
    company = db.query(Company).filter(Company.id == company_id).first()

    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    return company