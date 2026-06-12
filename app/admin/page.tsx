import { redirect } from 'next/navigation';
import { getCurrentUser, publicUser } from '@/lib/auth';
import AdminDashboard from '@/components/AdminDashboard';

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') {
    redirect('/login');
  }
  if (user.role !== 'admin') {
    redirect('/');
  }

  return <AdminDashboard initialUser={publicUser(user)} />;
}
