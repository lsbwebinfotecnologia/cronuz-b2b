'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Trash2,
  Plus,
  Minus,
  Search,
  User,
  UserPlus,
  Phone,
  Mail,
  Truck,
  Store,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShoppingBag,
  ChevronRight,
  Info,
  BookOpen,
  Sparkles,
  FilePlus2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import CurrencyInput from '@/components/CurrencyInput';

export interface EncomendaCartItem {
  isbn: string;
  title: string;
  publisher?: string;
  author?: string;
  cover_url?: string;
  quantity: number;
  unit_price: number;
  product_id?: number;
  has_erp_registration?: boolean;
  horus_cod_item?: number;
  suggested_supplier_id?: number;
}

interface CatalogSearchResult {
  COD_ITEM?: number | string;
  product_id?: number | null;
  COD_BARRA_ITEM?: string;
  COD_ISBN_ITEM?: string;
  NOM_ITEM: string;
  NOM_EDITORA?: string;
  SELO?: string;
  DES_AUTOR?: string;
  VLR_CAPA?: number | string;
  SALDO_DISPONIVEL?: number;
  COVER_URL?: string;
  has_erp_registration?: boolean;
  horus_cod_item?: number | null;
  badge_warning?: string | null;
}

interface BookinfoSearchResult {
  isbn: string;
  title: string;
  subtitle?: string;
  authors?: string;
  author?: string;
  publisher?: string;
  imprint?: string;
  price?: number | string;
  cover_url?: string;
  synopsis?: string;
}

interface CustomerOption {
  id: number;
  name: string;
  corporate_name?: string;
  document: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  addresses?: Array<{
    zip_code?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  }>;
}

interface CustomerEncomendaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: EncomendaCartItem[];
  onUpdateQuantity: (isbn: string, newQty: number) => void;
  onUpdatePrice: (isbn: string, newPrice: number) => void;
  onRemoveItem: (isbn: string) => void;
  onClearCart: () => void;
  onAddItem?: (item: EncomendaCartItem) => void;
  allowManualItemAdd?: boolean;
  onOrderCreated?: (encomendaNumber: string) => void;
  branches?: string[];
}

