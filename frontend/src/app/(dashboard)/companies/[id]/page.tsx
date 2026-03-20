import { redirect } from 'next/navigation';

export default async function CompanyRedirectPage({ params }: { params: any }) {
  const resolvedParams = await Promise.resolve(params);
  redirect(`/companies/${resolvedParams.id}/profile`);
}
