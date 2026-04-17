import os
import re

# 1. Update StoreHeader.tsx to include the Consignacao Link
store_header_path = "frontend/src/components/store/StoreHeader.tsx"
with open(store_header_path, "r") as f:
    header_content = f.read()

target_nav = """<Link href="/store/orders" className="hidden lg:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <ShoppingBag className="h-5 w-5" />
                <span className="text-sm font-bold">Pedidos</span>
              </Link>
"""

new_nav = target_nav + """              <Link href="/store/consignment" className="hidden lg:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <BookOpen className="h-5 w-5" />
                <span className="text-sm font-bold">Consignação</span>
              </Link>
"""

if target_nav in header_content:
    header_content = header_content.replace(target_nav, new_nav)
else:
    print("WARNING: Could not find target nav in StoreHeader to patch desktop link")

target_mobile_nav = """<Link href="/store/orders" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                        <ShoppingBag className="w-5 h-5 text-slate-400" /> Pedidos
                      </Link>
"""

new_mobile_nav = target_mobile_nav + """                      <Link href="/store/consignment" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                        <BookOpen className="w-5 h-5 text-slate-400" /> Consignação
                      </Link>
"""

if target_mobile_nav in header_content:
    header_content = header_content.replace(target_mobile_nav, new_mobile_nav)
else:
    print("WARNING: Could not find target mobile nav in StoreHeader to patch")

with open(store_header_path, "w") as f:
    f.write(header_content)


# 2. Create the Store Consignment Page
os.makedirs("frontend/src/app/store/consignment", exist_ok=True)
with open("frontend/src/app/store/consignment/page.tsx", "w") as f:
    f.write(""""use client";

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
""")

print("Store components patched")
