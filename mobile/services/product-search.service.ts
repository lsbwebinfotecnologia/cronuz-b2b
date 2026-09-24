import api from './api';

export interface HorusProduct {
  COD_ITEM: number;
  NOM_ITEM: string;
  COD_BARRA_ITEM?: string;
  COD_ISBN_ITEM?: string;
  NOM_EDITORA?: string;
  SELO?: string;
  GENERO_NIVEL_1?: string;
  GENERO_NIVEL_2?: string;
  VLR_CAPA?: string;
  SALDO_DISPONIVEL?: number;
  SITUACAO_ITEM?: string;
  SITUACAO_ITEM_DESC?: string;
  DESC_SINOPSE?: string;
  IMAGEM_ITEM?: string;
  TIPO?: string;
  STATUS_ITEM?: string;
  COVER_URL?: string | null;
}

export interface BranchStock {
  filial_nome: string;
  cod_empresa?: string;
  cod_filial?: string;
  saldo: number;
  situacao_item?: string;
  registros_retornados?: number;
  erro?: string;
}

export interface StockResponse {
  status: 'ok' | 'partial_error' | 'offline';
  cod_item: number;
  branches: BranchStock[];
  total_branches: number;
  branches_with_stock: number;
  error_message?: string;
}

export interface DistributorResult {
  slug: string;
  name: string;
  enabled: boolean;
  found: boolean;
  saldo: number;
  preco?: number;
  titulo?: string;
  error?: string;
}

export interface DistributorStockResponse {
  isbn: string;
  distributors: DistributorResult[];
  total_distributors: number;
}

export type SearchOptionType = 'BARRAS_ISBN' | 'NOME' | 'COD_ITEM';

export async function searchProduct(
  term: string,
  searchOption: SearchOptionType = 'BARRAS_ISBN',
  source: 'app' | 'physical_scanner' = 'app',
  offset = 0,
  limit = 10
): Promise<HorusProduct[]> {
  const { data } = await api.get<{ items: HorusProduct[]; total: number }>('/product-search/product', {
    params: {
      term: term.trim(),
      search_option: searchOption,
      source,
      offset,
      limit,
    },
  });
  return data.items || [];
}

export async function getProductStock(codItem: number): Promise<StockResponse> {
  const { data } = await api.get<StockResponse>('/product-search/stock', {
    params: { cod_item: codItem },
  });
  return data;
}

export async function getDistributorStock(isbn: string): Promise<DistributorStockResponse> {
  const { data } = await api.get<DistributorStockResponse>('/product-search/distributor-stock', {
    params: { isbn: isbn.trim() },
  });
  return data;
}
