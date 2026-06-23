/**
 * conference.service.ts
 * Serviço de Conferência de Expedição — integra com /logistics/* do backend.
 * Mesma lógica do portal web, adaptada para o app mobile.
 */

import api from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Branch {
  id: number;
  nome: string;   // campo do backend: SellerBranch.nome
  cod_empresa: string;
  cod_filial: string;
  active: boolean;
}

export interface ConferenceVolumeItem {
  id: number;
  volume_id: number;
  isbn: string;
  name: string;
  quantity: number;
}

export interface ConferenceVolume {
  id: number;
  conference_id: number;
  volume_number: number;
  barcode: string;
  weight: number | null;
  status: string; // 'OPEN' | 'CLOSED' | 'CANCELLED'
  items: ConferenceVolumeItem[];
}

export interface ConferenceSession {
  id: number;
  company_id: number;
  branch_id: number;
  cod_cli: string;
  cod_pedido_origem: string;
  status: string; // 'IN_PROGRESS' | 'COMPLETED'
  created_at: string;
  updated_at: string;
  volumes: ConferenceVolume[];
}

export interface HorusItem {
  ISBN: string;
  COD_ITEM: string;
  DESCRICAO: string;
  QTD_PEDIDA: number;
  QTD_ATENDIDA: number;
  [key: string]: any;
}

export interface HorusOrder {
  COD_PED_VENDA: string;
  COD_CLI: string;
  NOM_CLI?: string;
  STATUS_PEDIDO_VENDA?: string;
  [key: string]: any;
}

export interface SearchConferenceResult {
  session: ConferenceSession;
  horus_order: HorusOrder | null;
  horus_items: HorusItem[];
  message?: string;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/** Lista filiais disponíveis para conferência */
export async function getBranches(): Promise<Branch[]> {
  const res = await api.get('/logistics/branches');
  return res.data ?? [];
}

/** Busca pedido no Horus e cria/recupera sessão local */
export async function searchOrderForConference(
  branch_id: number,
  cod_cli: string,
  cod_pedido_origem: string,
  conference_id?: number
): Promise<SearchConferenceResult> {
  const res = await api.get('/logistics/orders/search', {
    params: { branch_id, cod_cli, cod_pedido_origem, conference_id },
  });
  return res.data;
}

/** Abre uma nova caixa/volume na sessão */
export async function openVolume(
  branch_id: number,
  cod_cli: string,
  cod_pedido_origem: string
): Promise<ConferenceVolume> {
  const res = await api.post('/logistics/orders/session/volume/open', {
    branch_id,
    cod_cli,
    cod_pedido_origem,
  });
  return res.data;
}

/** Bipa/registra um item na caixa ativa */
export async function submitItem(
  volume_id: number,
  payload: {
    isbn: string;
    name: string;
    quantity: number;
    cod_item: string;
    cod_ped_venda: string;
  }
): Promise<{ session: ConferenceSession; horus_response: any }> {
  const res = await api.post(
    '/logistics/orders/session/volume/item',
    payload,
    { params: { volume_id } }
  );
  return res.data;
}

/** Fecha a caixa com o peso (kg) */
export async function closeVolume(
  volume_id: number,
  weight: number
): Promise<{ status: string; message: string }> {
  const res = await api.post('/logistics/orders/session/volume/close', null, {
    params: { volume_id, weight },
  });
  return res.data;
}

/** Cancela um volume */
export async function cancelVolume(volume_id: number): Promise<void> {
  await api.post(`/logistics/orders/session/volume/${volume_id}/cancel`);
}

/** Finaliza a conferência — envia volumes ao Horus */
export async function finalizeConference(
  conference_id: number,
  cod_ped_venda: string
): Promise<{ status: string; message: string }> {
  const res = await api.post('/logistics/orders/session/finalize', null, {
    params: { conference_id, cod_ped_venda },
  });
  return res.data;
}

// ─── Listagem / Gestão ────────────────────────────────────────────────────────

export interface ConferenceSummary {
  id: number;
  branch_id: number;
  branch_name: string;
  cod_cli: string;
  cod_pedido_origem: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  total_volumes: number;
  total_items: number;
  created_at: string;
  updated_at: string;
}

/** Lista todas as conferências da empresa (com filtros opcionais) */
export async function getConferences(params?: {
  status?: string;
  branch_id?: number;
}): Promise<ConferenceSummary[]> {
  const res = await api.get('/logistics/orders/conferences', { params });
  return res.data ?? [];
}

/** Exclui uma conferência (apenas IN_PROGRESS) */
export async function deleteConference(
  conference_id: number
): Promise<{ status: string; message: string }> {
  const res = await api.delete(`/logistics/orders/conferences/${conference_id}`);
  return res.data;
}
