'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Coffee, 
  Users, 
  Plus, 
  Search, 
  Receipt, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2, 
  RefreshCw,
  UtensilsCrossed,
  ArrowRight,
  ArrowLeft,
  Trash2,
  DollarSign,
  ChevronRight,
  ShoppingBag,
  SlidersHorizontal,
  X,
  QrCode,
  Copy,
  ExternalLink,
  Printer,
  Globe,
  Calendar,
  AlertTriangle,
  Filter,
  ChefHat,
  Bell,
  Send
} from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface ModifierOption {
  id: number;
  name: string;
  additional_price: number;
}

interface ModifierGroup {
  id: number;
  name: string;
  min_selectable: number;
  max_selectable: number;
  options: ModifierOption[];
}

interface ProductItem {
  id?: number;
  source: string;
  barcode: string;
  sku?: string;
  title: string;
  price: number;
  stock: number;
  category?: string;
  requires_preparation: boolean;
  modifier_groups: ModifierGroup[];
}

interface OrderItem {
  id: number;
  tab_id?: number;
  product_id?: number;
  title: string;
  quantity: number;
  unit_price: number;
  modifiers_price: number;
  total_price: number;
  modifiers_json?: any[];
  notes?: string;
  category_name?: string;
  prep_sector?: 'BEVERAGE' | 'KITCHEN' | 'OTHER' | string;
  prep_status: string;
  kitchen_alert?: string;
  kitchen_alert_at?: string;
  kitchen_alert_acknowledged?: boolean;
  cancel_reason?: string;
}

interface TableData {
  id: number;
  number: string;
  table_token?: string;
  area: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'BLOCKED';
  active_tab_id?: number;
  active_tab_number?: string;
  active_tab_total?: number;
  has_kitchen_alert?: boolean;
  opened_at?: string;
}

interface TabData {
  id: number;
  tab_number: string;
  table_id?: number;
  table_number?: string;
  customer_name?: string;
  status: 'OPEN' | 'BILL_REQUESTED' | 'BILLED' | 'PAID' | 'CLOSED' | 'CANCELLED' | string;
  subtotal: number;
  discount: number;
  total_amount: number;
  opened_at: string;
  closed_at?: string;
  items: OrderItem[];
}

