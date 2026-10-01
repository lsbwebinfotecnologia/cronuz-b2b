import os
import shutil
import logging
from datetime import datetime, date
from pathlib import Path
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.core.upload_security import validate_file_size_and_extension, sanitize_filename, read_file_safely
from app.models.company import Company
from app.models.user import User
from app.models.author import Author
from app.models.editorial import (
    EditorialPipeline,
    EditorialStage,
    EditorialProject,
    EditorialTask,
    EditorialFile,
    EditorialHistory,
    EditorialProfessional,
    EditorialProjectCost,
    EditorialPipelineTemplate
)
from app.schemas.editorial import (
    PipelineCreate,
    PipelineUpdate,
    PipelineResponse,
    StageCreate,
    StageUpdate,
    StageReorderPayload,
    StageResponse,
    ProjectCreate,
    ProjectUpdate,
    ProjectMoveStagePayload,
    ProjectCardResponse,
    ProjectDetailResponse,
    TaskCreate,
    TaskResponse,
    FileResponse,
    HistoryResponse,
    ProfessionalCreate,
    ProfessionalUpdate,
    ProfessionalResponse,
    ProjectCostCreate,
    ProjectCostUpdate,
    ProjectCostResponse,
    PipelineTemplateResponse
)
from app.services.editorial_costing import simular_orcamento_completo, BENCHMARKS
from app.services.editorial_manual import gerar_manual_editorial_pdf
from app.services.editorial_exports import (
    export_services_excel,
    export_services_pdf,
    export_movements_excel,
    export_movements_pdf
)
from fastapi.responses import Response

