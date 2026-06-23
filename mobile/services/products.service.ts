import api from './api';

export interface Product {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  stock?: number;
  image_url?: string;
  brand?: string;
  unit?: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
}

export async function getProducts(params: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<ProductListResponse> {
  const { data } = await api.get<ProductListResponse>('/products', {
    params: {
      search: params.search,
      offset: ((params.page ?? 1) - 1) * (params.limit ?? 20),
      limit: params.limit ?? 20,
    },
  });
  return data;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    const { data } = await api.get<Product>(`/products/barcode/${barcode}`);
    return data;
  } catch {
    return null;
  }
}

export async function getProductById(id: number): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
}
