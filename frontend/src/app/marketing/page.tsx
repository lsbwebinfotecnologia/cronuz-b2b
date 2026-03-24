import { headers } from 'next/headers';
import CronuzLanding from '@/components/marketing/CronuzLanding';
import HorusLanding from '@/components/marketing/HorusLanding';

export default function MarketingPageSwitcher() {
    const headersList = headers();
    const tenantId = headersList.get('x-tenant-id');

    if (tenantId === 'horus') {
        return <HorusLanding />;
    }

    return <CronuzLanding />;
}
