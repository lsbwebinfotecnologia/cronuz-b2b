import api from './api';

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Order {
  id: number;
  order_number?: string;
  customer_id: number;
  customer_name: string;
  status: string;
  total: number;
  items: OrderItem[];
  created_at: string;
  updated_at?: string;
  notes?: string;
  payment_condition?: string;
}

export interface OrderListResponse {
  items: Order[];
  total: number;
}

export interface CreateOrderPayload {
  customer_id: number;
  items: { product_id: number; quantity: number; unit_price: number }[];
  payment_condition?: string;
  notes?: string;
}

export async function getOrders(params: {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}): Promise<OrderListResponse> {
  const { data } = await api.get<OrderListResponse>('/orders', {
    params: {
      status: params.status,
      search: params.search,
      offset: ((params.page ?? 1) - 1) * (params.limit ?? 20),
      limit: params.limit ?? 20,
    },
  });
  return data;
}

export async function getOrderById(id: number): Promise<Order> {
  const { data } = await api.get<Order>(`/orders/${id}`);
  return data;
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const { data } = await api.post<Order>('/orders', payload);
  return data;
}
