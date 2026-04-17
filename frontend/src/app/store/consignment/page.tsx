"use client";

import { useEffect, useState } from "react";
import HorusConsignmentManager from "@/components/HorusConsignmentManager";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Package, BookOpen } from "lucide-react";

export default function StoreConsignmentPage() {
    const router = useRouter();
    const token = getToken();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!token) {
            router.push('/login');
        }
    }, [token, router]);

    if (!mounted || !token) return null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-8 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <BookOpen className="w-7 h-7 text-indigo-500" />
                        Gestão de Consignação
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Conferência de Acertos e Devoluções de Estoque Consignado</p>
                </div>
                
                <div className="bg-slate-50 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden min-h-[600px] mb-8">
                     <HorusConsignmentManager apiBaseUrl="/me/consignment" token={token} />
                </div>
            </div>
        </div>
    );
}