export default function CafeteriaTablesPage() {
  const [user, setUser] = useState<any>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [activeView, setActiveView] = useState<'tables' | 'tabs'>('tables');
  const [tables, setTables] = useState<TableData[]>([]);
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de Data e Status das Comandas
  const [tabDateFilter, setTabDateFilter] = useState<'today' | 'yesterday' | 'last7days' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [tabStatusFilter, setTabStatusFilter] = useState<'ALL' | 'OPEN' | 'BILL_REQUESTED' | 'BILLED' | 'CANCELLED'>('ALL');

  // Cancelamento de Comanda
  const [tabToCancel, setTabToCancel] = useState<TabData | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancelTab, setSubmittingCancelTab] = useState(false);

  // Modal / Drawer de Comanda Selecionada
  const [selectedTab, setSelectedTab] = useState<TabData | null>(null);
  const [loadingTabDetails, setLoadingTabDetails] = useState(false);

  // Modal de Abertura de Mesa/Comanda
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openTableId, setOpenTableId] = useState<number | null>(null);
  const [openTabNumber, setOpenTabNumber] = useState('');
  const [openCustomerName, setOpenCustomerName] = useState('');
  const [submittingOpen, setSubmittingOpen] = useState(false);

  // Modal de Criação de Mesa
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableArea, setNewTableArea] = useState('Salão Principal');
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [submittingTable, setSubmittingTable] = useState(false);

  // Modal de Exclusão de Mesa
  const [tableToDelete, setTableToDelete] = useState<TableData | null>(null);
  const [deletingTable, setDeletingTable] = useState(false);

  // Drawer de Adição de Itens (Busca Híbrida)
  const [showAddItemDrawer, setShowAddItemDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductItem[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Modal de Modificadores para Item Selecionado
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number>>({}); // groupId -> optionId
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');
  const [itemSendNow, setItemSendNow] = useState(true); // Enviar imediatamente para a fila ou salvar em DRAFT
  const [submittingItem, setSubmittingItem] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Modal de QR Code da Mesa
  const [qrModalTable, setQrModalTable] = useState<TableData | null>(null);
  const [menuToken, setMenuToken] = useState<string>('');
  const [regeneratingTableToken, setRegeneratingTableToken] = useState(false);

  // Modal Geral do Cardápio Digital Web & QR Codes
  const [showPublicMenuModal, setShowPublicMenuModal] = useState(false);
  const [selectedMenuTableId, setSelectedMenuTableId] = useState<number | 'general'>('general');
  const [regeneratingMenuToken, setRegeneratingMenuToken] = useState(false);

  // Resumo do movimento do dia/período
  const tabStats = useMemo(() => {
    let totalCount = tabs.length;
    let openCount = 0;
    let billRequestedCount = 0;
    let billedCount = 0;
    let cancelledCount = 0;
    let totalRevenue = 0;

    tabs.forEach(t => {
      const s = String(t.status || '').toUpperCase();
      if (s === 'OPEN') openCount++;
      else if (s === 'BILL_REQUESTED') billRequestedCount++;
      else if (s === 'BILLED' || s === 'PAID' || s === 'CLOSED') {
        billedCount++;
        totalRevenue += Number(t.total_amount || 0);
      } else if (s === 'CANCELLED') cancelledCount++;
    });

    return { totalCount, openCount, billRequestedCount, billedCount, cancelledCount, totalRevenue };
  }, [tabs]);

  // Inicializa usuário
  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser?.company_id) {
      setCompanyId(currentUser.company_id);
    }

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('cardapio') === '1' || urlParams.get('openMenu') === 'true') {
        setShowPublicMenuModal(true);
      }
    }
  }, []);

  // Fecha modais e gavetas ao pressionar ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tableToDelete) {
          setTableToDelete(null);
        } else if (tabToCancel) {
          setTabToCancel(null);
        } else if (showPublicMenuModal) {
          setShowPublicMenuModal(false);
        } else if (qrModalTable) {
          setQrModalTable(null);
        } else if (selectedProduct) {
          setSelectedProduct(null);
        } else if (showAddItemDrawer) {
          setShowAddItemDrawer(false);
        } else if (showOpenModal) {
          setShowOpenModal(false);
        } else if (showCreateTableModal) {
          setShowCreateTableModal(false);
        } else if (selectedTab) {
          setSelectedTab(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tableToDelete, tabToCancel, showPublicMenuModal, qrModalTable, selectedProduct, showAddItemDrawer, showOpenModal, showCreateTableModal, selectedTab]);

  const fetchTablesAndTabs = useCallback(async () => {
    if (!companyId) return;
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const queryParams = new URLSearchParams();
      if (tabStatusFilter !== 'ALL') {
        queryParams.set('status', tabStatusFilter);
      } else {
        queryParams.set('status', 'ALL');
      }

      if (tabDateFilter === 'custom' && customDate) {
        queryParams.set('date', customDate);
      } else if (tabDateFilter !== 'all') {
        queryParams.set('date', tabDateFilter);
      }

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

      const [tablesRes, tabsRes, tokenRes] = await Promise.all([
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/tables`, { headers }),
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs${queryString}`, { headers }),
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/menu-token`, { headers })
      ]);

      if (tablesRes.ok) {
        setTables(await tablesRes.json());
      }
      if (tabsRes.ok) {
        setTabs(await tabsRes.json());
      }
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setMenuToken(tokenData.menu_token || '');
      }
    } catch (e) {
      toast.error('Erro ao atualizar salão e comandas');
    } finally {
      setLoading(false);
    }
  }, [companyId, tabStatusFilter, tabDateFilter, customDate]);

  const handleConfirmCancelTab = async () => {
    if (!companyId || !tabToCancel) return;
    try {
      setSubmittingCancelTab(true);
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      let res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs/${tabToCancel.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined })
      });

      // Fallback de segurança para retrocompatibilidade
      if (res.status === 404) {
        res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs/${tabToCancel.id}/status?status=CANCELLED`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      if (res.ok) {
        toast.success(`Comanda #${tabToCancel.tab_number} cancelada com sucesso!`);
        if (selectedTab?.id === tabToCancel.id) {
          setSelectedTab(null);
        }
        setTabToCancel(null);
        setCancelReason('');
        await fetchTablesAndTabs();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao cancelar comanda');
      }
    } catch {
      toast.error('Falha de conexão ao cancelar comanda');
    } finally {
      setSubmittingCancelTab(false);
    }
  };

  const handleRegenerateTableToken = async (tableId: number) => {
    if (!companyId) return;
    if (!confirm('Deseja realmente gerar um novo token e QR Code para esta mesa? O QR Code antigo impresso na mesa física deixará de funcionar.')) {
      return;
    }
    try {
      setRegeneratingTableToken(true);
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tables/${tableId}/regenerate-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const updatedTable = await res.json();
        setTables(prev => prev.map(t => t.id === updatedTable.id ? updatedTable : t));
        setQrModalTable(updatedTable);
        toast.success('Novo QR Code e token gerados para a mesa!');
      } else {
        toast.error('Erro ao regenerar token da mesa');
      }
    } catch {
      toast.error('Falha de conexão ao regenerar token da mesa');
    } finally {
      setRegeneratingTableToken(false);
    }
  };

  const handleRegenerateMenuToken = async () => {
    if (!companyId) return;
    if (!confirm('Deseja realmente gerar um novo token para o cardápio público? Todos os links e QR Codes gerais anteriores deixarão de funcionar imediatamente.')) {
      return;
    }
    try {
      setRegeneratingMenuToken(true);
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/regenerate-menu-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMenuToken(data.menu_token);
        toast.success('Novo token seguro do cardápio gerado com sucesso!');
      } else {
        toast.error('Erro ao regenerar token do cardápio');
      }
    } catch {
      toast.error('Falha de conexão ao regenerar token');
    } finally {
      setRegeneratingMenuToken(false);
    }
  };

  const handlePrintQrDisplay = (title: string, subtitle: string, qrImageUrl: string, pageUrl: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Permita pop-ups no navegador para imprimir o display');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Imprimir QR Code - ${title}</title>
          <style>
            @page { size: A5 portrait; margin: 12mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              margin: 0;
              padding: 20px;
              color: #1e293b;
              background: #fff;
            }
            .card {
              border: 2px dashed #d97706;
              border-radius: 28px;
              padding: 32px 24px;
              max-width: 360px;
              margin: 0 auto;
              box-sizing: border-box;
            }
            .badge {
              display: inline-block;
              background: #fef3c7;
              color: #92400e;
              font-weight: 800;
              font-size: 13px;
              padding: 6px 16px;
              border-radius: 999px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            h1 {
              font-size: 26px;
              font-weight: 900;
              margin: 16px 0 4px;
              color: #0f172a;
            }
            p.sub {
              font-size: 13px;
              color: #64748b;
              margin: 0 0 24px;
            }
            .qr-wrapper {
              background: #fff;
              padding: 12px;
              border-radius: 16px;
              display: inline-block;
              box-shadow: 0 4px 12px rgba(0,0,0,0.06);
              border: 1px solid #e2e8f0;
            }
            img.qr {
              width: 220px;
              height: 220px;
              display: block;
              margin: 0 auto;
              border-radius: 8px;
            }
            p.instruction {
              font-size: 13px;
              color: #334155;
              font-weight: 700;
              margin: 20px 0 6px;
              line-height: 1.4;
            }
            p.url {
              font-size: 11px;
              color: #94a3b8;
              word-break: break-all;
              margin: 0;
            }
            p.footer {
              font-size: 10px;
              color: #cbd5e1;
              margin-top: 24px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">☕ Cardápio Digital</span>
            <h1>${title}</h1>
            <p class="sub">${subtitle}</p>
            <div class="qr-wrapper">
              <img class="qr" src="${qrImageUrl}" alt="QR Code" />
            </div>
            <p class="instruction">Aponte a câmera do celular para ver o cardápio, fotos e pedir</p>
            <p class="url">${pageUrl}</p>
            <p class="footer">Cronuz B2B • Cardápio Digital Inteligente</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  useEffect(() => {
    if (companyId) {
      fetchTablesAndTabs();
    }
  }, [companyId, fetchTablesAndTabs]);

  // Carrega detalhes completos da comanda
  const openTabDetails = async (tabId: number) => {
    if (!companyId) return;
    setLoadingTabDetails(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tabs/${tabId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setSelectedTab(await res.json());
      }
    } catch {
      toast.error('Erro ao carregar detalhes da comanda');
    } finally {
      setLoadingTabDetails(false);
    }
  };

  // Criação de Nova Mesa
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !newTableNumber.trim()) return;
    setSubmittingTable(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          number: newTableNumber.trim(),
          area: newTableArea.trim(),
          capacity: newTableCapacity
        })
      });
      if (res.ok) {
        toast.success(`Mesa ${newTableNumber} cadastrada!`);
        setShowCreateTableModal(false);
        setNewTableNumber('');
        fetchTablesAndTabs();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao cadastrar mesa');
      }
    } catch {
      toast.error('Erro de conexão ao salvar mesa');
    } finally {
      setSubmittingTable(false);
    }
  };

  // Exclusão de Mesa
  const handleDeleteTable = async () => {
    if (!companyId || !tableToDelete) return;
    setDeletingTable(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tables/${tableToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success(`Mesa ${tableToDelete.number} excluída com sucesso!`);
        setTableToDelete(null);
        await fetchTablesAndTabs();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao excluir mesa');
      }
    } catch {
      toast.error('Falha de conexão ao excluir mesa');
    } finally {
      setDeletingTable(false);
    }
  };

  // Abertura de Comanda / Mesa
  const handleOpenTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !openTabNumber.trim()) return;
    setSubmittingOpen(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          table_id: openTableId,
          tab_number: openTabNumber.trim(),
          customer_name: openCustomerName.trim() || undefined
        })
      });
      if (res.ok) {
        const createdTab = await res.json();
        toast.success(`Comanda #${createdTab.tab_number} aberta!`);
        setShowOpenModal(false);
        setOpenTabNumber('');
        setOpenCustomerName('');
        setOpenTableId(null);
        await fetchTablesAndTabs();
        openTabDetails(createdTab.id);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao abrir comanda');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSubmittingOpen(false);
    }
  };

  // Busca Híbrida de Produtos
  const handleSearchProducts = async (term: string) => {
    setSearchQuery(term);
    if (!companyId) return;
    setSearchingProducts(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/products/search?q=${encodeURIComponent(term)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setSearchResults(await res.json());
      }
    } catch {
      toast.error('Erro ao buscar produtos');
    } finally {
      setSearchingProducts(false);
    }
  };

  // Abre modal de modificadores para o produto escolhido
  const handleSelectProduct = (prod: ProductItem) => {
    setSelectedProduct(prod);
    setSelectedModifiers({});
    setItemQuantity(1);
    setItemNotes('');
    setItemSendNow(true);
  };

  // Adiciona item na comanda com modificadores
  const handleConfirmAddItem = async () => {
    if (!companyId || !selectedTab || !selectedProduct) return;
    setSubmittingItem(true);
    try {
      const token = getToken();

      // Monta lista de modificadores selecionados
      const modList: any[] = [];
      for (const grp of selectedProduct.modifier_groups || []) {
        const chosenOptId = selectedModifiers[grp.id];
        if (chosenOptId) {
          const opt = grp.options.find(o => o.id === chosenOptId);
          if (opt) {
            modList.push({
              group_id: grp.id,
              group_name: grp.name,
              option_id: opt.id,
              option_name: opt.name,
              price: opt.additional_price
            });
          }
        }
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            product_id: selectedProduct.id,
            barcode: selectedProduct.barcode,
            sku: selectedProduct.sku,
            title: selectedProduct.title,
            quantity: itemQuantity,
            unit_price: selectedProduct.price,
            source: selectedProduct.source,
            category_name: selectedProduct.category,
            send_now: itemSendNow,
            selected_modifiers: modList,
            notes: itemNotes.trim() || undefined,
            requires_preparation: selectedProduct.requires_preparation
          })
        }
      );

      if (res.ok) {
        toast.success(itemSendNow ? 'Item adicionado e enviado para a produção!' : 'Item salvo em rascunho na mesa!');
        setSelectedProduct(null);
        setShowAddItemDrawer(false);
        setItemSendNow(true);
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao adicionar item');
      }
    } catch {
      toast.error('Erro de conexão ao adicionar item');
    } finally {
      setSubmittingItem(false);
    }
  };

  // Disparar item avulso que está em DRAFT
  const handleDispatchItem = async (itemId: number) => {
    if (!companyId || !selectedTab) return;
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/items/${itemId}/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Item disparado para a produção!');
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      } else {
        toast.error('Erro ao disparar item');
      }
    } catch {
      toast.error('Erro de conexão ao disparar item');
    }
  };

  // Disparar setor (Bebidas, Cozinha ou Tudo)
  const handleDispatchSector = async (sector: 'ALL' | 'BEVERAGE' | 'KITCHEN' | 'OTHER') => {
    if (!companyId || !selectedTab) return;
    setDispatching(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sector })
      });
      if (res.ok) {
        const data = await res.json();
        const sectorLabel = sector === 'BEVERAGE' ? 'Bebidas' : sector === 'KITCHEN' ? 'Cozinha' : 'Itens';
        toast.success(`${data.dispatched_count || ''} ${sectorLabel} disparados para a fila de produção!`);
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      } else {
        toast.error('Erro ao disparar setor');
      }
    } catch {
      toast.error('Erro de conexão ao disparar itens');
    } finally {
      setDispatching(false);
    }
  };

  // Confirmar ciência no alerta da cozinha
  const handleAcknowledgeAlert = async (itemId: number) => {
    if (!companyId || !selectedTab) return;
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/items/${itemId}/acknowledge-alert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Ciência confirmada! Alerta marcado como lido.');
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      }
    } catch {
      toast.error('Erro ao confirmar ciência');
    }
  };

  // Cancelar item com justificativa
  const handleCancelItem = async (itemId: number) => {
    const reason = window.prompt('Informe o motivo do cancelamento do item:', 'Cancelado pelo cliente');
    if (!reason || !companyId || !selectedTab) return;

    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/items/${itemId}?reason=${encodeURIComponent(reason)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        toast.success('Item cancelado com sucesso!');
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao cancelar item');
      }
    } catch {
      toast.error('Erro de conexão ao cancelar item');
    }
  };

  // Solicitar Fechamento da Conta
  const handleRequestBill = async () => {
    if (!companyId || !selectedTab) return;
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/status?status=BILL_REQUESTED`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        toast.success('Conta solicitada! Comanda enviada para recebimento no Caixa PDV.');
        openTabDetails(selectedTab.id);
        fetchTablesAndTabs();
      }
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const getTableStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Livre</span>;
      case 'OCCUPIED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">Ocupada</span>;
      case 'BILL_REQUESTED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-sky-500/10 text-sky-600 border border-sky-500/20 animate-pulse">Conta Solicitada</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-500">Bloqueada</span>;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header com Navegação Mobile First */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600">
              <Coffee className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Cafeteria & Bistrô
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Gestão ágil de salão, mesas, comandas avulsas e atendimento express
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchTablesAndTabs()}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            title="Atualizar Salão"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Botão de Destaque: Cardápio Web & QR Code */}
          <button
            onClick={() => setShowPublicMenuModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95"
            title="Abrir painel do Cardápio Digital Web e gerar QR Codes"
          >
            <QrCode className="h-4 w-4" />
            <span>Cardápio Web & QR Code</span>
          </button>

          <button
            onClick={() => setShowCreateTableModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nova Mesa
          </button>
          <button
            onClick={() => {
              setOpenTableId(null);
              setOpenTabNumber(`BALCAO-${Date.now().toString().slice(-4)}`);
              setShowOpenModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Abrir Comanda
          </button>
        </div>
      </div>

      {/* Abas: Mesas vs Comandas Avulsas */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveView('tables')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
            activeView === 'tables'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UtensilsCrossed className="h-4 w-4" />
          Salão e Mesas ({tables.length})
        </button>
        <button
          onClick={() => setActiveView('tabs')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
            activeView === 'tabs'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Comandas & Movimento ({tabs.length})
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mb-3 text-amber-500" />
          <p className="text-sm font-medium">Carregando mapa de salão...</p>
        </div>
      ) : activeView === 'tables' ? (
        /* Grid de Mesas Mobile First */
        tables.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <UtensilsCrossed className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Nenhuma mesa cadastrada</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Cadastre as mesas físicas do seu salão, varanda ou balcão para iniciar o atendimento.
            </p>
            <button
              onClick={() => setShowCreateTableModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
            >
              Cadastrar Primeira Mesa
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {tables.map((table) => {
              const isOccupied = table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED';
              return (
                <div
                  key={table.id}
                  onClick={() => {
                    if (table.active_tab_id) {
                      openTabDetails(table.active_tab_id);
                    } else {
                      setOpenTableId(table.id);
                      setOpenTabNumber(`MESA-${table.number}`);
                      setShowOpenModal(true);
                    }
                  }}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                    table.status === 'AVAILABLE'
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:shadow-md'
                      : table.status === 'BILL_REQUESTED'
                      ? 'bg-sky-500/5 border-sky-500/30 hover:border-sky-500 shadow-sm'
                      : 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold">{table.area}</span>
                      <h4 className="text-lg font-black text-slate-800 dark:text-white">
                        Mesa {table.number}
                      </h4>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getTableStatusBadge(table.status)}
                      {table.has_kitchen_alert && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse shadow-sm shadow-rose-500/30">
                          <Bell className="w-3 h-3" />
                          Aviso Cozinha
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span>{table.capacity}p</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQrModalTable(table);
                        }}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500 transition"
                        title="Ver QR Code Seguro da Mesa"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTableToDelete(table);
                        }}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 transition"
                        title="Excluir Mesa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {isOccupied && table.active_tab_total !== undefined ? (
                      <span className="font-extrabold text-amber-600 dark:text-amber-400 text-sm">
                        R$ {Number(table.active_tab_total).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Disponível</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Lista de Comandas & Movimento do Dia / Período */
        <div className="space-y-5">
          {/* Barra de Filtros por Data e Status */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filtro de Período / Data */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  Período:
                </span>
                <button
                  type="button"
                  onClick={() => setTabDateFilter('today')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    tabDateFilter === 'today'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setTabDateFilter('yesterday')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    tabDateFilter === 'yesterday'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Ontem
                </button>
                <button
                  type="button"
                  onClick={() => setTabDateFilter('last7days')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    tabDateFilter === 'last7days'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Últimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => setTabDateFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    tabDateFilter === 'all'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  Todas as Datas
                </button>
              </div>

              {/* Data personalizada */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    if (e.target.value) setTabDateFilter('custom');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {customDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomDate('');
                      setTabDateFilter('today');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 p-1"
                    title="Limpar data"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filtro de Status das Comandas */}
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5 text-amber-500" />
                Status:
              </span>
              <button
                type="button"
                onClick={() => setTabStatusFilter('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  tabStatusFilter === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todas ({tabStats.totalCount})
              </button>
              <button
                type="button"
                onClick={() => setTabStatusFilter('OPEN')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  tabStatusFilter === 'OPEN'
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-500 hover:text-amber-600'
                }`}
              >
                Abertas ({tabStats.openCount})
              </button>
              <button
                type="button"
                onClick={() => setTabStatusFilter('BILL_REQUESTED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  tabStatusFilter === 'BILL_REQUESTED'
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-500 hover:text-sky-600'
                }`}
              >
                Aguardando Conta ({tabStats.billRequestedCount})
              </button>
              <button
                type="button"
                onClick={() => setTabStatusFilter('BILLED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  tabStatusFilter === 'BILLED'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-500 hover:text-emerald-600'
                }`}
              >
                Faturadas / Pagas ({tabStats.billedCount})
              </button>
              <button
                type="button"
                onClick={() => setTabStatusFilter('CANCELLED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  tabStatusFilter === 'CANCELLED'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-500 hover:text-rose-600'
                }`}
              >
                Canceladas ({tabStats.cancelledCount})
              </button>
            </div>
          </div>

          {/* Cards de Resumo do Movimento */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-400">Total Comandas</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{tabStats.totalCount}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40">
              <span className="text-[11px] font-bold text-amber-600">Abertas / Ativas</span>
              <p className="text-xl font-black text-amber-600 mt-0.5">{tabStats.openCount + tabStats.billRequestedCount}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/40">
              <span className="text-[11px] font-bold text-emerald-600">Faturadas / Pagas</span>
              <p className="text-xl font-black text-emerald-600 mt-0.5">{tabStats.billedCount}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/40">
              <span className="text-[11px] font-bold text-rose-600">Canceladas</span>
              <p className="text-xl font-black text-rose-600 mt-0.5">{tabStats.cancelledCount}</p>
            </div>
            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/30">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Faturamento do Período</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                R$ {tabStats.totalRevenue.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Listagem de Comandas */}
          {tabs.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Nenhuma comanda encontrada</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Nenhuma comanda atende aos filtros de data ou status selecionados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {tabs.map((tab) => {
                const s = String(tab.status || '').toUpperCase();
                const isCancelled = s === 'CANCELLED';
                const isBilled = s === 'BILLED' || s === 'PAID' || s === 'CLOSED';
                const isBillReq = s === 'BILL_REQUESTED';
                const isOpen = s === 'OPEN';

                return (
                  <div
                    key={tab.id}
                    onClick={() => openTabDetails(tab.id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isCancelled
                        ? 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/40 opacity-75'
                        : isBilled
                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40'
                        : isBillReq
                        ? 'bg-sky-50/30 dark:bg-sky-950/10 border-sky-300 dark:border-sky-800'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-md">
                          Comanda #{tab.tab_number}
                        </span>
                        {isCancelled ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                            Cancelada
                          </span>
                        ) : isBilled ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            Faturada / Encerrada
                          </span>
                        ) : isBillReq ? (
                          <span className="text-[10px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 rounded-full">
                            Aguardando Conta
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                            Aberta
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-bold text-slate-800 dark:text-white">
                        {tab.table_number ? `Mesa ${tab.table_number}` : 'Balcão / Express'}
                      </h4>
                      {tab.customer_name && (
                        <p className="text-xs text-slate-500 mt-0.5">Cliente: {tab.customer_name}</p>
                      )}
                      {tab.opened_at && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Aberta em {new Date(tab.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(tab.opened_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {tab.items?.length || 0} {tab.items?.length === 1 ? 'item' : 'itens'}
                        </span>
                        {(isOpen || isBillReq) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTabToCancel(tab);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                            title="Cancelar Comanda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        R$ {Number(tab.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL / DRAWER DE COMANDA SELECIONADA ───────────────────────── */}
      {selectedTab && (
        <div
          onClick={() => setSelectedTab(null)}
          className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 dark:border-slate-800"
          >
            {/* Header da Comanda */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Comanda #{selectedTab.tab_number}
                  </h3>
                  {selectedTab.table_number && (
                    <span className="text-xs px-2 py-0.5 font-bold rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Mesa {selectedTab.table_number}
                    </span>
                  )}
                </div>
                {selectedTab.customer_name && (
                  <p className="text-xs text-slate-500">Cliente: {selectedTab.customer_name}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedTab(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Fechar Comanda (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lista de Itens da Comanda */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {loadingTabDetails ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                  <p className="text-xs">Atualizando itens...</p>
                </div>
              ) : selectedTab.items?.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <ShoppingBag className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold">Nenhum item lançado ainda</p>
                  <p className="text-[11px] text-slate-400 mt-1">Clique em "Adicionar Itens" abaixo para lançar cafés, lanches e bebidas.</p>
                </div>
              ) : (
                <>
                  {/* Painel de Disparo de Itens em Rascunho (Sob Demanda) */}
                  {(() => {
                    const draftItems = (selectedTab.items || []).filter(it => it.prep_status === 'DRAFT');
                    const draftBeverages = draftItems.filter(it => it.prep_sector === 'BEVERAGE');
                    const draftKitchen = draftItems.filter(it => it.prep_sector === 'KITCHEN');

                    if (draftItems.length === 0) return null;

                    return (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
                          <span className="flex items-center gap-1.5">
                            <Send className="w-4 h-4 text-amber-600" />
                            {draftItems.length} {draftItems.length === 1 ? 'item em rascunho na mesa' : 'itens em rascunho na mesa'}
                          </span>
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            Disparar para preparo:
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {draftBeverages.length > 0 && (
                            <button
                              type="button"
                              disabled={dispatching}
                              onClick={() => handleDispatchSector('BEVERAGE')}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <Coffee className="w-3.5 h-3.5" />
                              Enviar Bebidas ({draftBeverages.length})
                            </button>
                          )}
                          {draftKitchen.length > 0 && (
                            <button
                              type="button"
                              disabled={dispatching}
                              onClick={() => handleDispatchSector('KITCHEN')}
                              className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <ChefHat className="w-3.5 h-3.5" />
                              Enviar Cozinha ({draftKitchen.length})
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={dispatching}
                            onClick={() => handleDispatchSector('ALL')}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Enviar Tudo ({draftItems.length})
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {selectedTab.items.map((item) => {
                    const isCancelled = item.prep_status === 'CANCELLED';
                    const isDraft = item.prep_status === 'DRAFT';

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isCancelled
                            ? 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/30 opacity-70'
                            : isDraft
                            ? 'bg-amber-500/10 border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/40'
                            : item.kitchen_alert && !item.kitchen_alert_acknowledged
                            ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-extrabold ${isCancelled ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {Number(item.quantity)}x
                              </span>
                              <h5 className={`text-sm font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-slate-800 dark:text-white'}`}>
                                {item.title}
                              </h5>
                              {/* Badge do Setor */}
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md flex items-center gap-1 ${
                                item.prep_sector === 'KITCHEN'
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
                                  : item.prep_sector === 'OTHER'
                                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              }`}>
                                {item.prep_sector === 'KITCHEN' ? <ChefHat className="w-3 h-3" /> : item.prep_sector === 'OTHER' ? <UtensilsCrossed className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
                                {item.category_name || (item.prep_sector === 'KITCHEN' ? 'Cozinha' : item.prep_sector === 'OTHER' ? 'Balcão' : 'Bebida')}
                              </span>
                            </div>

                            {/* Modificadores */}
                            {item.modifiers_json && item.modifiers_json.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {item.modifiers_json.map((mod: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20"
                                  >
                                    + {mod.option_name} {mod.price > 0 ? `(+R$ ${Number(mod.price).toFixed(2)})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Observações */}
                            {item.notes && (
                              <p className="text-[11px] text-slate-500 italic mt-1">Obs: {item.notes}</p>
                            )}

                            {/* Status de Preparo e Ações Avulsas */}
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                              {isCancelled ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                  ❌ Cancelado {item.cancel_reason ? `(${item.cancel_reason})` : ''}
                                </span>
                              ) : isDraft ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    ⏳ Rascunho na Mesa
                                  </span>
                                  <button
                                    type="button"
                                    disabled={dispatching}
                                    onClick={() => handleDispatchItem(item.id)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                    title="Disparar este item para a fila do KDS agora"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Enviar para Fila KDS
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    item.prep_status === 'READY'
                                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 font-black'
                                      : item.prep_status === 'PREPARING'
                                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 animate-pulse font-bold'
                                      : item.prep_status === 'DELIVERED'
                                      ? 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 font-bold'
                                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 font-bold'
                                  }`}>
                                    {item.prep_status === 'READY'
                                      ? '🔔 Pronto para Servir'
                                      : item.prep_status === 'PREPARING'
                                      ? '👨‍🍳 Em Preparo'
                                      : item.prep_status === 'DELIVERED'
                                      ? '✔ Entregue'
                                      : '☕ Na Fila de Produção'}
                                  </span>
                                  {item.prep_status === 'DELIVERED' && (
                                    <button
                                      type="button"
                                      disabled={dispatching}
                                      onClick={() => handleDispatchItem(item.id)}
                                      className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold transition flex items-center gap-1"
                                      title="Enviar este item para a fila de preparo do KDS"
                                    >
                                      <Send className="w-2.5 h-2.5 text-amber-600" />
                                      Enviar ao KDS
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Alerta da Cozinha/Barista para o Garçom */}
                            {item.kitchen_alert && (
                              <div className="mt-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400">
                                  <span className="flex items-center gap-1">
                                    <Bell className="w-3.5 h-3.5 animate-bounce text-rose-600" />
                                    Aviso da Copa/Cozinha:
                                  </span>
                                  {item.kitchen_alert_acknowledged ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✔ Ciente</span>
                                  ) : (
                                    <span className="text-rose-600 font-bold">Ação necessária</span>
                                  )}
                                </div>
                                <p className="text-xs text-rose-900 dark:text-rose-200 font-medium italic">
                                  "{item.kitchen_alert}"
                                </p>
                                {!item.kitchen_alert_acknowledged && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAcknowledgeAlert(item.id)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-xs"
                                    >
                                      ✔ Dar Ciência
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelItem(item.id)}
                                      className="px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-[11px] font-bold transition"
                                    >
                                      Cancelar / Trocar Item
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="text-right flex flex-col justify-between items-end h-full">
                            <span className={`text-sm font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                              R$ {isCancelled ? '0.00' : Number(item.total_price).toFixed(2)}
                            </span>
                            {!isCancelled && (
                              <button
                                onClick={() => handleCancelItem(item.id)}
                                className="mt-2 text-rose-500 hover:text-rose-700 p-1 transition-colors"
                                title="Cancelar Item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Rodapé com Totais e Ações */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  R$ {Number(selectedTab.subtotal || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-base border-t border-slate-200 dark:border-slate-800 pt-2">
                <span className="font-bold text-slate-900 dark:text-white">Total da Comanda</span>
                <span className="text-xl font-black text-amber-600 dark:text-amber-400">
                  R$ {Number(selectedTab.total_amount || 0).toFixed(2)}
                </span>
              </div>

              {/* Ações da Comanda */}
              {selectedTab.status !== 'BILLED' && selectedTab.status !== 'CLOSED' && selectedTab.status !== 'CANCELLED' ? (
                <div className="space-y-2 pt-2">
                  {/* Botão Primário de Envio para a Fila KDS se houver itens em Rascunho */}
                  {(() => {
                    const draftCount = (selectedTab.items || []).filter(it => it.prep_status === 'DRAFT').length;
                    if (draftCount === 0) return null;
                    return (
                      <button
                        type="button"
                        disabled={dispatching}
                        onClick={() => handleDispatchSector('ALL')}
                        className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {dispatching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        🚀 Enviar {draftCount} {draftCount === 1 ? 'Pedido' : 'Pedidos'} para a Fila (KDS)
                      </button>
                    );
                  })()}

                  {/* Se não houver rascunho, mas houver itens marcados como entregues, permitir enviar ao KDS */}
                  {(() => {
                    const draftCount = (selectedTab.items || []).filter(it => it.prep_status === 'DRAFT').length;
                    const deliveredCount = (selectedTab.items || []).filter(it => it.prep_status === 'DELIVERED').length;
                    if (draftCount > 0 || deliveredCount === 0) return null;
                    return (
                      <button
                        type="button"
                        disabled={dispatching}
                        onClick={() => handleDispatchSector('ALL')}
                        className="w-full py-2.5 px-3 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                        title="Enviar todos os itens desta comanda para a fila do KDS"
                      >
                        {dispatching ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Enviar Itens da Mesa para a Fila (KDS)
                      </button>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setShowAddItemDrawer(true);
                        handleSearchProducts('');
                      }}
                      className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar Itens
                    </button>
                    <button
                      onClick={handleRequestBill}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="h-4 w-4" />
                      Fechar no PDV
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTabToCancel(selectedTab)}
                    className="w-full py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Cancelar Comanda
                  </button>
                </div>
              ) : (
                <div className="pt-2 text-center py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedTab.status === 'CANCELLED' ? '❌ Comanda Cancelada' : '✔ Comanda Faturada / Encerrada'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE ABERTURA DE COMANDA / MESA ─────────────────────────── */}
      {showOpenModal && (
        <div
          onClick={() => setShowOpenModal(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Coffee className="h-5 w-5 text-amber-500" />
                {openTableId ? 'Abrir Comanda para a Mesa' : 'Abrir Nova Comanda'}
              </h3>
              <button
                type="button"
                onClick={() => setShowOpenModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenTab} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Número / Identificador da Comanda *
                </label>
                <input
                  type="text"
                  required
                  value={openTabNumber}
                  onChange={(e) => setOpenTabNumber(e.target.value)}
                  placeholder="Ex: 101, Balcão 02, Mesa 04"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Cliente (Opcional)
                </label>
                <input
                  type="text"
                  value={openCustomerName}
                  onChange={(e) => setOpenCustomerName(e.target.value)}
                  placeholder="Para chamar no balcão"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingOpen}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir Comanda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CADASTRO DE MESA ───────────────────────────────────── */}
      {showCreateTableModal && (
        <div
          onClick={() => setShowCreateTableModal(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-amber-500" />
                Cadastrar Nova Mesa
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateTableModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Número / Nome da Mesa *
                </label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="Ex: 01, 02, Balcão 1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ambiente / Área
                  </label>
                  <input
                    type="text"
                    value={newTableArea}
                    onChange={(e) => setNewTableArea(e.target.value)}
                    placeholder="Salão, Varanda..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lugares (Capacidade)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTableModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingTable}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingTable ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE EXCLUSÃO DE MESA ───────────────────────────────────── */}
      {tableToDelete && (
        <div
          onClick={() => !deletingTable && setTableToDelete(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Excluir Mesa
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mesa {tableToDelete.number} • {tableToDelete.area}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deletingTable}
                onClick={() => setTableToDelete(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {tableToDelete.status !== 'AVAILABLE' ? (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Mesa Ocupada ou com Conta Solicitada
                </p>
                <p className="leading-relaxed">
                  Esta mesa possui uma comanda ativa vinculada no momento. Para excluí-la, você precisa primeiro cancelar ou faturar a comanda ativa no salão.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Tem certeza de que deseja excluir a <strong className="text-slate-900 dark:text-white">Mesa {tableToDelete.number}</strong> ({tableToDelete.area})?
                </p>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-1.5">
                  <p className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    O QR Code impresso desta mesa deixará de funcionar imediatamente.
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Caso tenha sido cadastrada incorretamente, o número/nome ficará livre para novo cadastro.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={deletingTable}
                onClick={() => setTableToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Voltar
              </button>
              {tableToDelete.status === 'AVAILABLE' && (
                <button
                  type="button"
                  disabled={deletingTable}
                  onClick={handleDeleteTable}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 disabled:opacity-50 flex items-center gap-2 transition"
                >
                  {deletingTable ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Sim, Excluir Mesa
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DRAWER DE BUSCA HÍBRIDA DE PRODUTOS ─────────────────────────── */}
      {showAddItemDrawer && (
        <div
          onClick={() => setShowAddItemDrawer(false)}
          className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 dark:border-slate-800"
          >
            {/* Header do Drawer */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddItemDrawer(false)}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Voltar para a Comanda (Esc)"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    Lançar Itens na Comanda
                  </h3>
                  <p className="text-xs text-slate-500">Busca híbrida: Cafeteria Cronuz + Catálogo Horus</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddItemDrawer(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Campo de Busca */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchProducts(e.target.value)}
                  placeholder="Buscar café, pão de queijo, livro ou código..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Resultados da Busca */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {searchingProducts ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
                  <p className="text-xs">Buscando itens no catálogo...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Coffee className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs">Nenhum produto encontrado</p>
                </div>
              ) : (
                searchResults.map((prod, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectProduct(prod)}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-amber-500 hover:bg-amber-50/20 dark:hover:bg-amber-500/5 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                          prod.source === 'CRONUZ'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
                        }`}>
                          {prod.source}
                        </span>
                        <h5 className="text-sm font-bold text-slate-800 dark:text-white line-clamp-1">
                          {prod.title}
                        </h5>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {prod.category || 'Geral'} {prod.modifier_groups?.length > 0 ? `• ${prod.modifier_groups.length} opcionais` : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0 pl-3">
                      <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                        R$ {Number(prod.price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé Fixo do Drawer */}
            <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between">
              <span className="text-xs text-slate-400">Pressione ESC para fechar</span>
              <button
                type="button"
                onClick={() => setShowAddItemDrawer(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                Voltar à Comanda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE MODIFICADORES & ADICIONAIS DO PRODUTO ──────────────── */}
      {selectedProduct && (
        <div
          onClick={() => setSelectedProduct(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {selectedProduct.title}
                </h4>
                <p className="text-xs text-amber-600 font-bold">
                  Preço base: R$ {Number(selectedProduct.price).toFixed(2)}
                </p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Grupos de Modificadores */}
            {selectedProduct.modifier_groups?.map((group) => (
              <div key={group.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {group.name}
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {group.min_selectable > 0 ? 'Obrigatório' : 'Opcional'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {group.options.map((opt) => {
                    const isSelected = selectedModifiers[group.id] === opt.id;
                    return (
                      <label
                        key={opt.id}
                        onClick={() => {
                          setSelectedModifiers(prev => ({
                            ...prev,
                            [group.id]: isSelected ? (group.min_selectable > 0 ? opt.id : 0) : opt.id
                          }));
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold'
                            : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/40 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{opt.name}</span>
                        {opt.additional_price > 0 && (
                          <span className="text-amber-600 font-bold">
                            + R$ {Number(opt.additional_price).toFixed(2)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Quantidade e Observações */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Quantidade:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-black text-slate-900 dark:text-white">
                    {itemQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemQuantity(itemQuantity + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações para o Barista / Cozinha (Opcional):
                </label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ex: sem canela, bem quente, sem cebola..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Envio Imediato vs Rascunho na Mesa */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Destino ao Confirmar
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItemSendNow(true)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                      itemSendNow
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-black">
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      Enviar Agora
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      Entra direto na fila do KDS
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setItemSendNow(false)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                      !itemSendNow
                        ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-2 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-black">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Rascunho
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      Salva na mesa p/ enviar depois
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAddItem}
                disabled={submittingItem}
                className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-1.5 transition-all ${
                  itemSendNow
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                }`}
              >
                {submittingItem ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : itemSendNow ? (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Confirmar e Enviar à Fila
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    Salvar na Mesa (Rascunho)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de QR Code Seguro da Mesa */}
      {qrModalTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              QR Code • Mesa {qrModalTable.number}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              {qrModalTable.area} • Capacidade {qrModalTable.capacity} pessoas
            </p>

            {/* Imagem do QR Code gerada via API nativa segura */}
            {menuToken && qrModalTable.table_token ? (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner inline-block mx-auto mb-4">
                {/* QR Code link: /cardapio/[menuToken]?mesa=[table_token] */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    `${typeof window !== 'undefined' ? window.location.origin : ''}/cardapio/${menuToken}?mesa=${qrModalTable.table_token}`
                  )}`}
                  alt={`QR Code Mesa ${qrModalTable.number}`}
                  className="w-44 h-44 mx-auto rounded-lg"
                />
                <span className="block text-[10px] font-mono text-slate-500 mt-2">
                  Token: {qrModalTable.table_token}
                </span>
              </div>
            ) : (
              <div className="py-12 text-xs text-slate-400">
                Carregando token da mesa...
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/cardapio/${menuToken}?mesa=${qrModalTable.table_token}`;
                  navigator.clipboard.writeText(url);
                  toast.success(`Link da Mesa ${qrModalTable.number} copiado!`);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Copy className="w-4 h-4 text-amber-500" />
                Copiar Link da Mesa
              </button>

              <div className="flex gap-2">
                <a
                  href={`/cardapio/${menuToken}?mesa=${qrModalTable.table_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir
                </a>

                <button
                  type="button"
                  onClick={() => handleRegenerateTableToken(qrModalTable.id)}
                  disabled={regeneratingTableToken}
                  className="flex-1 py-2 px-3 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 transition flex items-center justify-center gap-1 disabled:opacity-50"
                  title="Trocar token da mesa em caso de trote"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regeneratingTableToken ? 'animate-spin' : ''}`} />
                  Renovar Token
                </button>
              </div>

              <button
                type="button"
                onClick={() => setQrModalTable(null)}
                className="mt-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Cardápio Digital Web & Gestão de QR Codes */}
      {showPublicMenuModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cardápio Digital Web & QR Codes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acesso público para clientes via smartphone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPublicMenuModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explicação de como o Cardápio funciona */}
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 flex items-start justify-between gap-3">
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <p className="font-bold mb-0.5">Onde são cadastrados os itens do cardápio?</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  Os produtos, categorias, fotos e adicionais exibidos no cardápio são configurados em <strong>Itens do Cardápio</strong> e refletem em tempo real no link web.
                </p>
              </div>
              <Link
                href="/cafeteria/products"
                className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-sm transition"
              >
                Gerenciar Itens
              </Link>
            </div>

            {/* Seletor de Tipo: Geral ou Por Mesa */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Visualizar QR Code para:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMenuTableId('general')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center ${
                      selectedMenuTableId === 'general'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    🌐 Cardápio Geral (Balcão/Redes)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (tables.length > 0 && selectedMenuTableId === 'general') {
                        setSelectedMenuTableId(tables[0].id);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-center ${
                      selectedMenuTableId !== 'general'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    🍽️ Mesa Específica
                  </button>
                </div>
              </div>

              {selectedMenuTableId !== 'general' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Selecione a Mesa para gerar o QR Code com identificação automática:
                  </label>
                  <select
                    value={selectedMenuTableId}
                    onChange={(e) => setSelectedMenuTableId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {tables.map(table => (
                      <option key={table.id} value={table.id}>
                        Mesa {table.number} - {table.area} (Capacidade: {table.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* URL Calculada e Display do QR Code */}
              {(() => {
                const isGeneral = selectedMenuTableId === 'general';
                const currentTable = !isGeneral ? tables.find(t => t.id === selectedMenuTableId) : null;
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const activeUrl = menuToken
                  ? isGeneral
                    ? `${baseUrl}/cardapio/${menuToken}`
                    : `${baseUrl}/cardapio/${menuToken}?mesa=${currentTable?.table_token || ''}`
                  : '';
                const qrUrl = activeUrl
                  ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(activeUrl)}`
                  : '';
                const title = isGeneral ? 'Cardápio Digital' : `Mesa ${currentTable?.number || ''}`;
                const subtitle = isGeneral ? 'Autoatendimento & Consulta' : `${currentTable?.area || 'Salão'} • Autoatendimento`;

                return (
                  <div className="space-y-4">
                    {/* Campo de URL com Botão de Copiar, Abrir e Renovar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Link de Acesso Direto:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (isGeneral) {
                              handleRegenerateMenuToken();
                            } else if (currentTable) {
                              handleRegenerateTableToken(currentTable.id);
                            }
                          }}
                          disabled={regeneratingMenuToken || regeneratingTableToken}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition disabled:opacity-50"
                          title="Invalidar link atual e gerar novo token seguro"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${(regeneratingMenuToken || regeneratingTableToken) ? 'animate-spin' : ''}`} />
                          Renovar Token {isGeneral ? 'Geral' : `da Mesa ${currentTable?.number || ''}`}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={activeUrl}
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!activeUrl) return;
                            navigator.clipboard.writeText(activeUrl);
                            toast.success('Link do cardápio copiado!');
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1 transition"
                          title="Copiar Link"
                        >
                          <Copy className="w-4 h-4 text-amber-500" />
                          Copiar
                        </button>
                        <a
                          href={activeUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 transition shadow-sm"
                          title="Abrir em nova aba"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir
                        </a>
                      </div>
                    </div>

                    {/* QR Code Preview e Ações */}
                    <div className="text-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                      {qrUrl ? (
                        <>
                          <div className="inline-block p-3 rounded-2xl bg-white shadow-sm border border-slate-200 mb-3">
                            <img
                              src={qrUrl}
                              alt="QR Code Cardápio"
                              className="w-40 h-40 object-contain mx-auto"
                            />
                          </div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                            {subtitle}
                          </p>

                          <div className="flex gap-2 justify-center">
                            <button
                              type="button"
                              onClick={() => handlePrintQrDisplay(title, subtitle, qrUrl, activeUrl)}
                              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                            >
                              <Printer className="w-4 h-4 text-amber-500" />
                              Imprimir Plaquinha / Display (A5)
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-8 text-xs text-slate-400">
                          Carregando token do cardápio...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPublicMenuModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Cancelamento de Comanda */}
      {tabToCancel && (
        <div
          onClick={() => {
            setTabToCancel(null);
            setCancelReason('');
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Cancelar Comanda #{tabToCancel.tab_number}?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4 leading-relaxed">
              Esta ação cancelará a comanda, liberará a mesa física associada no salão e removerá os pedidos pendentes da fila do barista.
            </p>

            <div className="text-left mb-4">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo do Cancelamento (Opcional):
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente desistiu, erro de digitação"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTabToCancel(null);
                  setCancelReason('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelTab}
                disabled={submittingCancelTab}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-rose-500/20 disabled:opacity-50"
              >
                {submittingCancelTab ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