export default function CustomerEncomendaDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onUpdatePrice,
  onRemoveItem,
  onClearCart,
  onAddItem,
  allowManualItemAdd = false,
  onOrderCreated,
  branches = ['Loja Principal (Balcão)'],
}: CustomerEncomendaDrawerProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // ── 0. Busca Inteligente de Produto (Igual ao Busca Preço: Hórus + Cronuz -> Bookinfo -> Pré-Cadastro) ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'AUTO' | 'BARRAS_ISBN' | 'NOME' | 'COD_ITEM'>('AUTO');
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResult[]>([]);

  // Bookinfo Fallback
  const [showBookinfoPanel, setShowBookinfoPanel] = useState(false);
  const [bookinfoQuery, setBookinfoQuery] = useState('');
  const [bookinfoType, setBookinfoType] = useState<'AUTO' | 'ISBN' | 'TITULO' | 'AUTOR' | 'EDITORA'>('AUTO');
  const [searchingBookinfo, setSearchingBookinfo] = useState(false);
  const [bookinfoSearched, setBookinfoSearched] = useState(false);
  const [bookinfoResults, setBookinfoResults] = useState<BookinfoSearchResult[]>([]);
  const [bookinfoError, setBookinfoError] = useState<string | null>(null);

  // Formulário de Pré-Cadastro no Cronuz (para obras que NÃO existem no Hórus)
  const [showPreRegisterForm, setShowPreRegisterForm] = useState(false);
  const [preIsbn, setPreIsbn] = useState('');
  const [preTitle, setPreTitle] = useState('');
  const [prePublisher, setPrePublisher] = useState('');
  const [preAuthor, setPreAuthor] = useState('');
  const [preCoverUrl, setPreCoverUrl] = useState('');
  const [preSynopsis, setPreSynopsis] = useState('');
  const [preQty, setPreQty] = useState(1);
  const [prePrice, setPrePrice] = useState(0);
  const [savingPreRegister, setSavingPreRegister] = useState(false);

  // ── Identificação do Cliente ──
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  // ── Formulário Cadastro Rápido de Cliente ──
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerType, setNewCustomerType] = useState<'PF' | 'PJ'>('PF');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDoc, setNewCustomerDoc] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // ── Logística de Entrega ──
  const [deliveryType, setDeliveryType] = useState<'BALCAO' | 'ENTREGA'>('BALCAO');
  const [pickupBranch, setPickupBranch] = useState(branches[0] || 'Loja Principal (Balcão)');

  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [searchingCep, setSearchingCep] = useState(false);

  // ── Notas e Submissão ──
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Busca de Cliente com Debounce ──
  useEffect(() => {
    const q = customerSearchQuery.trim();
    if (q.length < 2) {
      setCustomerList([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const token = getToken();
        const res = await fetch(`${apiUrl}/customers?search=${encodeURIComponent(q)}&limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCustomerList(Array.isArray(data) ? data : []);
        } else {
          const err = await res.json().catch(() => ({}));
          if (res.status === 401 || res.status === 403) {
            toast.error(err.detail || 'Sem permissão para consultar clientes.');
          }
        }
      } catch {
        toast.error('Falha de conexão ao pesquisar clientes.');
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearchQuery, apiUrl]);

  useEffect(() => {
    if (branches && branches.length > 0 && !branches.includes(pickupBranch)) {
      setPickupBranch(branches[0]);
    }
  }, [branches, pickupBranch]);

  // ── Consulta na Bookinfo (por ISBN, Título, Autor ou Editora) ──
  const executeBookinfoSearch = async (
    customQuery?: string,
    customType?: 'AUTO' | 'ISBN' | 'TITULO' | 'AUTOR' | 'EDITORA'
  ) => {
    const raw = (customQuery !== undefined ? customQuery : bookinfoQuery).trim();
    const bType = customType || bookinfoType;
    if (!raw) {
      toast.warning('Informe um termo (Nome, ISBN, Autor ou Editora) para pesquisar na Bookinfo.');
      return;
    }

    setSearchingBookinfo(true);
    setBookinfoSearched(true);
    setBookinfoError(null);
    setBookinfoResults([]);

    try {
      const token = getToken();
      const params = new URLSearchParams({
        query: raw,
        search_type: bType,
      });
      const res = await fetch(`${apiUrl}/product-search/bookinfo-lookup?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.found && Array.isArray(data.items) && data.items.length > 0) {
          setBookinfoResults(data.items);
          toast.success(`${data.items.length} obra(s) localizada(s) na Bookinfo!`);
        } else {
          setBookinfoError(data.detail || 'Nenhuma obra localizada na Bookinfo para este termo.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setBookinfoError(err.detail || 'Falha ao consultar Bookinfo.');
      }
    } catch {
      setBookinfoError('Falha de comunicação com o serviço da Bookinfo.');
    } finally {
      setSearchingBookinfo(false);
    }
  };

  // ── Busca Inteligente no Catálogo (ERP Hórus + Catálogo Cronuz) ──
  const handleSmartCatalogSearch = async () => {
    const raw = searchTerm.trim();
    if (!raw) {
      toast.warning('Digite o nome do livro, ISBN ou código para pesquisar.');
      return;
    }

    // Resolução inteligente do tipo de pesquisa igual ao Busca Preço
    const onlyDigits = raw.replace(/[^0-9Xx]/g, '');
    const isIsbnLike = /^[0-9Xx\-\s]+$/.test(raw) && onlyDigits.length >= 8;
    const isShortNumeric = /^\d+$/.test(raw) && raw.length <= 7;

    let effectiveOption: 'BARRAS_ISBN' | 'NOME' | 'COD_ITEM' = 'NOME';
    if (searchMode !== 'AUTO') {
      effectiveOption = searchMode;
    } else if (isIsbnLike) {
      effectiveOption = 'BARRAS_ISBN';
    } else if (isShortNumeric) {
      effectiveOption = 'COD_ITEM';
    } else {
      effectiveOption = 'NOME';
    }

    setSearchingCatalog(true);
    setCatalogSearched(true);
    setCatalogResults([]);
    setShowBookinfoPanel(false);
    setBookinfoResults([]);
    setBookinfoSearched(false);
    setBookinfoError(null);
    setShowPreRegisterForm(false);

    try {
      const token = getToken();
      const queryValue = effectiveOption === 'BARRAS_ISBN' ? onlyDigits : raw;
      const params = new URLSearchParams({
        term: queryValue,
        search_option: effectiveOption,
        source: 'web',
        offset: '0',
        limit: '12',
      });

      const res = await fetch(`${apiUrl}/product-search/product?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let foundItems: CatalogSearchResult[] = [];
      if (res.ok) {
        const data = await res.json();
        foundItems = Array.isArray(data.items) ? data.items : [];
      }

      // Se digitou número curto no modo AUTO e não achou por COD_ITEM, tenta por NOME também
      if (foundItems.length === 0 && searchMode === 'AUTO' && effectiveOption === 'COD_ITEM') {
        const fallbackParams = new URLSearchParams({
          term: raw,
          search_option: 'NOME',
          source: 'web',
          offset: '0',
          limit: '12',
        });
        const fbRes = await fetch(`${apiUrl}/product-search/product?${fallbackParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          foundItems = Array.isArray(fbData.items) ? fbData.items : [];
        }
      }

      if (foundItems.length > 0) {
        setCatalogResults(foundItems);
      } else {
        // Não achou nem no Hórus nem no Cronuz: habilita imediatamente a pesquisa na Bookinfo!
        const defaultBiType = isIsbnLike ? 'ISBN' : 'TITULO';
        const defaultBiQuery = isIsbnLike ? onlyDigits : raw;
        setBookinfoQuery(defaultBiQuery);
        setBookinfoType(defaultBiType);
        setShowBookinfoPanel(true);

        // Pré-alimenta campos manuais caso precise fazer pré-cadastro direto
        if (isIsbnLike) {
          setPreIsbn(onlyDigits);
          setPreTitle('');
        } else {
          setPreTitle(raw);
        }

        // Se for um ISBN válido (10 ou 13 caracteres), já dispara a busca na Bookinfo automaticamente!
        if (isIsbnLike && (onlyDigits.length === 10 || onlyDigits.length === 13)) {
          await executeBookinfoSearch(onlyDigits, 'ISBN');
        } else {
          toast.info('Não encontrado no Hórus/Cronuz. Pesquisa na Bookinfo habilitada abaixo!');
        }
      }
    } catch {
      toast.error('Falha de conexão ao pesquisar catálogo.');
    } finally {
      setSearchingCatalog(false);
    }
  };

  // Seleciona um item já existente no Hórus ou no Pré-Cadastro Cronuz
  const handleSelectCatalogItem = (p: CatalogSearchResult) => {
    if (!onAddItem) return;
    const isbn = String(p.COD_BARRA_ITEM || p.COD_ISBN_ITEM || p.COD_ITEM || '').trim();
    if (!isbn) {
      toast.warning('Item sem código/ISBN válido.');
      return;
    }
    const hasErp = p.has_erp_registration !== undefined ? Boolean(p.has_erp_registration) : !Boolean(p.badge_warning);
    const horusCod = hasErp && (p.horus_cod_item || p.COD_ITEM) ? Number(p.horus_cod_item || p.COD_ITEM) : undefined;
    const unitPrice = parseFloat(String(p.VLR_CAPA || 0).replace(',', '.')) || 0;

    onAddItem({
      isbn,
      title: p.NOM_ITEM,
      publisher: p.NOM_EDITORA || p.SELO || undefined,
      author: p.DES_AUTOR || undefined,
      cover_url: p.COVER_URL || undefined,
      quantity: 1,
      unit_price: unitPrice,
      product_id: p.product_id || undefined,
      has_erp_registration: hasErp,
      horus_cod_item: horusCod,
    });

    toast.success(`"${p.NOM_ITEM.substring(0, 36)}" incluído na encomenda!`);
    setSearchTerm('');
    setCatalogResults([]);
    setCatalogSearched(false);
  };

  // Preenche o formulário de Pré-Cadastro Cronuz com os metadados vindos da Bookinfo
  const handleFillPreRegisterFromBookinfo = (b: BookinfoSearchResult) => {
    setPreIsbn((b.isbn || '').trim());
    setPreTitle((b.title || '').trim());
    setPrePublisher((b.publisher || b.imprint || '').trim());
    setPreAuthor((b.authors || b.author || '').trim());
    setPreCoverUrl((b.cover_url || '').trim());
    setPreSynopsis((b.synopsis || '').trim());
    const vlr = parseFloat(String(b.price || 0).replace(',', '.')) || 0;
    setPrePrice(vlr);
    setPreQty(1);
    setShowPreRegisterForm(true);
    toast.info('Dados da Bookinfo carregados para Pré-Cadastro (Sem Hórus). Confira e confirme!');
  };

  // Abre o formulário de Pré-Cadastro Manual (mesmo que não exista na Bookinfo)
  const handleOpenManualPreRegister = () => {
    const raw = searchTerm.trim();
    const onlyDigits = raw.replace(/[^0-9Xx]/g, '');
    const isIsbnLike = /^[0-9Xx\-\s]+$/.test(raw) && onlyDigits.length >= 8;
    if (!preIsbn && isIsbnLike) setPreIsbn(onlyDigits);
    if (!preTitle && !isIsbnLike && raw) setPreTitle(raw);
    setShowPreRegisterForm(true);
  };

  // Salva o Pré-Cadastro em prd_product (com horus_cod_item = null) e inclui na encomenda amarrado!
  const handleConfirmPreRegisterAndAdd = async () => {
    if (!onAddItem) return;
    const cleanTitle = preTitle.trim();
    const cleanCode = preIsbn.trim() || `SEM-ISBN-${Date.now().toString().slice(-6)}`;

    if (!cleanTitle) {
      toast.warning('Informe ao menos o Título da obra para realizar o pré-cadastro.');
      return;
    }

    setSavingPreRegister(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/product-search/quick-create-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isbn: cleanCode,
          title: cleanTitle,
          publisher: prePublisher.trim() || null,
          author: preAuthor.trim() || null,
          market_cover_price: prePrice,
          price_estimated: prePrice,
          cover_url: preCoverUrl.trim() || null,
          synopsis: preSynopsis.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao criar pré-cadastro do produto no Cronuz.');
      }

      const created = await res.json();
      const hasErp = Boolean(created.has_erp_registration);

      onAddItem({
        isbn: String(created.COD_BARRA_ITEM || cleanCode),
        title: created.NOM_ITEM || cleanTitle,
        publisher: created.NOM_EDITORA || prePublisher.trim() || undefined,
        author: created.DES_AUTOR || preAuthor.trim() || undefined,
        cover_url: created.COVER_URL || preCoverUrl.trim() || undefined,
        quantity: Math.max(1, preQty),
        unit_price: Math.max(0, prePrice),
        product_id: created.product_id || undefined,
        has_erp_registration: hasErp,
        horus_cod_item: hasErp && created.horus_cod_item ? Number(created.horus_cod_item) : undefined,
      });

      toast.success(
        hasErp
          ? `Obra vinculada ao Hórus #${created.horus_cod_item} e adicionada!`
          : `Pré-cadastro #${created.product_id} criado no Cronuz (Sem Hórus) e adicionado à encomenda!`
      );

      // Limpa estados da pesquisa/pré-cadastro para permitir adicionar outro livro
      setSearchTerm('');
      setCatalogResults([]);
      setCatalogSearched(false);
      setShowBookinfoPanel(false);
      setBookinfoResults([]);
      setShowPreRegisterForm(false);
      setPreIsbn('');
      setPreTitle('');
      setPrePublisher('');
      setPreAuthor('');
      setPreCoverUrl('');
      setPreSynopsis('');
      setPreQty(1);
      setPrePrice(0);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao pré-cadastrar obra.');
    } finally {
      setSavingPreRegister(false);
    }
  };

  // ── Seleção de Cliente ──
  const handleSelectCustomer = (c: CustomerOption) => {
    setSelectedCustomer(c);
    setCustomerSearchQuery('');
    setCustomerList([]);
    setShowNewCustomerForm(false);

    if (c.addresses && c.addresses.length > 0) {
      const addr = c.addresses[0];
      if (addr.zip_code) setZipCode(addr.zip_code);
      if (addr.street) setStreet(addr.street);
      if (addr.number) setNumber(addr.number);
      if (addr.complement) setComplement(addr.complement);
      if (addr.neighborhood) setNeighborhood(addr.neighborhood);
      if (addr.city) setCity(addr.city);
      if (addr.state) setState(addr.state);
    }
    toast.success(`Cliente ${c.name} selecionado para a encomenda!`);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
  };

  // ── Busca de CEP ViaCEP ──
  const handleLookupCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    setSearchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setStreet(data.logradouro || '');
        setNeighborhood(data.bairro || '');
        setCity(data.localidade || '');
        setState(data.uf || '');
        toast.success(`Endereço localizado: ${data.bairro}, ${data.localidade}-${data.uf}`);
      } else {
        toast.warning('CEP não encontrado na base dos Correios.');
      }
    } catch {
      toast.error('Erro ao consultar CEP.');
    } finally {
      setSearchingCep(false);
    }
  };

  // ── Cadastro Rápido de Cliente ──
  const handleSaveQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      toast.warning('Informe o nome do cliente.');
      return;
    }
    const cleanDoc = newCustomerDoc.replace(/\D/g, '');
    if (cleanDoc.length < 11) {
      toast.warning('Informe um CPF ou CNPJ válido.');
      return;
    }

    setSavingCustomer(true);
    try {
      const token = getToken();
      const payload = {
        name: newCustomerName.trim(),
        corporate_name: newCustomerName.trim(),
        document: cleanDoc,
        customer_type: newCustomerType,
        phone: newCustomerPhone.trim() || undefined,
        email: newCustomerEmail.trim() || undefined,
      };

      const res = await fetch(`${apiUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 400) {
          const searchRes = await fetch(`${apiUrl}/customers?search=${encodeURIComponent(cleanDoc)}&limit=5`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (searchRes.ok) {
            const foundList = await searchRes.json();
            if (Array.isArray(foundList) && foundList.length > 0) {
              handleSelectCustomer(foundList[0]);
              toast.info(`Cliente já cadastrado localizado e vinculado: ${foundList[0].name}`);
              return;
            }
          }
        }
        throw new Error(err.detail || 'Falha ao cadastrar cliente.');
      }

      const createdCust: CustomerOption = await res.json();
      toast.success(`Cliente ${createdCust.name} cadastrado e vinculado com sucesso!`);
      setSelectedCustomer(createdCust);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerDoc('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar cliente.');
    } finally {
      setSavingCustomer(false);
    }
  };

  // ── Totais ──
  const totalQuantity = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const totalAmount = items.reduce((acc, it) => acc + it.unit_price * (it.quantity || 1), 0);

  // ── Finalização da Encomenda ──
  const handleCreateEncomenda = async () => {
    if (items.length === 0) {
      toast.warning('Adicione ao menos um título à encomenda.');
      return;
    }

    if (!selectedCustomer && !newCustomerName.trim()) {
      toast.warning('Selecione ou informe os dados do cliente solicitante.');
      return;
    }

    if (deliveryType === 'ENTREGA' && (!street.trim() || !city.trim())) {
      toast.warning('Para entrega no endereço, preencha o logradouro e cidade.');
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken();

      const payload = {
        customer_id: selectedCustomer?.id || undefined,
        customer_name: (selectedCustomer ? selectedCustomer.name : newCustomerName).trim(),
        customer_document: (selectedCustomer ? selectedCustomer.document : newCustomerDoc).replace(/\D/g, '') || undefined,
        customer_phone: (selectedCustomer ? selectedCustomer.phone : newCustomerPhone)?.trim() || undefined,
        customer_email: (selectedCustomer ? selectedCustomer.email : newCustomerEmail)?.trim() || undefined,
        delivery_type: deliveryType,
        pickup_branch_name: deliveryType === 'BALCAO' ? pickupBranch : undefined,
        shipping_zip_code: deliveryType === 'ENTREGA' ? zipCode : undefined,
        shipping_street: deliveryType === 'ENTREGA' ? street : undefined,
        shipping_number: deliveryType === 'ENTREGA' ? number : undefined,
        shipping_complement: deliveryType === 'ENTREGA' ? complement : undefined,
        shipping_neighborhood: deliveryType === 'ENTREGA' ? neighborhood : undefined,
        shipping_city: deliveryType === 'ENTREGA' ? city : undefined,
        shipping_state: deliveryType === 'ENTREGA' ? state : undefined,
        notes: notes.trim() || undefined,
        items: items.map((it) => ({
          isbn: it.isbn,
          title: it.title,
          publisher: it.publisher || undefined,
          author: it.author || undefined,
          cover_url: it.cover_url || undefined,
          quantity: it.quantity,
          unit_price: it.unit_price,
          product_id: it.product_id || undefined,
          has_erp_registration: it.has_erp_registration ?? Boolean(it.horus_cod_item),
          horus_cod_item: it.horus_cod_item || undefined,
          suggested_supplier_id: it.suggested_supplier_id || undefined,
        })),
      };

      const res = await fetch(`${apiUrl}/encomendas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Falha ao registrar encomenda.');
      }

      const createdOrder = await res.json();
      toast.success(`Encomenda ${createdOrder.encomenda_number} gerada com sucesso! (${totalQuantity} itens)`);

      setNotes('');
      setSelectedCustomer(null);
      setNewCustomerName('');
      setNewCustomerDoc('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      onClearCart();
      onClose();
      if (onOrderCreated) {
        onOrderCreated(createdOrder.encomenda_number);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar encomenda.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* ── Topo do Drawer ── */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xs">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                  Encomenda do Cliente
                </h2>
                <span className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Sob Demanda
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                {items.length} {items.length === 1 ? 'título selecionado' : 'títulos selecionados'} • {totalQuantity} unidades
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Banner Informativo ── */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/60 px-5 py-2.5 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <p>
            <strong>Nunca perca a encomenda:</strong> Pesquise por Nome ou ISBN. Se não existir no Hórus, busque na Bookinfo ou faça o Pré-Cadastro no Cronuz com flag <strong>Sem Hórus</strong> para futura compra.
          </p>
        </div>

        {/* ── Conteúdo Rolável ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* PESQUISA INTELIGENTE DE OBRA (IGUAL AO BUSCA PREÇO: HÓRUS + CRONUZ -> BOOKINFO -> PRÉ-CADASTRO) */}
          {allowManualItemAdd && onAddItem && (
            <section className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Search className="w-4 h-4 text-emerald-600" />
                  Pesquisar Obra (Hórus / Cronuz / Bookinfo)
                </h3>

                <button
                  type="button"
                  onClick={handleOpenManualPreRegister}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  Pré-Cadastro Manual Direto
                </button>
              </div>

              {/* Barra Única Inteligente */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as any)}
                  className="sm:w-36 px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="AUTO">Auto (Nome/ISBN)</option>
                  <option value="BARRAS_ISBN">ISBN / Barras</option>
                  <option value="NOME">Nome / Título</option>
                  <option value="COD_ITEM">Cód. Hórus</option>
                </select>

                <div className="relative flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSmartCatalogSearch();
                        }
                      }}
                      placeholder="Digite o Nome do livro, ISBN ou Código Hórus..."
                      className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSmartCatalogSearch}
                    disabled={searchingCatalog}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    {searchingCatalog ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    Buscar
                  </button>
                </div>
              </div>

              {/* Lista de Resultados Encontrados no Hórus / Catálogo Cronuz */}
              {catalogResults.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold">
                      {catalogResults.length} resultado(s) no catálogo interno:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBookinfoQuery(searchTerm.trim());
                        setBookinfoType(/^[0-9Xx\-\s]{8,}$/.test(searchTerm.trim()) ? 'ISBN' : 'TITULO');
                        setShowBookinfoPanel(true);
                      }}
                      className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                    >
                      Não é nenhum destes? Buscar na Bookinfo →
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    {catalogResults.map((r, idx) => {
                      const hasErp =
                        r.has_erp_registration !== undefined
                          ? Boolean(r.has_erp_registration)
                          : !Boolean(r.badge_warning);
                      const isbnVal = r.COD_BARRA_ITEM || r.COD_ISBN_ITEM || String(r.COD_ITEM || '');
                      const priceVal = parseFloat(String(r.VLR_CAPA || 0).replace(',', '.')) || 0;

                      return (
                        <div
                          key={`${r.COD_ITEM}-${idx}`}
                          className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {r.COVER_URL ? (
                              <img
                                src={r.COVER_URL}
                                alt=""
                                className="w-9 h-12 object-contain rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-9 h-12 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4 text-slate-400" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {r.NOM_ITEM}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                                <span className="font-mono">{isbnVal}</span>
                                {r.NOM_EDITORA && <span>• {r.NOM_EDITORA}</span>}
                                {priceVal > 0 && (
                                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                    • R$ {priceVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                {hasErp ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    ERP Hórus #{r.horus_cod_item || r.COD_ITEM}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                    Pré-Cadastro Cronuz #{r.product_id || r.COD_ITEM} • Sem Hórus
                                  </span>
                                )}
                                {r.SALDO_DISPONIVEL !== undefined && (
                                  <span className="text-[10px] text-slate-400">
                                    Saldo: {r.SALDO_DISPONIVEL} un
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSelectCatalogItem(r)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer shadow-2xs transition-colors"
                          >
                            + Incluir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Painel de Pesquisa na Bookinfo (Habilitado automaticamente quando não encontra no Hórus/Cronuz) */}
              {showBookinfoPanel && (
                <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Não localizado no Hórus — Consultar Base Oficial Bookinfo
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Localize por Título, ISBN, Autor ou Editora para preencher o Pré-Cadastro automaticamente.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={bookinfoType}
                      onChange={(e) => setBookinfoType(e.target.value as any)}
                      className="sm:w-32 px-2.5 py-2 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                    >
                      <option value="AUTO">Automático</option>
                      <option value="TITULO">Título / Nome</option>
                      <option value="ISBN">ISBN</option>
                      <option value="AUTOR">Autor</option>
                      <option value="EDITORA">Editora</option>
                    </select>

                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={bookinfoQuery}
                        onChange={(e) => setBookinfoQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            executeBookinfoSearch();
                          }
                        }}
                        placeholder="Pesquisar na Bookinfo..."
                        className="w-full px-3 py-2 text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => executeBookinfoSearch()}
                        disabled={searchingBookinfo}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        {searchingBookinfo ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        Bookinfo
                      </button>
                    </div>
                  </div>

                  {bookinfoResults.length > 0 && (
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-indigo-200/80 dark:border-indigo-800 bg-white dark:bg-slate-900">
                      {bookinfoResults.map((b, bIdx) => {
                        const bPrice = parseFloat(String(b.price || 0).replace(',', '.')) || 0;
                        return (
                          <div
                            key={`${b.isbn}-${bIdx}`}
                            className="p-2.5 flex items-center justify-between gap-3 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {b.cover_url ? (
                                <img
                                  src={b.cover_url}
                                  alt=""
                                  className="w-9 h-12 object-contain rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-12 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <BookOpen className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {b.title}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  {b.authors || b.author || 'Autor n/i'} • {b.publisher || b.imprint || 'Editora n/i'}
                                </p>
                                <p className="text-[10px] font-mono text-slate-500">
                                  ISBN: {b.isbn}
                                  {bPrice > 0 && (
                                    <span className="ml-1.5 font-sans font-bold text-emerald-700 dark:text-emerald-400">
                                      • R$ {bPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleFillPreRegisterFromBookinfo(b)}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shrink-0 cursor-pointer shadow-2xs transition-colors"
                            >
                              Pré-Cadastrar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {bookinfoSearched && !searchingBookinfo && bookinfoResults.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs">
                      <span className="text-slate-600 dark:text-slate-300">
                        {bookinfoError || 'Nenhuma obra encontrada na Bookinfo.'}
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenManualPreRegister}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Fazer Pré-Cadastro Manual
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Formulário de Pré-Cadastro no Cronuz (Item SEM cadastro no ERP Hórus) */}
              {showPreRegisterForm && (
                <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                          Pré-Cadastro de Obra no Cronuz (Sem Cadastro no Hórus)
                        </h4>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-snug mt-0.5">
                          Esta obra será gravada no Cronuz e vinculada à encomenda com alerta <strong>Sem Hórus</strong> para futura solicitação de compra e cadastro no ERP.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreRegisterForm(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        ISBN / Código Identificador (opcional se não houver)
                      </label>
                      <input
                        type="text"
                        value={preIsbn}
                        onChange={(e) => setPreIsbn(e.target.value)}
                        placeholder="Ex: 9788535914849 (gerado automático se vazio)"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Quantidade *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={preQty}
                        onChange={(e) => setPreQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Título da Obra *
                    </label>
                    <input
                      type="text"
                      value={preTitle}
                      onChange={(e) => setPreTitle(e.target.value)}
                      placeholder="Título completo informado pelo cliente ou Bookinfo"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Editora
                      </label>
                      <input
                        type="text"
                        value={prePublisher}
                        onChange={(e) => setPrePublisher(e.target.value)}
                        placeholder="Editora"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Autor
                      </label>
                      <input
                        type="text"
                        value={preAuthor}
                        onChange={(e) => setPreAuthor(e.target.value)}
                        placeholder="Autor"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Preço Estimado (R$)
                      </label>
                      <CurrencyInput
                        value={prePrice}
                        onChangeValue={setPrePrice}
                        prefixStr="R$ "
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={savingPreRegister}
                      onClick={handleConfirmPreRegisterAndAdd}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                    >
                      {savingPreRegister ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Pré-Cadastrar no Cronuz e Incluir na Encomenda
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 1. LISTA DE TÍTULOS ENCOMENDADOS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                1. Títulos Selecionados ({items.length})
              </h3>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Limpar lista
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-slate-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">Nenhum título adicionado ainda.</p>
                <p className="text-xs mt-1 text-slate-500">
                  {allowManualItemAdd
                    ? 'Pesquise acima por Nome ou ISBN (ou use a Bookinfo / Pré-Cadastro) para incluir obras.'
                    : 'Pesquise no Busca Preço ou Bookinfo e clique em "Adicionar à Encomenda".'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((it) => {
                  const inHorus = it.has_erp_registration ?? Boolean(it.horus_cod_item);
                  return (
                    <div
                      key={it.isbn}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start gap-3 transition-all hover:border-slate-300"
                    >
                      {it.cover_url ? (
                        <img
                          src={it.cover_url}
                          alt=""
                          className="w-12 h-16 object-contain rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                          <Package className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                            {it.title}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-medium">
                          <span>
                            ISBN: <strong className="font-mono text-slate-700 dark:text-slate-300">{it.isbn}</strong>
                          </span>
                          {it.publisher && <span>Ed: {it.publisher}</span>}
                          {it.author && <span>Aut: {it.author}</span>}
                        </div>

                        {/* Identificador explícito: Existe no Hórus vs Pré-Cadastro Cronuz (Sem Hórus) */}
                        <div className="pt-0.5">
                          {inHorus ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              ERP Hórus #{it.horus_cod_item}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                              Sem Cadastro no Hórus{it.product_id ? ` • Pré-Cadastro Cronuz #${it.product_id}` : ' • Pré-Cadastro Automático'}
                            </span>
                          )}
                        </div>

                        {/* Controles de Quantidade e Preço Unitário com Máscara BRL */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(it.isbn, Math.max(1, it.quantity - 1))}
                              className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs text-slate-800 dark:text-slate-100">
                              {it.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(it.isbn, it.quantity + 1)}
                              className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block leading-none mb-0.5">Preço Unit.</span>
                              <CurrencyInput
                                value={it.unit_price || 0}
                                onChangeValue={(val) => onUpdatePrice(it.isbn, val)}
                                prefixStr="R$ "
                                className="w-28 px-2 py-1 text-right font-bold text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => onRemoveItem(it.isbn)}
                              className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                              title="Remover item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. IDENTIFICAÇÃO E DADOS DO CLIENTE */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              2. Cliente Solicitante
            </h3>

            {selectedCustomer ? (
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cliente Vinculado
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {selectedCustomer.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {selectedCustomer.document && (
                        <span>
                          Doc: <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedCustomer.document}</strong>
                        </span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-600" /> {selectedCustomer.phone}
                        </span>
                      )}
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-emerald-600" /> {selectedCustomer.email}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline cursor-pointer"
                  >
                    Trocar
                  </button>
                </div>
              </div>
            ) : showNewCustomerForm ? (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-emerald-600" />
                    Novo Cadastro de Cliente
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={newCustomerType === 'PF'}
                      onChange={() => setNewCustomerType('PF')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    Pessoa Física (CPF)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={newCustomerType === 'PJ'}
                      onChange={() => setNewCustomerType('PJ')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    Pessoa Jurídica (CNPJ)
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Nome Completo / Razão Social *
                    </label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Ex: Maria das Graças ou Escola Futuro"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {newCustomerType === 'PF' ? 'CPF *' : 'CNPJ *'}
                    </label>
                    <input
                      type="text"
                      value={newCustomerDoc}
                      onChange={(e) => setNewCustomerDoc(e.target.value)}
                      placeholder="Somente números"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      E-mail do Cliente
                    </label>
                    <input
                      type="email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      placeholder="cliente@exemplo.com.br"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveQuickCustomer}
                    disabled={savingCustomer}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
                  >
                    {savingCustomer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Salvar e Vincular Cliente
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Pesquisar cliente por CPF/CNPJ, Nome ou Telefone..."
                    className="w-full pl-10 pr-24 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                  {customerSearching && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-24 top-3" />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    className="absolute right-2 top-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    + Novo
                  </button>
                </div>

                {customerList.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {customerList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Doc: {c.document} {c.phone && `• Tel: ${c.phone}`}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. MODALIDADE DE ENTREGA / LOGÍSTICA */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              3. Modalidade de Entrega / Logística
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryType('BALCAO')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  deliveryType === 'BALCAO'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Store className="w-4 h-4" />
                Retirada no Balcão
              </button>

              <button
                type="button"
                onClick={() => setDeliveryType('ENTREGA')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  deliveryType === 'ENTREGA'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Truck className="w-4 h-4" />
                Entrega no Endereço
              </button>
            </div>

            {deliveryType === 'BALCAO' ? (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Selecione a Filial / Loja de Retirada:
                </label>
                <select
                  value={pickupBranch}
                  onChange={(e) => setPickupBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  O cliente será informado via WhatsApp ou E-mail assim que as obras chegarem nesta filial.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      CEP
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        onBlur={(e) => handleLookupCep(e.target.value)}
                        placeholder="00000-000"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      {searchingCep && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-2.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Logradouro / Rua *
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Ex: Av. Paulista, Rua das Flores"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Número *
                    </label>
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto 42"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Cidade / UF
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Cidade"
                        className="w-full px-2 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        maxLength={2}
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        placeholder="UF"
                        className="w-12 text-center uppercase px-1 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 4. OBSERVAÇÕES */}
          <section className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Observações Internas ou da Encomenda
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Cliente tem urgência, avisar assim que chegar do fornecedor..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
          </section>
        </div>

        {/* ── Rodapé / Resumo e Confirmação ── */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Total de Itens:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{totalQuantity} unidade(s)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Total Estimado da Encomenda:
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              {allowManualItemAdd ? 'Fechar' : 'Continuar Pesquisando'}
            </button>

            <button
              type="button"
              onClick={handleCreateEncomenda}
              disabled={submitting || items.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando Encomenda...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Gerar Encomenda ({totalQuantity})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
