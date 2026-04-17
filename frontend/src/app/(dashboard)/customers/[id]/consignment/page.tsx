"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import HorusConsignmentManager from '@/components/HorusConsignmentManager';

export default function CustomerConsignmentPage() {
    const params = useParams();
    const router = useRouter();
    const customerId = params.id as string;
    
    const [loading, setLoading] = useState(true);
    const [customer, setCustomer] = useState<any>(null);
    const [companyId, setCompanyId] = useState<number | null>(null);
    const user = getUser();

    useEffect(() => {
        if (!user) {
            router.push('/login');
            return;
        }
        setCompanyId(user.company_id);
        fetchCustomer();
    }, [customerId, router]);

    const fetchCustomer = async () => {
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCustomer(data);
            } else {
                router.push('/customers');
            }
        } catch (e) {
            router.push('/customers');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
            </div>
        );
    }

    if (!customer) return null;

    // Define the api base Url mapping to the Horus endpoint in Seller API
    // -> /companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/summary
    const cnpj = customer.document;
    const apiBaseUrl = `/companies/${companyId}/horus/customers/${cnpj}/consignment`;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-4rem)] flex flex-col">
            <div className="mb-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Link 
                        href={`/customers/${customerId}`}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Gestão de Consignação
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Ambiente do Vendedor: Integrado com Horus B2B
                        </p>
                    </div>
                </div>
                <div className="text-right hidden sm:block">
                     <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{customer.name}</p>
                     <p className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 rounded mt-1 inline-block">CNPJ: {customer.document}</p>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                 <HorusConsignmentManager 
                     apiBaseUrl={apiBaseUrl}
                     token={getToken() || ''}
                     backUrl={`/customers/${customerId}`}
                 />
            </div>
        </div>
    );
}
