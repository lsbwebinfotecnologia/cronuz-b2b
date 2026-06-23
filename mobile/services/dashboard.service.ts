import api from './api';

export interface DashboardKpis {
  total_orders: number;
  total_revenue: number;
  pending_orders: number;
  total_customers: number;
  orders_today: number;
  revenue_today: number;
  orders_month: number;
  revenue_month: number;
}

export interface RecentOrder {
  id: number;
  order_number?: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  recent_orders: RecentOrder[];
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await api.get<DashboardData>('/mobile/dashboard');
  return data;
}
