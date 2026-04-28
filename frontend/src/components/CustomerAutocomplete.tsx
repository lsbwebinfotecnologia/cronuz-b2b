'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface Customer {
  id: number;
  name: string;
  document?: string;
  corporate_name?: string;
  [key: string]: any;
}

interface CustomerAutocompleteProps {
  value: string | number;
  onChange: (id: string, customer: Customer | null) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

export default function CustomerAutocomplete({ value, onChange, required = false, className = "", placeholder = "Buscar cliente..." }: CustomerAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [options, setOptions] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch initial selected customer if we have a value but no selectedCustomer object
  useEffect(() => {
    if (value && !selectedCustomer) {
      const fetchInitial = async () => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${value}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (res.ok) {
            const data = await res.json();
            setSelectedCustomer(data);
          }
        } catch (e) {
          console.error("Failed to fetch initial customer", e);
        }
      };
      fetchInitial();
    } else if (!value) {
      setSelectedCustomer(null);
    }
  }, [value, selectedCustomer]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch options based on debounced search
  useEffect(() => {
    if (!isOpen) return;

    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const queryParams = new URLSearchParams({ limit: '15' });
        if (debouncedSearch) {
          queryParams.append('search', debouncedSearch);
        }
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers?${queryParams.toString()}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          // API returns an array of customers
          setOptions(Array.isArray(data) ? data : data.items || []);
        } else {
          toast.error("Erro ao carregar clientes.");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, [debouncedSearch, isOpen]);

  const handleSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    onChange(customer.id.toString(), customer);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCustomer(null);
    onChange('', null);
    setSearchTerm('');
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {/* Hidden input for HTML5 required validation */}
      <input type="text" required={required} value={value} onChange={() => {}} className="absolute opacity-0 w-0 h-0" tabIndex={-1} />

      <div 
        className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer border rounded-xl text-sm transition-colors shadow-sm
          ${isOpen 
            ? 'border-[var(--color-primary-base)] ring-2 ring-[var(--color-primary-base)]/20 bg-white dark:bg-slate-950' 
            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex-1 truncate">
          {selectedCustomer ? (
            <span className="text-slate-900 dark:text-white font-medium">
              {selectedCustomer.id} - {selectedCustomer.name}
              {selectedCustomer.corporate_name && selectedCustomer.corporate_name !== selectedCustomer.name && ` (${selectedCustomer.corporate_name})`}
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">{placeholder}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-2">
          {selectedCustomer && (
            <button 
              type="button" 
              onClick={handleClear}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[300px]">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 relative bg-slate-50/50 dark:bg-slate-900/50">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              autoFocus
              type="text"
              placeholder="Digite nome, CPF/CNPJ ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors"
            />
          </div>
          
          <div className="overflow-y-auto flex-1 p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-4 text-slate-500 dark:text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm">Buscando...</span>
              </div>
            ) : options.length > 0 ? (
              <ul className="space-y-1">
                {options.map((customer) => (
                  <li 
                    key={customer.id}
                    onClick={() => handleSelect(customer)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors text-sm
                      ${value == customer.id.toString() 
                        ? 'bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] font-medium' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className="flex flex-col">
                      <span>{customer.id} - {customer.name}</span>
                      {customer.document && (
                        <span className="text-xs opacity-70 mt-0.5 font-mono">{customer.document}</span>
                      )}
                    </div>
                    {value == customer.id.toString() && <Check className="w-4 h-4" />}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum cliente encontrado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
