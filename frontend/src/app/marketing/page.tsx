import { headers } from 'next/headers';
import CronuzLanding from '@/components/marketing/CronuzLanding';
import HorusLanding from '@/components/marketing/HorusLanding';

interface PageProps {
    searchParams?: Promise<{ tenant?: string }>;
}

export default async function MarketingPageSwitcher({ searchParams }: PageProps) {
    const headersList = await headers();
    const host = (headersList.get('x-forwarded-host') || headersList.get('host') || '').toLowerCase();
    const tenantId = (headersList.get('x-tenant-id') || '').toLowerCase();
    const resolvedParams = searchParams ? await searchParams : {};
    const queryTenant = (resolvedParams?.tenant || '').toLowerCase();

    const isHorus = 
        queryTenant === 'horus' ||
        tenantId === 'horus' || 
        host.includes('horus') || 
        host.includes('fmz');

    if (isHorus) {
        return <HorusLanding />;
    }

    return <CronuzLanding />;
}