router = APIRouter(prefix="/companies/{company_id}/editorial", tags=["Editorial"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")

def _get_user_attr(user: Any, attr: str, default: Any = None) -> Any:
    """Helper para obter atributo de user tanto se for objeto SQLAlchemy quanto se for dict."""
    if user is None:
        return default
    if isinstance(user, dict):
        return user.get(attr, default)
    return getattr(user, attr, default)

# ── Helper para Pipelines Padrão ──────────────────────────────────────────────

def _ensure_default_pipeline(db: Session, company_id: int) -> EditorialPipeline:
    """Se a empresa não possui nenhum pipeline, cria o fluxo editorial padrão."""
    pipeline = db.query(EditorialPipeline).filter(
        EditorialPipeline.company_id == company_id,
        EditorialPipeline.is_active == True
    ).first()

    if not pipeline:
        pipeline = EditorialPipeline(
            company_id=company_id,
            name="Produção de Livro Físico",
            description="Fluxo editorial completo padrão para publicação de livros físicos.",
            color="#6366f1",
            is_default=True,
            is_active=True
        )
        db.add(pipeline)
        db.flush()

        default_stages = [
            {"name": "Preparação & Original", "color": "#3b82f6", "sla_days": 10, "is_initial": True, "is_final": False},
            {"name": "1ª Revisão de Texto", "color": "#06b6d4", "sla_days": 15, "is_initial": False, "is_final": False},
            {"name": "Diagramação (Miolo)", "color": "#8b5cf6", "sla_days": 10, "is_initial": False, "is_final": False},
            {"name": "Criação de Capa", "color": "#ec4899", "sla_days": 7, "is_initial": False, "is_final": False},
            {"name": "2ª Revisão (Prova/Cotejo)", "color": "#f59e0b", "sla_days": 7, "is_initial": False, "is_final": False},
            {"name": "Orçamento & Gráfica", "color": "#10b981", "sla_days": 15, "is_initial": False, "is_final": False},
            {"name": "Concluído / Publicado", "color": "#14b8a6", "sla_days": 0, "is_initial": False, "is_final": True}
        ]

        for idx, st in enumerate(default_stages):
            stage = EditorialStage(
                company_id=company_id,
                pipeline_id=pipeline.id,
                name=st["name"],
                color=st["color"],
                order_index=idx,
                sla_days=st["sla_days"],
                is_initial=st["is_initial"],
                is_final=st["is_final"]
            )
            db.add(stage)
        db.commit()
        db.refresh(pipeline)

    return pipeline

# ── Endpoints de Suporte (Autores, Usuários, Hórus) ────────────────────────────

@router.get("/authors")
def get_editorial_authors(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    authors = db.query(Author).filter(Author.company_id == company_id).order_by(Author.nome).all()
    return [
        {
            "id": a.id,
            "nome": a.nome,
            "nome_fantasia": a.nome_fantasia,
            "email": a.emailb2b or a.end_email,
            "cpf": a.cpf,
            "cnpj": a.cnpj,
            "classificacao": a.classificacao_autor
        }
        for a in authors
    ]

@router.get("/users")
def get_editorial_users(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    users = db.query(User).filter(User.company_id == company_id, User.is_active == True).order_by(User.name).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": getattr(u, "role", "USER")
        }
        for u in users
    ]

@router.get("/horus/search-products")
async def search_horus_products(
    company_id: int,
    term: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Busca produtos/livros no Hórus ERP para vincular ao projeto editorial."""
    assert_company_ownership(current_user, company_id)
    try:
        from app.integrators.horus_products import HorusProducts
        from app.models.customer import Customer
        from app.models.company_settings import CompanySettings

        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        if not settings or not settings.horus_enabled:
            return {"items": [], "message": "Horus não habilitado para esta empresa"}

        # Pega guid padrão
        guid = settings.horus_default_b2b_guid or ""
        doc = _get_user_attr(current_user, "document", "")

        horus = HorusProducts(db, company_id)
        res = await horus.busca_acervo_b2b(
            id_doc=doc,
            id_guid=guid,
            term=term,
            limit=20
        )
        await horus.close()

        if isinstance(res, list):
            items = []
            for it in res:
                if isinstance(it, dict) and not it.get("Falha"):
                    items.append({
                        "cod_item": it.get("COD_ITEM"),
                        "nom_item": it.get("NOM_ITEM"),
                        "barras_isbn": it.get("BARRAS_ISBN") or it.get("ISBN"),
                        "preco_capa": it.get("PRECO_TABELA") or it.get("VAL_PRECO_VENDA"),
                        "saldo_disponivel": it.get("SALDO_DISPONIVEL", 0)
                    })
            return {"items": items}
        return {"items": []}
    except Exception as e:
        logger.warning(f"[search_horus_products] Erro ou Horus offline: {e}")
        return {"items": [], "message": str(e)}

# ── Pipelines & Stages Endpoints ──────────────────────────────────────────────

@router.get("/pipelines", response_model=List[PipelineResponse])
def list_pipelines(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    _ensure_default_pipeline(db, company_id)

    pipelines = db.query(EditorialPipeline).filter(
        EditorialPipeline.company_id == company_id,
        EditorialPipeline.is_active == True
    ).order_by(desc(EditorialPipeline.is_default), EditorialPipeline.name).all()

    result = []
    for p in pipelines:
        stages_res = []
        for s in p.stages:
            p_count = db.query(func.count(EditorialProject.id)).filter(EditorialProject.stage_id == s.id).scalar()
            stages_res.append(StageResponse(
                id=s.id,
                company_id=s.company_id,
                pipeline_id=s.pipeline_id,
                name=s.name,
                description=s.description,
                color=s.color,
                order_index=s.order_index,
                sla_days=s.sla_days,
                is_initial=s.is_initial,
                is_final=s.is_final,
                created_at=s.created_at,
                projects_count=p_count or 0
            ))
        total_p = db.query(func.count(EditorialProject.id)).filter(EditorialProject.pipeline_id == p.id).scalar()
        result.append(PipelineResponse(
            id=p.id,
            company_id=p.company_id,
            name=p.name,
            description=p.description,
            color=p.color,
            is_default=p.is_default,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
            stages=stages_res,
            projects_count=total_p or 0
        ))
    return result

@router.post("/pipelines", response_model=PipelineResponse)
def create_pipeline(
    company_id: int,
    payload: PipelineCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    if payload.is_default:
        db.query(EditorialPipeline).filter(EditorialPipeline.company_id == company_id).update({"is_default": False})

    pipeline = EditorialPipeline(
        company_id=company_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
        is_default=payload.is_default,
        is_active=payload.is_active
    )
    db.add(pipeline)
    db.flush()

    # Cria etapas iniciais padrão para facilitar o usuário
    default_stages = [
        {"name": "Início", "color": "#3b82f6", "sla_days": 5, "is_initial": True, "is_final": False},
        {"name": "Em Andamento", "color": "#f59e0b", "sla_days": 10, "is_initial": False, "is_final": False},
        {"name": "Concluído", "color": "#10b981", "sla_days": 0, "is_initial": False, "is_final": True}
    ]
    for idx, st in enumerate(default_stages):
        stage = EditorialStage(
            company_id=company_id,
            pipeline_id=pipeline.id,
            name=st["name"],
            color=st["color"],
            order_index=idx,
            sla_days=st["sla_days"],
            is_initial=st["is_initial"],
            is_final=st["is_final"]
        )
        db.add(stage)

    db.commit()
    db.refresh(pipeline)

    stages_res = [
        StageResponse(
            id=s.id,
            company_id=s.company_id,
            pipeline_id=s.pipeline_id,
            name=s.name,
            description=s.description,
            color=s.color,
            order_index=s.order_index,
            sla_days=s.sla_days,
            is_initial=s.is_initial,
            is_final=s.is_final,
            created_at=s.created_at,
            projects_count=0
        ) for s in pipeline.stages
    ]
    return PipelineResponse(
        id=pipeline.id,
        company_id=pipeline.company_id,
        name=pipeline.name,
        description=pipeline.description,
        color=pipeline.color,
        is_default=pipeline.is_default,
        is_active=pipeline.is_active,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
        stages=stages_res,
        projects_count=0
    )

@router.put("/pipelines/{pipeline_id}", response_model=PipelineResponse)
def update_pipeline(
    company_id: int,
    pipeline_id: int,
    payload: PipelineUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    pipeline = db.query(EditorialPipeline).filter(
        EditorialPipeline.id == pipeline_id,
        EditorialPipeline.company_id == company_id
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    if payload.is_default:
        db.query(EditorialPipeline).filter(EditorialPipeline.company_id == company_id).update({"is_default": False})

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(pipeline, k, v)
    pipeline.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(pipeline)

    stages_res = [
        StageResponse(
            id=s.id,
            company_id=s.company_id,
            pipeline_id=s.pipeline_id,
            name=s.name,
            description=s.description,
            color=s.color,
            order_index=s.order_index,
            sla_days=s.sla_days,
            is_initial=s.is_initial,
            is_final=s.is_final,
            created_at=s.created_at,
            projects_count=db.query(func.count(EditorialProject.id)).filter(EditorialProject.stage_id == s.id).scalar() or 0
        ) for s in pipeline.stages
    ]
    total_p = db.query(func.count(EditorialProject.id)).filter(EditorialProject.pipeline_id == pipeline.id).scalar()
    return PipelineResponse(
        id=pipeline.id,
        company_id=pipeline.company_id,
        name=pipeline.name,
        description=pipeline.description,
        color=pipeline.color,
        is_default=pipeline.is_default,
        is_active=pipeline.is_active,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
        stages=stages_res,
        projects_count=total_p or 0
    )

@router.delete("/pipelines/{pipeline_id}")
def delete_pipeline(
    company_id: int,
    pipeline_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    pipeline = db.query(EditorialPipeline).filter(
        EditorialPipeline.id == pipeline_id,
        EditorialPipeline.company_id == company_id
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    # Soft delete
    pipeline.is_active = False
    pipeline.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Pipeline desativado com sucesso"}

# ── Etapas (Stages) ───────────────────────────────────────────────────────────

@router.post("/pipelines/{pipeline_id}/stages", response_model=StageResponse)
def create_stage(
    company_id: int,
    pipeline_id: int,
    payload: StageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    pipeline = db.query(EditorialPipeline).filter(
        EditorialPipeline.id == pipeline_id,
        EditorialPipeline.company_id == company_id
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    max_order = db.query(func.max(EditorialStage.order_index)).filter(EditorialStage.pipeline_id == pipeline_id).scalar()
    order_idx = (max_order + 1) if max_order is not None else 0

    stage = EditorialStage(
        company_id=company_id,
        pipeline_id=pipeline_id,
        name=payload.name,
        description=payload.description,
        color=payload.color,
        order_index=order_idx if payload.order_index == 0 else payload.order_index,
        sla_days=payload.sla_days,
        is_initial=payload.is_initial,
        is_final=payload.is_final
    )
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return StageResponse(
        id=stage.id,
        company_id=stage.company_id,
        pipeline_id=stage.pipeline_id,
        name=stage.name,
        description=stage.description,
        color=stage.color,
        order_index=stage.order_index,
        sla_days=stage.sla_days,
        is_initial=stage.is_initial,
        is_final=stage.is_final,
        created_at=stage.created_at,
        projects_count=0
    )

@router.put("/stages/{stage_id}", response_model=StageResponse)
def update_stage(
    company_id: int,
    stage_id: int,
    payload: StageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    stage = db.query(EditorialStage).filter(
        EditorialStage.id == stage_id,
        EditorialStage.company_id == company_id
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(stage, k, v)
    stage.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(stage)
    p_count = db.query(func.count(EditorialProject.id)).filter(EditorialProject.stage_id == stage.id).scalar() or 0
    return StageResponse(
        id=stage.id,
        company_id=stage.company_id,
        pipeline_id=stage.pipeline_id,
        name=stage.name,
        description=stage.description,
        color=stage.color,
        order_index=stage.order_index,
        sla_days=stage.sla_days,
        is_initial=stage.is_initial,
        is_final=stage.is_final,
        created_at=stage.created_at,
        projects_count=p_count
    )

@router.put("/stages/reorder")
def reorder_stages(
    company_id: int,
    payload: StageReorderPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    for item in payload.stages:
        db.query(EditorialStage).filter(
            EditorialStage.id == item.stage_id,
            EditorialStage.company_id == company_id
        ).update({"order_index": item.order_index, "updated_at": datetime.utcnow()})
    db.commit()
    return {"ok": True}

@router.delete("/stages/{stage_id}")
def delete_stage(
    company_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    stage = db.query(EditorialStage).filter(
        EditorialStage.id == stage_id,
        EditorialStage.company_id == company_id
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    # Checa se há projetos na etapa
    has_projects = db.query(EditorialProject).filter(EditorialProject.stage_id == stage_id).first()
    if has_projects:
        raise HTTPException(status_code=400, detail="Não é possível excluir uma etapa que possui demandas ativas. Mova os projetos para outra etapa primeiro.")

    db.delete(stage)
    db.commit()
    return {"ok": True, "message": "Etapa removida com sucesso"}

# ── Projetos / Demandas Editoriais (Kanban & Lista) ───────────────────────────

@router.get("/projects", response_model=List[ProjectCardResponse])
def list_projects(
    company_id: int,
    pipeline_id: Optional[int] = None,
    stage_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    author_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    q = db.query(EditorialProject).filter(EditorialProject.company_id == company_id)

    if pipeline_id:
        q = q.filter(EditorialProject.pipeline_id == pipeline_id)
    if stage_id:
        q = q.filter(EditorialProject.stage_id == stage_id)
    if status:
        q = q.filter(EditorialProject.status == status)
    if priority:
        q = q.filter(EditorialProject.priority == priority)
    if author_id:
        q = q.filter(EditorialProject.author_id == author_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            EditorialProject.title.ilike(s),
            EditorialProject.subtitle.ilike(s),
            EditorialProject.isbn.ilike(s)
        ))

    projects = q.order_by(EditorialProject.stage_id, desc(EditorialProject.created_at)).all()

    today = date.today()
    result = []
    for p in projects:
        # Dias na etapa atual
        days_in = (datetime.utcnow() - p.stage_entered_at).days if p.stage_entered_at else 0
        is_over = (p.due_date < today) if (p.due_date and p.status != 'COMPLETED') else False

        tasks_total = len(p.tasks)
        tasks_done = sum(1 for t in p.tasks if t.is_completed)
        files_cnt = len(p.files)

        result.append(ProjectCardResponse(
            id=p.id,
            company_id=p.company_id,
            local_id=p.local_id,
            pipeline_id=p.pipeline_id,
            stage_id=p.stage_id,
            stage_name=p.stage.name if p.stage else "",
            stage_color=p.stage.color if p.stage else "#3b82f6",
            title=p.title,
            subtitle=p.subtitle,
            format=p.format,
            isbn=p.isbn,
            cover_url=p.cover_url,
            priority=p.priority,
            status=p.status,
            start_date=p.start_date,
            due_date=p.due_date,
            stage_entered_at=p.stage_entered_at,
            completed_at=p.completed_at,
            days_in_stage=days_in,
            is_overdue=is_over,
            responsible_user_id=p.responsible_user_id,
            responsible_user_name=p.responsible_user.name if p.responsible_user else None,
            author_id=p.author_id,
            author_name=p.author.nome if p.author else None,
            horus_cod_item=p.horus_cod_item,
            visible_to_author=p.visible_to_author,
            tasks_total=tasks_total,
            tasks_completed=tasks_done,
            files_count=files_cnt,
            tiragem=p.tiragem or 1000,
            custo_unitario_exemplar=p.custo_unitario_exemplar or 0.0,
            custo_total_orcado=p.custo_total_orcado or 0.0,
            custo_total_realizado=p.custo_total_realizado or 0.0,
            preco_capa_sugerido=p.preco_capa_sugerido or 0.0,
            created_at=p.created_at
        ))
    return result

@router.post("/projects", response_model=ProjectDetailResponse)
def create_project(
    company_id: int,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    # Identifica etapa inicial
    stage_id = payload.stage_id
    if not stage_id:
        initial_stage = db.query(EditorialStage).filter(
            EditorialStage.pipeline_id == payload.pipeline_id,
            EditorialStage.company_id == company_id
        ).order_by(EditorialStage.order_index).first()
        if not initial_stage:
            raise HTTPException(status_code=400, detail="O pipeline selecionado não possui etapas configuradas")
        stage_id = initial_stage.id

    # Gera próximo local_id sequencial por empresa
    max_id = db.query(func.max(EditorialProject.local_id)).filter(EditorialProject.company_id == company_id).scalar()
    next_local_id = (max_id + 1) if max_id is not None else 1

    project = EditorialProject(
        company_id=company_id,
        local_id=next_local_id,
        pipeline_id=payload.pipeline_id,
        stage_id=stage_id,
        title=payload.title,
        subtitle=payload.subtitle,
        format=payload.format,
        edition=payload.edition,
        volume=payload.volume,
        isbn=payload.isbn,
        barcode=payload.barcode,
        synopsis=payload.synopsis,
        cover_url=payload.cover_url,
        priority=payload.priority,
        status="ACTIVE",
        start_date=payload.start_date or date.today(),
        due_date=payload.due_date,
        stage_entered_at=datetime.utcnow(),
        responsible_user_id=payload.responsible_user_id or _get_user_attr(current_user, "id"),
        author_id=payload.author_id,
        horus_cod_item=payload.horus_cod_item,
        visible_to_author=payload.visible_to_author,
        estimated_pages=payload.estimated_pages,
        estimated_cost=payload.estimated_cost,
        tiragem=payload.tiragem or 1000,
        preco_capa_sugerido=payload.preco_capa_sugerido or 0.0,
        margem_estimada_percentual=payload.margem_estimada_percentual or 0.0,
        internal_notes=payload.internal_notes
    )
    db.add(project)
    db.flush()

    # Registra no histórico
    history = EditorialHistory(
        project_id=project.id,
        to_stage_id=stage_id,
        user_id=_get_user_attr(current_user, "id"),
        action="CREATED",
        notes="Demanda editorial criada no sistema."
    )
    db.add(history)
    db.commit()
    db.refresh(project)

    return get_project_detail(company_id=company_id, project_id=project.id, db=db, current_user=current_user)

@router.get("/projects/{project_id}", response_model=ProjectDetailResponse)
def get_project_detail(
    company_id: int,
    project_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    p = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Demanda editorial não encontrada")

    today = date.today()
    days_in = (datetime.utcnow() - p.stage_entered_at).days if p.stage_entered_at else 0
    is_over = (p.due_date < today) if (p.due_date and p.status != 'COMPLETED') else False

    tasks_res = [
        TaskResponse(
            id=t.id,
            project_id=t.project_id,
            stage_id=t.stage_id,
            title=t.title,
            is_completed=t.is_completed,
            completed_at=t.completed_at,
            completed_by_user_id=t.completed_by_user_id,
            completed_by_name=t.completed_by.name if t.completed_by else None,
            order_index=t.order_index,
            created_at=t.created_at
        ) for t in p.tasks
    ]

    files_res = [
        FileResponse(
            id=f.id,
            project_id=f.project_id,
            stage_id=f.stage_id,
            file_name=f.file_name,
            file_path=f.file_path,
            file_size=f.file_size,
            file_type=f.file_type,
            uploaded_by_user_id=f.uploaded_by_user_id,
            uploaded_by_name=f.uploaded_by.name if f.uploaded_by else None,
            created_at=f.created_at
        ) for f in p.files
    ]

    history_res = [
        HistoryResponse(
            id=h.id,
            project_id=h.project_id,
            from_stage_id=h.from_stage_id,
            from_stage_name=h.from_stage.name if h.from_stage else None,
            to_stage_id=h.to_stage_id,
            to_stage_name=h.to_stage.name if h.to_stage else None,
            user_id=h.user_id,
            user_name=h.user.name if h.user else None,
            action=h.action,
            notes=h.notes,
            created_at=h.created_at
        ) for h in p.history
    ]

    costs_res = [
        ProjectCostResponse(
            id=c.id,
            project_id=c.project_id,
            stage_id=c.stage_id,
            stage_name=c.stage.name if c.stage else None,
            professional_id=c.professional_id,
            professional_name=c.professional.name if c.professional else None,
            professional_pix=c.professional.pix_key if c.professional else None,
            service_type=c.service_type,
            description=c.description,
            unit_type=c.unit_type,
            quantity=c.quantity,
            unit_value=c.unit_value,
            estimated_total=c.estimated_total,
            actual_total=c.actual_total,
            payment_status=c.payment_status,
            paid_at=c.paid_at,
            invoice_number=c.invoice_number,
            notes=c.notes,
            order_index=c.order_index,
            created_at=c.created_at
        ) for c in (p.costs or [])
    ]

    return ProjectDetailResponse(
        id=p.id,
        company_id=p.company_id,
        local_id=p.local_id,
        pipeline_id=p.pipeline_id,
        stage_id=p.stage_id,
        stage_name=p.stage.name if p.stage else "",
        stage_color=p.stage.color if p.stage else "#3b82f6",
        title=p.title,
        subtitle=p.subtitle,
        format=p.format,
        isbn=p.isbn,
        cover_url=p.cover_url,
        priority=p.priority,
        status=p.status,
        start_date=p.start_date,
        due_date=p.due_date,
        stage_entered_at=p.stage_entered_at,
        completed_at=p.completed_at,
        days_in_stage=days_in,
        is_overdue=is_over,
        responsible_user_id=p.responsible_user_id,
        responsible_user_name=p.responsible_user.name if p.responsible_user else None,
        author_id=p.author_id,
        author_name=p.author.nome if p.author else None,
        horus_cod_item=p.horus_cod_item,
        visible_to_author=p.visible_to_author,
        tasks_total=len(tasks_res),
        tasks_completed=sum(1 for t in tasks_res if t.is_completed),
        files_count=len(files_res),
        tiragem=p.tiragem or 1000,
        custo_unitario_exemplar=p.custo_unitario_exemplar or 0.0,
        custo_total_orcado=p.custo_total_orcado or 0.0,
        custo_total_realizado=p.custo_total_realizado or 0.0,
        preco_capa_sugerido=p.preco_capa_sugerido or 0.0,
        created_at=p.created_at,
        edition=p.edition,
        volume=p.volume,
        barcode=p.barcode,
        synopsis=p.synopsis,
        estimated_pages=p.estimated_pages,
        estimated_cost=p.estimated_cost,
        margem_estimada_percentual=p.margem_estimada_percentual or 0.0,
        internal_notes=p.internal_notes,
        updated_at=p.updated_at,
        costs=costs_res,
        tasks=tasks_res,
        files=files_res,
        history=history_res
    )

@router.put("/projects/{project_id}", response_model=ProjectDetailResponse)
def update_project(
    company_id: int,
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Demanda editorial não encontrada")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(project, k, v)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return get_project_detail(company_id=company_id, project_id=project.id, db=db, current_user=current_user)

@router.put("/projects/{project_id}/move-stage", response_model=ProjectDetailResponse)
def move_project_stage(
    company_id: int,
    project_id: int,
    payload: ProjectMoveStagePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Demanda editorial não encontrada")

    target_stage = db.query(EditorialStage).filter(
        EditorialStage.id == payload.to_stage_id,
        EditorialStage.company_id == company_id
    ).first()
    if not target_stage:
        raise HTTPException(status_code=404, detail="Etapa de destino não encontrada")

    old_stage_id = project.stage_id
    project.stage_id = payload.to_stage_id
    project.stage_entered_at = datetime.utcnow()
    project.updated_at = datetime.utcnow()

    # Se a etapa for final, marca como CONCLUÍDO
    if target_stage.is_final:
        project.status = "COMPLETED"
        project.completed_at = datetime.utcnow()
    elif project.status == "COMPLETED":
        project.status = "ACTIVE"
        project.completed_at = None

    history = EditorialHistory(
        project_id=project.id,
        from_stage_id=old_stage_id,
        to_stage_id=target_stage.id,
        user_id=_get_user_attr(current_user, "id"),
        action="STAGE_CHANGED",
        notes=payload.notes or f"Movido para a etapa {target_stage.name}"
    )
    db.add(history)
    db.commit()
    db.refresh(project)

    return get_project_detail(company_id=company_id, project_id=project.id, db=db, current_user=current_user)

# ── Tarefas / Checklist ───────────────────────────────────────────────────────

@router.post("/projects/{project_id}/tasks", response_model=TaskResponse)
def add_task(
    company_id: int,
    project_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Demanda não encontrada")

    max_idx = db.query(func.max(EditorialTask.order_index)).filter(EditorialTask.project_id == project_id).scalar()
    order_idx = (max_idx + 1) if max_idx is not None else 0

    task = EditorialTask(
        project_id=project_id,
        stage_id=payload.stage_id or project.stage_id,
        title=payload.title,
        order_index=order_idx
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        stage_id=task.stage_id,
        title=task.title,
        is_completed=task.is_completed,
        completed_at=task.completed_at,
        completed_by_user_id=task.completed_by_user_id,
        completed_by_name=None,
        order_index=task.order_index,
        created_at=task.created_at
    )

@router.put("/tasks/{task_id}/toggle", response_model=TaskResponse)
def toggle_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    task = db.query(EditorialTask).join(EditorialProject).filter(
        EditorialTask.id == task_id,
        EditorialProject.company_id == company_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    task.is_completed = not task.is_completed
    if task.is_completed:
        task.completed_at = datetime.utcnow()
        task.completed_by_user_id = _get_user_attr(current_user, "id")
    else:
        task.completed_at = None
        task.completed_by_user_id = None

    db.commit()
    db.refresh(task)
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        stage_id=task.stage_id,
        title=task.title,
        is_completed=task.is_completed,
        completed_at=task.completed_at,
        completed_by_user_id=task.completed_by_user_id,
        completed_by_name=task.completed_by.name if task.completed_by else None,
        order_index=task.order_index,
        created_at=task.created_at
    )

@router.delete("/tasks/{task_id}")
def delete_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    task = db.query(EditorialTask).join(EditorialProject).filter(
        EditorialTask.id == task_id,
        EditorialProject.company_id == company_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    db.delete(task)
    db.commit()
    return {"ok": True}

# ── Upload de Arquivos & Provas Digitais ───────────────────────────────────────

@router.post("/projects/{project_id}/files", response_model=FileResponse)
async def upload_file(
    company_id: int,
    project_id: int,
    file: UploadFile = File(...),
    stage_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    validate_file_size_and_extension(file, category="generic", custom_max_size=15 * 1024 * 1024)

    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Demanda editorial não encontrada")

    # Diretório seguro: uploads/sellers/{company_id}/editorial/{project_id}/
    target_dir = UPLOAD_DIR / "sellers" / str(company_id) / "editorial" / str(project_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Nome limpo e sanitizado contra Path Traversal
    timestamp = int(datetime.utcnow().timestamp())
    safe_base = sanitize_filename(file.filename or "")
    clean_filename = f"{timestamp}_{safe_base}"
    file_path = target_dir / clean_filename

    # Salva arquivo de forma segura
    content = await read_file_safely(file, max_size_bytes=15 * 1024 * 1024)
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    file_size = len(content)
    relative_path = f"/uploads/sellers/{company_id}/editorial/{project_id}/{clean_filename}"

    doc = EditorialFile(
        project_id=project_id,
        stage_id=stage_id or project.stage_id,
        file_name=file.filename,
        file_path=relative_path,
        file_size=file_size,
        file_type=file.content_type,
        uploaded_by_user_id=_get_user_attr(current_user, "id")
    )
    db.add(doc)

    history = EditorialHistory(
        project_id=project_id,
        user_id=_get_user_attr(current_user, "id"),
        action="FILE_UPLOADED",
        notes=f"Arquivo anexado: {file.filename}"
    )
    db.add(history)
    db.commit()
    db.refresh(doc)

    return FileResponse(
        id=doc.id,
        project_id=doc.project_id,
        stage_id=doc.stage_id,
        file_name=doc.file_name,
        file_path=doc.file_path,
        file_size=doc.file_size,
        file_type=doc.file_type,
        uploaded_by_user_id=doc.uploaded_by_user_id,
        uploaded_by_name=_get_user_attr(current_user, "name"),
        created_at=doc.created_at
    )

@router.delete("/files/{file_id}")
def delete_file(
    company_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    doc = db.query(EditorialFile).join(EditorialProject).filter(
        EditorialFile.id == file_id,
        EditorialProject.company_id == company_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    # Remove do disco se existir
    try:
        disk_path = Path(".") / doc.file_path.lstrip("/")
        if disk_path.exists():
            disk_path.unlink()
    except Exception as e:
        logger.warning(f"Falha ao remover arquivo do disco: {e}")

    db.delete(doc)
    db.commit()
    return {"ok": True, "message": "Arquivo removido com sucesso"}


# ── Profissionais & Prestadores de Serviço ─────────────────────────────────────

@router.get("/professionals", response_model=List[ProfessionalResponse])
def list_professionals(
    company_id: int,
    specialty: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    q = db.query(EditorialProfessional).filter(
        EditorialProfessional.company_id == company_id,
        EditorialProfessional.is_active == True
    )
    if specialty:
        q = q.filter(EditorialProfessional.specialty == specialty)
    
    profs = q.order_by(EditorialProfessional.name).all()
    result = []
    for p in profs:
        p_count = db.query(func.count(func.distinct(EditorialProjectCost.project_id))).filter(EditorialProjectCost.professional_id == p.id).scalar() or 0
        total_paid = db.query(func.sum(EditorialProjectCost.actual_total)).filter(
            EditorialProjectCost.professional_id == p.id,
            EditorialProjectCost.payment_status == 'PAGO'
        ).scalar() or 0.0

        result.append(ProfessionalResponse(
            id=p.id,
            company_id=p.company_id,
            name=p.name,
            specialty=p.specialty,
            email=p.email,
            phone=p.phone,
            pix_key=p.pix_key,
            pix_type=p.pix_type,
            rate_type=p.rate_type,
            default_rate=p.default_rate,
            rating=p.rating,
            portfolio_url=p.portfolio_url,
            notes=p.notes,
            is_active=p.is_active,
            created_at=p.created_at,
            projects_count=p_count,
            total_paid=float(total_paid)
        ))
    return result

@router.post("/professionals", response_model=ProfessionalResponse)
def create_professional(
    company_id: int,
    payload: ProfessionalCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    prof = EditorialProfessional(
        company_id=company_id,
        name=payload.name,
        specialty=payload.specialty,
        email=payload.email,
        phone=payload.phone,
        pix_key=payload.pix_key,
        pix_type=payload.pix_type,
        rate_type=payload.rate_type,
        default_rate=payload.default_rate,
        rating=payload.rating,
        portfolio_url=payload.portfolio_url,
        notes=payload.notes,
        is_active=True
    )
    db.add(prof)
    db.commit()
    db.refresh(prof)
    return ProfessionalResponse(
        id=prof.id,
        company_id=prof.company_id,
        name=prof.name,
        specialty=prof.specialty,
        email=prof.email,
        phone=prof.phone,
        pix_key=prof.pix_key,
        pix_type=prof.pix_type,
        rate_type=prof.rate_type,
        default_rate=prof.default_rate,
        rating=prof.rating,
        portfolio_url=prof.portfolio_url,
        notes=prof.notes,
        is_active=prof.is_active,
        created_at=prof.created_at,
        projects_count=0,
        total_paid=0.0
    )

@router.put("/professionals/{prof_id}", response_model=ProfessionalResponse)
def update_professional(
    company_id: int,
    prof_id: int,
    payload: ProfessionalUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    prof = db.query(EditorialProfessional).filter(
        EditorialProfessional.id == prof_id,
        EditorialProfessional.company_id == company_id
    ).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Profissional não encontrado")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(prof, k, v)
    prof.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prof)

    p_count = db.query(func.count(func.distinct(EditorialProjectCost.project_id))).filter(EditorialProjectCost.professional_id == prof.id).scalar() or 0
    total_paid = db.query(func.sum(EditorialProjectCost.actual_total)).filter(
        EditorialProjectCost.professional_id == prof.id,
        EditorialProjectCost.payment_status == 'PAGO'
    ).scalar() or 0.0

    return ProfessionalResponse(
        id=prof.id,
        company_id=prof.company_id,
        name=prof.name,
        specialty=prof.specialty,
        email=prof.email,
        phone=prof.phone,
        pix_key=prof.pix_key,
        pix_type=prof.pix_type,
        rate_type=prof.rate_type,
        default_rate=prof.default_rate,
        rating=prof.rating,
        portfolio_url=prof.portfolio_url,
        notes=prof.notes,
        is_active=prof.is_active,
        created_at=prof.created_at,
        projects_count=p_count,
        total_paid=float(total_paid)
    )

@router.delete("/professionals/{prof_id}")
def delete_professional(
    company_id: int,
    prof_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    prof = db.query(EditorialProfessional).filter(
        EditorialProfessional.id == prof_id,
        EditorialProfessional.company_id == company_id
    ).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Profissional não encontrado")
    prof.is_active = False
    prof.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Profissional desativado"}


# ── Custos & Serviços por Demanda / Projeto ────────────────────────────────────

def _recalculate_project_costs(db: Session, project: EditorialProject):
    """Atualiza o custo total orçado, realizado e unitário do projeto."""
    costs = db.query(EditorialProjectCost).filter(EditorialProjectCost.project_id == project.id).all()
    total_orcado = sum(c.estimated_total for c in costs)
    total_realizado = sum(c.actual_total for c in costs if c.actual_total > 0)
    
    project.custo_total_orcado = total_orcado
    project.custo_total_realizado = total_realizado
    project.estimated_cost = total_orcado

    tiragem = max(1, project.tiragem or 1000)
    project.custo_unitario_exemplar = round(total_orcado / tiragem, 2)
    db.commit()

@router.post("/projects/{project_id}/costs", response_model=ProjectCostResponse)
def add_project_cost(
    company_id: int,
    project_id: int,
    payload: ProjectCostCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    est_total = round(payload.quantity * payload.unit_value, 2)
    cost = EditorialProjectCost(
        project_id=project_id,
        stage_id=payload.stage_id or project.stage_id,
        professional_id=payload.professional_id,
        service_type=payload.service_type,
        description=payload.description,
        unit_type=payload.unit_type,
        quantity=payload.quantity,
        unit_value=payload.unit_value,
        estimated_total=est_total,
        actual_total=est_total if payload.payment_status == 'PAGO' else 0.0,
        payment_status=payload.payment_status or "ORCADO",
        notes=payload.notes
    )
    db.add(cost)
    db.commit()
    db.refresh(cost)

    _recalculate_project_costs(db, project)

    return ProjectCostResponse(
        id=cost.id,
        project_id=cost.project_id,
        stage_id=cost.stage_id,
        stage_name=cost.stage.name if cost.stage else None,
        professional_id=cost.professional_id,
        professional_name=cost.professional.name if cost.professional else None,
        professional_pix=cost.professional.pix_key if cost.professional else None,
        service_type=cost.service_type,
        description=cost.description,
        unit_type=cost.unit_type,
        quantity=cost.quantity,
        unit_value=cost.unit_value,
        estimated_total=cost.estimated_total,
        actual_total=cost.actual_total,
        payment_status=cost.payment_status,
        paid_at=cost.paid_at,
        invoice_number=cost.invoice_number,
        notes=cost.notes,
        order_index=cost.order_index,
        created_at=cost.created_at
    )

@router.put("/costs/{cost_id}", response_model=ProjectCostResponse)
def update_project_cost(
    company_id: int,
    cost_id: int,
    payload: ProjectCostUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    cost = db.query(EditorialProjectCost).join(EditorialProject).filter(
        EditorialProjectCost.id == cost_id,
        EditorialProject.company_id == company_id
    ).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Item de custo não encontrado")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(cost, k, v)
    
    # Recalcula estimado se quantidade ou unit_value mudaram
    if payload.quantity is not None or payload.unit_value is not None:
        cost.estimated_total = round(cost.quantity * cost.unit_value, 2)
    
    if payload.payment_status == 'PAGO' and not cost.paid_at:
        cost.paid_at = datetime.utcnow()
        if cost.actual_total <= 0:
            cost.actual_total = cost.estimated_total

    cost.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cost)

    project = db.query(EditorialProject).filter(EditorialProject.id == cost.project_id).first()
    if project:
        _recalculate_project_costs(db, project)

    return ProjectCostResponse(
        id=cost.id,
        project_id=cost.project_id,
        stage_id=cost.stage_id,
        stage_name=cost.stage.name if cost.stage else None,
        professional_id=cost.professional_id,
        professional_name=cost.professional.name if cost.professional else None,
        professional_pix=cost.professional.pix_key if cost.professional else None,
        service_type=cost.service_type,
        description=cost.description,
        unit_type=cost.unit_type,
        quantity=cost.quantity,
        unit_value=cost.unit_value,
        estimated_total=cost.estimated_total,
        actual_total=cost.actual_total,
        payment_status=cost.payment_status,
        paid_at=cost.paid_at,
        invoice_number=cost.invoice_number,
        notes=cost.notes,
        order_index=cost.order_index,
        created_at=cost.created_at
    )

@router.delete("/costs/{cost_id}")
def delete_project_cost(
    company_id: int,
    cost_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    cost = db.query(EditorialProjectCost).join(EditorialProject).filter(
        EditorialProjectCost.id == cost_id,
        EditorialProject.company_id == company_id
    ).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Item de custo não encontrado")

    pid = cost.project_id
    db.delete(cost)
    db.commit()

    project = db.query(EditorialProject).filter(EditorialProject.id == pid).first()
    if project:
        _recalculate_project_costs(db, project)

    return {"ok": True, "message": "Item de custo removido"}


# ── Simulador Automático de Custos com Benchmarks de Mercado ──────────────────

@router.get("/costs/simulate")
def simulate_editorial_budget(
    company_id: int,
    pages: int = Query(200, ge=1, le=2000),
    tiragem: int = Query(1000, ge=50, le=100000),
    format_size: str = Query("14x21"),
    margin: float = Query(60.0, ge=10.0, le=90.0),
    current_user: dict = Depends(get_current_user)
):
    """Simula o orçamento completo de um livro físico com base nas métricas de mercado."""
    assert_company_ownership(current_user, company_id)
    return simular_orcamento_completo(
        paginas=pages,
        tiragem=tiragem,
        formato_livro=format_size,
        margem_desejada=margin
    )

@router.post("/projects/{project_id}/costs/apply-simulation")
def apply_simulation_to_project(
    company_id: int,
    project_id: int,
    pages: int = Query(..., ge=1),
    tiragem: int = Query(..., ge=50),
    margin: float = Query(60.0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Aplica o pacote de serviços simulados aos custos reais do projeto."""
    assert_company_ownership(current_user, company_id)
    project = db.query(EditorialProject).filter(
        EditorialProject.id == project_id,
        EditorialProject.company_id == company_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    sim = simular_orcamento_completo(paginas=pages, tiragem=tiragem, margem_desejada=margin)

    for item in sim["servicos_sugeridos"]:
        cost = EditorialProjectCost(
            project_id=project_id,
            stage_id=project.stage_id,
            service_type=item["service_type"],
            description=item["description"],
            unit_type=item["unit_type"],
            quantity=item["quantity"],
            unit_value=item["unit_value"],
            estimated_total=item["estimated_total"],
            actual_total=0.0,
            payment_status="ORCADO"
        )
        db.add(cost)

    project.tiragem = tiragem
    project.estimated_pages = pages
    project.preco_capa_sugerido = sim["resumo_financeiro"]["preco_capa_sugerido"]
    project.margem_estimada_percentual = margin
    db.commit()

    _recalculate_project_costs(db, project)

    return get_project_detail(company_id=company_id, project_id=project.id, db=db, current_user=current_user)


# ── Templates / Modelos Profissionais de Esteiras ──────────────────────────────

@router.get("/templates", response_model=List[PipelineTemplateResponse])
def list_pipeline_templates(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    templates = db.query(EditorialPipelineTemplate).order_by(EditorialPipelineTemplate.id).all()
    return [
        PipelineTemplateResponse(
            id=t.id,
            name=t.name,
            category=t.category,
            description=t.description,
            color=t.color,
            stages=t.stages_json if isinstance(t.stages_json, list) else [],
            default_services=t.default_services_json if isinstance(t.default_services_json, list) else []
        )
        for t in templates
    ]

@router.post("/templates/{template_id}/instantiate", response_model=PipelineResponse)
def instantiate_pipeline_template(
    company_id: int,
    template_id: int,
    name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Clona um modelo de esteira editorial profissional para a empresa."""
    assert_company_ownership(current_user, company_id)
    template = db.query(EditorialPipelineTemplate).filter(EditorialPipelineTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Modelo não encontrado")

    pipe_name = name or template.name
    pipeline = EditorialPipeline(
        company_id=company_id,
        name=pipe_name,
        description=template.description,
        color=template.color,
        is_default=False,
        is_active=True
    )
    db.add(pipeline)
    db.flush()

    stages_data = template.stages_json if isinstance(template.stages_json, list) else []
    for idx, st in enumerate(stages_data):
        stage = EditorialStage(
            company_id=company_id,
            pipeline_id=pipeline.id,
            name=st.get("name", f"Etapa {idx+1}"),
            color=st.get("color", "#3b82f6"),
            order_index=idx,
            sla_days=st.get("sla_days", 7),
            is_initial=st.get("is_initial", idx == 0),
            is_final=st.get("is_final", idx == len(stages_data) - 1)
        )
        db.add(stage)

    db.commit()
    db.refresh(pipeline)

    stages_res = [
        StageResponse(
            id=s.id,
            company_id=s.company_id,
            pipeline_id=s.pipeline_id,
            name=s.name,
            description=s.description,
            color=s.color,
            order_index=s.order_index,
            sla_days=s.sla_days,
            is_initial=s.is_initial,
            is_final=s.is_final,
            created_at=s.created_at,
            projects_count=0
        ) for s in pipeline.stages
    ]

    return PipelineResponse(
        id=pipeline.id,
        company_id=pipeline.company_id,
        name=pipeline.name,
        description=pipeline.description,
        color=pipeline.color,
        is_default=pipeline.is_default,
        is_active=pipeline.is_active,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
        stages=stages_res,
        projects_count=0
    )


# ── Relatórios Analíticos & Visões Gerenciais da Editora ────────────────────────

@router.get("/reports/executive")
def get_executive_editorial_report(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retorna consolidação gerencial de custos, SLAs, gargalos e capacidade produtiva."""
    assert_company_ownership(current_user, company_id)

    projects = db.query(EditorialProject).filter(EditorialProject.company_id == company_id).all()
    today = date.today()

    total_projects = len(projects)
    active_count = sum(1 for p in projects if p.status == 'ACTIVE')
    completed_count = sum(1 for p in projects if p.status == 'COMPLETED')
    overdue_count = sum(1 for p in projects if (p.due_date and p.due_date < today and p.status != 'COMPLETED'))

    # Custos e Tiragem
    total_orcado = sum(p.custo_total_orcado for p in projects)
    total_realizado = sum(p.custo_total_realizado for p in projects)
    total_tiragem = sum(p.tiragem for p in projects)
    custo_medio_por_livro = (total_orcado / total_projects) if total_projects > 0 else 0.0

    # Gargalos de Etapa (SLA médio e estouros)
    stages = db.query(EditorialStage).filter(EditorialStage.company_id == company_id).all()
    bottlenecks = []
    for s in stages:
        projs_in_stage = [p for p in projects if p.stage_id == s.id and p.status == 'ACTIVE']
        avg_days = 0
        overdue_in_stage = 0
        if projs_in_stage:
            days_list = [(datetime.utcnow() - p.stage_entered_at).days for p in projs_in_stage if p.stage_entered_at]
            avg_days = round(sum(days_list) / len(days_list), 1) if days_list else 0
            overdue_in_stage = sum(1 for d in days_list if s.sla_days > 0 and d > s.sla_days)

        bottlenecks.append({
            "stage_id": s.id,
            "stage_name": s.name,
            "stage_color": s.color,
            "sla_days": s.sla_days,
            "active_projects": len(projs_in_stage),
            "average_days_in_stage": avg_days,
            "overdue_projects_count": overdue_in_stage
        })

    # Ranking de Prestadores
    profs = db.query(EditorialProfessional).filter(EditorialProfessional.company_id == company_id, EditorialProfessional.is_active == True).all()
    profs_ranking = []
    for pr in profs:
        paid = db.query(func.sum(EditorialProjectCost.actual_total)).filter(
            EditorialProjectCost.professional_id == pr.id,
            EditorialProjectCost.payment_status == 'PAGO'
        ).scalar() or 0.0
        p_count = db.query(func.count(func.distinct(EditorialProjectCost.project_id))).filter(EditorialProjectCost.professional_id == pr.id).scalar() or 0
        profs_ranking.append({
            "id": pr.id,
            "name": pr.name,
            "specialty": pr.specialty,
            "rating": pr.rating,
            "projects_count": p_count,
            "total_paid": float(paid)
        })

    return {
        "kpis": {
            "total_projects": total_projects,
            "active_count": active_count,
            "completed_count": completed_count,
            "overdue_count": overdue_count,
            "total_orcado": round(total_orcado, 2),
            "total_realizado": round(total_realizado, 2),
            "total_tiragem": total_tiragem,
            "custo_medio_por_livro": round(custo_medio_por_livro, 2)
        },
        "bottlenecks": sorted(bottlenecks, key=lambda x: x["overdue_projects_count"], reverse=True),
        "professionals": sorted(profs_ranking, key=lambda x: x["total_paid"], reverse=True)
    }


# ── Download do Manual Editorial em PDF ────────────────────────────────────────

@router.get("/manual/download-pdf")
def download_editorial_manual_pdf(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Gera e faz streaming do manual prático e conceitual em PDF."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    comp_name = company.name if company else "Editora"

    pdf_bytes = bytes(gerar_manual_editorial_pdf(company_name=comp_name))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Manual_Editorial_Cronuz_{company_id}.pdf"
        }
    )


# ── Exportação de Relatórios (Excel & PDF) ─────────────────────────────────────

@router.get("/exports/services")
def export_editorial_services(
    company_id: int,
    project_id: Optional[int] = Query(None, description="ID do projeto específico, ou vazio para relatório geral"),
    format: str = Query("excel", pattern="^(excel|pdf)$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Exporta relatório de serviços e custos em formato Excel (.xlsx) ou PDF (.pdf)."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    comp_name = company.name if company else f"Empresa_{company_id}"

    query = db.query(EditorialProjectCost).join(
        EditorialProject, EditorialProjectCost.project_id == EditorialProject.id
    ).filter(
        EditorialProject.company_id == company_id
    )

    project_title = None
    if project_id and project_id > 0:
        proj = db.query(EditorialProject).filter(
            EditorialProject.id == project_id,
            EditorialProject.company_id == company_id
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        project_title = proj.title
        query = query.filter(EditorialProjectCost.project_id == project_id)

    costs = query.order_by(
        EditorialProject.id.asc(),
        EditorialProjectCost.order_index.asc(),
        EditorialProjectCost.id.asc()
    ).all()

    costs_data = []
    for c in costs:
        costs_data.append({
            "id": c.id,
            "project_title": c.project.title if c.project else "N/D",
            "service_type": c.service_type,
            "description": c.description,
            "professional_name": c.professional.name if c.professional else None,
            "professional_pix": c.professional.pix_key if c.professional else None,
            "stage_name": c.stage.name if c.stage else "Geral",
            "unit_type": c.unit_type,
            "quantity": c.quantity,
            "unit_value": c.unit_value,
            "estimated_total": c.estimated_total,
            "actual_total": c.actual_total,
            "payment_status": c.payment_status,
            "created_at_str": c.created_at.strftime("%d/%m/%Y") if c.created_at else "-",
            "paid_at_str": c.paid_at.strftime("%d/%m/%Y") if c.paid_at else "-",
            "invoice_number": c.invoice_number or "-"
        })

    safe_name = "".join(ch for ch in comp_name if ch.isalnum() or ch in ('_', '-'))
    scope_suffix = f"Projeto_{project_id}" if project_id else "Geral"

    if format == "excel":
        excel_buf = export_services_excel(costs_data, comp_name, project_title=project_title)
        filename = f"Relatorio_Servicos_{safe_name}_{scope_suffix}.xlsx"
        return Response(
            content=excel_buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        pdf_bytes = export_services_pdf(costs_data, comp_name, project_title=project_title)
        filename = f"Relatorio_Servicos_{safe_name}_{scope_suffix}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )


@router.get("/exports/movements")
def export_editorial_movements(
    company_id: int,
    project_id: Optional[int] = Query(None, description="ID do projeto específico, ou vazio para relatório geral"),
    format: str = Query("excel", pattern="^(excel|pdf)$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Exporta relatório de movimentações e timeline do projeto em formato Excel (.xlsx) ou PDF (.pdf)."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    comp_name = company.name if company else f"Empresa_{company_id}"

    query = db.query(EditorialHistory).join(
        EditorialProject, EditorialHistory.project_id == EditorialProject.id
    ).filter(
        EditorialProject.company_id == company_id
    )

    project_title = None
    if project_id and project_id > 0:
        proj = db.query(EditorialProject).filter(
            EditorialProject.id == project_id,
            EditorialProject.company_id == company_id
        ).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        project_title = proj.title
        query = query.filter(EditorialHistory.project_id == project_id)

    histories = query.order_by(EditorialHistory.created_at.desc()).all()

    movements_data = []
    for h in histories:
        movements_data.append({
            "project_id": h.project_id,
            "project_local_id": h.project.local_id if h.project else h.project_id,
            "project_title": h.project.title if h.project else "N/D",
            "from_stage_name": h.from_stage.name if h.from_stage else "Início do Fluxo",
            "to_stage_name": h.to_stage.name if h.to_stage else "Etapa Inicial",
            "action": h.action,
            "user_name": h.user.name if h.user else "Sistema",
            "notes": h.notes or "-",
            "created_at_str": h.created_at.strftime("%d/%m/%Y %H:%M") if h.created_at else "-"
        })

    safe_name = "".join(ch for ch in comp_name if ch.isalnum() or ch in ('_', '-'))
    scope_suffix = f"Projeto_{project_id}" if project_id else "Geral"

    if format == "excel":
        excel_buf = export_movements_excel(movements_data, comp_name, project_title=project_title)
        filename = f"Relatorio_Movimentacoes_{safe_name}_{scope_suffix}.xlsx"
        return Response(
            content=excel_buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        pdf_bytes = export_movements_pdf(movements_data, comp_name, project_title=project_title)
        filename = f"Relatorio_Movimentacoes_{safe_name}_{scope_suffix}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

